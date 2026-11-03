# Changelog

> **Status:** LIVING DOCUMENT — append-only, newest first · **Updated:** 2026-11-03

Format: `DATE — item — type` where type ∈ {BLUEPRINT, PHASE-NNN, DOCS, BREAKING-ARCH, DECISION}.

- 2026-11-03 — **PHASE-018 — Manufacturing & Production (COMPLETE)**: migration
  `0026_manufacturing.sql` (schema_version 26) — 7 new RLS'd tenant tables +
  additive widenings + CoA markers + the template seed + permission/plan/role
  grants. `bills_of_materials` + `bom_lines` (versioned recipes per item —
  `uq (tenant, item, version_no)` + the partial-unique one-ACTIVE-per-item rule;
  `0 < yield_pct <= 100`; per-component `qty_per_output` + `scrap_pct`; DRAFT
  full-replace through the DELETE-granted lines; activate stamps `effective_from`
  and archives the previous ACTIVE). `production_orders` + `production_order_lines`
  (DRAFT → RELEASED → IN_PROGRESS → COMPLETED / CANCELLED-before-consumption with
  reason; the CANCELLED-shape CHECK; labor_rate/overhead_rate;
  `yield_snapshot` bound at release; fg_batch_id/fg_journal_id;
  fg/wip_credit/labor/overhead value columns; the `over_plan` variance flag on
  lines). `production_consumptions` (batch-tracked issue rows with per-slice
  journal refs + the partial index on batch). `production_scraps` (reason_code
  1..40 NOT NULL; value ≤ the order's WIP balance service-enforced). `inspections`
  (production_order\|goods_receipt targets with shape CHECKs; PASS\|FAIL +
  sampled/sample_size; dispositions ACCEPT\|SCRAP\|REWORK\|RETURN_TO_SUPPLIER
  required on FAIL by CHECK). Widenings: `item_batches.status` + QUARANTINED
  (FEFO/availability exclude it; explicit-batch issues throw BATCH_QUARANTINED),
  `stock_moves.source_type` + production_order, `warehouses.role` RAW\|WIP\|FG,
  `items.shelf_life_days`, `item_batches.production_order_id` produced-batch
  provenance (composite FK). CoA template markers: `1160 WIP` + `5120
  PRODUCTION_SCRAP` + the `5400` absorption group with `5410 PRODUCTION_LABOR` /
  `5420 PRODUCTION_OVERHEAD` (fail-closed PURPOSE_NOT_MAPPED at completion when
  the corresponding rate > 0). 8 permission seeds (`manufacturing.boms.manage`,
  `manufacturing.production_orders.{view,create,approve,post}` — approve/post
  RISKY — `manufacturing.qc.manage`, `manufacturing.genealogy.read`,
  `manufacturing.costing.read`; matrix 238 → 241 = the seed union drift-green) +
  plan grants (the seven `manufacturing.*` feature keys → business + enterprise;
  starter excluded) + role-template grants (owner/viewer/warehouse/accountant).
  `industry.food_manufacturing` seeded at v1.0.0 verbatim from the docs manifest.
  The `manufacturing` module: BomService (DRAFT→ACTIVE→ARCHIVED versioning;
  activate archives the previous ACTIVE; the multi-level explosion
  `round6(planned_qty × qty_per_output × (1 + scrap_pct/100) ÷ (yield_pct/100))`
  with cycle detection `BOM_CYCLE` + depth cap — property-proven composed
  level-by-level === single-pass; order planned lines are level-1 only, chaining
  via separate semi-finished orders); ProductionOrderService (release reserves +
  binds `PRD-{YYYY}-{SEQ:5}` per-branch INV-021 and snapshots the level-1
  explosion as order lines; consume through the inventory
  `planIssue`/`applyIssue` seam with `sourceType:"production_order"` —
  manufacturing never writes stock tables — one journal per call DR WIP · CR
  inventory at actual per-batch issue cost INV-018; consumption beyond plan ×
  (1 + threshold%) flags `over_plan` once + one dedupe-keyed inbox notification —
  never blocks, correction is an adjusted consumption; scrap reason-coded per
  policy, value ≤ current WIP balance (typed SCRAP_EXCEEDS_WIP), DR
  PRODUCTION_SCRAP · CR WIP, NO stock move; complete = the single completion
  journal DR FG inventory · CR WIP (materials) · [CR PRODUCTION_LABOR · CR
  PRODUCTION_OVERHEAD when rates > 0 — absorption inside the completion journal,
  no separate entry], FG receipt into a new batch with expiry = completedAt +
  shelf_life_days + producing-order provenance, quarantine when qc_gate=required,
  per-order WIP nets to EXACTLY zero, idempotent replay returns the stored result
  INV-013; cancel zero-consumption-only with reason; typed
  PRODUCTION_ORDER_STATE on illegal transitions; PERIOD_LOCKED fails closed);
  InspectionService (PASS releases quarantine with NO journal; FAIL+SCRAP → the
  qc_scrap posting DR PRODUCTION_SCRAP (reason QC_FAILED) · CR FG inventory
  account with the stock issue of the whole remaining quarantined batch;
  FAIL+REWORK stays quarantined; FAIL+ACCEPT operator-override audited;
  RETURN_TO_SUPPLIER record-only; GRN-attachable inspections);
  GenealogyService (read-only upstream/downstream/batch-summary walks over batch
  provenance + consumptions + sales edges — recall trace, never writes);
  ManufacturingReconciliationService (kind "WIP" INV-010: the GL WIP-purpose
  balance vs Σ per-order WIP; seeded drift ⇒ BROKEN + audit + inbox; wired into
  the PC-04 lock lists + the close checklist + `POST
  /api/v1/manufacturing/reconciliation/wip-check`). 24 routes under
  `/api/v1/manufacturing` (BOM CRUD + activate/archive + explosion; production
  orders CRUD + release/start/consume/scrap/complete/cancel; wip-check;
  genealogy upstream/downstream/batch; inspections list/get/create —
  route-permissions verbatim, envelope + Idempotency-Key, zod 6dp/4dp). The 3
  industry reports on the PHASE-013 contract (registry 63 → 66:
  `manufacturing.production_cost` with the production-materials-gl-tie tolerance 0,
  `manufacturing.batch_genealogy`, `manufacturing.qc_inspection_log` —
  ManufacturingQueriesService raw SQL via tenantTx, read-only). Template
  activation: CURRENT_SHIPPED_PHASE 17 → 18; the 4 POLICY/SETTINGS
  `manufacturing.*` keys (qc_gate, scrap_reason_required,
  fg_batch_expiry_from_shelf_life, consumption_variance_threshold_pct); 3 new
  golden effective-config pins + documented re-pins; templates-018.spec 7/7 incl.
  restaurant → food_manufacturing additive switch safety BR-038 (POS history
  untouched) + degraded-entitlement missingChain + restaurant prep-recipes hidden
  cleanly without the add-on. The §8 golden chain on the fixtures tenant (M-RAW /
  M-FG warehouses; dough v1 yield 80% + bread v1 two-level recipes): J1 consume
  8875.0000 · J2 scrap 443.7500 (WIP 8431.2500) · J3 dough completion DR INVENTORY
  8431.2500 · CR WIP (unit cost 8.875000, expiry +2d) · J4 bread consume 8554.6875
  · J5 bread completion DR 9117.1875 · CR WIP 8554.6875 · CR LABOR 375.0000 · CR
  OVERHEAD 187.5000 (unit cost 12.156250, expiry +5d) — WIP zero per order, the
  sale's COGS 1215.6250 ties. Web: the four manufacturing surfaces
  (`/manufacturing/boms` version registry + lines editor + explosion preview,
  `/manufacturing/orders` the order workspace with lifecycle bar + consume/scrap/
  complete dialogs + the over_plan chip, `/manufacturing/qc` the inspections
  console with the disposition matrix, `/manufacturing/genealogy` the recall
  search) + 3 report deep-links on the template-derived navigation + terminology
  (الوصفة / أمر الإنتاج / بوابة فحص الجودة / شجرة الدفعات); i18n parity 2348 →
  2556 (+208). Tests: 8 new db spec files (bom 11 incl. the property packs,
  orders 8, costing 9 — the golden chain exact, wip-recon 4 incl. seeded-drift
  BROKEN + PERIOD_LOCKED, qc 6 — the gate-on chain, genealogy 10 —
  forward/backward multi-level + read-only, industry-018 reports 11, templates-018
  7) inside the 96-file/1517-test suite on embedded PG16 (migrations 0001–0026) +
  the isolation suite extended to the 7 new tables; api unit 270/270 (25 files,
  reporting pins 66); contracts 46/46 (6 manifests — the food_manufacturing
  constant byte-equal to the seed); typecheck/lint 6/6; depcruise 0 violations;
  permissions-drift 241=241; docs validation 29/29; i18n parity 2556/2556. Docs
  authored in-phase: TABLES/manufacturing.md + ERD/manufacturing.md, the
  ENTITY_CATALOG manufacturing section, POSTING_ENGINE §4 production rows (consume
  / complete / scrap / qc_scrap), CHART_OF_ACCOUNTS labor/overhead purposes,
  FEATURE_CATALOG permission reconciliation, SUBSCRIPTION add-on wiring note,
  AUTHORIZATION_MATRIX rows, catalog flips. — PHASE-NNN

- 2026-11-02 — **PHASE-017 — Automotive & Distribution Templates (COMPLETE)**:
  migration `0025_automotive_distribution.sql` — 15 new RLS'd tenant tables +
  additive widenings + CoA markers + template seeds + permission/plan/role grants.
  Partners-owned `vehicles` (per-partner registry: make/model/VIN-shape chassis
  tenant-unique where set, plate, odometer readings; archive-only; service history is
  a read-only UNION ALL over sales-owned job cards / invoices / credit notes — the
  MODULE_BOUNDARIES §6 read precedent). Sales-owned `job_cards` + `job_card_lines`
  (DRAFT → IN_PROGRESS → COMPLETED → INVOICED + CANCELLED-with-reason;
  `parts_issue_mode` reserve\|issue_immediate; PARTS lines are STOCK-kind items with
  reservation/issue linkage, LABOR lines SERVICE-kind billed at estimated-hours ×
  per-hour rate; tombstone-based line full-replace — no DELETE grants). The
  `distribution` module's tables: `routes` + `route_customers` + `route_visits`
  (planning-only — no route/visit operation ever writes a journal), `van_stocks`
  (read-model mirror of Σ signed `stock_moves` scoped to VAN warehouses, refreshed
  inside the owning transaction, DELETE+INSERT grants), `customer_tiers` (the BR-003
  tier level; assignment rides `partners.customer_tier_id`), `free_goods_rules`
  (buy-X-get-Y, per-tier, reason-coded; the engine is pure — never posts),
  `rep_settlements` + `rep_settlement_lines` (STL- at post INV-021; expected =
  opening + cash sales + collections − refunds − expenses; variance ALWAYS posts
  BR-021-family with a reason for any non-zero, beyond-tolerance or an approval
  policy ⇒ creator≠approver BR-034; the (rep, date) day-lock; POSTED immutable —
  corrections are new documents; signed component lines Σ = expected, after post
  Σ = counted − deposit). `commission_runs` + `commission_run_lines` (one basis
  INVOICED\|COLLECTED per run; flat or tiered-band math with one rounding; exclusion
  note-lines explain basis mismatches; POSTED immutable). Additive: `warehouses`
  gains type VAN + rep binding (one van per rep; VAN rows inserted through the
  distribution store's documented VAN-slice with `inventory_account_id` NULL ⇒ the
  tenant INVENTORY purpose — the G-15 shared-account no-journal default),
  `sales_reps` commission rule columns, `sales_invoices` job_card_id/vehicle_id,
  `sales_invoice_lines` foc_reason_code (0018's net-positive CHECK re-issued
  `> 0 OR foc_reason_code IS NOT NULL` — BR-008 zero-price FOC lines legal exactly
  when reason-coded, still issuing stock and posting full COGS), `credit_notes`
  job_card_id, `stock_reservations` holder JOB_CARD, `stock_moves` source job_card,
  `cash_movements` source rep_settlement; CoA template markers `2150
  COMMISSION_ACCRUAL` + `5250 COMMISSION_EXPENSE` + the `4200 SERVICE_REVENUE`
  labor-revenue marker (fail-closed PURPOSE_NOT_MAPPED until mapped — the DR-016-02
  precedent); `industry.automotive` + `industry.distribution` seeded at v1.0.0
  (automotive pins the live report keys `inventory.valuation`/`ar.aging`); 7
  permission seeds (`sales.job_cards.manage`, `partners.vehicles.manage`,
  `distribution.{settlements,tiers,free_goods,van_stock}.manage`,
  `sales.commissions.manage` — matrix 238 = the seed union 0004+0024+0025
  drift-green) + plan grants (business/enterprise gain the distribution set +
  `sales.job_cards` + `sales.commissions`; business additionally
  `inventory.reservations`) + role-template grants (owner full set; sales
  job-cards/commissions/tiers/foc/settlement-create; warehouse van ops + routes;
  accountant settlement-approve + commissions). The job-card API (10 routes) with
  quotation-from-card through the REAL QuotationService (BR-006), approve reserving
  one JOB_CARD hold per PARTS line or issuing immediately, hours logging, invoice
  through the posting port (invoice with parts + labor revenue natures —
  SALES_REVENUE + SERVICE_REVENUE per line item kind, per-line VAT legs —
  invoice_line_id stamped per card line), cancel (never-cancelable once
  issued/invoiced; releases holds). Posting goldens: reserve = two revenue natures +
  flow-B COGS at invoice + holds→CONSUMED; issue_immediate = `job_card:issue_parts`
  DR COGS · CR INVENTORY at approval with per-line issue snapshots and exactly ONE
  COGS journal over the card's life; warranty credit note G-04/W-3 re-entry at the
  ORIGINAL issue cost; PERIOD_LOCKED/INSUFFICIENT_STOCK zero-residue packs. The
  distribution API (31 routes: routes CRUD + composition + idempotent plan-visits,
  the visit board check-in/complete/skip + missed sweep, van
  register/load-out/receive/unload as ordinary TRN- transfers — in-transit never
  sellable BR-016, mirror refreshed, conservation tie asserted, G-15 policy-none
  journal — settlements open/count/approve/post/cancel with the pending-documents
  gate + variance/deposit journals + INV-019 movement ties, tiers +
  free-goods-rules CRUD). The commissions API (7 routes; create+compute inline; post
  = the single accrual journal DR 5250 · CR 2150 dated period_to; COLLECTED basis
  over treasury_allocations → receipts → rep invoices; recompute excludes reversed
  sales via credit notes). Vehicles API (6 routes, typed chassis/duplicate/archived
  errors). BR-003 precedence chain proven (own list > tier > base; a quoted price is
  never overridden — the staleness gate re-resolves through the tier level). The 7
  industry reports on the PHASE-013 contract (registry 56 → 63:
  `automotive.job_card_profitability` with jc-parts-cogs-tie,
  `automotive.vehicle_service_history`, `distribution.rep_settlement` with
  settlement-gl-tie, `distribution.route_visit_compliance`,
  `distribution.van_stock_balances` with van-conservation-tie,
  `sales.discount_management_effectiveness`, `sales.commissions_due` with
  commissions-total-tie — all tolerance 0, reused permissions). Template activation:
  CURRENT_SHIPPED_PHASE 16 → 17; 11 new POLICY_REGISTRY keys; the FEATURE_DEPS
  `sales.job_cards` registration (deps `sales.quotations` + `inventory.reservations`);
  6 new golden effective-config pins + 7 re-pinned; grocery's
  `customer_price_tiers` flipped live; switch-safety retail → automotive → retail
  with zero data loss proven. Web: the seven 017 surfaces (job-cards workspace,
  vehicles registry + service history, routes & visit board, van stock, settlements
  console, tiers/free-goods editors, commissions) on the template-derived
  navigation + terminology; i18n parity 2348/2348. Tests: 78 new db tests on
  embedded PG16 (job-cards 5, job-card-posting 5, vehicles 13, distribution core 6,
  settlements 4, tiers-foc 18, commissions 11, industry-017 reports 10,
  templates-017 6) + regressions green (sales+pos 57/57 ×3, combined distribution
  38/38); api unit 267/267 (25 files); contracts 42/42 (5 manifests — the
  automotive/distribution constants byte-equal to the seeds); reporting unit 42/42
  (63 contracts); docs validation 29/29, manifests 5/5, permissions-drift 238=238.
  Docs authored in-phase: TABLES/automotive-distribution.md +
  ERD/automotive-distribution.md, ENTITY_CATALOG distribution-ownership
  reconciliation, POSTING_ENGINE §4 rows (job-card invoice/issue, settlement
  variance/deposit, commission accrual), FEATURE_CATALOG + capability/template
  catalog flips, SUBSCRIPTION add-on wiring note, AUTHORIZATION_MATRIX rows. —
  PHASE-NNN

- 2026-11-02 — **PHASE-016 — Point of Sale (COMPLETE)**: migration
  `0024_pos_core.sql`. The `pos` module lands as the terminal layer over sales:
  `pos_terminals` (registry per branch — code, till cash account binding, device link
  with one-terminal-one-device uniqueness, default warehouse, 80/58 mm receipt size,
  quick keys, ACTIVE/INACTIVE lifecycle only — documents reference terminals);
  `pos_tables` + `pos_checks` + `pos_kitchen_tickets` (the ledger-free floor: open
  checks carry a jsonb working-order document behind send/merge/transfer/split, and an
  unpaid check holds NO ledger effect — it converts to a `channel='POS'` sale at
  payment); `cashier_shifts` gains `pos_terminal_id` + `denominations` jsonb +
  `blind_count` (per-denomination blind count BR-021; writes stay treasury-owned);
  `sales_invoices` gains the POS channel columns (`channel` STANDARD/POS default
  STANDARD, `pos_terminal_id`, `order_type` DINE_IN/TAKEAWAY/DELIVERY/COUNTER,
  `pos_table_id`, `tenders` jsonb — the G-02 cash/card split); the narrow sync slice
  (`change_log` for the POS feed group items/barcodes/uoms/price_list_items/partners/
  tax_codes + `sync_cursors`; `tombstones` GC + `inbox_commands` remain 020); the
  `devices` pos-terminal slice (platform value + capabilities/tenant_id/terminal_id);
  the additive CoA template marker `1151 CARD_RECEIVABLE`; 4 permission seeds
  (`pos.terminals.manage`, `pos.sales.sell`, `pos.shifts.manage`,
  `pos.receipts.print`); plan grants (business/enterprise gain `pos.table_service`,
  `pos.kitchen_display`, `items.composite_products`). `PosSaleService`
  (`sales/application/pos-channel`): a POS sale IS a sales invoice — channel='POS',
  kind=CASH, BR-005 autopost with the `policy:pos.cash_autopost` sentinel, split
  tenders G-02 (DR till cash + DR the mapped CARD_RECEIVABLE — fail-closed
  PURPOSE_NOT_MAPPED until the tenant maps it once, DR-016-02), server-side
  `POS-{branch}-{yyMM}-{seq:5}` numbering, offline replay exactly-once (client UUIDv7
  + idempotencyKey + the (terminal, OFF-) triple dedupe — INV-013), typed rejections
  (PERIOD_LOCKED/PRICE_CHANGED/INSUFFICIENT_STOCK/CREDIT_LIMIT_EXCEEDED/
  VALIDATION_ERROR), returns as credit notes at original cost (G-04), the POS-WALKIN
  walk-in partner, and the shift capture feed to treasury. The `pos` API: terminal
  registry + manual device enrollment (revocation ⇒ DEVICE_REVOKED before execution),
  the shift flow (float, denomination grids, blind count, supervisor PIN), floor
  service (zones/tables/checks + kitchen tickets), receipts via the PHASE-013 print
  templates receipt-80/58 (AR/EN RTL-correct, the OFF- variant with the pending-sync
  notice), and the Z report. The narrow `sync` module: catch-up change_log writer,
  cursor pull with HMAC-signed opaque tokens, batch push ≤ 50 with per-item
  ACCEPTED/REJECTED/DEFERRED. `packages/sync-core` (NEW): storage-adapter contract +
  versioned local migrations for the POS subset, the outbox engine
  (QUEUED→IN_FLIGHT→ACKED/REJECTED + crash recovery), SyncClient, command builders,
  and the seeded-RNG chaos harness; `@erp/contracts` gains the sync wire schemas
  (`pos_sale`, `cashier_shift`, pull envelope, push results, rejection reasons).
  Web: `/[locale]/pos` (counter sale with the offline outbox in localStorage — OFF-
  numbering, honest PENDING_SYNC, auto-drain, typed rejection triage per DR-016-01),
  `/pos/floor`, `/pos/reconciliation` (Z report + OFF-⇄official pairs + rejection
  actions), `/pos/terminals`. Reports registered: `pos.sales_by_terminal`,
  `pos.sales_by_hour`, `treasury.shift_cash_reconciliation` (the two sales reports carry
  the pos-gl-tie assertion).
  Template activation: CURRENT_SHIPPED_PHASE 015→016; `pos.table_service` +
  `pos.kitchen_display` promoted to full FEATURE_CATALOG keys. Three §11 deviation
  decision records: DR-016-01 (web outbox via the localStorage bridge), DR-016-02
  (CARD_RECEIVABLE tenant mapping), DR-016-03 (devices on the identity table with
  session transport). Tests: chaos slice 8/8 green (C-01/03/04/07/09/16 + OFF-
  numbering + state honesty — packages/sync-core), API unit 257/257 (25 files), POS
  DB posting goldens green (cash G-02+COGS exact figures, split tender, offline
  replay exactly-once, PERIOD_LOCKED zero residue, G-04 return mirror), web tsc 0
  errors + i18n parity 2030/2030, 56 report contracts validated, docs validation
  29/29. — PHASE-NNN

- 2026-11-02 — **PHASE-015 — Industry Configuration Framework & Priority Templates
  (COMPLETE)**: migrations `0022_industry_configuration.sql` + `0023_notifications_categories.sql`.
  0022: `industry_templates` gains the registry lifecycle status (ACTIVE/DRAFT/RETIRED —
  the 004/008 seed stub becomes the engine-owned registry) + the three priority
  manifests seeded at v1.0.0 verbatim from the template docs
  (`industry.retail`/`industry.grocery`/`industry.restaurant`); `tenant_industry_config`
  — exactly one row per tenant (UNIQUE (tenant_id)): applied template key/version/
  manifest-hash, overrides jsonb (report_pins/onboarding_checklist/enabled_modules),
  BR-038 archived_terminology/archived_navigation/archived_capabilities snapshots +
  conflict_notes; `feature_flags` — the L8 platform rollout-flag table (global
  reference, no tenant_id/RLS, erp_migrate writes, app reads, seeded empty);
  `item_components` — composite-product definitions (tenant-composite FK pattern);
  both tenant-owned tables get the RLS macro. 0023: the `notifications`/
  `notification_prefs` category CHECK domains widen with `stock` (BR-019 reorder
  digests — alert only, never a PO) and `templates` (template upgrade offers) — the
  in-app inbox generalizes beyond the 014 billing-critical subset. The `configuration`
  module ships the ten-layer `resolveEffectiveConfig` engine (L1→L2→L3→L4→L5→L7→L8→L10
  merge with the precedence table, typed-key schema validation — unknown keys/type
  violations fail loudly, BR-040 dependency closure, content-hash tenant-static cache
  + §9 event invalidation, L6 request overlay — never cached across principals, L9
  navigation/terminology derivation — derived only, fail-closed); the apply service
  (bilingual activity→template resolution — null = plain onboarding, never a wrong
  guess; capability prerequisites: REQUIRED-missing ⇒ typed block with the exact
  missing chain, phase-gated entries labeled "coming with PHASE-016" with immediate
  back-office mode, OPTIONAL-missing ⇒ hidden; idempotent audited apply writing
  exactly one config row + tenant-level numbering series — R5 append-only, R3/INV-022
  no mutations of existing data); additive-only switch/extend (BR-038 R1–R10:
  no-writes preview diff, acknowledged switch archives terminology/navigation/
  capabilities read-only, unset-key conflicts resolved most-recently-applied-wins and
  recorded in conflict_notes, series append-only, switching back always possible,
  extend keeps the primary template with additive merges); the drift job (PATCH/MINOR
  ⇒ bilingual upgrade OFFER via the inbox, MAJOR ⇒ critical + migration note — never
  auto-applies); the terminology/navigation runtime (tenant addition > template >
  glossary; nav tree pruned by L4/L8/L6, POS items phase-gated not hidden). Supporting
  features: `items.composite_products` (component definitions + explosion at sale
  posting at component cost), `inventory.reservations` (hard pool with expiry sweep),
  `inventory.reorder_levels` (in-app `stock.below_reorder` digests, once-per-window),
  `purchasing.landed_costs` FULL workflow (value/qty allocation documents over posted
  GRNs with the remaining-qty constraint + COGS-adjustment posting). Industry reports
  over the PHASE-013 contract: `inventory.expiry_list` (age buckets + value-at-risk +
  FEFO pick, INV-010-tied), `grocery.expiry_writeoff` (EXPIRED/DAMAGE register tied to
  INVENTORY_SHRINKAGE journal debits), `retail.imei_register` (per-device in/out
  ledger with GRN/sale/return drills, INV-018-consistency assertion). Configuration
  API: session `GET /effective-config` + templates/activity-map/apply/preview/switch/
  extend/drift-check (Zod-strict, typed errors); UI surfaces: onboarding industry
  step, admin template management with diff preview, upgrade-offer notices. Contracts:
  `industry.template-manifest.v1` (zod mirror of industries/README §3 +
  `sha256` canonical hashing + the 3 frozen manifests) + the `pnpm validate:manifests`
  CI gate. Security: 3 new permission keys — `industry.templates.manage`,
  `industry.templates.switch` (risky — the additive-only twin of
  `configuration.templates.apply`), `industry.terminology.manage` — matrix 227=227
  drift-green. Tests: unit 257/257 (incl. permissions-drift) + the configuration db
  spec pack (template-apply/template-switch/degraded-entitlement/dependency-closure/
  engine + composites-golden/reservations-sweep/reorder-inapp/landed-costs/industry
  reports). — PHASE-NNN

- 2026-11-01 — **PHASE-014 — Subscription, Billing, Onboarding & Dashboards — MVP
  (COMPLETE, release tag `release/v1.0.0` — THE MVP GATE)**: migration
  `0021_subscriptions_billing.sql` — subscriptions lifecycle columns + the widened
  status domain (TRIAL/ACTIVE/PAST_DUE/GRACE_READ_ONLY/SUSPENDED/CANCELLED — the
  PHASE-004 subset stays valid); 6 RLS'd tenant tables (`subscription_invoices` — the
  billing history BOTH payment paths write identically; `billing_events` — append-only
  with `webhook:{id}` idempotency keys (replay protection); `usage_counters` — the §6
  read model; `notifications` + `notification_prefs` — the in-app inbox + preferences);
  `plans` marketing columns (bilingual positioning, annual price ⚠ PLACEHOLDER,
  highlight, sort order). Billing application: three self-serve plan seeds (every price
  0.0000 PLACEHOLDER per OQ-002 — pricing renders from seeds only); SubscriptionService
  — startTrial (Business entitlements materialized like paid, no parallel path),
  changePlan (§8 downgrade blockers named per limit), sandbox checkout
  (createCheckoutSession/completeCheckout), webhook ingest (HMAC-SHA256
  timingSafeEqual + 300 s staleness + idempotency gate — duplicate delivery is a
  no-op, INV-013 discipline), manual payment recording (`via_platform_admin` audited,
  mandatory reason) with IDENTICAL entitlement outcomes to the provider path (A-009),
  dunning → read-only grace → suspension wiring the PHASE-004 semantics (sessions
  killed, `tenant_suspended`), runDailyPass. UsageService: 80%/100% soft warnings
  (in-app + owner email), hard blocks ONLY on creation actions (require-limit
  decorator + guard) — documents/month NEVER blocks posting (INV-022,
  property-proven). Read-only grace = a first-class product state (typed
  `subscription_read_only` 403s with the bilingual resolving action; reports/exports/
  print/notifications/billing exempt and alive). Notifications module: in-app inbox +
  preferences + owner emails for the billing-critical set (limit warnings,
  subscription state changes, overdue, reorder). Dashboard widget registry per
  REPORT_CATALOG §14. Web: public bilingual pricing page, sandbox checkout
  workspace, billing home, owner dashboard (4 KPI tiles as LINKS to the bound
  report-contract runs — no parallel math), notifications center + bell, read-only
  banner/hook, onboarding Journey A6–A9 completed over the REAL controllers (honest
  skips, honest print-queue note), admin billing panel; i18n 1505→1723. Security
  review executed (docs/security/MVP_SECURITY_REVIEW.md — 0 prod criticals, findings
  F-01…F-05 triaged, zero open blockers, PHASE-024 pen-test split explicit).
  NFR-006: T-01 33 ms / T-02 10 ms / T-04 14 ms / T-06 156 ms AR + 160 ms EN / T-07
  0.000% (local harness; hosted k6 `k6/mvp-candidate.ts` staged = follow-up).
  First backup-restore rehearsal PASSED (runbook §8: RTO 0.7 s, post-restore
  INV-001/002/003/013 + RLS + parity 5/5 GREEN). Gate: ALL 17 local steps green
  (1153 db tests / 244 unit / visual 16/16 / CSP probe / docs 29/29). — PHASE-NNN

