import { generateUuidV7 } from "@erp/domain-core";

import type { StorageAdapter } from "../store/adapter";

/**
 * PHASE-016 · the outbox engine (T9; LOCAL_DATABASE §1.2; IDEMPOTENCY_
 * AND_RETRIES): every local write (a POS sale, a shift event) lands in
 * the outbox in the SAME local transaction as the business row — if the
 * device crashes between them, neither exists (atomic local capture).
 *
 * State machine (state honesty, OFFLINE_ARCHITECTURE §5 — the binding
 * rule: no locally created state is EVER presented as posted):
 *
 *   QUEUED ──drain──▶ IN_FLIGHT ──ACCEPTED──▶ ACKED   (official no recorded)
 *                        │
 *                        ├──REJECTED──▶ REJECTED  (typed reason + user action)
 *                        └──crash─────▶ IN_FLIGHT ─boot─▶ QUEUED (re-drain;
 *                                       the server dedupes by idempotency key
 *                                       + posting-operation key — INV-013)
 *
 * `PENDING_SYNC` is the business-facing view: every pos_sales row whose
 * outbox command is not ACKED renders as pending — the official number
 * appears nowhere until the server assigned it.
 */

export type OutboxStatus =
  | "QUEUED"
  | "IN_FLIGHT"
  | "ACKED"
  | "REJECTED"
  | "CANCELLED";

export interface OutboxRow {
  commandId: string;
  entityType: string;
  intent: string;
  payload: string;
  idempotencyKey: string;
  baseVersion: number | null;
  clientCreatedAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  acceptedResult: string | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
  officialNo: string | null;
  ackedAt: string | null;
}

export interface EnqueueInput {
  entityType: string;
  intent: string;
  payload: Record<string, unknown>;
  /** Stable per-command key (the §11 first dedupe layer). */
  idempotencyKey: string;
  baseVersion?: number | null;
  commandId?: string;
}

/** Enqueue a command — MUST be called inside the same local transaction
 * as the business row write (the caller's transaction). */
