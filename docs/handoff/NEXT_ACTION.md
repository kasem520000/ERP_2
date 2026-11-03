# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-03

## The single next action

**Execute PHASE-019 — CRM, Service Contracts & Projects** per
[../implementation/phases/PHASE-019.md](../implementation/phases/PHASE-019.md): ship the
`crm` module — leads with conversion into partners (NEW → QUALIFIED → CONVERTED / LOST
with reasons; conversion creates or merges the partner with explicit confirmation and
links the lead forever), tasks/activities/reminders on the PHASE-015 notification rails
(no ledger effects ever), service contracts with a billing schedule (monthly retainer /
fixed-fee milestones / hourly against time entries — **the contract posts nothing**),
recurring billing that generates **DRAFT invoices idempotently per (contract, period)**
through the ordinary sales-invoice approval/posting chain, deferred-revenue wiring for
prepaid retainers (`DEFERRED_REVENUE` release at invoice posting), service orders as
the **generalization of PHASE-017 job cards** (contract link + CRM workflow, NO
posting-rule fork), and the **projects dimension** (`accounting.projects`) as a
cost-center-type analytical stamp on documents, journal lines, and reports — then apply
the `industry.professional_services` template on top.

Why now: PHASE-018 is COMPLETE (2026-11-03; evidence:
[../planning/IMPLEMENTATION_STATUS.md](../planning/IMPLEMENTATION_STATUS.md) PHASE-018
row + the completion report at
  `docs/implementation/phases/reports/PHASE-018-COMPLETION.md` — written by the
  orchestrator with this phase's close-out)
— **Manufacturing & Production is live**: the `manufacturing` module (versioned BOMs
with the multi-level explosion, production orders on the documented lifecycle with
`PRD-{YYYY}-{SEQ:5}` numbering at release, batch-tracked consumption into WIP through
the inventory issue seam, completion as the single absorption journal — materials +
labor 5410 + overhead 5420 — receiving the FG batch at computed cost with shelf-life
expiry, per-order WIP netting to exactly zero, reason-coded scrap, the QUARANTINED QC
gate, read-only batch genealogy, and the INV-010 WIP reconciliation check live in the
health center) plus the `industry.food_manufacturing` template at v1.0.0 on the
unmodified PHASE-015 engine (CURRENT_SHIPPED_PHASE 18; restaurant switch safety
BR-038 proven; reports registry 66; permission matrix 241 = seed union drift-green).
PHASE-019 builds directly on it: the job-card generalization seam is documented in the
PHASE-017 completion report (§2.6 reconciliation — service orders do NOT fork the
posting rules), the projects dimension extends the proven PHASE-007 cost-centers
pattern, recurring billing rides the idempotency + approval disciplines the platform
has proven since INV-013, and the notification rails (inbox + email) are live from
PHASE-014/015. The PHASE-019 prerequisites note is explicit: "consumes the
partner/contract patterns 017 stabilized."

How:

1. Follow the handoff protocol: read the PHASE-018 material first (the completion
   report; migration `0026_manufacturing.sql`; the `manufacturing` module — BOM/
   orders/inspections/genealogy services + the WIP reconciliation wiring; the three
   018 industry reports in `reporting/registry/industry/phase018.ts`; the
   `food_manufacturing` template activation in `configuration`), then the
   consumed-as-is reports: PHASE-017 (job cards + the §2.6 generalization note;
   commissions runs as the pg-boss + immutable-post pattern), PHASE-012 (the sales
   invoice chain the drafts flow into), PHASE-007 (cost centers as the projects
   precedent; `DEFERRED_REVENUE` purpose), PHASE-015 (template engine),
   PHASE-013 (report contract), PHASE-014 (notification inbox).
2. Confirm prerequisites per the dependency graph: PHASE-018 ✓ (+ PHASE-017 ✓,
   PHASE-016 ✓, PHASE-015 ✓, PHASE-014 ✓, PHASE-013 ✓, PHASE-012 ✓, PHASE-011 ✓,
   PHASE-010 ✓, PHASE-009 ✓, PHASE-008 ✓, PHASE-007 ✓, PHASE-005 ✓, PHASE-004 ✓ —
   all verified in IMPLEMENTATION_STATUS).
3. Register any intake keys first per the FEATURE_CATALOG §25 protocol (decision
   record → row → plan/add-on → permission seeds → phase-document reference) — the
   `crm.*` feature keys and permissions are already catalogued/matrixed (planned
   rows); confirm entitlement closure before template work.
4. Honor the binding constraints: the service contract posts nothing — only its
   generated documents do; billing runs generate DRAFTS idempotently per (contract,
   period) and never bypass approval policies or period locks; the deferred-revenue
   reclassification posts through the engine (policy-gated, audited); service orders
   generalize job cards WITHOUT a posting-rule fork (same invoice chain, same
   journals); projects stamp journal lines as an analytical dimension (never a GL
   split); leads convert to partners through the partners module service (BR-025 code
   rules; merge requires explicit confirmation); the professional-services template
   applies through the unmodified PHASE-015 engine (BR-038 additive-only semantics).
5. Do NOT implement PHASE-020+ in the same run.

## Next eligible: PHASE-019 — CRM, Service Contracts & Projects

Per [../planning/PHASE_DEPENDENCY_GRAPH.md](../planning/PHASE_DEPENDENCY_GRAPH.md):
PHASE-019 requires PHASE-018 ✓ (plus the delivered stack PHASE-017 ✓, PHASE-016 ✓,
PHASE-015 ✓, PHASE-014 ✓, PHASE-013 ✓, PHASE-012 ✓, PHASE-007 ✓ …). **PHASE-020 —
Offline Sync Foundation — is parallel-eligible from here** (016 → 020; it must accept
a PHASE-016 terminal on day one and will generalize the van-sales offline rows the
capabilities matrix keeps at PHASE-022 — PHASE-018 deliberately shipped zero
sync-client code, grep-verified). The agent protocol executes one phase at a time.

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

- Do not implement PHASE-020+ in the same run as PHASE-019.
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
