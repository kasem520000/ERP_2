/**
 * PHASE-020/021 · the machine capabilities fixture (MASTER-PLAN §15, T17).
 *
 * ONE source of truth the `check:capabilities-matrix` gate
 * (scripts/check-capabilities-matrix.ts) cross-checks against
 * OFFLINE_CAPABILITIES_MATRIX.md §2 row by row: implemented intents ×
 * device class × capability class × conflict policy. The matrix is the
 * normative scope; this fixture is the machine-readable claim of what is
 * TRUE TODAY, plus the explicit deferral annotations the checker demands
 * (rule d: an offline-capability cell due by PHASE-020 that is not live
 * must carry an `implemented: false` row naming the phase it lands in —
 * the honest-deferral contract of MASTER-PLAN §1.5).
 *
 * Row kinds:
 *  - `implemented: true`  — live in the codebase today, proven by `gate`
 *    (a spec/test path or chaos-matrix case). The set is EXACTLY:
 *    the PHASE-016 ✓ rows (matrix §1 legend: #1–#5, #8, #23, #31, #32,
 *    #33, #35 — the POS-terminal column) + the PHASE-020 generalized
 *    rows (the desktop-column drafts: sales_invoice drafts + partner
 *    contact merge) + the PHASE-021 desktop column (matrix rows #4, #5,
 *    #7, #10, #11, #23, #25, #26, #32, #33, #34 — the read cache, the
 *    cache reprint, partner create, and the seven DR-P21-08 write
 *    intents; MASTER-PLAN §11). No extension ever passes a column
 *    without a gate.
 *  - `implemented: false` — an explicit deferred-phase annotation (no
 *    gate; `phase` names where it lands). Required by the checker for
 *    every offline-capability cell of a matrix row whose first phase is
 *    ≤ 020; other rows defer by their matrix Phase column alone.
 *
 * `operation` is the EXACT matrix §2 "Operation" spelling (the checker's
 * typo guard is an exact-name match — an unknown operation fails the gate).
 *
 * `capability` uses the matrix §1 spellings, incl. `LOCAL-VALID` (the
 * † LOCALLY-VALIDATED-PENDING-SERVER class); CAPABILITY_CLASSES in
 * ./index keeps the contracts-side spelling of the same class.
 *
 * This module is deliberately STANDALONE (zero imports — not even
 * type-only): ./index re-exports it, and a back-import would trip the
 * `no-circular` dependency-cruiser rule (DEPENDENCY_RULES §2.1).
 */

/** The four matrix device classes — mirrors DEVICE_CLASSES in ./index
 * (LOCAL_DATABASE §1.1); kept as a local literal so this module stays
 * acyclic (see the header note). The `_` prefix satisfies the unused-value
 * rule — the literal rides only in the derived type. */
const _MATRIX_DEVICE_CLASSES = [
  "pos-terminal",
  "tauri-desktop",
  "android-field",
  "android-personal",
] as const;

export type MatrixDeviceClass = (typeof _MATRIX_DEVICE_CLASSES)[number];

/** The matrix §1 capability-class spellings (OFFLINE_CAPABILITIES_MATRIX "Values"). */
export type MatrixCapabilityClass =
  | "OFFLINE-COMPLETE"
  | "OFFLINE-DRAFT"
  | "LOCAL-VALID"
  | "READ-CACHED"
  | "ONLINE-ONLY";

/** The matrix §1 conflict-policy codes (CONFLICT_RESOLUTION §2). */
export type MatrixConflictPolicy = "SD" | "SAS" | "FM" | "OD" | "RO" | "n/a";

/** One (operation × deviceClass) claim or deferral annotation. */
export interface SyncCapabilityRow {
  /** EXACT matrix §2 Operation cell (the checker matches by this name). */
  readonly operation: string;
  readonly deviceClass: MatrixDeviceClass;
  /** The capability class the matrix grants that cell (matrix §1 spelling). */
  readonly capability: MatrixCapabilityClass;
  /** The row's primary conflict policy (matrix "Conflict policy" first code). */
  readonly conflictPolicy: MatrixConflictPolicy;
  /** "016" | "020" | "021" | "022" | … — implemented rows: when it went live; deferred rows: when it lands. */
  readonly phase: string;
  /** True only for what is live in the codebase today. */
  readonly implemented: boolean;
  /** The spec/test that proves an implemented row (null on deferred rows). */
  readonly gate: string | null;
  /** Why a deferred row defers, or a scope note (never parsed by the checker). */
  readonly note?: string;
}

/**
 * The fixture. Implemented rows are the PHASE-016 ✓ surface (POS-terminal
 * column) + the PHASE-020 generalized foundation + the PHASE-021 desktop
 * column; deferred rows are the explicit deferral annotations the checker
 * requires for rows due by 020 (the android columns stay deferred to 022).
 */