export function enqueue(adapter: StorageAdapter, input: EnqueueInput): OutboxRow {
  const row: OutboxRow = {
    commandId: input.commandId ?? generateUuidV7(),
    entityType: input.entityType,
    intent: input.intent,
    payload: JSON.stringify(input.payload),
    idempotencyKey: input.idempotencyKey,
    baseVersion: input.baseVersion ?? null,
    clientCreatedAt: new Date().toISOString(),
    status: "QUEUED",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    acceptedResult: null,
    rejectionReason: null,
    rejectionAction: null,
    officialNo: null,
    ackedAt: null,
  };
  adapter.run(
    `INSERT INTO outbox (command_id, entity_type, intent, payload, idempotency_key,
                         base_version, client_created_at, status, attempts, last_error,
                         last_attempt_at, accepted_result, rejection_reason,
                         rejection_action, official_no, acked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.commandId,
      row.entityType,
      row.intent,
      row.payload,
      row.idempotencyKey,
      row.baseVersion,
      row.clientCreatedAt,
      row.status,
      row.attempts,
      row.lastError,
      row.lastAttemptAt,
      row.acceptedResult,
      row.rejectionReason,
      row.rejectionAction,
      row.officialNo,
      row.ackedAt,
    ],
  );
  return row;
}

/** Crash recovery (SYNC_TESTS C-04): at boot, any IN_FLIGHT row (a crash
 * between the server's journal write and our ack) returns to QUEUED —
 * the replay is safe because the server dedupes; the ledger oracle
 * asserts exactly-once effects. */
export function recoverInFlight(adapter: StorageAdapter): number {
  const rows = adapter.all("SELECT * FROM outbox WHERE status = ?", ["IN_FLIGHT"]);
  for (const row of rows) {
    const commandId = String(row.command_id ?? row.commandId);
    adapter.run("UPDATE outbox SET status = ? WHERE command_id = ?", ["QUEUED", commandId]);
  }
  return rows.length;
}

/** The next drain batch (≤ 50, oldest first — the §3 budget). */
export function nextBatch(adapter: StorageAdapter, limit = 50): OutboxRow[] {
  const rows = adapter.all("SELECT * FROM outbox WHERE status = ?", ["QUEUED"]);
  return rows
    .sort((a, b) =>
      String(a.client_created_at ?? "").localeCompare(String(b.client_created_at ?? "")),
    )
    .slice(0, limit)
    .map(fromRow);
}

function fromRow(row: Record<string, unknown>): OutboxRow {
  const read = (snake: string): unknown => {
    const value = row[snake];
    return value === undefined ? null : value;
  };
  return {
    commandId: String(read("command_id")),
    entityType: String(read("entity_type")),
    intent: String(row.intent),
    payload: String(row.payload),
    idempotencyKey: String(read("idempotency_key")),
    baseVersion: (() => {
      const value = read("base_version");
      return value === null ? null : Number(value);
    })(),
    clientCreatedAt: String(read("client_created_at")),
    status: row.status as OutboxStatus,
    attempts: Number(row.attempts ?? 0),
    lastError: (() => {
      const value = read("last_error");
      return value === null ? null : String(value);
    })(),
    lastAttemptAt: (() => {
      const value = read("last_attempt_at");
      return value === null ? null : String(value);
    })(),
    acceptedResult: (() => {
      const value = read("accepted_result");
      return value === null ? null : String(value);
    })(),
    rejectionReason: (() => {
      const value = read("rejection_reason");
      return value === null ? null : String(value);
    })(),
    rejectionAction: (() => {
      const value = read("rejection_action");
      return value === null ? null : String(value);
    })(),
    officialNo: (() => {
      const value = read("official_no");
      return value === null ? null : String(value);
    })(),
    ackedAt: (() => {
      const value = read("acked_at");
      return value === null ? null : String(value);
    })(),
  };
}

/** Mark a batch as IN_FLIGHT (inside the caller's transaction — the
 * status flip and the HTTP send are NOT atomic, which is exactly why
 * crash recovery exists). */
export function markInFlight(adapter: StorageAdapter, commandIds: readonly string[]): void {
  const now = new Date().toISOString();
  for (const commandId of commandIds) {
    adapter.run(
      "UPDATE outbox SET status = ?, last_attempt_at = ?, attempts = attempts + 1 WHERE command_id = ?",
      ["IN_FLIGHT", now, commandId],
    );
  }
}

export interface ApplyResultInput {
  commandId: string;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  officialNo?: string | null;
  acceptedResult?: Record<string, unknown> | null;
  rejectionReason?: string | null;
  rejectionAction?: string | null;
  error?: string | null;
}

/**
 * Apply a per-item push result. ACCEPTED stamps the official number (the
 * ONLY place it enters the local store); REJECTED keeps the typed reason
 * for the shift-end reconciliation screen; DEFERRED returns the command
 * to QUEUED (retryable — the server asked us to back off).
 */
export function applyResult(adapter: StorageAdapter, input: ApplyResultInput): void {
  const now = new Date().toISOString();
  if (input.status === "ACCEPTED") {
    adapter.run(
      `UPDATE outbox SET status = ?, accepted_result = ?, official_no = ?, acked_at = ?,
                         last_error = NULL, rejection_reason = NULL, rejection_action = NULL
       WHERE command_id = ?`,
      [
        "ACKED",
        JSON.stringify(input.acceptedResult ?? {}),
        input.officialNo ?? null,
        now,
        input.commandId,
      ],
    );
  } else if (input.status === "REJECTED") {
    adapter.run(
      `UPDATE outbox SET status = ?, rejection_reason = ?, rejection_action = ?, last_error = ?
       WHERE command_id = ?`,
      ["REJECTED", input.rejectionReason ?? "VALIDATION_ERROR", input.rejectionAction ?? "CANCEL_WITH_REASON", input.error ?? "rejected", input.commandId],
    );
  } else {
    adapter.run(
      "UPDATE outbox SET status = ?, last_error = ? WHERE command_id = ?",
      ["QUEUED", input.error ?? "deferred by server", input.commandId],
    );
  }
}

/** Cancel a rejected command after the user chose CANCEL_WITH_REASON. */
export function cancel(adapter: StorageAdapter, commandId: string): void {
  adapter.run("UPDATE outbox SET status = ? WHERE command_id = ?", ["CANCELLED", commandId]);
}

/** Re-queue a rejected command after the user edited it (EDIT_AND_RESEND). */
export function requeue(
  adapter: StorageAdapter,
  commandId: string,
  payload: Record<string, unknown>,
): void {
  adapter.run(
    "UPDATE outbox SET payload = ?, status = ?, rejection_reason = NULL, rejection_action = NULL WHERE command_id = ?",
    [JSON.stringify(payload), "QUEUED", commandId],
  );
}

/** The user-facing sync state (the offline banner + queue badge). */
export function queueStats(adapter: StorageAdapter): {
  pending: number;
  inFlight: number;
  rejected: number;
  acked: number;
} {
  const rows = adapter.all("SELECT * FROM outbox");
  const stats = { pending: 0, inFlight: 0, rejected: 0, acked: 0 };
  for (const row of rows) {
    if (row.status === "QUEUED") stats.pending += 1;
    else if (row.status === "IN_FLIGHT") stats.inFlight += 1;
    else if (row.status === "REJECTED") stats.rejected += 1;
    else if (row.status === "ACKED") stats.acked += 1;
  }
  return stats;
}

/** Every rejected command with its typed reason (the reconciliation
 * screen listing). */
export function rejectedCommands(adapter: StorageAdapter): OutboxRow[] {
  return adapter.all("SELECT * FROM outbox WHERE status = ?", ["REJECTED"]).map(fromRow);
}
