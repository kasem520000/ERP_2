import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";

/**
 * PHASE-016 · the POS feed-group change-log writer (T8; SYNC_PROTOCOL §2/
 * §11 — the NARROW slice): a catch-up writer that runs at pull time — it
 * reads the POS feed group's source tables for rows changed since the
 * feed's last watermark and appends `change_log` rows inside the pull
 * transaction. The frozen substrate modules (items/partners/tax) are NOT
 * modified to write the feed (their invariants stay untouched); the feed
 * is a read-model projection they never know about. PHASE-020 replaces
 * this with in-transaction writers across all entity types.
 *
 * The watermark per entity type lives ON the change_log tail (the max
 * source changedAt already fed) — restart-safe and idempotent: re-feeding
 * a source row appends another UPSERT (seq order preserved; clients apply
 * last-writer-wins), never a duplicate primary effect.
 */

/** The POS feed group (§11): pulled read-caches — nothing else (binding). */
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

interface ProjectedChange {
  changedAt: string;
  id: string;
  op: "UPSERT" | "DELETE";
  payload: Record<string, unknown>;
}

/** Source projection per entity type: (changedAt, id, payload) rows — the
 * pulled read-cache shape (LOCAL_DATABASE §1.1 POS subset). */
async function projectSource(
  entityType: PosFeedEntity,
  since: string | null,
  limit: number,
): Promise<ProjectedChange[]> {
  const tx = requireTenantContext().tx!;
  const sinceClause = since === null ? sql`IS NULL` : sql`> ${since}`;
  const sinceFallback = since === null;
  switch (entityType) {
    case "items": {
      const rows = await tx.execute(sql`
        SELECT i.id, i.updated_at AS "changedAt", i.sku, i.name, i.name_ar AS "nameAr",
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
        SELECT b.id, b.updated_at AS "changedAt", b.code, b.item_id AS "itemId", b.uom_id AS "uomId"
        FROM barcodes b
        WHERE (${sinceFallback}::boolean AND b.updated_at IS NOT NULL)
           OR b.updated_at ${sinceClause}
        ORDER BY b.updated_at NULLS FIRST, b.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
    case "uoms": {
      const rows = await tx.execute(sql`
        SELECT u.id, u.updated_at AS "changedAt", u.code, u.name, u.name_ar AS "nameAr",
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
        SELECT p.id, p.updated_at AS "changedAt", p.price_list_id AS "priceListId",
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
        SELECT p.id, p.updated_at AS "changedAt", p.code, p.name, p.name_ar AS "nameAr",
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
        SELECT t.id, t.updated_at AS "changedAt", t.code, t.name, t.name_ar AS "nameAr",
               t.country_code AS "countryCode", t.default_treatment AS "defaultTreatment",
               t.snapshot_policy AS "snapshotPolicy", t.status
        FROM tax_codes t
        WHERE (${sinceFallback}::boolean AND t.updated_at IS NOT NULL)
           OR t.updated_at ${sinceClause}
        ORDER BY t.updated_at NULLS FIRST, t.id LIMIT ${limit}
      `);
      return (rows.rows as unknown as Record<string, unknown>[]).map(mapRow);
    }
  }
}

function mapRow(row: Record<string, unknown>): ProjectedChange {
  return {
    changedAt: String(row.changedAt),
    id: String(row.id),
    op: row.deletedAt === null || row.deletedAt === undefined ? "UPSERT" : "DELETE",
    payload: row,
  };
}

/** Feed the change log from the sources (catch-up), return the new
 * watermark for the entity type. Chunked per SYNC_PROTOCOL §2.5. */
export async function syncFeed(entityType: PosFeedEntity, chunk = 500): Promise<string | null> {
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
  }
  if (projected.length === chunk) {
    // Keep draining until under a chunk (bounded recursion; the writer is
    // bounded per call and the next pull drains the rest — §2.5 chunking).
    return syncFeed(entityType, chunk);
  }
  return projected.length > 0 ? projected[projected.length - 1]!.changedAt : watermark;
}
