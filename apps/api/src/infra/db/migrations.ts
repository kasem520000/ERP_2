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
  // PHASE-021 DR-P21-01 (MASTER-PLAN §1 item 2): devices.device_key_hash
  // relaxed to nullable — the one-time enrollment proof's "consumed" state
  // is NULL (POST /api/v1/devices/:id/enroll clears it on success).
  // Backward compatible: every existing writer still provides a hash.
  // See 0032_device_enrollment_one_time.sql.
  "0032_device_enrollment_one_time",
  // PHASE-022 DR-P22-05a (MASTER-PLAN §1 item 5): devices.linked_partner_id —
  // the personal-account device's linked partner, the server-side partner
  // scope for the personal pull feeds (LOCAL_DATABASE §1.1 rule 2). Nullable
  // plain uuid (devices stays service-mediated — no cross-plane FK); NULL =
  // no linkage → the personal pull serves an empty partner scope (fail
  // closed). No business-schema change. See 0033_mobile_feeds.sql.
  "0033_mobile_feeds",
  // PHASE-022 DR-P22-07a (MASTER-PLAN §1 item 7): the FCM skeleton's
  // device-token opt-in store — the dedicated service-mediated table (the
  // 0029 device_refresh_tokens pattern; devices has no natural JSON column
  // for push tokens). opted_in defaults FALSE (explicit opt-in, default OFF);
  // one active row per device (uq device_id), a token never belongs to two
  // devices (uq token); revocation clears the rows. No business-schema change
  // (the DR-P22-05a reading). See 0034_device_push_tokens.sql.
  "0034_device_push_tokens",
  // PHASE-023 (external integrations): the operational e-invoicing registry
  // expansion (submissions × adapter 1:N, attempts/backoff, sealed
  // payload/response artifacts, retry sweep), the S-10 certificate store +
  // append-only usage audit (secret-store PATH only — key material lives in
  // the files module), per-tenant adapter rollout flags (default OFF), the
  // bank-statement parked lines + seeded format registry, the commerce
  // channel staging tables (natural-key upsert, server-decision conflicts),
  // and the billing payout batches (T6 reconciliation substrate). See
  // 0035_external_integrations.sql.
  "0035_external_integrations",
  // PHASE-024: 0036_security_hardening.sql (MFA policy substrate + the
  // offboarding purge path + audit-review indexes — T4/T8/T11).
  "0036_security_hardening",
  // PHASE-026: 0037_fixed_assets.sql (the fixed_assets module per DR-002
  // option A: asset_categories/assets/depreciation_runs/depreciation_lines 🔒/
  // asset_disposals/asset_revaluations + the six v2.0 CoA purposes + 13
  // permission seeds + plan/role grants + the RC-10 reconciliation kind).
  "0037_fixed_assets",
  // PHASE-027: 0038_notes_installments.sql (the notes & installments modules
  // per DR-003/ED-03 option A: notes/note_events 🔒/installment_plans/
  // installment_lines + the treasury_allocations note_id widening (the
  // settle/restore substrate) + the four v2.0 CoA purposes (1160/2150/4920/
  // 5260) + the notes.notes.return seed (0004/0005 in-phase edits) + the 12
  // feature-key plan grants + the RC-11 'NOTES' kind + the notification
  // category widening).
  "0038_notes_installments",
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
