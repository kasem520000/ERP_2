/**
 * PHASE-016 · the device-side local store contract (LOCAL_DATABASE §1/
 * §1.2; ADR-0012): a minimal synchronous SQL-ish adapter the sync core
 * programs against. Concrete adapters:
 *
 * - **SQLite (the production device store)** — better-sqlite3 inside the
 *   Tauri shell (SQLCipher-encrypted at rest, §4) arriving with
 *   PHASE-021; the versioned DDL lives in `../../migrations` and this
 *   adapter applies them forward-only in one transaction (§2).
 * - **In-memory (tests + the chaos harness)** — `memoryAdapter()`.
 * - **localStorage (the browser terminal bridge)** — the PHASE-016
 *   terminal UI runs in the browser (Tauri packaging is PHASE-021), so
 *   the web outbox persists through the app's own localStorage bridge
 *   (`apps/web/lib/pos-outbox.ts`) rather than this package — recorded
 *   as a §11 decision to reconcile at 020/021 (LOCAL_DATABASE §4 "no
 *   service-worker write cache" stays true: the web queue is an explicit
 *   user-visible PENDING_SYNC surface, never a transparent cache).
 *
 * The interface is deliberately narrow: everything the sync core does
 * must fit these primitives so every adapter behaves identically.
 */

export interface StorageAdapter {
  /** Execute statements inside ONE transaction (all-or-nothing). */
  transaction<T>(fn: () => T): T;
  /** Run a mutating statement (INSERT/UPDATE/DELETE/DDL). */
  run(sql: string, params?: readonly unknown[]): void;
  /** Query rows as plain objects. */
  all(sql: string, params?: readonly unknown[]): Record<string, unknown>[];
  /** Query a single row (or undefined). */
  get(sql: string, params?: readonly unknown[]): Record<string, unknown> | undefined;
}

// -- migrations (LOCAL_DATABASE §2: forward-only, applied at start, one
// transaction, tracked in schema_migrations) --------------------------------------

export interface LocalMigration {
  readonly version: number;
  /** The minimum server contract version this migration understands. */
  readonly minContractVersion: string;
  readonly statements: readonly string[];
}

/** The POS-subset local DDL (§1.1 + §1.2): mirrored read caches + the
 * local write set + the outbox/inbox/cursors/meta machinery. Money and
 * quantities are TEXT (canonical decimal strings — never REAL, ADR-0009). */
export const LOCAL_MIGRATIONS: readonly LocalMigration[] = [
  {
    version: 1,
    minContractVersion: "1.0.0-pos",
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         min_contract_version TEXT NOT NULL,
         applied_at TEXT NOT NULL
       )`,
      // §1.2 core machinery — identical on every write-capable device.
      `CREATE TABLE IF NOT EXISTS outbox (
         command_id TEXT PRIMARY KEY,
         entity_type TEXT NOT NULL,
         intent TEXT NOT NULL,
         payload TEXT NOT NULL,
         idempotency_key TEXT NOT NULL UNIQUE,
         base_version INTEGER,
         client_created_at TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'QUEUED',
         attempts INTEGER NOT NULL DEFAULT 0,
         last_error TEXT,
         last_attempt_at TEXT,
         accepted_result TEXT,
         rejection_reason TEXT,
         rejection_action TEXT,
         official_no TEXT,
         acked_at TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox (status, client_created_at)`,
      `CREATE TABLE IF NOT EXISTS inbox (
         command_id TEXT PRIMARY KEY,
         processed_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS cursors (
         entity_type TEXT PRIMARY KEY,
         last_seq TEXT NOT NULL,
         synced_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      // §1.1 POS mirrored read caches (pull-applied projections).
      `CREATE TABLE IF NOT EXISTS items (
         id TEXT PRIMARY KEY,
         sku TEXT NOT NULL,
         name TEXT NOT NULL,
         name_ar TEXT,
         kind TEXT NOT NULL,
         uom_id TEXT,
         category_id TEXT,
         tax_code_id TEXT,
         base_price TEXT,
         track_batch INTEGER NOT NULL DEFAULT 0,
         track_serial INTEGER NOT NULL DEFAULT 0,
         track_imei INTEGER NOT NULL DEFAULT 0,
         status TEXT NOT NULL,
         updated_at TEXT,
         dirty INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE TABLE IF NOT EXISTS barcodes (
         id TEXT PRIMARY KEY,
         code TEXT NOT NULL,
         item_id TEXT NOT NULL,
         uom_id TEXT,
         updated_at TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS ix_barcodes_code ON barcodes (code)`,
      `CREATE TABLE IF NOT EXISTS uoms (
         id TEXT PRIMARY KEY,
         code TEXT NOT NULL,
         name TEXT NOT NULL,
         name_ar TEXT,
         is_active INTEGER NOT NULL DEFAULT 1,
         updated_at TEXT
       )`,
      `CREATE TABLE IF NOT EXISTS price_list_items (
         id TEXT PRIMARY KEY,
         price_list_id TEXT NOT NULL,
         item_id TEXT NOT NULL,
         uom_id TEXT,
         unit_price TEXT NOT NULL,
         min_qty TEXT NOT NULL,
         updated_at TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS ix_pli_item ON price_list_items (item_id)`,
      `CREATE TABLE IF NOT EXISTS partners (
         id TEXT PRIMARY KEY,
         code TEXT NOT NULL,
         name TEXT NOT NULL,
         name_ar TEXT,
         kind TEXT NOT NULL,
         status TEXT NOT NULL,
         credit_limit TEXT,
         price_list_id TEXT,
         tax_number TEXT,
         updated_at TEXT
       )`,
      `CREATE TABLE IF NOT EXISTS tax_codes (
         id TEXT PRIMARY KEY,
         code TEXT NOT NULL,
         name TEXT NOT NULL,
         name_ar TEXT,
         country_code TEXT NOT NULL,
         default_treatment TEXT NOT NULL,
         rate TEXT,
         status TEXT NOT NULL,
         updated_at TEXT
       )`,
      // §1.1 local write set: the POS sale documents (stamped snapshots;
      // official numbers arrive only via sync results).
      `CREATE TABLE IF NOT EXISTS pos_sales (
         id TEXT PRIMARY KEY,
         offline_receipt_no TEXT NOT NULL UNIQUE,
         terminal_id TEXT NOT NULL,
         customer_id TEXT,
         order_type TEXT NOT NULL,
         invoice_date TEXT NOT NULL,
         total_gross TEXT NOT NULL,
         tenders TEXT NOT NULL,
         lines TEXT NOT NULL,
         local_status TEXT NOT NULL DEFAULT 'PENDING_SYNC',
         official_no TEXT,
         journal_entry_id TEXT,
         synced_at TEXT,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS ix_pos_sales_status ON pos_sales (local_status, created_at)`,
    ],
  },
];

/** Apply pending forward-only migrations in one transaction each (§2.2). */
export function applyMigrations(adapter: StorageAdapter): void {
  adapter.transaction(() => {
    adapter.run(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, min_contract_version TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const applied = new Set(
      adapter.all("SELECT version FROM schema_migrations").map((row) => Number(row.version)),
    );
    for (const migration of LOCAL_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) {
        adapter.run(statement);
      }
      adapter.run("INSERT INTO schema_migrations (version, min_contract_version, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.minContractVersion,
        new Date().toISOString(),
      ]);
    }
  });
}