- 2026-11-01 — **PHASE-013 — Reporting, Statements & Printing (COMPLETE, tag
  `phase/013`)**: migration `0020_reporting_core.sql` — 2 tenant tables
  (`report_runs`: execution records with status QUEUED/RUNNING/SUCCEEDED/
  FAILED + stage, `params`/`params_hash`, `assertion_status`, result +
  assertions + artifacts jsonb, unique `(tenant_id, report_key, params_hash)`
  so idempotent re-runs replace their own artifacts — the stored result
  envelope is the export source of truth, "you print what you saw"; and
  `print_templates`: the per-tenant registry of the 4 code-defined base
  templates, synced from `packages/ui/print`, tenants pick locale variants
  and never author template logic); RLS macro on both + the isolation
  A-test registry with generated coverage. The `reporting` module: the
  code-defined contract registry — **48 contracts** = the REPORT_CATALOG
  §1–§7 phase-013 set — with boot-time zod validation (a malformed
  contract, an unknown permission, or a financial contract missing its §11
  assertion set fails startup — meta-tested); the executor with the inline
  path (p50 budget) and the pg-boss job path (`reporting-report-run`
  queue) where permissions are re-resolved at execution — a revoked grant
  kills a queued run FORBIDDEN_AT_RUN with zero partial artifacts (no
  TOCTOU); the as-of-keyed cache (60s current-TTL cap) invalidated by
  ledger events (journal.posted/period.locked via the new accounting
  ledger-events bus wired into PostingService.post + PeriodService.lock);
  and the assertion engine executing the FINANCIAL_REPORT_RULES §11
  minimum set at exact-decimal tolerance 0 — FAIL is stored on the run AND
  blocks export/print server-side with ASSERTION_FAILED. Financial
  statements exact per the rules: TB (one-side balances, zero suppression),
  GL (running balance + the INV-006 entry drill + gl-entry-balance), IS
  (contra aggregation via purposes SALES_RETURNS/SALES_DISCOUNTS, COGS
  section, YTD column, is-tb-tie), BS (RE composition counted once —
  bs-current-year-once; prior-year comparative re-derived), CF indirect
  (buckets by purposes/account groups; untagged lines display as
  "أخرى/Other" — the documented limitation; cf-cash-tie INV-019), the
  fiscal close pack as an archive-class job, journal-register, and
  cost-centers — consolidated by construction (journal lines carry no
  branch dimension in migrations 0001–0020; financial contracts declare
  branches "fixed-all" — FINANCIAL_REPORT_RULES §1 branch subsets land with
  a branch-dimensioned journal substrate). Operational contracts over
  module query services — 7 NEW application services
  (`sales-analytics`, `ap-analytics`, `inventory-queries`,
  `treasury-queries`, `partner-queries`, `tax-queries`, `user-queries`):
  AR/AP aging + statements + allocations (INV-009 ties) + partner
  balances; salesAnalytics.* (item/customer/rep revenue, payment-method
  split, pipeline conversion, branch revenue + sales-gl-tie);
  apAnalytics.* (supplier/item spend, PO status, matching exceptions +
  purchasing-gl-tie); inventory queries (on hand/movement/expiry/count
  variance/transfer log/serials/slow-moving + INV-010 tie); treasury
  queries (daily flow, receipts/payments registers, petty cash, expenses,
  shifts, bank recon + per-account INV-019 ties); the both-sides VAT
  return + summary-by-treatment (INV-012 tie via TaxQueriesService); and
  platform reports (audit-trail with the new actorId/action filters on
  AuditQuery, user-activity via the new UserQueriesService, report-runs,
  subscription-usage). Print/export system: `packages/ui/print` (NEW
  package surface `@erp/ui/print` — sanctioned in the erp-ui import-path
  rule which now allows the exact entry and bans deeper paths) with 4
  versioned templates — a4-document (tafqit amount-in-words verified per
  locale and per currency minor-unit incl. 3-dp KWD/BHD/OMR/JOD/IQD +
  bilingual legal footers), a4-report (assertion footers + freshness
  stamps), receipt-80, and receipt-58 (RTL rules — Western digits
  LTR-isolated, physical QR blocks, condensed 58mm) — over embedded woff2
  fonts (no system fonts, no network in render); the Chromium render
  service (playwright, pool bound 2 via Semaphore, 60s/300s timeouts,
  PDF/A-2b XMP identification stamping via pdf-lib — Chromium cannot emit
  conformance-level PDF/A; the stamp + artifact metadata record the
  archive class honestly); XLSX via exceljs (RTL sheet views, values-only
  with no formulas, typed columns); CSV UTF-8 BOM RFC4180; artifacts via
  the files module with sha256 + signed URLs (15 min) + audited export
  issuance. 8 routes under `/api/v1/reporting` (registry snapshot, POST
  report-runs, GET runs/:id, runs/:id/result, runs, POST runs/:id/exports,
  print-preview/:id, print-templates) in ROUTE_PERMISSIONS; errors
  FORBIDDEN_AT_RUN (403) + ASSERTION_FAILED / PARAMS_INVALID /
  CONTRACT_VERSION_MISMATCH (422) wired into the ErrorModelFilter.
  Security: 26 granular `reports.*.read` keys + `platform.reporting.read`
  seeded (0004 §3.8 + matrix — 224=224 drift-green) and granted to the
  viewer/accountant/owner templates (close pack accountant+owner; exports
  accountant+owner via `reporting.reports.export`); platform_admin key
  count 9→10; isolation A-tests registered. Web: the `/reports` workspace
  (report catalog grouped by category, declarative parameter bar, saved
  views as client-side parameter sets — no new tables per the phase
  constraint, run + polling, ReportViewer with group tree/check
  totals/assertion footer/freshness/drill links, export menu,
  print-preview iframe, run history) + the nav item `reports.workspace`;
  i18n 1465→1505 AR=EN. The dashboard widget seam is the §14 binding
  contract only (widgets land PHASE-014). Tests: registry meta-tests,
  cache/scope/assertions/tafqit/CSV/XLSX unit suite + the db suite
  (golden dataset envelopes, as-of byte-identical re-runs, run lifecycle
  incl. the FORBIDDEN_AT_RUN TOCTOU + idempotent artifact replacement,
  export block on seeded corruption, real-Chromium render with thead
  repetition + page count + the PDF/A stamp, isolation A-tests) — the full
  suite output is in the completion report. Known limitations documented
  honestly: no branch dimension on the journal substrate (statements
  consolidated); PDF/A-2b is an XMP identification stamp on Chromium PDF
  1.7 (conformance-level PDF/A is post-MVP with a dedicated processor);
  web E2E Playwright remains waived to first infra availability per the
  standing PHASE-003 owner directive (the @erp/ui visual harness +
  API-level HTTP tests cover the surfaces). — PHASE-013
