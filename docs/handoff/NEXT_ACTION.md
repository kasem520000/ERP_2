# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-05

## The single next action

**Execute PHASE-024 — Security Hardening & Compliance Review** per
[../implementation/phases/PHASE-024.md](../implementation/phases/PHASE-024.md): execute the
SECURITY_TEST_PLAN §11 penetration test across its full scope (multi-tenancy/RLS with a
tenant-pair setup, auth + MFA, POS, the complete API surface, sync endpoints,
uploads/exports, native clients, the e-invoicing sandbox surface, CI/CD exposure) with
severity-mapped remediation SLAs (Critical 7d release-blocking / High 30d / Medium 90d /
Low next release); enforce MFA policies per role/plan (completing ADR-0015 §4) with
admin-assisted reset and the WebAuthn/passkeys decision record; re-verify rate-limit and
lockout behavior (R-01…R-08); execute the secrets-rotation drill once (S-03 dual-accept
window, S-01 DB credentials, S-11 webhook signers; S-10 certificate rotation rehearsed
against the fake-authority harness only); complete dependency triage (audit + SBOM);
ship tenant-admin audit review tooling; the CSP/headers final pass; drive the
privacy-notices legal review to a recorded retention decision (OQ-009); verify the
tenant-offboarding purge job end-to-end; review support-access auditing; and refresh the
threat model for every surface added since PHASE-001 — leaving the findings log at
`docs/operations/security-findings.md` with retest proofs and regression tests.

