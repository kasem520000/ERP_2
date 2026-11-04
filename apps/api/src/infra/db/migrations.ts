import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration manifest (MIGRATION_STRATEGY §1): the ordered `NNNN_description`
 * tags mirror `apps/api/migrations/meta/_journal.json` and the SQL files on
 * disk. `/health/ready` compares `erp.schema_version()` (upserted by every
 * migration) against this list; a stale build against a newer schema fails
 * readiness. The unit test `migrations.spec.ts` asserts manifest ↔ journal ↔
 * files never drift.
 *
 * Convention: every `NNNN_*.sql` must upsert
 * `INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', N)`
 * with its own number — enforced by the same unit test.
 */
export const MIGRATIONS: readonly string[] = [
  "0001_core_infra",
  "0002_rls_macro",
  "0003_identity_core",
  "0004_permissions_seed",
  "0005_system_role_templates_seed",
  "0006_tenancy_provisioning",
  "0007_accounts_schema",
  "0008_platform_seeds",
  "0009_partners_items",
  "0010_accounting_core",
  "0011_journal_tables",
  "0012_treasury",
  "0013_tax",
  "0014_inventory_core",
  "0015_inventory_tracking",
  "0016_purchasing_core",
  "0017_purchasing_ap",
  "0018_sales_core",
  "0019_sales_ar",
  "0020_reporting_core",
  "0021_subscriptions_billing",
  "0022_industry_configuration",
  "0023_notifications_categories",
  "0024_pos_core",
  "0025_automotive_distribution",
  "0026_manufacturing",
  "0027_crm_projects",
  // PHASE-019 T48 (the recorded deviation — agent-ctx/T48-7-service-orders.md):
  // 0027 missed the stock_reservations.holder_type widening for
  // SERVICE_ORDER holders (0025 gave JOB_CARD its counterpart in the same
  // migration that created job_cards); this re-issues the CHECK with
  // 'SERVICE_ORDER' added. Additive only — see 0028_crm_service_order_holder.sql.
  "0028_crm_service_order_holder",
  // PHASE-020 (MASTER-PLAN §3): the offline synchronization foundation —
  // tombstones + inbox_commands (tenant-owned, RLS), device_refresh_tokens
  // (the sessions pattern), the devices registry widening, the
  // sales_invoices owner-device stamp, the sync permission re-assertions
  // and the offline.* plan grants. See 0029_sync_foundation.sql.
  "0029_sync_foundation",
  // PHASE-020 T5 (the substrate fix, agent-ctx/T-P20-2a-pull.md): 0024
  // granted erp_app INSERT on change_log but missed USAGE on its bigserial
  // sequence change_log_seq_seq — the feed writers could never append as
  // erp_app. Additive grant only. See 0030_sync_change_log_sequence_grant.sql.
  "0030_sync_change_log_sequence_grant",
  // PHASE-020 T9 (SYNC_PROTOCOL §6.2 aggregate snapshots): the sync
  // update_draft handler replaces DRAFT invoice lines wholesale
  // (DELETE + re-INSERT); 0018 never granted DELETE (online drafts are
  // append-only). DRAFT-only by handler discipline + OWNER_DEVICE_WINS
  // single-writer. See 0031_sync_draft_line_replace.sql.
  "0031_sync_draft_line_replace",
];

/**
 * Module-system independent resolution (tsc CJS __dirname vs vitest ESM):
 * prefer the package-local `migrations/` of the invoking workspace, then the
 * monorepo-root-relative path for callers at other cwds.
 */
function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), "migrations"),
    join(process.cwd(), "apps", "api", "migrations"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

export const MIGRATIONS_DIR: string = resolveMigrationsDir();

export interface MigrationFile {
  tag: string;
  content: string;
}

/** Reads and returns every migration SQL file in manifest order. */
export function readMigrationFiles(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const tags = files.map((name) => name.replace(/\.sql$/, ""));
  if (tags.join(",") !== MIGRATIONS.join(",")) {
    throw new Error(
      `Migration drift: manifest [${MIGRATIONS.join(", ")}] vs files [${tags.join(", ")}]`,
    );
  }
  return files.map((name, index) => ({
    tag: tags[index]!,
    content: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
  }));
}
