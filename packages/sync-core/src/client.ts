import { POS_FEED_ENTITY_TYPES, type PullEnvelope, type PushItemResult } from "@erp/contracts";

import type { StorageAdapter } from "./store/adapter";
import {
  applyPullBatch,
  markSaleRejected,
  markSaleSynced,
  posAppliers,
  readCursor,
} from "./store/pull";
import {
  applyResult,
  markInFlight,
  nextBatch,
  recoverInFlight,
  type OutboxRow,
} from "./outbox/engine";

/**
 * PHASE-016 · the sync client (T8/T9 consumer side; SYNC_PROTOCOL §2/§3/
 * §8): pulls per entity type until `hasMore` drains, pushes the outbox in
 * ≤ 50-command batches with per-item result application. The transport is
 * injected (the browser terminal: BFF fetch with the device header; the
 * Tauri shell in 021: the same fetch over its HTTP client) — the sync
 * core never owns networking.
 *
 * Sync cadence (§8): periodic every 1 min when the outbox is non-empty +
 * on reconnect triggers; the caller drives both.
 */
export interface SyncTransport {
  /** GET the pull envelope for one entity type at a cursor position. */
  pull(entityType: string, cursor: string | null, limit?: number): Promise<PullEnvelope>;
  /** POST a command batch; returns per-item results. */
  push(batchId: string, commands: readonly Record<string, unknown>[]): Promise<PushItemResult[]>;
}

export interface SyncOutcome {
  pulled: Record<string, number>;
  pushed: number;
  accepted: number;
  rejected: number;
  deferred: number;
}

export class SyncClient {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly transport: SyncTransport,
  ) {}

  /** Boot-time recovery: IN_FLIGHT → QUEUED (C-04 crash resume). */
  recover(): number {
    return recoverInFlight(this.adapter);
  }

  /** Pull every POS feed entity until drained (cursor advance only
   * after each batch's local commit — §2, asserted by the chaos suite). */
  async pullAll(): Promise<Record<string, number>> {
    const pulled: Record<string, number> = {};
    for (const entityType of POS_FEED_ENTITY_TYPES) {
      let total = 0;
      // hasMore loop — bounded by the server's page budgets.
      for (let page = 0; page < 100; page += 1) {
        const cursor = readCursor(this.adapter, entityType);
        const envelope = await this.transport.pull(entityType, cursor);
        const applied = applyPullBatch(
          this.adapter,
          { entityType, cursor: envelope.cursor, changes: envelope.changes },
          posAppliers,
        );
        total += applied;
        if (!envelope.hasMore) break;
      }
      pulled[entityType] = total;
    }
    return pulled;
  }

  /** Drain the outbox: batches of ≤ 50, per-item results applied in the
   * same local transaction batch (C-09 queue drain; C-03 partial-batch
   * failures leave zero residue for the failed command — each item's
   * result application is independent). */
  async pushAll(): Promise<{ pushed: number; accepted: number; rejected: number; deferred: number }> {
    let pushed = 0;
    let accepted = 0;
    let rejected = 0;
    let deferred = 0;
    for (let round = 0; round < 20; round += 1) {
      const batch = nextBatch(this.adapter);
      if (batch.length === 0) break;
      const commands = batch.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
      markInFlight(
        this.adapter,
        batch.map((row) => row.commandId),
      );
      const batchId = `batch:${new Date().toISOString()}:${batch[0]!.commandId}`;
      let results: PushItemResult[];
      try {
        results = await this.transport.push(batchId, commands);
      } catch (error) {
        // Transport failure mid-batch: back to QUEUED (safe replay — the
        // server dedupes; C-01 duplicate push proves zero extra effects).
        for (const row of batch) {
          applyResult(this.adapter, {
            commandId: row.commandId,
            status: "DEFERRED",
            error: `transport: ${String(error)}`,
          });
        }
        break;
      }
      this.applyResults(batch, results);
      pushed += batch.length;
      for (const result of results) {
        if (result.status === "ACCEPTED") accepted += 1;
        else if (result.status === "REJECTED") rejected += 1;
        else deferred += 1;
      }
    }
    return { pushed, accepted, rejected, deferred };
  }

  /** One full cycle (the reconnect trigger + the periodic tick). */
  async sync(): Promise<SyncOutcome> {
    const pulled = await this.pullAll();
    const push = await this.pushAll();
    return { pulled, ...push };
  }

  private applyResults(batch: readonly OutboxRow[], results: readonly PushItemResult[]): void {
    const byId = new Map(batch.map((row) => [row.commandId, row]));
    for (const result of results) {
      const row = byId.get(result.id);
      if (row === undefined) continue;
      this.adapter.transaction(() => {
        if (result.status === "ACCEPTED") {
          applyResult(this.adapter, {
            commandId: row.commandId,
            status: "ACCEPTED",
            officialNo:
              typeof result.result?.officialNo === "string" ? result.result.officialNo : null,
            acceptedResult: result.result ?? null,
          });
          // Mark the captured sale row SYNCED (official number recorded
          // alongside the OFF- reference — the 1:1 reconciliation pair).
          const payload = JSON.parse(row.payload) as { sale?: { clientId?: string } };
          if (payload.sale?.clientId !== undefined) {
            markSaleSynced(this.adapter, {
              saleId: payload.sale.clientId,
              officialNo:
                typeof result.result?.officialNo === "string" ? result.result.officialNo : "",
              journalEntryId:
                typeof result.result?.journalEntryId === "string"
                  ? result.result.journalEntryId
                  : null,
            });
          }
        } else if (result.status === "REJECTED") {
          applyResult(this.adapter, {
            commandId: row.commandId,
            status: "REJECTED",
            rejectionReason: result.reason,
            rejectionAction: result.action,
            error: result.message,
          });
          const payload = JSON.parse(row.payload) as { sale?: { clientId?: string } };
          if (payload.sale?.clientId !== undefined) {
            markSaleRejected(this.adapter, payload.sale.clientId);
          }
        } else {
          applyResult(this.adapter, {
            commandId: row.commandId,
            status: "DEFERRED",
            error: result.message,
          });
        }
      });
    }
  }
}
