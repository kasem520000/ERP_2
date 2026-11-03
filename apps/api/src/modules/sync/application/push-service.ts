import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { generateUuidV7 } from "@erp/domain-core";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { PosSaleService } from "../../sales/application/pos-channel/pos-sale-service";
import { PosShiftFlowService } from "../../pos/application/shift-flow-service";
import {
  PosDeviceNotTerminalError,
  PosDeviceNotFoundError,
  PosDeviceRevokedError,
  PosSyncCommandInvalidError,
} from "../../pos/domain/pos-errors";

/**
 * PHASE-016 · the narrow push service (T8; SYNC_PROTOCOL §3 + §11): batch
 * push (≤ 50 commands, per-item results, `Idempotency-Key` = batch id)
 * for exactly two command families:
 *
 * - `pos_sale` — invoice + lines + tenders aggregate → the SALES module's
 *   PosSaleService.submitOffline (the same posting path as the online
 *   flow: sales service + posting engine — sync adds transport, never a
 *   second business-logic path). Official number + journal ids returned
 *   on ACCEPTED replace the local PENDING_SYNC state.
 * - `cashier_shift` — shift open/close events over the TREASURY shift
 *   model (POS-grade columns; runtime writes stay treasury-owned).
 *
 * Dedupe (§11): per-sale idempotencyKey + the posting-operation key
 * (INV-013) + the (terminal, OFF- number) pair — double execution is
 * impossible through three layers; the full inbox_commands registry is
 * PHASE-020. Server decisions surface as typed REJECTED reasons for the
 * shift-end reconciliation screen (CONFLICT_RESOLUTION §3).
 */

// The wire contracts live in @erp/contracts (one source of truth shared
// with the device-side sync-core; §11 rule 1 — same contracts, narrow scope).
export {
  POS_REJECTION_REASONS,
  MAX_PUSH_BATCH,
  cashierShiftCommandSchema,
  posSaleCommandSchema,
  type CashierShiftCommand,
  type PosSaleCommand,
  type PushItemResult,
} from "@erp/contracts";
import {
  MAX_PUSH_BATCH,
  POS_REJECTION_REASONS,
  cashierShiftCommandSchema,
  posSaleCommandSchema,
  type CashierShiftCommand,
  type PosSaleCommand,
  type PosRejectionReason,
  type PushItemResult,
} from "@erp/contracts";

export type SyncCommand = PosSaleCommand | CashierShiftCommand;


@Injectable()
export class PushService {
  constructor(
    private readonly posSales: PosSaleService,
    private readonly shiftFlow: PosShiftFlowService,
  ) {}

  /** Verify the pushing device: exists, pos-terminal class, not revoked —
   * rejected BEFORE any command executes (SYNC_PROTOCOL §1.5; zero
   * effects on revocation). */
  async requireActivePosDevice(deviceId: string): Promise<void> {
    const tx = requireTenantContext().tx!;
    const rows = await tx.execute(sql`
      SELECT platform, revoked_at AS "revokedAt" FROM devices WHERE id = ${deviceId} LIMIT 1
    `);
    const device = (rows.rows as unknown as { platform: string; revokedAt: string | null }[])[0];
    if (device === undefined) {
      throw new PosDeviceNotFoundError(deviceId);
    }
    if (device.platform !== "pos-terminal") {
      throw new PosDeviceNotTerminalError(`device ${deviceId} is platform ${device.platform}`);
    }
    if (device.revokedAt !== null) {
      throw new PosDeviceRevokedError(deviceId);
    }
  }

  /** Execute one batch: per-item results; a failing command never affects
   * its siblings (C-03 partial-batch-failure discipline). */
  async push(input: {
    deviceId: string;
    batchId: string;
    commands: unknown[];
  }): Promise<{ results: PushItemResult[] }> {
    await this.requireActivePosDevice(input.deviceId);
    if (input.commands.length === 0) {
      return { results: [] };
    }
    if (input.commands.length > MAX_PUSH_BATCH) {
      throw new PosSyncCommandInvalidError(
        `batch exceeds the 50-command budget (got ${input.commands.length})`,
      );
    }
    // Idempotency: the batch id dedupes whole-batch replays (the transport
    // layer's Idempotency-Key); per-command idempotencyKey dedupes items.
    const seen = new Set<string>();
    const results: PushItemResult[] = [];
    for (const raw of input.commands) {
      const sale = posSaleCommandSchema.safeParse(raw);
      const shift = sale.success ? null : cashierShiftCommandSchema.safeParse(raw);
      if (!sale.success && (shift === null || !shift.success)) {
        results.push({
          id:
            typeof (raw as { id?: unknown })?.id === "string"
              ? String((raw as { id: string }).id)
              : generateUuidV7(),
          status: "REJECTED",
          idempotencyKey: String((raw as { idempotencyKey?: unknown })?.idempotencyKey ?? "unknown"),
          reason: "VALIDATION_ERROR",
          message: "command shape rejected by the contract",
          action: "EDIT_AND_RESEND",
        });
        continue;
      }
      const command = (sale.success ? sale.data : shift!.data) as SyncCommand;
      if (seen.has(command.idempotencyKey)) {
        // Duplicate within the same batch — drop as an ACCEPTED no-op echo.
        results.push({
          id: command.id,
          status: "ACCEPTED",
          idempotencyKey: command.idempotencyKey,
          result: { deduped: "within-batch duplicate" },
        });
        continue;
      }
      seen.add(command.idempotencyKey);
      results.push(await this.executeCommand(command));
    }
    return { results };
  }

