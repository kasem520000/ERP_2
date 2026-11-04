# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-04

## The single next action

**Execute PHASE-021 — Desktop Application** per
[../implementation/phases/PHASE-021.md](../implementation/phases/PHASE-021.md): ship the
Windows-first desktop client as a **Tauri v2 shell** around the static-exported web ERP
([ADR-0013](../architecture/ADR/ADR-0013-tauri-desktop.md)) — Rust-side plugins for local
SQLite (SQLCipher, WAL) consumed through the PHASE-020 `packages/sync-core` client,
OS-keychain credential storage (refresh token, device key, SQLite key — access tokens
memory-only), the **signed auto-update channel with crash-rate-gated staged rollout**,
crash recovery that preserves the outbox, receipt/printer integration points, and
WebView2 minimum-version enforcement with graceful degradation. Offline behavior is
exactly the desktop column of the OFFLINE_CAPABILITIES_MATRIX: cached read models with
as-of-cursor labels + OFFLINE-DRAFT creation where the matrix allows (rows 6, 7, 10, 11,
21, 23, 25, 26, 34) — never a disconnected back office; ONLINE-ONLY operations disabled
with the "requires connection" reason; offline login = app unlock against the cached
permission snapshot degrading to read-only after the 7-day watermark.

Why now: PHASE-020 is COMPLETE (2026-11-04; evidence:
[../planning/IMPLEMENTATION_STATUS.md](../planning/IMPLEMENTATION_STATUS.md) PHASE-020
row + the completion report at
  `docs/implementation/phases/reports/PHASE-020-COMPLETION.md`
— written by the orchestrator with this phase's close-out)
— **the Offline Synchronization Foundation is live**: the `sync` module (migrations
0029–0031, schema_version 31) owns the device registry with `tauri-desktop` as a
first-class device class, 4 device-class feed groups + the 9-entity catch-up writer +
the permissions snapshot feed, pull v2 / push v2 with typed per-item results and the
full conflict-policy set (SERVER_DECISION / FIELD_LEVEL_MERGE / OWNER_DEVICE_WINS /
ONLINE_ONLY), inbox dedupe + rate limiting + DEFERRED, refresh-token rotation with
reuse detection, four maintenance jobs, the reconciliation queue + admin health
aggregate, and the three platform web screens; `packages/sync-core` v1 ships the
reference client engine (runCycle, retry, recovery, pruning, watermark — LOCAL_MIGRATIONS
v2). The FULL chaos matrix C-01…C-16 + duplicates + D-series + Y-series suites are green
and blocking (9 files / 74 tests in `apps/api/src/__db__/sync/`; sync-core 36/36).
PHASE-021 builds directly on it: the Tauri shell hosts the sync client UNMODIFIED, the
SQLite store is the LOCAL_DATABASE §1.1 desktop subset with byte-exact LRU budgets
(020 shipped the documented row-count approximation), and the contract-version gate +
grace window (`2026-11-04.1` / `2026-10-27.1`) are already enforced server-side.

How:

1. Follow the handoff protocol: read the PHASE-020 material first (the completion
   report; migrations `0029`–`0031`; the `sync` module — pull/push/registry/health
   services, handlers, jobs, the admin controller; `packages/sync-core` — cycle,
   retry, recovery, pruning, watermark + the LOCAL_MIGRATIONS v2 store contract),
   then the consumed-as-is specs: ADR-0013 (Tauri shell),
   [../offline/LOCAL_DATABASE.md](../offline/LOCAL_DATABASE.md) (§1.1 desktop subset,
   §5 budgets, §6.4 corruption path),
   [../offline/OFFLINE_CAPABILITIES_MATRIX.md](../offline/OFFLINE_CAPABILITIES_MATRIX.md)
   (the desktop column),
   [../offline/SECURITY_AND_DEVICE_MANAGEMENT.md](../offline/SECURITY_AND_DEVICE_MANAGEMENT.md)
   (§3 keychain, §4 revocation), and
   [../offline/SYNC_PROTOCOL.md](../offline/SYNC_PROTOCOL.md) (§8 desktop triggers).
2. Confirm prerequisites per the dependency graph: PHASE-020 ✓ (+ PHASE-019 ✓,
   PHASE-018 ✓, PHASE-016 ✓ — the POS terminal interop proof, PHASE-013 ✓ (printing),
   PHASE-005 ✓ (the web UI being wrapped), PHASE-001 ✓ (`apps/desktop` placeholder) —
   all verified in IMPLEMENTATION_STATUS).
3. Register any intake keys first per the FEATURE_CATALOG §25 protocol —
   `offline.desktop_app` is already catalogued (permission key: app install; depends
   on `offline.sync_protocol`, granted business+enterprise via the 0029 plan grants).
4. Honor the binding constraints: the shell hosts the PHASE-020 sync client UNMODIFIED
   (no protocol forks); app logic stays TypeScript (Rust confined to plugins); no
   secrets in SQLite, logs, or preferences (keychain only; access tokens memory-only);
   offline writes only where the capabilities matrix allows (OFFLINE-DRAFT set);
   honest local states (`DRAFT_LOCAL`/`PENDING_MERGE`/`SYNC_FAILED` rendered
   distinctly, `PENDING_SYNC` never as posted); the static export must not depend on
   Next.js server features at runtime (build-target check in CI); signed updates with
   staged rollout gates; crash recovery preserves the outbox.
5. Do NOT implement PHASE-022+ in the same run.

## Next eligible: PHASE-021 — Desktop Application

Per [../planning/PHASE_DEPENDENCY_GRAPH.md](../planning/PHASE_DEPENDENCY_GRAPH.md):
PHASE-021 requires PHASE-020 ✓ (plus the delivered stack PHASE-019 ✓, PHASE-018 ✓,
PHASE-017 ✓, PHASE-016 ✓, PHASE-015 ✓, PHASE-013 ✓, PHASE-005 ✓ …). **PHASE-022 —
Android Application — becomes parallel-eligible once 021 lands** (the Expo client rides
the same sync-core engine + device classes; its field/personal feed groups are already
live server-side). The agent protocol executes one phase at a time.

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

- Do not implement PHASE-022+ in the same run as PHASE-021.
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