// -- adapters ------------------------------------------------------------------------

/** The in-memory adapter (unit tests + the chaos harness device store). */
export function memoryAdapter(): StorageAdapter {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  let nextRowId = 0;
  const rowsOf = (table: string) => {
    let rows = tables.get(table);
    if (rows === undefined) {
      rows = new Map();
      tables.set(table, rows);
    }
    return rows;
  };
  const matcher = (row: Record<string, unknown>, where: string, params: readonly unknown[]): boolean => {
    if (where.trim() === "") return true;
    const clauses = where.split(/\s+AND\s+/i).map((clause) => clause.trim());
    let paramIndex = 0;
    for (const clause of clauses) {
      const inMatch = clause.match(/^(\w+)\s+IN\s+\((\?[^)]*)\)$/i);
      if (inMatch !== null) {
        const column = inMatch[1]!;
        const placeholders = inMatch[2]!.split(",").map((token) => token.trim());
        const values = placeholders.map(() => params[paramIndex++]);
        if (!values.includes(row[column])) return false;
        continue;
      }
      const simple = clause.match(/^(\w+)\s*(=|!=|>|<|>=|<=)\s*\?$/);
      if (simple === null) throw new Error(`memoryAdapter: unsupported WHERE clause "${clause}"`);
      const [, column, operator] = simple;
      const value = params[paramIndex++]!;
      const cell = row[column as string];
      switch (operator) {
        case "=":
          if (cell !== value) return false;
          break;
        case "!=":
          if (cell === value) return false;
          break;
        default: {
          const numeric = (input: unknown): number =>
            typeof input === "number" ? input : Number(input ?? 0);
          if (operator === ">" && !(numeric(cell) > numeric(value))) return false;
          if (operator === "<" && !(numeric(cell) < numeric(value))) return false;
          if (operator === ">=" && !(numeric(cell) >= numeric(value))) return false;
          if (operator === "<=" && !(numeric(cell) <= numeric(value))) return false;
        }
      }
    }
    return true;
  };
  const parse = (sql: string): { action: string; table: string; rest: string } => {
    const normalized = sql.trim().replace(/\s+/g, " ");
    const insert = normalized.match(/^INSERT (?:OR REPLACE )?INTO (\w+)\s*(?:\(([^)]*)\))?\s*VALUES\s*\(([^)]*)\)$/i);
    if (insert !== null) {
      return { action: "INSERT", table: insert[1]!, rest: normalized };
    }
    const update = normalized.match(/^UPDATE (\w+) SET (.*?)(?: WHERE (.*))?$/i);
    if (update !== null) {
      return { action: "UPDATE", table: update[1]!, rest: normalized };
    }
    const del = normalized.match(/^DELETE FROM (\w+)(?: WHERE (.*))?$/i);
    if (del !== null) {
      return { action: "DELETE", table: del[1]!, rest: del[2] ?? "" };
    }
    const create = normalized.match(/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX)|DROP|ALTER)/i);
    if (create !== null) return { action: "DDL", table: "", rest: normalized };
    throw new Error(`memoryAdapter: unsupported statement: ${normalized.slice(0, 80)}`);
  };
  return {
    transaction<T>(fn: () => T): T {
      // In-memory: no partial rollback needed for the harness semantics —
      // statements either throw before mutating or complete; nested calls
      // flatten (the caller's outermost transaction wins).
      return fn();
    },
    run(sql: string, params: readonly unknown[] = []): void {
      const { action, table, rest } = parse(sql);
      if (action === "DDL") return;
      if (action === "INSERT") {
        const columnsMatch = rest.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
        if (columnsMatch === null) throw new Error("memoryAdapter INSERT parse failure");
        const columns = columnsMatch[1]!.split(",").map((token) => token.trim());
        const placeholders = columnsMatch[2]!.split(",").map((token) => token.trim());
        const row: Record<string, unknown> = {};
        let paramIndex = 0;
        columns.forEach((column, index) => {
          const placeholder = placeholders[index]!;
          if (placeholder === "?") {
            row[column] = params[paramIndex] ?? null;
            paramIndex += 1;
          } else if (/^'.*'$/i.test(placeholder)) {
            row[column] = placeholder.slice(1, -1);
          } else if (/^-?\d+(\.\d+)?$/i.test(placeholder)) {
            row[column] = Number(placeholder);
          } else {
            row[column] = null;
          }
        });
        const primaryKey = (columns.includes("id") ? "id" : columns[0]!) as string;
        const key = String(row[primaryKey] ?? `row-${(nextRowId += 1)}`);
        rowsOf(table).set(key, row);
        return;
      }
      if (action === "UPDATE") {
        const setMatch = rest.match(/^UPDATE \w+ SET (.*?)(?: WHERE (.*))?$/i);
        const assignments = (setMatch?.[1] ?? "")
          .split(/,\s*(?=\w+\s*=)/)
          .map((assignment) => assignment.trim());
        const where = setMatch?.[2] ?? "";
        // Params arrive in statement order: SET values first, then WHERE.
        const setPlaceholderCount = assignments.filter(
          (assignment) => /^\w+\s*=\s*\?$/.test(assignment),
        ).length;
        const setParams = params.slice(0, setPlaceholderCount);
        const whereParams = params.slice(setPlaceholderCount);
        let setIndex = 0;
        const updates = assignments.map((assignment) => {
          const simple = assignment.match(/^(\w+)\s*=\s*\?$/);
          if (simple !== null) {
            return { column: simple[1]!, value: setParams[setIndex++] };
          }
          const increment = assignment.match(/^(\w+)\s*=\s*\w+\s*\+\s*(\d+)$/);
          if (increment !== null && increment[2] !== undefined) {
            return { column: increment[1]!, increment: Number(increment[2]) };
          }
          const literal = assignment.match(/^(\w+)\s*=\s*(NULL|TRUE|FALSE)$/i);
          if (literal !== null) {
            const raw = literal[2]!.toUpperCase();
            return {
              column: literal[1]!,
              value: raw === "NULL" ? null : raw === "TRUE",
            };
          }
          const quoted = assignment.match(/^(\w+)\s*=\s*'([^']*)'$/i);
          if (quoted !== null) {
            return { column: quoted[1]!, value: quoted[2]! };
          }
          throw new Error(`memoryAdapter SET parse failure: ${assignment}`);
        });
        for (const row of rowsOf(table).values()) {
          if (!matcher(row, where, whereParams)) continue;
          for (const update of updates) {
            if ("increment" in update && update.increment !== undefined) {
              row[update.column] = Number(row[update.column] ?? 0) + update.increment;
            } else if ("value" in update) {
              row[update.column] = update.value;
            }
          }
          void setIndex;
        }
        return;
      }
      // DELETE
      for (const [key, row] of [...rowsOf(table).entries()]) {
        if (matcher(row, table, params)) rowsOf(table).delete(key);
      }
    },
    all(sql: string, params: readonly unknown[] = []): Record<string, unknown>[] {
      const select = sql
        .trim()
        .replace(/\s+/g, " ")
        .match(/^SELECT (\*|[\w, ]+) FROM (\w+)(?: WHERE (.*))?$/i);
      if (select === null) throw new Error(`memoryAdapter: unsupported SELECT: ${sql.slice(0, 80)}`);
      const columns = select[1]!;
      const table = select[2]!;
      const where = select[3] ?? "";
      const rows = [...rowsOf(table).values()].filter((row) => matcher(row, where, params));
      if (columns === "*") return rows;
      const wanted = columns.split(",").map((token) => token.trim());
      return rows.map((row) => {
        const projected: Record<string, unknown> = {};
        for (const column of wanted) projected[column] = row[column];
        return projected;
      });
    },
    get(sql: string, params: readonly unknown[] = []): Record<string, unknown> | undefined {
      return this.all(sql, params)[0];
    },
  };
}
