/**
 * PHASE-020 · the per-intent push handler registry (MASTER-PLAN §4/§6/§7;
 * SYNC_PROTOCOL §3 + §6; CONFLICT_RESOLUTION §2). One handler per
 * `entityType:intent` key; the push service normalizes v2 + legacy
 * commands into ONE NormalizedCommand and dispatches through this
 * registry. Handlers call OWNING module services only (MODULE_BOUNDARIES —
 * sync adds transport, never a second business-logic path), validate
 * BEFORE any write (zero-residue: the ambient request tx cannot roll back
 * per item — SYNC_PROTOCOL §3.3/§6.3), and declare their feed entries so
 * the push service writes them in the SAME transaction as the command
 * (MASTER-PLAN §1.3b).
 *
 * The shared handler contract (types, service wiring, the typed
 * validation throw) lives in ./contract — a leaf, so the handler modules
 * never import this registry file (DEPENDENCY_RULES §2.1 no-circular;
 * everything below stays re-exported for "./handlers" consumers).
 */
export {
  configureHandlerServices,
  handlerServices,
  handlerValidationError,
  type HandlerOutcome,
  type HandlerServices,
  type NormalizedCommand,
  type SyncCommandHandler,
  type SyncHandlerContext,
} from "./contract";

import { posSaleCreateHandler } from "./pos-sale";
import { shiftCloseHandler, shiftOpenHandler } from "./shift";
import { partnerContactMergeHandler } from "./partner-merge";
import {
  draftInvoiceCreateHandler,
  draftInvoiceUpdateHandler,
} from "./draft-invoice";
import type { SyncCommandHandler } from "./contract";

/** key: `${entityType}:${intent}` — the ONLINE_ONLY entities never
 * register a handler (CONFLICT_RESOLUTION §2 last row: the push service
 * rejects them BEFORE handler lookup). */
export const HANDLER_REGISTRY: ReadonlyMap<string, SyncCommandHandler> = new Map<
  string,
  SyncCommandHandler
>([
  ["pos_sale:create", posSaleCreateHandler],
  ["cashier_shift:open", shiftOpenHandler],
  ["cashier_shift:close", shiftCloseHandler],
  ["partner:contact_merge", partnerContactMergeHandler],
  ["sales_invoice:create_draft", draftInvoiceCreateHandler],
  ["sales_invoice:update_draft", draftInvoiceUpdateHandler],
]);

/** Handler lookup by (entityType, intent). */
export function handlerFor(entityType: string, intent: string): SyncCommandHandler | undefined {
  return HANDLER_REGISTRY.get(`${entityType}:${intent}`);
}

/** The registry keys in stable order — rides REJECTED details.supported
 * when a command names an unknown intent (the client can self-diagnose). */
export function handlerRegistryKeys(): string[] {
  return [...HANDLER_REGISTRY.keys()];
}
