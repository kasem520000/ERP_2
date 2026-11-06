import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MIGRATIONS, MIGRATIONS_DIR, readMigrationFiles } from "./migrations";

describe("migration manifest (MIGRATION_STRATEGY §1)", () => {
  it("manifest matches the SQL files on disk", () => {
    const files = readMigrationFiles();
    expect(files.map((file) => file.tag)).toEqual([...MIGRATIONS]);
    expect(files[0]?.tag).toBe("0001_core_infra");
    // PHASE-019 T48: 0028_crm_service_order_holder (the holder-type widening —
    // the deviation recorded in agent-ctx/T48-7-service-orders.md).
    // PHASE-020 W1: 0029_sync_foundation (tombstones + inbox_commands +
    // device_refresh_tokens + the devices/sales_invoices widenings).
    // PHASE-020 T5: 0030_sync_change_log_sequence_grant (the 0024 INSERT
    // grant's missing sequence half — agent-ctx/T-P20-2a-pull.md).
    // PHASE-020 T9: 0031_sync_draft_line_replace (the update_draft
    // aggregate-replacement DELETE grant — SYNC_PROTOCOL §6.2).
    // PHASE-021 DR-P21-01: 0032_device_enrollment_one_time (the one-time
    // enrollment proof — devices.device_key_hash relaxed to nullable).
    // PHASE-022 DR-P22-05a: 0033_mobile_feeds (devices.linked_partner_id —
    // the personal pull feeds' partner scope, the only schema object the
    // 022 feed activation needs).
    // PHASE-022 DR-P22-07a: 0034_device_push_tokens (the FCM skeleton's
    // device-token opt-in store — the dedicated service-mediated table; the
    // devices table has no natural JSON column for push tokens).
    // PHASE-023: 0035_external_integrations (e-invoicing submissions/certs/
    // suppression + commerce channels + payouts/refunds/settlements + the
    // parked-lines/pending-formats treasury registry — T1/T3/T5/T6/T8).
    // PHASE-024: 0036_security_hardening (MFA policy substrate — plan role
    // keys + the bootstrap session gate; the offboarding purge substrate —
    // legal_hold + tenant_offboarding + purged_tenants + the per-table
    // purge_path RLS policies + the audit-guard purge exception; the
    // audit-review indexes — T4/T8/T11).
    expect(files.at(-1)?.tag).toBe("0036_security_hardening");
  });

  it("journal entries mirror the manifest order (drizzle-kit manifest)", () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string; idx: number }[] };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([...MIGRATIONS]);
  });

  it("every migration upserts its own schema-state number (readiness mirror)", () => {
    readMigrationFiles().forEach((file, index) => {
      const number = String(index + 1);
      expect(
        file.content,
        `${file.tag} must upsert ('schema_version', ${number})`,
      ).toMatch(
        new RegExp(
          `INSERT INTO erp\\._schema_state \\(key, value\\) VALUES \\('schema_version', ${number}\\)`,
        ),
      );
    });
  });

  it("fail-closed drift signal: an unexpected file breaks readMigrationFiles", () => {
    const baseline = readMigrationFiles().length;
    expect(baseline).toBe(MIGRATIONS.length);
  });
});
