import { generateUuidV7 } from "@erp/domain-core";

import type { StorageAdapter } from "../store/adapter";

/**
 * PHASE-016 · local pull application (T7; SYNC_PROTOCOL §2): apply a
 * pull batch inside ONE local transaction — cursor advance happens ONLY
 * after every change applied (the §2 rule the chaos suite asserts; a
 * crash mid-batch re-pulls the batch, which is idempotent by primary
 * key). Tombstones delete in the same transaction.
 */

export interface LocalCursor {
  entityType: string;
  lastSeq: string;
  syncedAt: number;
}

export function readCursor(adapter: StorageAdapter, entityType: string): string | null {
  const row = adapter.get("SELECT * FROM cursors WHERE entity_type = ?", [entityType]);
  return row === undefined ? null : String(row.last_seq);
}

/** Apply a batch + advance the cursor atomically. Returns the applied
 * count. `upsert`/`remove` are per-entity-type appliers the embedding
 * app provides (the POS terminal maps them onto its local projections). */
export function applyPullBatch(
  adapter: StorageAdapter,
  input: {
    entityType: string;
    cursor: string;
    changes: readonly {
      id: string;
      seq: number;
      op: "UPSERT" | "DELETE";
      payload: Record<string, unknown> | null;
    }[];
  },
  appliers: {
    upsert: (adapter: StorageAdapter, entityType: string, payload: Record<string, unknown>) => void;
    remove: (adapter: StorageAdapter, entityType: string, id: string) => void;
  },
): number {
  return adapter.transaction(() => {
    let applied = 0;
    for (const change of input.changes) {
      if (change.op === "DELETE") {
        appliers.remove(adapter, input.entityType, change.id);
      } else if (change.payload !== null) {
        appliers.upsert(adapter, input.entityType, change.payload);
      }
      applied += 1;
    }
    const now = Date.now();
    const existing = adapter.get("SELECT * FROM cursors WHERE entity_type = ?", [input.entityType]);
    if (existing === undefined) {
      adapter.run("INSERT INTO cursors (entity_type, last_seq, synced_at) VALUES (?, ?, ?)", [
        input.entityType,
        input.cursor,
        now,
      ]);
    } else {
      adapter.run("UPDATE cursors SET last_seq = ?, synced_at = ? WHERE entity_type = ?", [
        input.cursor,
        now,
        input.entityType,
      ]);
    }
    return applied;
  });
}

/**
 * The POS terminal's standard appliers (§1.1 projections): UPSERT maps
 * the feed payload onto the local table by primary key; DELETE removes
 * (tombstones apply immediately, §5 rule 4).
 */