- 2026-10-31 — **PHASE-012 — Sales & Receivables (COMPLETE, tag `phase/012`)**:
  migrations `0018_sales_core.sql` + `0019_sales_ar.sql` — 14 tenant tables
  (`sales_reps`, `quotations` + lines with the BR-006 validity CHECKs, `sales_orders`
  + lines carrying the optional soft-reservation reference (the PHASE-010 seam),
  `delivery_notes` + lines with the issue-cost snapshot (the W-3 provenance),
  `sales_invoices` + lines with BR-033 `tax_snapshot` stamps + `credit_check` jsonb +
  `offline_receipt_no`/`einvoice_status` reserved NULL (PHASE-016/023), `credit_notes`
  + lines with the mandatory `invoice_line_id` reference + reentry-cost snapshots,
  and the INSERT-only `sales_reallocations` + lines — the audited re-allocation
  trail, append-only by shape); `stock_moves.source_type` widened
  (delivery_note/sales_invoice/credit_note) + `cash_movements.source_type` gains
  `sales_invoice` (the G-02 counter payment, INV-019); the §6-mandated AR index
  `(tenant_id, customer_id, due_date)`; RLS macro on all 14 + the isolation
  registry with generated A-test coverage. The `sales` module: quotations BR-006
  (validity at send + accept + the expiry sweep; QOT- at SENT), orders SOR- at
  ISSUE with soft reservations honored by the availability netting, deliveries
  posting G-03 `DR COGS · CR INVENTORY` at issue cost through the inventory
  `planIssue`/`applyIssue` seam (sales never writes stock tables) and converting
  to revenue-only invoices with the DN issue-cost copied onto the invoice lines
  (BR-007 both flows first-class), invoices G-01 credit / G-02 cash / G-03
  with-goods W-1 exact (AR 1,380 / revenue 1,200 / VAT 180 with per-line
  output-VAT legs; official SAL- numbering at posting INV-021 proven under
  50-way parallel posts CC-03; BR-005 cash-autopost with the POLICY_ACTOR
  sentinel recorded distinctly from posted_by; BR-001 credit limits as a
  CREDIT-kind control — cash records ALLOW by shape, no credit exposure —
  enforced server-side at approve with the no-TOCTOU re-verification at post,
  the block/warn/allow × limit/overdue matrix with the exact
  8,200 + 2,500 > 10,000 math in the typed `CREDIT_LIMIT_EXCEEDED` payload,
  override via `sales.credit_check.override` audited; BR-003 price resolution
  with the PRICE_CHANGED staleness gate; BR-033 snapshots refusing a rate
  mismatch at post — never silently recomputing), credit notes G-04/W-3 exact
  (SALES_RETURNS 200 DR · VAT 30 DR · AR 230 CR + INVENTORY 120 DR · COGS 120 CR
  at the ORIGINAL issue cost — batch preserved, serial binds the originally sold
  unit BR-018; BR-004 window 14d/0 with the reference requirement never
  disabling; §3.4 explicit allocation — the invoice stays gross-open, the note
  its own subledger row, mirroring the accepted PHASE-011 debit-note model),
  receipts riding the PHASE-008 treasury service (G-05 settle + G-06 the W-2 FX
  gain/loss residual ±10 at the INV-008 stored rate; settlement + on-account
  control legs split explicitly BR-027), allocations with INV-016 bounds at post
  and CC-02 concurrency proven on the sales surface, audited re-allocation
  documents SRA- (from→to, to-NULL on-account, bounds, `receipts.allocated_amount`
  re-synced), AR aging buckets + customer statements as deterministic as-of
  recomputations (RC-10 byte-identical; BR-028 document currency + base totals;
  the INV-009 footer tie) + `verifyInv009`, RC-01 over 20 randomized AR ops OK +
  RC-03 seeded drift → BROKEN + PC-04 lock block on the PHASE-007 framework's AR
  kind, opening-AR settlement (G-16 AR side, INV-009 from entry #1), the
  `invoice.overdue` job exactly-once (audit-stamp dedupe), and sales-rep
  attribution on documents (commissions explicitly deferred to PHASE-017 —
  grep-clean). 51 routes under `/api/v1/sales` + `POST /partners/partners/:id/credit-check`
  (matrix §3.2 exact, risky keys audited). 27 sales db tests (golden G-01..G-06 +
  W-1/W-2/W-3 exact figures + PERIOD_LOCKED/NOT_SUBJECT/CC-01 zero-residue packs
  + the operations packs: BR-001 matrix ×4, BR-004 boundaries, BR-006 expiry +
  sweep, G-16 AR side, RC-01/RC-03/RC-10, overdue exactly-once, INV-016 + CC-02,
  re-allocations + the INSERT-only grant denial, CC-03 50-way contiguous) inside
  a 1044-test db suite. 5 AR/EN web screens (quotes+orders workspace, deliveries,
  invoices with the live credit-check decision panel, credit notes, AR
  aging/statement/open-items) + the sales nav group; print honestly marked
  "arriving with the PHASE-013 reporting release". i18n 1342→1465.
  TABLES/trade-sales.md column specs + ENTITY_CATALOG §sales line-table rows +
  the OFFLINE matrix PHASE-012 substrate note authored in-phase.
  `pnpm gate:local` ALL GREEN (evidence in the report). — PHASE-012
- 2026-10-30 — **PHASE-011 — Purchasing & Payables (COMPLETE, tag `phase/011`)**:
  migrations `0016_purchasing_core.sql` + `0017_purchasing_ap.sql` — 14 tenant tables
  (`purchase_requests` + lines with approval routing, `purchase_orders` + lines with
  BR-010 thresholds + linked revisions + BR-029 numbering at issue, `goods_receipts` +
  lines with the BR-012 po-less shape CHECK, `supplier_invoices` + lines with
  `match_result` jsonb recorded BEFORE approval + BR-033 `tax_snapshot` stamps + the
  per-line G-08 quanta (`grni_cleared_value`/`stock_revalue_value`), `debit_notes` +
  lines referencing the original invoice, `landed_costs` + `landed_cost_allocations`
  with the remaining-qty bound + the POSTED exact-split CHECK, and the INSERT-only
  `purchase_reallocations` + lines — the audited re-allocation trail, append-only by
  shape); the `stock_moves.source_type` CHECK expansion (goods_receipt/landed_cost
  provenance); the §6-mandated AP index `(tenant_id, supplier_id, due_date)`; RLS
  macro on all 14. The `purchasing` module: PR lifecycle with SoD, PO lifecycle with
  threshold routing against the PHASE-007 approval-policies substrate, the GRN service
  receiving stock through the inventory `planReceipt`/`applyReceipt` seam (batch
  capture at receipt; purchasing never writes stock tables — MODULE_BOUNDARIES held)
  and posting G-07 (`DR INVENTORY/expense · CR GRNI`) with the BR-012 policy (reason
  mandatory, forbid by setting, audited when allowed), the three-way match BR-009
  (tolerance matrix exact by default with the 2% worked examples both directions,
  partial-receipt 98/100 exception, dispositions with reasons, the service-level
  no-match-no-post guard, `purchasing.matching.override` risky + recorded), supplier
  invoices (BR-011 duplicate block/warn, G-08 posting clearing GRNI exactly incl.
  partial proportional clearing, VAT recoverability per pack + registration —
  RECOVERABLE/EXPENSED/NOT_SUBJECT all golden-proven), debit notes G-09 mirror
  corrections, payments riding the PHASE-008 treasury service (`purchasing.payments.*`
  keys; G-10 + the W-2 FX mirror honoring the stored rate INV-008) with audited
  re-allocation documents (BR-027 on-account both directions, INV-016 bounds under
  the CC-02 lock), the AP subledger tying to `AP_CONTROL` exactly (RC-02 over 20
  randomized ops + RC-03 seeded drift → BROKEN + PC-04 lock block; opening-AP
  settlement G-16 AP side, INV-009 from entry #1), aging buckets + supplier
  statements as deterministic as-of recomputations (RC-10 byte-identical; document
  currency + base totals BR-028), the GRNI register RC-09 registered into the
  PHASE-007 framework (live close-checklist item; GRNI BROKEN refuses the period
  lock), landed-cost baseline allocation (VALUE/QTY, remaining-qty constraint, the
  explicit COGS-adjustment split — never silent back-dating — via the new inventory
  revaluation seam), and supplier price-list consumption with BR-003 purchase-side
  provenance. 48 routes under `/api/v1/purchasing` (matrix §3.3 exact, risky keys
  audited, Idempotency-Key on POST actions); six purchasing settings keys
  (allow_po_less_grn, match tolerances, duplicate_invoice_behavior, input_vat_default,
  po_approval_threshold); 5 AR/EN web screens + the AP views (orders workspace,
  receipts + landed costs, invoices with the match-result panel — per-line
  PO/GRN/invoice triple with variance highlighting, debit notes, AP aging/statement
  with the INV-009 footer badge/GRNI register); i18n 1231→1342;
  TABLES/trade-purchasing.md column specs authored in-phase; ENTITY_CATALOG §purchasing.
  41 purchasing db tests inside a 939-test db suite (G-07…G-10 goldens + failure packs
  zero-residue, BR-009 matrix + BR-011 + BR-012 ×3 + BR-010 + SoD, RC-02/03/09/10,
  re-allocations + bounds + on-account, INV-021, CC-01 concurrent convergence, A7
  spoof parity + raw-plane RLS over the 14 new registry tables, landed-costs ×7,
  posting-smoke p95 58.4ms n=100); `pnpm gate:local` ALL GREEN (all 17 steps exit 0 —
  typecheck/lint/depcruise 1171 modules/permissions-drift 199=199/unit 183/db 939/
  build/contrast/i18n 1342=1342/ui-catalog 37↔60/visual harness 16 + axe 0 + perf/
  CSP probe 4/docs 29/29/negative proofs ×3).
- 2026-10-30 — **PHASE-010 — Inventory & Warehousing (COMPLETE, tag `phase/010`)**:
  migrations `0014_inventory_core.sql` + `0015_inventory_tracking.sql` — 13 tenant tables
  (`warehouses` branch-linked with the per-warehouse `inventory_account_id` G-15 override,
  `item_warehouse_settings` with the BR-019 once-per-window `last_reorder_alerted_at` stamp,
  `stock_moves` 🔒 append-only by grants (SELECT/INSERT only for erp_app — the A4 denial)
  + `trg_stock_moves_guard` (even superuser DELETE refuses — RC-05 asserts it), `stock_layers`
  with consumed rows kept at remaining 0 (Σ layer qty = on-hand exactly), `item_stock` the
  transactionally-maintained read model, `stock_transfers` + `stock_transfer_lines` with
  transit/posted shape CHECKs, `stock_adjustments` with the OTHER-requires-counter shape,
  `stock_reservations` (the §4 in-phase catalog addition — soft netting only), `item_batches`
  with the FEFO expiry index, `item_serials` with IMEI shape + sold/returned binding CHECKs,
  `stock_counts` + `stock_count_lines` with frozen-snapshot + variance jsonb shape CHECKs;
  the opening_balance_docs STOCK status lift + stock_moves↔batches/serials FK expand steps;
  RLS macro on all 13; the 0014 viewer-template correction (0005 pre-granted
  inventory.transfers.view/inventory.counts.view — matrix §3.5 says warehouse+owner only;
  PHASE-010's route surface made the drift observable, the module migration realigns it).
  The `inventory` module: warehouse service (activation/deactivation with in-flight guards),
  the movement core — one transaction per move: stock rows + `PostingEngine.post` + audit
  (INV-018; simulated-crash leaves neither), WAC + FIFO valuation engines (pure domain,
  6-decimal internal precision; oracle property suites: average within [min,max] of costs
  seen, valuation = Σ layer qty × cost), opening-stock posting consuming PHASE-006 stock
  drafts through the OPENING period (G-16 stock leg: DR INVENTORY · CR OPENING_EQUITY with
  per-item layers, idempotent replay), transfers DRAFT→IN_TRANSIT→POSTED (dispatch writes
  the OUT leg + G-15 journal only when the warehouses resolve distinct GL accounts — the
  policy-none same-account case asserted explicitly; receive writes the IN leg at conserved
  value; IN_TRANSIT netted out of availability BR-016), stock counts DRAFT→COUNTED→
  VARIANCE_REVIEW→POSTED (snapshot frozen at creation, blind mode, audited recount with
  note, BR-015 value-impact tolerance → supervisor override, approval posts G-13
  shrinkage / G-14 appreciation, INV-011 locked-period rejection with zero residue), FEFO
  batch issuing (BR-017) + expiry write-off as EXPIRED shrinkage, serial/IMEI registry
  with the original-unit return binding (BR-018), soft reservations + the availability
  service (on-hand − reserved − in-transit; expiry sweep), the nightly reorder job
  (BR-019: `stock.below_reorder` email digest via the notifications module — exactly once
  per 24h window per item-warehouse; no automatic POs exist, asserted), the INV-010/RC-04/
  RC-05 reconciliation check (movement trail + pending IN legs vs GL per resolved account,
  zero tolerance; orphan moves/journals surfaced; registered into the PHASE-007 framework
  with PC-04 lock block + the close-checklist inventory item live), method-lock +
  dated-revaluation method switch (INV-017: no in-flight movements, revaluation posting
  DR/CR inventory vs appreciation/shrinkage, past issues immutable, preview included), and
  manual reason-coded receipts/issues/adjustments (never a way around the engine).
  49 API routes under /api/v1/inventory (matrix §3.5 exact permission keys; risky
  inventory.items.method_switch / inventory.counts.post / inventory.adjustments.post
  audited; A7-parity 404s). Settings: `inventory.allow_negative_stock` (BR-013, default
  false) + `inventory.count_variance_tolerance` (BR-015, default 0). Web: المخزون /
  Inventory nav group live with 5 AR/EN routes (warehouses manager on the Settings
  archetype, stock on hand + the BR-016 availability drill, the movement ledger with
  direction/kind/warehouse filters + batch/serial columns, the transfer wizard with
  in-transit badge, and the count workspace — Journey D: item picking + blind mode +
  frozen sheet + variance review + recount + plain/supervisor approval); nav +5 items;
  i18n 1085→1231 AR=EN. Tests: 37 inventory db specs (G-13/G-14/G-15 both branches/G-16
  goldens + failure packs; INV-010/017/018; RC-04 mixed-ops green + RC-05 orphan drift →
  BROKEN + notification + PC-04 block + the documented superuser-tooling repair; FEFO +
  serial return-binding; CC-04 last-units race with zero residue; BR-013 negative-off
  default + explicit-on; the T-01 100k-move perf smoke with EXPLAIN-verified
  `ix_stock_moves_tenant_item_wh_date` use + suite-order cleanup; spoof A7 zero-residue)
  + the 12-test valuation property suite inside an 814-test db suite; the 438-test
  isolation suite covers the 13 new registry tables. `pnpm gate:local` ALL GREEN (all 17
  steps exit 0). Docs synced: ENTITY_CATALOG §inventory rows refined (+`stock_reservations`,
  +`stock_transfer_lines`), TABLES/trade-inventory §inventory column specs authored
  in-phase, GLOSSARY inventory terms unchanged (AR canonical already), OFFLINE matrix
  PHASE-016/020 notes stand.
- 2026-10-30 — **PHASE-009 — Tax Engine & Jurisdiction Packs (COMPLETE, tag `phase/009`)**:
  migration `0013_tax.sql` — 3 global reference tables (`tax_treatments` with return-box
  semantics for the six never-conflated treatments, `jurisdictions` with the full
  COUNTRY_PACKS §2 descriptor as jsonb + verification_status/verified_at shape, and
  `jurisdiction_tax_rates` with effective-dated versioned windows; NO RLS by design per
  TENANT_ISOLATION §3 — read-only grants to erp_app with INSERT/UPDATE/DELETE denials
  asserted; seed-only via erp_migrate) + 6 tenant tables (`tax_codes` tenant-unique with
  pack binding, `tax_registrations` with the REGISTERED-number shape CHECK migrating the
  PHASE-004 `tax.registration.*` settings (expand → dual-read window; contract step later),
  `tax_pack_bindings` for staged version pins, `tax_document_summaries` 🔒 append-only by
  grants + `erp.tax_summaries_guard()` (INV-012's document side — RC-07 drift is
  superuser tooling by construction), `vat_returns` with ready-revocation on cross-check
  failure, and `e_invoicing_submissions` schema-only per FEATURE_CATALOG "023 (schema
  009)"); the expand step wires `items.tax_code_id` + `item_categories.default_tax_code_id`
  + `expenses.tax_code_id` composite FKs. Seeds: 6 treatments + **all 10 packs**
  (SA 15% from 2020-07, AE 5% from 2018-01, BH both asserted windows 5%→10% across
  2022-01, OM 5% from 2021-04, EG 14% from 2017-01, JO/GST 16% from 2018-01; KW/QA/YE/IQ
  ship fully with NO rate rows) — every row carries source_ref + verified_at NULL
  (REQUIRES_VERIFICATION — directive §1.12–1.13; the NO-fabrication gate: SA's unasserted
  pre-2020-07 rate ships no row, documents before the window fail closed
  NO_RATE_FOR_DATE). The `tax` module: the pure deterministic resolver (rate snapshots
  stamped on lines BR-033 + draft-spanning boundary warnings; INCLUSIVE extraction within
  the same rounding rules; NOT_REGISTERED + NO_VAT/VAT_PLANNED modes; REVERSE_CHARGE
  self-accounts at the standard rate — baseline-labeled), codes/registrations/packs
  services (audited; reference-guarded archive; preview→apply with audit), the posting
  adapter (the G-11 expense VAT leg: DR EXPENSE net · DR VAT_RECOVERABLE tax · CR CASH
  gross with the golden updated; OUTPUT-lines + summary-recording seams for
  PHASE-011/012), the VAT return v1 (deterministic aggregation, INV-012 side-by-side
  cross-check gating READY, ready-revocation on drift, CSV/XLSX export via the files
  module, mark-filed as the audited human action), the INV-012 check (RC-06) registered
  into the PHASE-007 framework with PC-04 lock block + the close-checklist tax item live,
  and the EInvoicingAdapter port + fake adapter (RISK-005 UNVERIFIED refusal asserted;
  lifecycle walkers PENDING→…→ACCEPTED/REJECTED in tests). Frozen contracts
  `tax.snapshot.v1` / `summary-group` / `document-summary` / `resolved-line` /
  `pricing-mode` in @erp/contracts. 27 API routes under /api/v1/tax (permission-gated
  incl. the risky tax.registrations.manage/tax.returns.mark_filed keys, A7-parity 404s).
  Web: 4 AR/EN routes (الإعدادات: tax codes manager with resolve preview, registrations,
  pack viewer with versions/apply; التقارير: VAT return workspace with the cross-check
  side-by-side + export); nav registry +4 items; i18n 974→1085 AR=EN. Tests: 90 tax db
  specs (10 per-pack suites × the 7 engine-level scenario classes + NO_VAT modes + 2-dp/
  3-dp rounding worked examples + byte-identical determinism + return-prepare; VAT
  return RC-06/RC-07 + registration migration + adapter lifecycle + BR-033
  snapshot-preservation under a simulated version bump + grants denials; spoof A7/A8)
  inside the 699-test db suite; treasury G-11 golden gains the VAT leg. `pnpm gate:local`
  ALL GREEN. Docs synced: ENTITY_CATALOG §tax, TABLES/tax-compliance (authored to the
  delivered schema — doc-reality reconciliation recorded), ERD/treasury-tax, the 10
  compliance-matrix §9 implementation-status notes (pack seeded, fixtures executed,
  remaining scenarios mapped to 012/013/023), DEPENDENCY_RULES §2 treasury→tax edge.
- 2026-10-30 — **PHASE-008 — Treasury: Cash, Banking & Expenses (COMPLETE, tag `phase/008`)**:
  migration `0012_treasury.sql` (11 tenant tables — cash_accounts 1:1 to CoA accounts,
  append-only cash_movements 🔒 by grants + guard trigger, receipts/payments with posted-shape
  CHECKs, treasury_allocations with exactly-one-doc CHECK + partial uniques, expense_categories,
  expenses with reserved tax_code_id, cash_transfers with fee CHECKs, cashier_shifts with
  one-open-per-account partial unique, bank_statements idempotent by (tenant, file_hash),
  bank_statement_lines informational-only; reconciliation_runs kind widened with BANK_REC,
  file_objects owner widened with EXPENSE; all RLS'd + composite-FK'd + registry-isolated).
  The `treasury` module: account service (open requires mapped GL, close preserves history,
  balance ≡ Σ movements), receipt/payment services (DRAFT→POSTED via `PostingEngine.post`,
  RCV-/PAY- numbers INV-021, FX capture), allocation service (FIFO suggest, partials,
  INV-016 bounds under the open-item row lock CC-02, BR-027 on-account remainders),
  SettlementCore realized-FX posting (cash at current rate · control at the original
  stored rate INV-008 · explicit FX_GAIN/FX_LOSS residual with references — gain and
  loss goldens), petty-cash guard (BR-020 caps + override with audit, PLACEHOLDER defaults
  documented OQ-002), transfer service (G-12 with BANK_CHARGES), expense service (BR-023
  per-category approvals + receipt attachments via files), shift service (BR-021 worked
  example −2.50 posts with the shift as source; supervisor id+PIN above tolerance),
  statement import (adapter registry: generic-csv with Arabic-header mapping + generic-xlsx;
  sha-256 idempotency; 5000-row cap), bank-rec service (auto-match amount+window+reference,
  exact manual match, unmatched aging both sides, BR-022 per-account period lock), and the
  INV-019/RC-08 cash reconciliation check registered into the PHASE-007 framework (seeded
  drift → BROKEN + notification + PC-04 block; close-checklist cash + bank-rec items live).
  62 API routes under /api/v1/treasury (A7-parity 404s, Idempotency-Key guard, 37 treasury
  error codes typed in the ERROR_MODEL filter). Web: the الخزينة / Treasury nav group live
  with 12 AR/EN routes (accounts + movements drill-down, receipts/payments list/create/
  detail with the allocation editor + live exact-math totals bar, expenses + categories,
  transfers, shifts, bank-rec wizard → match grid → aging → lock); `ShiftPanel` pattern in
  @erp/ui (headless cashier console, exact-decimal expected math, supervisor PIN, 4 stories,
  AR+EN baselines; exact-decimal extracted so MoneySummaryBar shares it — ADR-0009); i18n
  733→974 AR=EN. **Reality-audit repairs (pre-existing latent defects found by this phase's
  gates)**: db-suite file-order couplings on the shared FY2026 — gl-perf posted into
  September that periods.spec soft-closes (observed live once treasury's 5 spec files
  perturbed vitest's scheduling), accounting/golden's FX-reval posted into September +
  October, concurrency's May, INV-011-022's March/April/May — every state-mutating suite
  now restores the pristine all-OPEN state in afterAll (`restorePeriodsOpen`), the INV-022
  fuzz corpus's flipped settings (incl. fx_revaluation_enabled) are restored, the treasury
  G-11 golden find-or-creates the T-RENT category, and master-data-flows reuses the
  isolation suite's canonical MAIN branch row id; order-independence proven with
  `--sequence.shuffle.files` across 4 seeds (default order + seed 7 fully green; seeds
  42/13/99 fail only on two pre-existing documented classes — the isolation suite's
  pristine-count design that requires it to run before row-adding suites, and the email
  suite's 10s queue deadline under a late-run loaded queue — both satisfied deterministically
  by the default gate order). Evidence: 572/572 db tests (43 treasury: goldens
  G-05/G-06+loss mirror/G-10+mirrors/G-11/G-12 with failure packs zero-residue, INV-016/019,
  CC-02, RC-08 drift, spoof S-04/A7, BR-020..023), `pnpm gate:local` ALL GREEN (typecheck,
  lint, depcruise, permissions-drift 199, unit 133, db 572, build, contrast, i18n 974/974,
  ui-catalog 37↔60, visual harness 16 + axe 0 + perf, CSP probe 4, docs 29/29, negative
  proofs ×3). Docs: TABLES/treasury-tax.md authored (the phase's §8 obligation), ERD
  treasury-tax.md refreshed (receipts/payments/treasury_allocations added), ENTITY_CATALOG
  treasury rows completed, FEATURE_CATALOG cheque-deferral note carries the PHASE-008
  provenance, PHASE_ACCEPTANCE_CRITERIA 008 row enriched, PERIOD_CLOSING cash/bank-rec
  items now live. (reports/PHASE-008-COMPLETION.md)
- 2026-10-30 — **PHASE-007 — Accounting Core & Posting Engine (COMPLETE, tag `phase/007`)**:
  migrations `0010_accounting_core.sql` + `0011_journal_tables.sql` (fiscal_years/fiscal_periods
  with no-overlap exclusion + OPENING/CLOSING windows, exchange_rates dated, cost_centers tree,
  recurring_journals, approval_policies, reconciliation_runs, numbering store per ADR-0006;
  journal_entries/lines append-only with `uq_journal_entries_tenant_source_op` (INV-013),
  balance + immutability + period-lock guard triggers, tenant-first hot indexes; all RLS'd +
  composite-FK'd + registry-isolated). The `accounting` module: CoA readiness service (V1–V6,
  purpose resolution fail-closed), period service (PC-01…PC-04, reopen + anti-fraud alert),
  FX service, the **posting engine** (ADR-0007: pure domain package, validation pipeline 1–8
  in order, verbatim error taxonomy, INV-001…022 enforcement, reversal-only correction),
  posting orchestration (JE-{yyyy}-{seq:6} numbering, insert-conflict idempotency CC-01),
  manual journals (draft→submit→approve→post lifecycle, SoD default-OFF), recurring journals
  (pg-boss draft generation, never auto-posts), approval policies (BR-034 base-currency
  thresholds), GL queries (trial balance, movements with running balance, journal register,
  INV-006 drill-down + EXPLAIN evidence), opening-balance posting (G-16, per-partner AR/AP
  subledger rows from entry #1 via the partners subledger port), year-end close (PC-05/06/07,
  idempotent, unit-reversible), reconciliation framework (RC-01…RC-03 AR/AP checks) + close
  checklist service (NOT_APPLICABLE explicit). Partners module gained the subledger-write api
  (same-transaction, module-boundary sanctioned). Web: the accounting navigation group live
  with 8 screens (CoA editor + purposes, journal list/detail/workspace on the JournalEntryGrid
  archetype-4 pattern with MoneySummaryBar live Δ, GL browser with drill-down, period
  management + checklist + reconciliation + year-end, approvals queue on the ApprovalsQueue
  pattern, rate editor, opening-balances post step); i18n 320→733 keys AR=EN; `JournalEntryGrid`
  + `MoneySummaryBar` + `ApprovalsQueue` patterns in @erp/ui with catalog rows + AR+EN
  baselines. **Reality-audit repairs (pre-existing latent defects found by the phase's own
  gates)**: Radix tooltip ≥1.1 requires a Provider — the primitive crashed every provider-less
  consumer (the overlays story baseline had captured a crashed error stack; the real app's
  collapsed sidebar would white-screen) — the primitive is now self-contained; the Tabs
  wrapper never mounted TabsContent (dangling `aria-controls`, axe critical — the real
  opening-balances console was affected) — content routing added (data-slot + fallback);
  Combobox clear-button + trigger naming and MoneyInput input labels added (grid cells now
  carry per-cell aria-labels); new `--erp-width-journal-grid` token through the DESIGN_TOKENS
  governance path. Evidence: 460/460 db tests (invariants INV-001…009/011/013/014/015/020/021/022,
  golden G-16/G-19/G-20 + engine goldens, CC-01/03/05/06, PC-01…PC-07, RC-01…RC-03, posting
  smoke p95 ≪ 500 ms local k6-equivalent), 171 unit tests, visual harness 16 passed (73→87
  baselines AR+EN), `pnpm gate:local` ALL GREEN —
  [reports/PHASE-007-COMPLETION.md](../implementation/phases/reports/PHASE-007-COMPLETION.md).
- 2026-10-29 — **PHASE-006 — Master Data (COMPLETE, tag `phase/006`)**: migration 0009 (15
  tenant-owned tables: partners + contacts/addresses, credit_terms, item_categories, items,
  uoms, uom_conversions, barcodes, price_lists, price_list_items, opening_balance_docs
  DRAFT-locked, partner_balances read model, file_objects attachment linkage, import_jobs;
  pg_trgm+btree_gin AR/EN search indexes; branches.default_price_list_id). Partners module:
  BR-025 auto-coded directory (P-000001…), contacts/addresses, BR-026 system terms, the BR-001
  credit-check interface (warn default over DRAFT exposure), opening-balance DRAFT capture
  (G-16 source; zero-posting proven: no journal tables exist). Items module: categories tree
  (cycle-proof), items (tracking-flag matrix, tax_code_id FK deferred to PHASE-009), UoM
  registry with exact-decimal conversions (compose-exactly property test), scan-unique
  barcodes, price lists + tiers, and the BR-003 resolution service (customer list → branch
  default → base price, with provenance + per-UoM exact conversion). Preview-gated import
  engine (CSV+XLSX, AR+EN headers, dry-run row reports, duplicates blocked/warned, commit
  idempotent per upload token via pg-boss, U-07 zip-bomb guard) + bounded signed-URL exports.
  Attachments wired through the PHASE-002 files module (U-01…U-07, A11). Trigram search in
  CommandMenu + PartnerPicker/ItemPicker patterns (catalog-covered) + headless hooks.
  Evidence: 328/328 db tests (168-test A1–A10 suite over all 27 registered tenant tables),
  10k-row perf ≤ 200 ms with EXPLAIN index proofs, S-04 no-existence-disclosure, 12/12
  acceptance criteria — [reports/PHASE-006-COMPLETION.md](../implementation/phases/reports/PHASE-006-COMPLETION.md).
- 2026-10-29 — **PHASE-005 — Design System, i18n & RTL Foundation (COMPLETE, tag `phase/005`)**:
  `@erp/ui` 1.0.0 (ADR-0016) — token layer byte-verbatim to DESIGN_TOKENS (§16 contrast gate
  in CI), Radix primitives (single legal import site), catalog components (DataTable
  virtualized-to-10k with grid semantics; MoneyInput §6.2 decimal-string contract;
  DatePicker/DateRangePicker canonical-Gregorian + `islamic-umalqura` display; DocumentStatusBadge
  + DocumentActions §6.4 fixed vocabulary; overlays/toasts/states/navigation) + AppShell with
  server-resolved entitlement-driven navigation (contract registry + pure resolver +
  GET /tenancy/navigation). AR+EN visual harness (Storybook --test frozen-clock → Playwright
  threshold-0 ×65 baselines, axe-in-harness 0, geometry invariants, both-direction coverage
  check, §3 quarantine). Four erp-ui lint rules + negative meta-tests. i18n dictionaries
  310→320 (triple parity). CSP middleware + §8 probe. S-03 bidi payload suite. All 18 web
  screens migrated; provisional styling removed. Gates: 42+58+38+11 unit, 207/207 db,
  harness 16+1, CSP 4/4, docs 29/29. Discovered+repaired: PHASE-003's inline
  no-physical-direction rule was structurally dead (create() nested in meta) — replaced.
  Evidence: implementation/phases/reports/PHASE-005-COMPLETION.md.
- 2026-10-28 — **PHASE-003 — Identity, Multi-Tenancy & Audit (COMPLETE)**:
  migrations `0003_identity_core.sql` (9 identity tables per TABLES/tenancy-identity;
  composite tenant FKs; variant command-specific RLS for roles/role_permissions +
  `template_seed` path TO erp_migrate — templates readable for cloning, never
  forgeable/mutable/deletable by the app role; `audit_events.actor_id → users(id)`
  expand-FK), `0004_permissions_seed.sql` (199 keys verbatim from AUTHORIZATION_MATRIX
  §3 — drift checker `scripts/check-permissions-drift.ts` in the gate), and
  `0005_system_role_templates_seed.sql` (9 templates, 413 grants). New role
  `erp_definer` (NOLOGIN BYPASSRLS) owns the pre-GUC SECURITY DEFINER projections
  (`user_membership_options`, `user_effective_permissions`, `invitation_by_token`) —
  FORCE RLS binds even the table owner, so definer ownership MUST bypass. Identity
  module: argon2id (64 MB/3/1, per-hash params), opaque rotating sessions (12 h
  absolute re-anchored on rotation / 30 min idle), progressive lockout (5 → 15 min,
  never permanent) + per-IP windows, TOTP MFA (RFC 6238, replay-rejecting timestep
  tracking, hashed single-use recovery codes), stateless HMAC reset tokens bound to
  the user version (single-use; documented deviation — no resets table in the 9-table
  set), 72 h single-use invitations. RBAC: `@RequirePermissions` guard + route
  registry (`infra/auth/route-permissions.ts`) + generated checklist test;
  `identity.mfa.manage` is runtime self-scope. Tenant-context interceptor wraps
  handlers in the `withTenant` UoW (S-02 suspension → 503 TENANT_SUSPENDED).
  Notifications skeleton: AR/EN plain-text templates, minimal SMTP client
  (EHLO/STARTTLS/AUTH PLAIN/DATA), pg-boss `notifications-email` queue with
  deterministic-UUID dedupe. Web (apps/web): BFF session cookie (httpOnly/Secure/
  SameSite=Lax) + CSRF double-submit + generic proxy; provisional screens login /
  forgot-password / accept-invitation / users / sessions / mfa / roles / settings
  with typed AR/EN dictionaries (~115 keys, parity-asserted). **Verified against
  embedded PostgreSQL 16: 105/105 db tests** — generated isolation suite A1–A10 ×
  every registered tenant-owned table (36) + registry negative proof, flows (20:
  R-01/02/03/05, M-01/02/04/06/07/08/10, S-01/02/03, invitations, checklist),
  HTTP end-to-end (12: 401/403+audit/200, oracle-uniform login, idempotency 422,
  MFA 423, reset-200-always), email over a real SMTP session (5); 58 api unit
  tests; typecheck/lint/depcruise/drift/web gates green. House rule discovered:
  tsx/esbuild emits no decorator metadata — all Nest DI uses explicit `@Inject`
  tokens. Waivers: mailpit capture + Playwright journey (first Docker/host),
  Testcontainers (standing), same class as PHASE-001/002 items.
  — PHASE-003

- 2026-10-28 — **PHASE-002 — Database & Migration Infrastructure (COMPLETE)**:
  migrations `0001_core_infra.sql` (roles erp_migrate/erp_app/erp_readonly — no
  passwords in SQL; `erp.current_tenant_id()` GUC; minimal `tenants`; append-only
  `audit_events` with grants + `erp.audit_events_guard()`; RLS ENABLE+FORCE;
  `boss` schema) and `0002_rls_macro.sql` (`erp.apply_tenant_policy()` macro +
  `erp._schema_state` readiness mirror); drizzle-kit workflow (`NNNN_description.sql`
  + journal); `withTenant()` unit-of-work (transaction-local GUC, ALS, transactional
  audit appends); pg-boss queue client + worker mode (`WORKER_MODE`); files module
  (S3 adapter, tenant-prefixed keys, signed URLs, upload constraints — A11); pino
  logging with X-Request-Id correlation + redaction; OTel api no-op wiring;
  `/health/ready` (DB + migration state + queue liveness); CI checkers
  (`scripts/check-rls.ts` RLS presence + ENTITY_CATALOG drift; `scripts/ci/migration-tests.ts`
  Testcontainers runner + ci-db.yml). **Verified against embedded PostgreSQL 16**:
  attack suite A1–A5/A10 zero leaks, append-only rejection (grants 42501 + trigger
  P0001), pg-boss dedupe (one execution for duplicate enqueues), signed-URL
  round-trip + expiry + A11, readiness `{db: up, migrations: up, queue: up}`; full
  gate green (typecheck/lint/depcruise/78 unit/32 db/build/docs 29–29/meta-test).
  Scoped repairs: compose/DEVELOPMENT_SETUP database naming unified (`erp`);
  DEVELOPMENT_SETUP filter names fixed (@erp/api); ci.yml `branches: [main]` typo
  repaired; Dockerfile runtime entry switched to the tsx workspace-source model
  (ADR-0002; production bundling stays PHASE-014+). Report:
  [../implementation/phases/reports/PHASE-002-COMPLETION.md](../implementation/phases/reports/PHASE-002-COMPLETION.md);
  tagged `phase/002`. — PHASE-002
- 2026-10-28 — **PHASE-001 flip to COMPLETE**: full local gate re-verified green after
  the blueprint v2.0 docs merge (`pnpm gate:local` exit 0 — typecheck, lint,
  boundaries, 51 tests, build, docs validation **29/29**, negative meta-test); the two
  infrastructure-bound evidence items (first hosted-CI green run, `docker compose up`
  healthcheck) are **waived to first infrastructure availability by project-owner
  directive (2026-10-28)** — recorded as follow-up obligations in
  [../implementation/phases/reports/PHASE-001-COMPLETION.md](../implementation/phases/reports/PHASE-001-COMPLETION.md)
  §Deferred evidence; tagged `phase/001`. — PHASE-001/DECISION
- 2026-10-28 — **Blueprint v2.0 — Platform Depth & Breadth Expansion**: 9 new phases
  (PHASE-026…034) in stages 9–11 — financial depth (fixed assets, cheques/notes/PDC,
  installments, budgeting, payroll) + 5 industry templates (wholesale, electronics,
  healthcare, education, agriculture commercial shells) + multi-entity consolidation
  (ADR-0018); 6 new modules/38 feature keys/23 entities/16 purposes/G-21…G-32/
  INV-023…026/BR-041…056/17 reports/10th navigation group; governed by
  [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md) ED-01…ED-19; MVP (PHASE-014) and GA
  (PHASE-025) gates unchanged. — BLUEPRINT/DECISION
- 2026-10-28 — **PHASE-001 — Repository & Engineering Foundation (IN_PROGRESS)**:
  pnpm + Turborepo monorepo scaffolded — `apps/api` NestJS skeleton (`GET /health/live`,
  runtime smoke HTTP 200), `apps/web` Next.js `[locale]` AR/EN RTL/LTR skeleton
  (SSG both locales), desktop/mobile/ui README stubs, `packages/domain-core`
  (UUIDv7, Money/Quantity/Rate per ADR-0009 with half-up rounding and 3-decimal
  currencies, Result, CalendarDate; 38 tests), `packages/contracts` (registry v0,
  error-code seed, wire schemas; 11 tests), `packages/config` (strict tsconfig,
  ESLint with module-boundary enforcement + money/RTL custom rules, Prettier);
  `dependency-cruiser` graph rules; Docker Compose dev stack; GitHub Actions CI
  (gitleaks, docs validation, negative boundary meta-test); CODEOWNERS; root
  README/AGENTS. All local gates green (`pnpm gate:local`); scoped repairs: ADR-0002
  desktop/mobile phase refs corrected (canon 021/022), DEVELOPMENT_SETUP package
  filter names fixed. Pending for COMPLETE: first CI green run + compose
  healthcheck (see
  [../implementation/phases/reports/PHASE-001-COMPLETION.md](../implementation/phases/reports/PHASE-001-COMPLETION.md)).
  — PHASE-001
- 2026-10-28 — **Blueprint v1.1 — Consolidation**: Folder 3 adopted as the canonical
  baseline; audited ideas from competing plans integrated and all dispositions recorded.
  10 defect corrections (DEF-001…DEF-010, two HIGH: money wire-regex conflict; ledger
  balance trigger made DEFERRABLE), 12 consolidation decisions (CD-01…CD-12), new
  ADR-0017 (no event sourcing), 14 authoritative summary documents
  (ARCHITECTURE_BASELINE + domain summaries + registers + validation report), 8
  industry manifests extracted to machine-readable JSON
  (`industries/templates/manifests/`), 2 validation scripts (`scripts/`), 23/23
  deterministic doc checks green. See [../CONSOLIDATION_VALIDATION_REPORT.md](../CONSOLIDATION_VALIDATION_REPORT.md)
  and [../CONSOLIDATION_REGISTER.md](../CONSOLIDATION_REGISTER.md). — BLUEPRINT
- 2026-10-27 — **Blueprint v1.0**: complete documentation blueprint created — 202
  documents, 16 ADRs, 25 phase documents, 8-stage roadmap, 22 accounting invariants
  (INV-001…022), 40 business rules (BR-001…040), 10-country compliance matrices with
  verification flags, cross-document validation performed
  ([VALIDATION_REPORT.md](VALIDATION_REPORT.md)). Repository tagged `blueprint/v1.0`.
  No application code exists yet. — BLUEPRINT
- 2026-10-27 — Post-blueprint consistency fixes: phase-numbering drift corrected
  (ADR-0012 POS subset → PHASE-016; DEPLOYMENT client distribution → 021/022;
  OQ-004 ZATCA implementation → PHASE-023; OBSERVABILITY sync-health → PHASE-020;
  MODULE_BOUNDARIES configuration module → P-004/015 and sync tables aligned with
  ENTITY_CATALOG); PHASE_ACCEPTANCE_CRITERIA.md restored; permission-key
  reconciliation note added to FEATURE_CATALOG (AUTHORIZATION_MATRIX canonical);
  TABLES/tax-compliance.md added (referenced by E_INVOICING_ARCHITECTURE); phase
  template/README wording clarified (29 mandatory items mapped to 8 sections). — DOCS

- 2026-10-28 — PHASE-004 COMPLETE (tag `phase/004`): Tenant Provisioning &
  Platform Administration — public registration (per-IP + global rate limits,
  atomic tenant+owner+trial+audit), provisionWorkspace idempotent CoA
  instantiation (42 accounts + 16 purposes + 8 roles + numbering/fiscal/
  jurisdiction defaults), branches + branch-scoped membership enforcement,
  typed tenant_settings (L5) with §9 invalidation events, entitlements service
  with BR-039 server-side enforcement + BR-040 dependency-closure validation
  (PLACEHOLDER plans per OQ-002), rule-6 lifecycle (suspend kills sessions +
  support sessions, login blocked, console stays up, restore revives),
  matrix-§7 support access (opt-in/ticket, 4h box, lazy expiry, per-action
  via_platform_admin audit, enumerated reads, tenant termination), the platform
  admin console on the new PlatformScope plane (ops-tenant membership; per-use
  audited cross-tenant reads; entitlement edits; plan assignment; audit
  viewer), the platform-scope audit widening (tenant_id NULL rows +
  via_platform_admin on both trails), 8 provisional AR/EN screens, and the full
  isolation evidence: A1–A10 over 12 registered tenant tables + the platform-GUC
  mini-matrix. 207/207 db tests, all local gates green. Catalog markers synced
  (accounts 004/007, data_export→014, numeral_system default → latn). — CODE