Why now: PHASE-023 is COMPLETE (2026-11-05; evidence:
[../planning/IMPLEMENTATION_STATUS.md](../planning/IMPLEMENTATION_STATUS.md) PHASE-023
row + the completion report at
  `docs/implementation/phases/reports/PHASE-023-COMPLETION.md`
— written by the orchestrator with this phase's close-out)
— **the External Integrations & E-Invoicing surface is live**: the operational
submission registry (migration 0035, schema_version 35 — 1:N per adapter, retry chains,
sealed artifacts), the S-10 certificate store with its append-only usage audit, the
per-tenant adapter rollout flags default OFF with the certificate-before-enablement
gate, the ZATCA adapter as the honestly-UNVERIFIED refuse-to-submit stub (the
verification gate items are all NOT_VERIFIED in the delivery environment — DR-001 stays
OPEN with option C recommended), the fake-authority harnesses (fake-zatca/fake-eta)
driving the real registry+jobs through submit/accept/reject/timeout/retry/DLQ, the
bank-statement parking + two new format families, the commerce channel staging import
(`sales.commerce.manage` — the 244-key catalog), and the sandbox payment hardening
(refund + payout reconciliation; DR-002 OPEN — no production cutover claim).
PHASE-024 builds directly on it: the pen-test scope list includes the e-invoicing
sandbox surface verbatim, and the S-10 rotation drill rides the shipped certificate
service against the fake-authority harness.

How:

1. Follow the handoff protocol: read the PHASE-023 material first (the completion
   report; migration `0035_external_integrations.sql`; the `tax/submissions` state
   machine + registry + jobs + monitoring; `tax/certs`; `tax/adapters/zatca` (the
   refusing stub); `tax/rollout`; `treasury/parsers`; `sales/adapters/commerce`;
   `tenancy/application/billing/refund-payout-service.ts`; `tests/authorities/`),
   then the consumed-as-is specs:
   [../security/SECURITY_TEST_PLAN.md](../security/SECURITY_TEST_PLAN.md) §11/§13/§14,
   [../security/SECRETS_MANAGEMENT.md](../security/SECRETS_MANAGEMENT.md) §3/§7,
   [../architecture/ADR/ADR-0015-authentication.md](../architecture/ADR/ADR-0015-authentication.md) §4,
   and the threat-model baseline
   [../security/THREAT_MODEL.md](../security/THREAT_MODEL.md).
2. Confirm prerequisites per the dependency graph: PHASE-023 ✓ (+ the full delivered
   stack PHASE-001…022 ✓ — all verified in IMPLEMENTATION_STATUS).
3. Register any intake keys first per the FEATURE_CATALOG §25 protocol — PHASE-024
   adds tooling over existing surfaces; new feature keys (audit review tooling,
   MFA policy admin) follow the protocol before landing.
4. Honor the binding constraints: findings ingested the same day the report lands;
   fix SLAs enforced with waivers only via decision record; every fixed finding gets
   a retest proof + an automated regression test where automatable; the external
   pen-test leg is infra-gated (record the substitute honestly per the follow-up
   obligations pattern if no external firm is reachable); drills executed, not
   described.
5. Do NOT implement PHASE-025+ in the same run.

## Next eligible: PHASE-024 — Security Hardening & Compliance Review

Per [../planning/PHASE_DEPENDENCY_GRAPH.md](../planning/PHASE_DEPENDENCY_GRAPH.md):
PHASE-024 requires PHASE-023 ✓ (plus the delivered stack PHASE-001…022 ✓). **PHASE-025
(GA readiness) becomes eligible once 024 lands.** The agent protocol executes one
phase at a time.

## Follow-up obligations (waived evidence — attach at first infra availability)

- First GitHub CI green run on `main` (ci.yml) — PHASE-001 (local gate output is
  the recorded substitute).
- `docker compose up -d` healthcheck capture on a Docker-capable host — PHASE-001.
- First ci-db.yml (Testcontainers) run — PHASE-002 (the embedded-PG16 db suite is
  the recorded local substitute).
- Hosted k6 runs — PHASE-007 posting smoke + **PHASE-014 MVP-candidate scenario**
  (`apps/api/k6/mvp-candidate.ts` — the local harness
  `src/__db__/performance/mvp-candidate.local.spec.ts` is the recorded substitute).
- Staging-tier restore rehearsal with the managed-PITR path (the sandbox drill of
  2026-11-01 is the recorded first rehearsal — BACKUP_RESTORE_RUNBOOK §8 actions).
- CI gitleaks full-history scan — MVP_SECURITY_REVIEW §0 (the targeted local grep is
  the recorded substitute).
- `release/v1.0.0` tag: created in the delivery repository when the archive is
  restored to a git checkout (this sandbox hands over a zip; the tag instruction is
  recorded in the PHASE-014 completion report §Release).

## Do NOT

- Do not implement PHASE-025+ in the same run as PHASE-024.
- Do not modify the ADRs or the roadmap without the change-control process
  ([IMPLEMENTATION_PROTOCOL.md](IMPLEMENTATION_PROTOCOL.md) §3).
- Do not relax the frozen substrates (PHASE-002 infra, PHASE-003 identity trust,
  PHASE-004 provisioning/entitlements, PHASE-007 posting-engine invariants,
  PHASE-009 tax contracts + snapshot semantics INV-022, PHASE-010 stock-ledger
  append-only semantics INV-010/017/018, PHASE-011 match-before-approval +
  GRNI/RC-09 semantics, PHASE-012 §3.4 explicit-allocation open-item semantics +
  original-cost re-entry W-3, PHASE-013 report-contract semantics +
  assertion-gated exports + the audited print/export artifact trail, PHASE-014
  billing lifecycle + INV-022 limit discipline + the both-paths A-009 parity,
  PHASE-015 configuration-engine semantics — additive-only switching BR-038,
  fail-closed resolution (a failed resolution is a typed error, never a
  partially-defaulted config), L2 jurisdiction-pack values read-only to tenants,
  terminology presentation-only (glossary meanings and data-model semantics never
  change), PHASE-016 POS/sync semantics — the SYNC_PROTOCOL §11 narrow-slice
  boundary, exactly-once posting through INV-013 keys, offline state honesty
  (`PENDING_SYNC` never renders as posted; official numbers are server-side only),
  unpaid floor checks hold no ledger effect, and the three DR-016-0x deviation
  records, PHASE-017 semantics — planning-only routes/visits (no route/visit
  operation writes a journal), van stock as VAN warehouses through ordinary
  transfers with `stock_moves` as the only stock truth (the `van_stocks` mirror is
  refreshed inside the owning transaction), settlement variance always posts
  approval-gated never netted + the (rep, date) day-lock + POSTED immutability,
  tier resolution never overriding a quoted price (BR-003), FOC lines as
  reason-coded zero-price lines that still issue stock and post COGS (BR-008),
  commissions never modifying an invoice or its VAT, and job cards posting only
  through the sales module service + the centralized posting engine (no ledger
  before INVOICED), **PHASE-018 semantics — production journals only through the
  four canonical rows in POSTING_ENGINE §4 (consume / complete / scrap / qc_scrap),
  per-order WIP netting to exactly zero at completion, consumption through the
  inventory `planIssue`/`applyIssue` seam only (manufacturing never writes stock
  tables), BOM versions bound at release and never mutated under an open order,
  consumption variance flags a review but NEVER blocks (correction is an adjusted
  consumption), scrap reason-coded and ≤ the order's WIP balance, the QUARANTINED
  batch status excluding stock from FEFO/availability until inspection decides, and
  genealogy strictly read-only (never alters a posted document)**) to make
  PHASE-019 easier — changes need decision records.
- Do not let any usage-limit or billing behavior block posting or touch posted
  data and reconciliation (INV-022 — billing pressure uses notifications +
  billing, not ledger locks).
- Do not post journal rows from any module bypassing the posting engine
  (ADR-0007) — the PHASE-007 boundary meta-tests enforce this.
- Do not fabricate tax rates or legal rules (directive §1.12–1.13) — the
  compliance-matrix provenance chain is mandatory; new pack facts ship as
  versioned seed migrations with verification records.
- Do not recompute tax on offline devices or rewrite stamped snapshots
  (BR-033) — offline caches stamps (PHASE-016/020), it never recomputes.
- Do not write `stock_moves`/`stock_layers` from outside the inventory
  module (MODULE_BOUNDARIES — inventory exclusively owns them; PHASE-018
  consumption/completion goes through the sanctioned seams).
- Do not net credit notes against invoices silently in reports — the §3.4
  explicit-allocation model (invoice gross-open, note its own row) is the
  honest presentation PHASE-012 established; netting is a derived display
  total, never a mutation.
- Do not build dashboard widgets as parallel query implementations — widgets
  bind to registered report contracts with pinned parameters
  ([../reporting/REPORT_CATALOG.md](../reporting/REPORT_CATALOG.md) §14) and
  open the underlying report on click.
- Do not invent pricing numbers to "finish" billing work — every price and
  numeric limit stays PLACEHOLDER pending OQ-002 (seed-only configuration).
- Do not grow the offline queue past the SYNC_PROTOCOL §11 POS boundary —
  generalization is PHASE-020; deviations are decision records, not code.
