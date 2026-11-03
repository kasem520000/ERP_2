import { generateUuidV7 } from "@erp/domain-core";

import type { StorageAdapter } from "../store/adapter";

/**
 * PHASE-016 · the terminal-scoped OFF- receipt numbering (BR-030/A-010;
 * DOCUMENT_LIFECYCLE §4): a per-terminal monotone sequence kept in local
 * meta (`offline_seq:{terminalId}`). `OFF-{terminalCode}-{seq}` is a
 * LOCAL reference only — it reconciles 1:1 to the official number the
 * server assigns at sync (the receipt prints both after sync; before
 * sync it prints the OFF- number plus a pending-sync notice and the
 * official number appears NOWHERE — OFFLINE_ARCHITECTURE §5).
 */
export function nextOfflineNumber(
  adapter: StorageAdapter,
  terminalCode: string,
  terminalId: string,
): string {
  const key = `offline_seq:${terminalId}`;
  const current = Number(adapter.get("SELECT * FROM meta WHERE key = ?", [key])?.value ?? "0");
  const next = current + 1;
  if (current === 0) {
    adapter.run("INSERT INTO meta (key, value) VALUES (?, ?)", [key, String(next)]);
  } else {
    adapter.run("UPDATE meta SET value = ? WHERE key = ?", [String(next), key]);
  }
  return `OFF-${terminalCode}-${String(next).padStart(5, "0")}`;
}

/** Read the current sequence without advancing (diagnostics/UX). */
export function currentOfflineSeq(adapter: StorageAdapter, terminalId: string): number {
  return Number(adapter.get("SELECT * FROM meta WHERE key = ?", [`offline_seq:${terminalId}`])?.value ?? "0");
}

// -- command builders (the §11 push intents; shapes shared with the server
// through @erp/contracts) ----------------------------------------------------------

export interface PosSaleDraft {
  clientId: string;
  terminalId: string;
  offlineReceiptNo: string;
  invoiceDate: string;
  customerId: string | null;
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "COUNTER";
  checkId?: string | null;
  lines: {
    itemId: string;
    qty: string;
    unitPrice: string;
    discountAmount?: string | null;
    taxCodeId?: string | null;
    serialIds?: string[] | null;
  }[];
  tenders: { method: "CASH" | "CARD"; amount: string; reference?: string | null }[];
}

/** Build the `pos_sale` command from a captured draft. The idempotency
 * key is `pos_sale:{clientId}` — stable across re-drains and app
 * restarts (the §11 first dedupe layer; INV-013 is the server-side
 * second layer on the posting-operation key). */
export function buildPosSaleCommand(draft: PosSaleDraft): {
  type: "pos_sale";
  id: string;
  idempotencyKey: string;
  createdAt: string;
  sale: PosSaleDraft;
} {
  return {
    type: "pos_sale",
    id: draft.clientId,
    idempotencyKey: `pos_sale:${draft.clientId}`,
    createdAt: new Date().toISOString(),
    sale: draft,
  };
}

/** Build a `cashier_shift` open event. */
export function buildShiftOpenCommand(input: {
  terminalId: string;
  clientId?: string;
  openingAmount: string;
  denominations?: Record<string, string> | null;
}): {
  type: "cashier_shift";
  id: string;
  idempotencyKey: string;
  createdAt: string;
  event: "open";
  shift: {
    terminalId: string;
    clientId?: string;
    openingAmount: string;
    denominations?: Record<string, string> | null;
  };
} {
  const clientId = input.clientId ?? generateUuidV7();
  return {
    type: "cashier_shift",
    id: clientId,
    idempotencyKey: `cashier_shift:open:${clientId}`,
    createdAt: new Date().toISOString(),
    event: "open",
    shift: {
      terminalId: input.terminalId,
      clientId,
      openingAmount: input.openingAmount,
      ...(input.denominations === undefined ? {} : { denominations: input.denominations }),
    },
  };
}

/** Build a `cashier_shift` close event (blind count + optional
 * supervisor attestation for the beyond-tolerance path). */
export function buildShiftCloseCommand(input: {
  terminalId: string;
  denominations: Record<string, string>;
  reason?: string | null;
  supervisorId?: string | null;
  supervisorPin?: string | null;
}): {
  type: "cashier_shift";
  id: string;
  idempotencyKey: string;
  createdAt: string;
  event: "close";
  shift: {
    terminalId: string;
    denominations: Record<string, string>;
    reason?: string | null;
    supervisorId?: string | null;
    supervisorPin?: string | null;
  };
} {
  const id = generateUuidV7();
  return {
    type: "cashier_shift",
    id,
    idempotencyKey: `cashier_shift:close:${input.terminalId}:${id}`,
    createdAt: new Date().toISOString(),
    event: "close",
    shift: {
      terminalId: input.terminalId,
      denominations: input.denominations,
      ...(input.reason === undefined || input.reason === null ? {} : { reason: input.reason }),
      ...(input.supervisorId === undefined || input.supervisorId === null ? {} : { supervisorId: input.supervisorId }),
      ...(input.supervisorPin === undefined || input.supervisorPin === null ? {} : { supervisorPin: input.supervisorPin }),
    },
  };
}
