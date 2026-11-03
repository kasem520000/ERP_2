import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { isPosFeedEntity, syncFeed } from "./change-log-writer";
import { decodeCursor, encodeCursor } from "./cursor-tokens";
import { PosSyncEntityInvalidError } from "../../pos/domain/pos-errors";

/**
 * PHASE-016 · the narrow pull service (T8; SYNC_PROTOCOL §2): per-entity-
 * type cursors over the POS feed group. The catch-up writer feeds the
 * change_log first (same transaction), then the batch is served strictly
 * in seq order. Page budgets: ≤ 1000 items / ≤ 2 MB (phase §6).
 */
export async function pull(input: {
  entityType: string;
  cursor: string | null;
  limit?: number;
}): Promise<PullEnvelope> {
  if (!isPosFeedEntity(input.entityType)) {
    throw new PosSyncEntityInvalidError(input.entityType);
  }
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const tx = requireTenantContext().tx!;

  // (1) Catch the feed up to the sources (same transaction — a pull never
  // observes a half-fed change_log).
  await syncFeed(input.entityType);

  // (2) Serve the batch strictly in seq order from the cursor position.
  const decoded = input.cursor === null ? undefined : decodeCursor(input.cursor);
  if (decoded === undefined) {
    if (input.cursor !== null) {
      throw new PosSyncEntityInvalidError(`${input.entityType} (cursor rejected — restart from null)`);
    }
  } else if (decoded.entityType !== input.entityType) {
    throw new PosSyncEntityInvalidError(
      `${input.entityType} (cursor belongs to ${decoded.entityType})`,
    );
  }
  const afterSeq: number = decoded === undefined ? 0 : decoded.seq;
  const rows = await tx.execute(sql`
    SELECT seq, entity_id AS "entityId", op, payload, changed_at AS "changedAt"
    FROM change_log
    WHERE entity_type = ${input.entityType} AND seq > ${afterSeq}
    ORDER BY seq ASC
    LIMIT ${limit + 1}
  `);
  const all = rows.rows as unknown as {
    seq: number;
    entityId: string;
    op: "UPSERT" | "DELETE";
    payload: Record<string, unknown> | null;
    changedAt: string;
  }[];
  const hasMore = all.length > limit;
  const batch = hasMore ? all.slice(0, limit) : all;
  const lastSeq = batch.length > 0 ? batch[batch.length - 1]!.seq : afterSeq;

  return {
    entityType: input.entityType,
    cursor: encodeCursor({
      entityType: input.entityType,
      seq: lastSeq,
      issuedAt: new Date().toISOString(),
    }),
    hasMore,
    changes: batch.map((row) => ({
      id: row.entityId,
      seq: row.seq,
      op: row.op,
      payload: row.payload,
      changedAt: row.changedAt,
    })),
  };
}

export interface PullEnvelope {
  entityType: string;
  cursor: string;
  hasMore: boolean;
  changes: readonly {
    id: string;
    seq: number;
    op: "UPSERT" | "DELETE";
    payload: Record<string, unknown> | null;
    changedAt: string;
  }[];
}