  private async executeCommand(command: SyncCommand): Promise<PushItemResult> {
    try {
      if (command.type === "pos_sale") {
        const outcome = await this.posSales.submitOffline({
          terminalId: command.sale.terminalId,
          customerId: command.sale.customerId,
          lines: command.sale.lines.map((line) => ({
            itemId: line.itemId,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount ?? null,
            taxCodeId: line.taxCodeId ?? null,
            serialIds: line.serialIds ?? null,
          })),
          tenders: command.sale.tenders.map((tender) => ({
            method: tender.method,
            amount: tender.amount,
            reference: tender.reference ?? null,
          })),
          orderType: command.sale.orderType,
          checkId: command.sale.checkId ?? null,
          offlineReceiptNo: command.sale.offlineReceiptNo,
          clientId: command.sale.clientId,
          invoiceDate: command.sale.invoiceDate,
          actorId: null,
          idempotencyKey: command.idempotencyKey,
        });
        return {
          id: command.id,
          status: "ACCEPTED",
          idempotencyKey: command.idempotencyKey,
          result: {
            invoiceId: outcome.invoice.id,
            officialNo: outcome.invoice.invoiceNo,
            offlineReceiptNo: command.sale.offlineReceiptNo,
            journalEntryId: outcome.invoice.postedJournalId,
            replay: outcome.replay,
          },
        };
      }
      // cashier_shift events.
      const result = await this.executeShiftCommand(command);
      return {
        id: command.id,
        status: "ACCEPTED",
        idempotencyKey: command.idempotencyKey,
        result,
      };
    } catch (error) {
      return rejectFrom(error, command);
    }
  }

  private async executeShiftCommand(
    command: CashierShiftCommand,
  ): Promise<Record<string, unknown>> {
    if (command.event === "open") {
      const opened = await this.shiftFlow.open({
        terminalId: command.shift.terminalId,
        openingAmount: command.shift.openingAmount ?? "0",
        denominations: command.shift.denominations ?? null,
        actorId: null,
      });
      return { shiftId: opened.shift.id, alreadyOpen: opened.alreadyOpen };
    }
    const open = await this.shiftFlow.openShiftForTerminal(command.shift.terminalId);
    if (open === undefined) {
      return { shiftId: null, alreadyClosed: true };
    }
    const closed = await this.shiftFlow.close({
      terminalId: command.shift.terminalId,
      shiftId: open.id,
      denominations: command.shift.denominations ?? {},
      reason: command.shift.reason ?? undefined,
      supervisorId: command.shift.supervisorId ?? undefined,
      supervisorPin: command.shift.supervisorPin ?? undefined,
      actorId: null,
    });
    return { shiftId: closed.id, difference: closed.difference };
  }
}

function rejectFrom(error: unknown, command: SyncCommand): PushItemResult {
  const domain = error as { code?: string; message?: string; details?: Record<string, unknown> };
  const reason: PosRejectionReason =
    domain?.code !== undefined &&
    (POS_REJECTION_REASONS as readonly string[]).includes(domain.code)
      ? (domain.code as PosRejectionReason)
      : error instanceof Error && (POS_REJECTION_REASONS as readonly string[]).includes(error.name)
        ? (error.name as PosRejectionReason)
        : "VALIDATION_ERROR";
  return {
    id: command.id,
    status: "REJECTED",
    idempotencyKey: command.idempotencyKey,
    reason,
    message: domain?.message ?? "command rejected by server decision",
    details: domain?.details,
    action:
      reason === "PRICE_CHANGED"
        ? "ACCEPT_SERVER_PRICE"
        : reason === "VALIDATION_ERROR"
          ? "EDIT_AND_RESEND"
          : "CANCEL_WITH_REASON",
  };
}
