import { sql } from "drizzle-orm";
import { generateUuidV7 } from "@erp/domain-core";

import { PULLED_ENTITY_TYPES } from "@erp/contracts";

import { requireTenantContext } from "../../../infra/db/tenant-context";

/**
 * PHASE-016 · the POS feed-group change-log writer (T8; SYNC_PROTOCOL §2/
 * §11 — the NARROW slice): a catch-up writer that runs at pull time — it
 * reads the POS feed group's source tables for rows changed since the
 * feed's last watermark and appends `change_log` rows inside the pull
 * transaction. The frozen substrate modules (items/partners/tax) are NOT
 * modified to write the feed (their invariants stay untouched); the feed
 * is a read-model projection they never know about.
 *
 * PHASE-020 · the generalized writer (T5; SYNC_PROTOCOL §2 + MASTER-PLAN
 * §1.3/§5): the same catch-up pattern widened from the 016 POS subset to
 * every registered FEED-GROUP entity (pos_terminals + cashier_shifts join
 * the pos group; sales_invoices headers join the desktop group — lines
 * are NOT pulled in 020, desktop doc-detail is online), each projected
 * payload carries the source row's `version` (the optimistic-concurrency
 * source, CONFLICT_RESOLUTION §4), and soft-deleted rows (items/partners
 * `deleted_at`) now ALSO upsert a `tombstones` row — the feed entry is
 * the transport (op:'DELETE', payload null on the wire), the tombstones
 * table is the GC-boundary ledger (0029). Sources without a soft-delete
 * lifecycle (pos_terminals/cashier_shifts — 0024: "no delete — documents
 * reference terminals"; uoms/tax_codes/barcodes/price_list_items) never
 * tombstone: their deactivation is ordinary data (status INACTIVE /
 * ARCHIVED rides the UPSERT payload).
 *
 * The watermark per entity type lives ON the change_log tail (the max
 * source changedAt already fed) — restart-safe and idempotent: re-feeding
 * a source row appends another UPSERT (seq order preserved; clients apply
 * last-writer-wins), never a duplicate primary effect.
 */

/** The POS feed group (016 §11 — kept verbatim for the 016 compat surface). */
export const POS_FEED_ENTITIES = [
  "items",
  "barcodes",
  "uoms",
  "price_list_items",
  "partners",
  "tax_codes",
] as const;

export type PosFeedEntity = (typeof POS_FEED_ENTITIES)[number];

export function isPosFeedEntity(entityType: string): entityType is PosFeedEntity {
  return (POS_FEED_ENTITIES as readonly string[]).includes(entityType);
}

/** Every feed-group entity the generalized writer can project (contracts). */
export type FeedEntity = (typeof PULLED_ENTITY_TYPES)[number];

export function isFeedEntity(entityType: string): entityType is FeedEntity {
  return (PULLED_ENTITY_TYPES as readonly string[]).includes(entityType);
}

interface ProjectedChange {
  changedAt: string;
  id: string;
  op: "UPSERT" | "DELETE";
  payload: Record<string, unknown> | null;
}

/** Source projection per entity type: (changedAt, id, op, payload) rows —
 * the pulled read-cache shape (LOCAL_DATABASE §1.1). Every source table
 * carries a `version` column (verified per migration: 0009 items/
 * partners/barcodes/uoms/price_list_items, 0013 tax_codes, 0012
 * cashier_shifts, 0018 sales_invoices, 0024 pos_terminals) — it rides the
 * payload verbatim; DELETE projections keep the source payload in
 * change_log (the watermark reads payload->>'changedAt') but the pull
 * envelope nulls it (op:'DELETE' + payload:null, MASTER-PLAN §1.1). */