export const SYNC_CAPABILITY_FIXTURE: readonly SyncCapabilityRow[] = [
  // ---- PHASE-016 ✓ (POS-terminal column — the offline sale queue) --------------
  {
    operation: "POS sale (cash/card at counter)",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "pos/golden.spec (cash + split-tender + offline replay) + sync/chaos-matrix C-01/C-09",
  },
  {
    operation: "POS return/refund against receipt",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "pos/golden.spec (return W-3 — POS credit note at original cost)",
  },
  {
    operation: "Cashier shift open/close (float, count)",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "treasury/treasury-rules.spec (shift open/close + variance; the 016 cashier_shift command path)",
  },
  {
    operation: "Items / barcodes / prices lookup",
    deviceClass: "pos-terminal",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "016",
    implemented: true,
    gate: "sync/pull.spec (feed groups + projections)",
  },
  {
    operation: "Price list view",
    deviceClass: "pos-terminal",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "016",
    implemented: true,
    gate: "sync/pull.spec (price_list_items feed projection)",
  },
  {
    operation: "Receipt — POS cash collection",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "pos/golden.spec (cash tender DR till) + sync/chaos-matrix C-09",
  },
  {
    operation: "Partner create (new walk-in / route customer)",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "master-data-flows.db.spec (partner create) + sync/pull.spec (partners feed)",
  },
  {
    operation: "POS on-account (credit) sale to known customer",
    deviceClass: "pos-terminal",
    capability: "LOCAL-VALID",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "sales/operations.spec (BR-001 credit-limit matrix — the hard server decision)",
  },
  {
    operation: "Reprint of an already-POSTED receipt/invoice",
    deviceClass: "pos-terminal",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "RO",
    phase: "016",
    implemented: true,
    gate: "sync/pull.spec (synced-doc cache read; ADR-0011 local print templates)",
  },
  {
    operation: "Master-data search (items, partners)",
    deviceClass: "pos-terminal",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "016",
    implemented: true,
    gate: "sync/pull.spec (items + partners feeds)",
  },
  {
    operation: "Serial/IMEI or batch capture on sale line (where tracked)",
    deviceClass: "pos-terminal",
    capability: "LOCAL-VALID",
    conflictPolicy: "SD",
    phase: "016",
    implemented: true,
    gate: "pos/golden.spec (offline replay; serialIds ride the sale aggregate) — server re-check per SYNC_PROTOCOL §3.4",
  },

  // ---- PHASE-020 generalized (desktop-column drafts — MASTER-PLAN §1.5) -------
  {
    operation: "Sales invoice draft (back office)",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "OD",
    phase: "020",
    implemented: true,
    gate: "sync/policies.spec #3–#6 (create_draft/update_draft, owner_device_id) + sync/chaos-matrix C-10",
  },
  {
    operation: "Partner edit — contact fields (phone, email, address)",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "FM",
    phase: "020",
    implemented: true,
    gate: "sync/policies.spec #1–#2 (partner:contact_merge whitelisted fields, zero merge on constrained)",
  },

  // ---- PHASE-021 desktop column — the read cache (MASTER-PLAN §11) ------------
  // The Tauri desktop client's READ-CACHED cells: the offline console's
  // cached reads over the REAL desktop file store (E2E journey, AR+EN) +
  // the store-client read suite + the schema-parity pin against the v1–v5
  // DDL. The feed substrate is the 020 POS group (sync/pull.spec).
  {
    operation: "Items / barcodes / prices lookup",
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: true,
    gate:
      "tests/e2e/desktop-offline.spec.ts (journey step 2: cached item reads + base price, AR+EN, real store) + apps/web lib/shell/__tests__/store-client.test.ts (cached read filters — the pickers' sources) + apps/web __tests__/local-schema-parity.test.ts (v1–v5 DDL pin)",
  },
  {
    operation: "Price list view",
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: true,
    gate:
      "sync/pull.spec (POS-group feed projections — the desktop class's feed scope, 020) + packages/sync-core __tests__/watermark-tombstone.test.ts (price_list_items upsert/tombstone — the local cache projection) + apps/desktop __tests__/store.test.ts (the file store carries the v1–v5 read-cache schema incl. price_list_items)",
  },
  {
    operation: "Reprint of an already-POSTED receipt/invoice",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "RO",
    phase: "021",
    implemented: true,
    gate:
      "apps/desktop __tests__/print.test.ts (renderReprintFromCache: cached doc_no VERBATIM exactly once + REPRINT marker, NOT_POSTED/NOT_CACHED refusals, corrupt-payload degrade) + tests/e2e/desktop-offline.spec.ts (journey step 2: exactly ONE printHtml capture carrying the cached doc_no + bilingual REPRINT marker, AR+EN) + apps/web components/offline/__tests__/offline-components.test.tsx (the reprint template — never re-numbers)",
  },
  {
    operation: "Master-data search (items, partners)",
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: true,
    gate:
      "tests/e2e/desktop-offline.spec.ts (journey step 2: search narrows \"ESP\" → 1 item and clears back to 2, AR+EN) + apps/web lib/shell/__tests__/store-client.test.ts (cached read filters — search by display text, ACTIVE only)",
  },

  // ---- PHASE-021 desktop column — the DR-P21-08 write intents (MASTER-PLAN §6/§11)
  // The seven server-side write intents + the offline console's draft forms.
  // DEFERRED-INTENT SPLIT (DR-P21-08): CREATE-DRAFT ONLY for the new types —
  // no offline update intents this phase (invoice keeps 020's create+update
  // pair); non-owner edits are simply not offered offline. The split is
  // pinned by desktop-intents.spec #7 (quotation:update_draft is an
  // unknown-intent rejection from ANY device) + #23 (frozen feed-group
  // scope).
  {
    operation: "Partner create (new walk-in / route customer)",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #1–#3 (partner:create cluster: accept+feed+device audit+C-01 replay, zod reject zero-residue, business rule) + apps/web lib/shell/__tests__/store-client.test.ts (partner:create builder → the outbox+projection enqueue contract) + tests/e2e/desktop-offline.spec.ts (the offline console enqueue→drain journey the form rides, AR+EN)",
    note: "DR-P21-08 desktop write intent; contact fields ride 020's partner:contact_merge (row #21) — this row is the partner record itself (code auto-numbered server-side, BR-025)",
  },
  {
    operation: "Quotation draft",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "OD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #4–#7 (quotation:create_draft cluster: accept+feed+audit+replay, zod reject, INACTIVE-customer rule, the OD-create posture — update_draft is an unknown-intent rejection) + apps/web components/offline forms (quotation-form rides buildQuotationCreateDraft, the store-client enqueue contract)",
    note: "DR-P21-08 deferred-intent split: CREATE-DRAFT ONLY — no offline quotation:update_draft this phase (registry has no such key; OD-create posture pinned by spec #7)",
  },
  {
    operation: "Delivery note",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #8–#10 (delivery_note:create_draft cluster: accept+feed+audit+replay, zod reject, SERVICE-item rule) + apps/web components/offline forms (delivery-note-form rides buildDeliveryNoteCreateDraft, the store-client enqueue contract)",
    note: "DR-P21-08 deferred-intent split: CREATE-DRAFT ONLY (stock issues at submit stay online server-side, SD-at-submit)",
  },
  {
    operation: "Stock count entry (lines as counted)",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #20–#22 (stock_count:submit_lines cluster: accept+feed+audit+replay, zod reject, non-DRAFT-session rule — SD-aggregate via CountService.enterCounts) + apps/web lib/shell/__tests__/store-client.test.ts (only DRAFT count sessions are pickable — sessions are created online so the snapshot freezes server-side)",
    note: "DR-P21-08 deferred-intent split: line submission only — session submit/review/approve + variance posting stay online server decisions",
  },
  {
    operation: "Expense entry (field/back office)",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #11–#13 (expense:create cluster: accept+feed+audit+replay, zod reject, negative-amount rule) + apps/web components/offline forms (expense-form rides buildExpenseCreate, the store-client enqueue contract)",
    note: "DR-P21-08 desktop write intent (SD — the claim posts at sync)",
  },
  {
    operation: "Stock transfer draft",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #17–#19 (stock_transfer:create_draft cluster: accept+feed+audit+replay, zod reject, same-warehouse rule) + apps/web components/offline forms (stock-transfer-form rides buildStockTransferCreateDraft, the store-client enqueue contract)",
    note: "DR-P21-08 deferred-intent split: CREATE-DRAFT ONLY — dispatch (IN_TRANSIT/POSTED) stays online; no batch binding at draft (FEFO at dispatch)",
  },
  {
    operation: "Cash transfer / drawer drop",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: true,
    gate:
      "sync/desktop-intents.spec #14–#16 (cash_transfer:create_draft cluster: accept+feed+audit+replay, zod reject, fee-≥-amount rule) + apps/web components/offline forms (cash-transfer-form rides buildCashTransferCreateDraft, the store-client enqueue contract)",
    note: "DR-P21-08 desktop write intent (treasury drafts post at sync)",
  },

  // ---- explicit deferred-phase annotations (checker rule d) -------------------
  // Rows whose matrix phase is ≤ 020 with an offline-capability cell that is
  // not live: every such cell carries an implemented:false row naming the
  // phase it lands in (per-class phases follow the matrix Phase column where
  // it lists them, else the class convention: desktop 021 ✓ live above, field
  // 022 — the device-class scope summary §4).
  {
    operation: "Items / barcodes / prices lookup",
    deviceClass: "android-field",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "022",
    implemented: false,
    gate: null,
    note: "field subset ships with the Android app (022); van feeds stay deferred",
  },
  {
    operation: "Price list view",
    deviceClass: "android-field",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "022",
    implemented: false,
    gate: null,
    note: "field subset ships with the Android app (022)",
  },
  {
    operation: "Partner create (new walk-in / route customer)",
    deviceClass: "android-field",
    capability: "LOCAL-VALID",
    conflictPolicy: "SD",
    phase: "022",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 021 / 022 — the field column lands 022 (LOCAL-VALID†)",
  },
  {
    operation: "Master-data search (items, partners)",
    deviceClass: "android-field",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "022",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 021 / 022 — the field column lands 022",
  },
  {
    operation: "Serial/IMEI or batch capture on sale line (where tracked)",
    deviceClass: "android-field",
    capability: "LOCAL-VALID",
    conflictPolicy: "SD",
    phase: "022",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 022 — the field column lands 022",
  },
];
