import { z } from "zod";

import { ISO_DATE_PATTERN, MONEY_AMOUNT_PATTERN, QUANTITY_PATTERN } from "../wire";

/**
 * PHASE-016 · the sync wire contracts (SYNC_PROTOCOL §2/§3 + §11 — the
 * POS-scoped subset): ONE source of truth shared by the server push/pull
 * services and the device-side sync-core. The generalized PHASE-020
 * protocol keeps these shapes verbatim (§11 rule 1: the subset is in
 * scope, not in format; rule 3: 020 must accept a 016 terminal on day
 * one via the contract-version gate).
 */

/** The POS feed group (§11 boundary — pulled read-caches, nothing else). */
export const POS_FEED_ENTITY_TYPES = [
  "items",
  "barcodes",
  "uoms",
  "price_list_items",
  "partners",
  "tax_codes",
] as const;

export type PosFeedEntityType = (typeof POS_FEED_ENTITY_TYPES)[number];

export const POS_FEED_ENTITY_TYPE_SCHEMA = z.enum(POS_FEED_ENTITY_TYPES);

/** Pull envelope (§2): opaque cursor + ordered changes. */
export const pullEnvelopeSchema = z.object({
  entityType: z.string().min(2).max(40),
  cursor: z.string().min(1),
  hasMore: z.boolean(),
  changes: z
    .array(
      z.object({
        id: z.string().min(1),
        seq: z.number().int().nonnegative(),
        op: z.enum(["UPSERT", "DELETE"]),
        payload: z.record(z.string(), z.unknown()).nullable(),
        changedAt: z.string().min(4),
      }),
    )
    .max(1000),
});

export type PullEnvelope = z.infer<typeof pullEnvelopeSchema>;

/** A single change applied through the device store's local transaction. */
export interface PullChange {
  readonly id: string;
  readonly seq: number;
  readonly op: "UPSERT" | "DELETE";
  readonly payload: Record<string, unknown> | null;
  readonly changedAt: string;
}

// -- push commands (§3 + §11) ----------------------------------------------------

const money = z.string().regex(MONEY_AMOUNT_PATTERN);
const qty = z.string().regex(QUANTITY_PATTERN);

/** `pos_sale` — the invoice + lines + tenders aggregate (a POS sale IS a
 * sales invoice; the server executes through the sales module service +
 * posting engine — never a second business-logic path). */
export const posSaleCommandSchema = z.object({
  type: z.literal("pos_sale"),
  id: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(120),
  createdAt: z.string().min(4),
  sale: z.object({
    clientId: z.string().uuid(),
    terminalId: z.string().uuid(),
    offlineReceiptNo: z.string().min(1).max(60),
    invoiceDate: z.string().regex(ISO_DATE_PATTERN),
    customerId: z.string().uuid().nullable(),
    orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "COUNTER"]),
    checkId: z.string().uuid().nullable().optional(),
    lines: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          qty,
          unitPrice: z.string().regex(/^\d+(\.\d{1,6})?$/),
          discountAmount: money.nullable().optional(),
          taxCodeId: z.string().uuid().nullable().optional(),
          serialIds: z.array(z.string().uuid()).nullable().optional(),
        }),
      )
      .min(1)
      .max(200),
    tenders: z
      .array(
        z.object({
          method: z.enum(["CASH", "CARD"]),
          amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
          reference: z.string().max(80).nullable().optional(),
        }),
      )
      .min(1)
      .max(10),
  }),
});

export type PosSaleCommand = z.infer<typeof posSaleCommandSchema>;

/** `cashier_shift` — open/close events over the treasury shift model. */
export const cashierShiftCommandSchema = z.object({
  type: z.literal("cashier_shift"),
  id: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(120),
  createdAt: z.string().min(4),
  event: z.enum(["open", "close"]),
  shift: z.object({
    terminalId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    openingAmount: money.optional(),
    denominations: z.record(z.string(), z.string()).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    supervisorId: z.string().max(80).nullable().optional(),
    supervisorPin: z.string().max(12).nullable().optional(),
  }),
});

export type CashierShiftCommand = z.infer<typeof cashierShiftCommandSchema>;

/** The per-item push results (§3): ACCEPTED / REJECTED / DEFERRED. */
export const POS_REJECTION_REASONS = [
  "PERIOD_LOCKED",
  "PRICE_CHANGED",
  "INSUFFICIENT_STOCK",
  "CREDIT_LIMIT_EXCEEDED",
  "VALIDATION_ERROR",
  "DEVICE_REVOKED",
] as const;

export type PosRejectionReason = (typeof POS_REJECTION_REASONS)[number];

/** CONFLICT_RESOLUTION §3: the user action per typed rejection code. */
export type RejectionAction = "EDIT_AND_RESEND" | "ACCEPT_SERVER_PRICE" | "CANCEL_WITH_REASON";

export function actionForRejection(reason: PosRejectionReason): RejectionAction {
  switch (reason) {
    case "PRICE_CHANGED":
      return "ACCEPT_SERVER_PRICE";
    case "VALIDATION_ERROR":
      return "EDIT_AND_RESEND";
    default:
      return "CANCEL_WITH_REASON";
  }
}

export type PushItemResult =
  | {
      id: string;
      status: "ACCEPTED";
      idempotencyKey: string;
      result: Record<string, unknown>;
    }
  | {
      id: string;
      status: "REJECTED";
      idempotencyKey: string;
      reason: PosRejectionReason;
      message: string;
      details?: Record<string, unknown>;
      action: RejectionAction;
    }
  | {
      id: string;
      status: "DEFERRED";
      idempotencyKey: string;
      reason: string;
      message: string;
    };

export const pushResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(["ACCEPTED", "REJECTED", "DEFERRED"]),
        idempotencyKey: z.string(),
      }),
    )
    .max(50),
});

/** The max batch budget (§3 + phase §6 performance budgets). */
export const MAX_PUSH_BATCH = 50;