export const posAppliers = {
  upsert(adapter: StorageAdapter, entityType: string, payload: Record<string, unknown>): void {
    const id = String(payload.id ?? "");
    if (id === "") return;
    switch (entityType) {
      case "items":
        adapter.run(
          `INSERT OR REPLACE INTO items (id, sku, name, name_ar, kind, uom_id, category_id,
              tax_code_id, base_price, track_batch, track_serial, track_imei, status, updated_at, dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            id,
            String(payload.sku ?? ""),
            String(payload.name ?? ""),
            payload.nameAr ?? null,
            String(payload.kind ?? "STOCK"),
            payload.uomId ?? null,
            payload.categoryId ?? null,
            payload.taxCodeId ?? null,
            payload.basePrice ?? null,
            payload.trackBatch === true ? 1 : 0,
            payload.trackSerial === true ? 1 : 0,
            payload.trackImei === true ? 1 : 0,
            String(payload.status ?? "ACTIVE"),
            String(payload.changedAt ?? new Date().toISOString()),
          ],
        );
        break;
      case "barcodes":
        adapter.run(
          `INSERT OR REPLACE INTO barcodes (id, code, item_id, uom_id, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [id, String(payload.code ?? ""), String(payload.itemId ?? ""), payload.uomId ?? null, String(payload.changedAt ?? "")],
        );
        break;
      case "uoms":
        adapter.run(
          `INSERT OR REPLACE INTO uoms (id, code, name, name_ar, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, String(payload.code ?? ""), String(payload.name ?? ""), payload.nameAr ?? null, payload.isActive === false ? 0 : 1, String(payload.changedAt ?? "")],
        );
        break;
      case "price_list_items":
        adapter.run(
          `INSERT OR REPLACE INTO price_list_items (id, price_list_id, item_id, uom_id, unit_price, min_qty, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(payload.priceListId ?? ""),
            String(payload.itemId ?? ""),
            payload.uomId ?? null,
            String(payload.unitPrice ?? "0"),
            String(payload.minQty ?? "1"),
            String(payload.changedAt ?? ""),
          ],
        );
        break;
      case "partners":
        adapter.run(
          `INSERT OR REPLACE INTO partners (id, code, name, name_ar, kind, status, credit_limit,
              price_list_id, tax_number, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(payload.code ?? ""),
            String(payload.name ?? ""),
            payload.nameAr ?? null,
            String(payload.kind ?? "CUSTOMER"),
            String(payload.status ?? "ACTIVE"),
            payload.creditLimit ?? null,
            payload.priceListId ?? null,
            payload.taxNumber ?? null,
            String(payload.changedAt ?? ""),
          ],
        );
        break;
      case "tax_codes":
        adapter.run(
          `INSERT OR REPLACE INTO tax_codes (id, code, name, name_ar, country_code,
              default_treatment, rate, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(payload.code ?? ""),
            String(payload.name ?? ""),
            payload.nameAr ?? null,
            String(payload.countryCode ?? ""),
            String(payload.defaultTreatment ?? "NOT_SUBJECT"),
            payload.rate === undefined || payload.rate === null ? null : String(payload.rate),
            String(payload.status ?? "ACTIVE"),
            String(payload.changedAt ?? ""),
          ],
        );
        break;
      default:
        break;
    }
  },
  remove(adapter: StorageAdapter, entityType: string, id: string): void {
    const table =
      entityType === "price_list_items"
        ? "price_list_items"
        : entityType;
    adapter.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  },
};

/** The local meta helpers (contract version, device hash, watermarks). */
export function readMeta(adapter: StorageAdapter, key: string): string | null {
  const row = adapter.get("SELECT * FROM meta WHERE key = ?", [key]);
  return row === undefined ? null : String(row.value);
}

export function writeMeta(adapter: StorageAdapter, key: string, value: string): void {
  const existing = adapter.get("SELECT * FROM meta WHERE key = ?", [key]);
  if (existing === undefined) {
    adapter.run("INSERT INTO meta (key, value) VALUES (?, ?)", [key, value]);
  } else {
    adapter.run("UPDATE meta SET value = ? WHERE key = ?", [value, key]);
  }
}

/** Local capture of a POS sale: the business row + the outbox command in
 * ONE transaction (§3 rule 1 — a crash between them is impossible). */
export function capturePosSale(
  adapter: StorageAdapter,
  input: {
    offlineReceiptNo: string;
    terminalId: string;
    customerId: string | null;
    orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "COUNTER";
    invoiceDate: string;
    totalGross: string;
    tenders: { method: "CASH" | "CARD"; amount: string; reference?: string | null }[];
    lines: {
      itemId: string;
      qty: string;
      unitPrice: string;
      discountAmount?: string | null;
      taxCodeId?: string | null;
      serialIds?: string[] | null;
    }[];
    enqueueCommand: (adapter: StorageAdapter) => void;
  },
): string {
  const clientId = generateUuidV7();
  adapter.transaction(() => {
    adapter.run(
      `INSERT INTO pos_sales (id, offline_receipt_no, terminal_id, customer_id, order_type,
          invoice_date, total_gross, tenders, lines, local_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SYNC', ?)`,
      [
        clientId,
        input.offlineReceiptNo,
        input.terminalId,
        input.customerId,
        input.orderType,
        input.invoiceDate,
        input.totalGross,
        JSON.stringify(input.tenders),
        JSON.stringify(input.lines),
        new Date().toISOString(),
      ],
    );
    input.enqueueCommand(adapter);
  });
  return clientId;
}

/** Mark a captured sale synced (official number recorded alongside). */
export function markSaleSynced(
  adapter: StorageAdapter,
  input: { saleId: string; officialNo: string; journalEntryId: string | null },
): void {
  adapter.run(
    `UPDATE pos_sales SET local_status = 'SYNCED', official_no = ?, journal_entry_id = ?, synced_at = ?
     WHERE id = ?`,
    [input.officialNo, input.journalEntryId, new Date().toISOString(), input.saleId],
  );
}

/** Mark a captured sale rejected (the reconciliation screen's subject). */
export function markSaleRejected(adapter: StorageAdapter, saleId: string): void {
  adapter.run("UPDATE pos_sales SET local_status = 'REJECTED' WHERE id = ?", [saleId]);
}
