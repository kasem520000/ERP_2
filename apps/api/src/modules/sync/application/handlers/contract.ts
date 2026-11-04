import { DomainError } from "@erp/domain-core";

import type { AuditService } from "../../../audit/api/audit";
import type { PosShiftFlowService } from "../../../pos/application/shift-flow-service";
import type { SalesInvoiceService } from "../../../sales/application/invoices";
import type { PosSaleService } from "../../../sales/application/pos-channel/pos-sale-service";

/**
 * PHASE-020 · the handler CONTRACT (split from ./index by the dependency
 * rules — DEPENDENCY_RULES §2.1 no-circular): every handler module imports
 * its types + the shared service accessor + the typed validation throw
 * from THIS leaf, while ./index keeps only the registry (which imports the
 * handler modules). index → handlers → contract stays acyclic; consumers
 * keep importing everything from "./handlers" (index re-exports).
 */

/** The execution context handed to every handler. `deviceClass` comes from
 * the devices row (agent 2-c owns the registry; handlers read the row via
 * the push service, never the registry service). */
export interface SyncHandlerContext {
  readonly deviceId: string;
  /** From the devices row: device_class column, else the platform mapping. */
  readonly deviceClass: string;
  /** devices.user_id — the device's user (audit actor when non-null). */
  readonly userId: string | null;
  readonly command: NormalizedCommand;
}

/** The unified command shape: v2 SyncCommand or the 016 legacy commands,
 * normalized by the push service before dispatch. */
export interface NormalizedCommand {
  /** v2 commandId, or the legacy command `id`. */
  readonly commandId: string;
  /** 'pos_sale' | 'cashier_shift' for legacy; the v2 entityType. */
  readonly entityType: string;
  /** 'create' for legacy pos_sale; 'open'/'close' for legacy shifts; v2 intent. */
  readonly intent: string;
  readonly idempotencyKey: string;
  readonly baseVersion?: number;
  readonly clientCreatedAt: string;
  readonly localRef?: string;
  /** Legacy: the whole command object; v2: the command's payload. */
  readonly payload: unknown;
  readonly legacy: boolean;
}

/** What a successful handler returns. `result` rides the ACCEPTED item;
 * `entity`/`officialNumber`/`effects` are the v2 extensions; `feedEntries`
 * are written to change_log in the same tx as the command (header-only
 * marker payloads — the catch-up writer projects details at pull time). */
export interface HandlerOutcome {
  readonly status: "ACCEPTED";
  readonly result: Record<string, unknown>;
  readonly entity?: { id: string; version: number };
  readonly officialNumber?: string;
  readonly effects?: {
    journalEntryIds?: string[];
    stockMoveIds?: string[];
  };
  readonly localized?: { ar: string; en: string };
  readonly feedEntries?: readonly {
    entityType: string;
    entityId: string;
    op: "UPSERT" | "DELETE";
    payload: Record<string, unknown> | null;
  }[];
}

export type SyncCommandHandler = (ctx: SyncHandlerContext) => Promise<HandlerOutcome>;

// -- service wiring ------------------------------------------------------------
//
// Handlers are module-level functions on a shared registry (the push
// service looks them up by key), so the DI'd service instances they call
// are injected ONCE per process by the PushService constructor (the Nest
// container's instances — single source). Specs instantiate PushService
// directly (the leads.spec pattern), which wires the same slots.

export interface HandlerServices {
  readonly posSales: PosSaleService;
  readonly shiftFlow: PosShiftFlowService;
  readonly audit: AuditService;
  readonly invoices: SalesInvoiceService;
}

let services: HandlerServices | undefined;

/** Called by the PushService constructor (DI container or spec). */
export function configureHandlerServices(injected: HandlerServices): void {
  services = injected;
}

/** The handler modules' accessor; throws loud when unwired (fail closed). */
export function handlerServices(): HandlerServices {
  if (services === undefined) {
    throw new Error(
      "sync handlers are not wired — construct PushService (it calls configureHandlerServices)",
    );
  }
  return services;
}

/** Typed VALIDATION_ERROR throw for handler pre-write validation: maps to
 * the per-item rejection reason VALIDATION_ERROR (SYNC_REJECTION_REASONS)
 * BEFORE any write — the zero-residue rule (the ambient tx cannot roll
 * back per item). */
export function handlerValidationError(
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new DomainError("VALIDATION_ERROR", message, details);
}