async function projectSource(
  entityType: FeedEntity,
  since: string | null,
  limit: number,
): Promise<ProjectedChange[]> {
  const tx = requireTenantContext().tx!;
  const sinceClause = since === null ? sql`IS NULL` : sql`> ${since}`;
  const sinceFallback = since === null;
  switch (entityType) {
    case "items": {
      const rows = await tx.execute(sql`
        SELECT i.id, i.updated_at AS "changedAt", i.version, i.sku, i.name, i.name_ar AS "nameAr",
               i.kind, i.uom_id AS "uomId", i.category_id AS "categoryId",
               i.tax_code_id AS "taxCodeId", i.base_price AS "basePrice",
               i.track_batch AS "trackBatch", i.track_serial AS "trackSerial",
               i.track_imei AS "trackImei", i.status, i.deleted_at AS "deletedAt"
        FROM items i
        WHERE (${sinceFallback}::boolean AND i.updated_at IS NOT NULL)
           OR i.updated_at ${sinceClause}
        ORDER BY i.updated_at NULLS FIRST, i.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "barcodes": {
      const rows = await tx.execute(sql`
        SELECT b.id, b.updated_at AS "changedAt", b.version, b.code, b.item_id AS "itemId", b.uom_id AS "uomId"
        FROM barcodes b
        WHERE (${sinceFallback}::boolean AND b.updated_at IS NOT NULL)
           OR b.updated_at ${sinceClause}
        ORDER BY b.updated_at NULLS FIRST, b.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "uoms": {
      const rows = await tx.execute(sql`
        SELECT u.id, u.updated_at AS "changedAt", u.version, u.code, u.name, u.name_ar AS "nameAr",
               u.is_system AS "isSystem", u.is_active AS "isActive"
        FROM uoms u
        WHERE (${sinceFallback}::boolean AND u.updated_at IS NOT NULL)
           OR u.updated_at ${sinceClause}
        ORDER BY u.updated_at NULLS FIRST, u.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "price_list_items": {
      const rows = await tx.execute(sql`
        SELECT p.id, p.updated_at AS "changedAt", p.version, p.price_list_id AS "priceListId",
               p.item_id AS "itemId", p.uom_id AS "uomId", p.unit_price AS "unitPrice",
               p.min_qty AS "minQty"
        FROM price_list_items p
        JOIN price_lists l ON l.id = p.price_list_id AND l.tenant_id = p.tenant_id
        WHERE l.status = 'ACTIVE'
          AND ((${sinceFallback}::boolean AND p.updated_at IS NOT NULL) OR p.updated_at ${sinceClause})
        ORDER BY p.updated_at NULLS FIRST, p.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "partners": {
      const rows = await tx.execute(sql`
        SELECT p.id, p.updated_at AS "changedAt", p.version, p.code, p.name, p.name_ar AS "nameAr",
               p.kind, p.status, p.credit_limit AS "creditLimit",
               p.price_list_id AS "priceListId", p.tax_number AS "taxNumber",
               p.deleted_at AS "deletedAt"
        FROM partners p
        WHERE (${sinceFallback}::boolean AND p.updated_at IS NOT NULL)
           OR p.updated_at ${sinceClause}
        ORDER BY p.updated_at NULLS FIRST, p.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "tax_codes": {
      const rows = await tx.execute(sql`
        SELECT t.id, t.updated_at AS "changedAt", t.version, t.code, t.name, t.name_ar AS "nameAr",
               t.country_code AS "countryCode", t.default_treatment AS "defaultTreatment",
               t.snapshot_policy AS "snapshotPolicy", t.status
        FROM tax_codes t
        WHERE (${sinceFallback}::boolean AND t.updated_at IS NOT NULL)
           OR t.updated_at ${sinceClause}
        ORDER BY t.updated_at NULLS FIRST, t.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    // PHASE-020 (020 pos group): the terminal registry projection — the
    // device's own configuration feed (0024 columns; no deleted_at —
    // terminals have no delete lifecycle, deactivation rides status).
    case "pos_terminals": {
      const rows = await tx.execute(sql`
        SELECT t.id, t.updated_at AS "changedAt", t.version, t.code, t.name, t.name_ar AS "nameAr",
               t.branch_id AS "branchId", t.cash_account_id AS "cashAccountId",
               t.warehouse_id AS "warehouseId", t.receipt_size AS "receiptSize", t.status,
               t.device_id AS "deviceId", t.offline_seq AS "offlineSeq"
        FROM pos_terminals t
        WHERE (${sinceFallback}::boolean AND t.updated_at IS NOT NULL)
           OR t.updated_at ${sinceClause}
        ORDER BY t.updated_at NULLS FIRST, t.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    // PHASE-020 (020 pos group): the cashier-shift projection — the
    // operational subset (0012 + 0024 columns: terminal linkage, blind
    // count, supervisor verification; no deleted_at — shifts are closed,
    // never deleted).
    case "cashier_shifts": {
      const rows = await tx.execute(sql`
        SELECT s.id, s.updated_at AS "changedAt", s.version,
               s.pos_terminal_id AS "terminalId", s.status,
               s.opened_at AS "openedAt", s.closed_at AS "closedAt",
               s.opening_amount AS "openingAmount", s.counted_amount AS "countedAmount",
               s.difference, s.denominations,
               s.supervisor_id AS "supervisorId", s.supervisor_verified_at AS "supervisorVerifiedAt"
        FROM cashier_shifts s
        WHERE (${sinceFallback}::boolean AND s.updated_at IS NOT NULL)
           OR s.updated_at ${sinceClause}
        ORDER BY s.updated_at NULLS FIRST, s.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    // PHASE-020 (020 desktop group): the sales-invoice HEADER projection
    // — DRAFT+POSTED read cache. Lines are NOT pulled in 020: desktop
    // doc-detail is online (MASTER-PLAN §1.5 scope honesty). Money rides
    // the row's numeric totals (total_gross = the document amount).
    case "sales_invoices": {
      const rows = await tx.execute(sql`
        SELECT v.id, v.updated_at AS "changedAt", v.version, v.invoice_no AS "invoiceNo",
               v.status, v.kind, v.channel, v.customer_id AS "customerId",
               v.invoice_date AS "orderDate", v.total_gross AS "totalAmount",
               v.currency_code AS "currency", v.owner_device_id AS "ownerDeviceId"
        FROM sales_invoices v
        WHERE (${sinceFallback}::boolean AND v.updated_at IS NOT NULL)
           OR v.updated_at ${sinceClause}
        ORDER BY v.updated_at NULLS FIRST, v.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
  }
}

function mapRow(row: Record<string, unknown>): ProjectedChange {
  const deleted = row.deletedAt !== null && row.deletedAt !== undefined;
  // pg hands timestamptz back as Date: JSON.stringify (the payload write)
  // renders ISO, and the explicit changedAt/tombstone values must be ISO
  // too (a bare String(Date) is the locale format pg cannot re-parse).
  const changedAt =
    row.changedAt instanceof Date ? row.changedAt.toISOString() : String(row.changedAt);
  return {
    changedAt,
    id: String(row.id),
    op: deleted ? "DELETE" : "UPSERT",
    // The source payload is kept on DELETE rows in change_log (the
    // watermark reads payload->>'changedAt'); the pull envelope nulls it.
    payload: row,
  };
}

/**
 * The tombstone upsert (MASTER-PLAN §5.7 — idempotent on the 0029 UQ
 * (tenant_id, entity_type, entity_id); gc_after = deleted_at + 90d, the
 * weekly GC sweep's boundary).
 */
async function upsertTombstone(entityType: string, entityId: string, deletedAt: string): Promise<void> {
  const tx = requireTenantContext().tx!;
  await tx.execute(sql`
    INSERT INTO tombstones (id, tenant_id, entity_type, entity_id, deleted_at, gc_after)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${entityType}, ${entityId},
            ${deletedAt}::timestamptz, ${deletedAt}::timestamptz + interval '90 days')
    ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE
      SET deleted_at = EXCLUDED.deleted_at, gc_after = EXCLUDED.gc_after
  `);
}

/** Feed the change log from the sources (catch-up), return the new
 * watermark for the entity type. Chunked per SYNC_PROTOCOL §2.5. */
export async function syncFeed(entityType: FeedEntity, chunk = 500): Promise<string | null> {
  const tx = requireTenantContext().tx!;
  const watermarkRow = await tx.execute(sql`
    SELECT max((payload->>'changedAt')) AS wm FROM change_log WHERE entity_type = ${entityType}
  `);
  let watermark: string | null = null;
  const tail = (watermarkRow.rows as unknown as { wm: string | null }[])[0];
  if (tail !== undefined && tail.wm !== null && tail.wm !== undefined) {
    watermark = tail.wm;
  }
  const projected = await projectSource(entityType, watermark, chunk);
  for (const change of projected) {
    await tx.execute(sql`
      INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload)
      VALUES (erp.current_tenant_id(), ${entityType}, ${change.id}, ${change.op},
              ${JSON.stringify(change.payload)}::jsonb)
    `);
    if (change.op === "DELETE") {
      await upsertTombstone(entityType, change.id, change.changedAt);
    }
  }
  if (projected.length === chunk) {
    // Keep draining until under a chunk (bounded recursion; the writer is
    // bounded per call and the next pull drains the rest — §2.5 chunking).
    return syncFeed(entityType, chunk);
  }
  return projected.length > 0 ? projected[projected.length - 1]!.changedAt : watermark;
}

/** One in-transaction feed entry (the pushed-command writer, below). */
export interface FeedEntry {
  entityType: string;
  entityId: string;
  op: "UPSERT" | "DELETE";
  payload: Record<string, unknown> | null;
  changedAt?: string;
}

/**
 * PHASE-020 · the in-transaction feed writer for pushed-command execution
 * (SYNC_PROTOCOL §9 note 4 — feed propagation is transactional with
 * command execution): appends `change_log` rows for the entities a
 * command touched, called by the push side AFTER command execution in the
 * SAME ambient tenant tx. The payload rides verbatim (JSON-stringified
 * like the catch-up writer; its `version` field is the row version the
 * pull envelope surfaces — null on DELETE). DELETE ops also upsert the
 * tombstones row. Empty input is a no-op.
 */
export async function publishFeedEntries(entries: readonly FeedEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const tx = requireTenantContext().tx!;
  for (const entry of entries) {
    const changedAt = entry.changedAt ?? new Date().toISOString();
    await tx.execute(sql`
      INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload, changed_at)
      VALUES (erp.current_tenant_id(), ${entry.entityType}, ${entry.entityId}, ${entry.op},
              ${entry.payload === null ? sql`NULL` : sql`${JSON.stringify(entry.payload)}::jsonb`},
              ${changedAt}::timestamptz)
    `);
    if (entry.op === "DELETE") {
      await upsertTombstone(entry.entityType, entry.entityId, changedAt);
    }
  }
}
