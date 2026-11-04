/**
 * PHASE-020 · the machine capabilities fixture (MASTER-PLAN §15, T17).
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
 *    contact merge). The 020 extension never passes the desktop column
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
 * column) + the PHASE-020 generalized foundation; deferred rows are the
 * explicit deferral annotations the checker requires for rows due by 020.
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

  // ---- explicit deferred-phase annotations (checker rule d) -------------------
  // Rows whose matrix phase is ≤ 020 with an offline-capability cell that is
  // not live: every such cell carries an implemented:false row naming the
  // phase it lands in (per-class phases follow the matrix Phase column where
  // it lists them, else the class convention: desktop 021, field 022 — the
  // device-class scope summary §4).
  {
    operation: "Items / barcodes / prices lookup",
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: false,
    gate: null,
    note: "desktop read cache goes live with the Tauri client (021); the feed group is already server-side (020)",
  },
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
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: false,
    gate: null,
    note: "desktop read cache goes live with the Tauri client (021)",
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
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-DRAFT",
    conflictPolicy: "SD",
    phase: "021",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 021 / 022 — the desktop column lands 021",
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
    operation: "Reprint of an already-POSTED receipt/invoice",
    deviceClass: "tauri-desktop",
    capability: "OFFLINE-COMPLETE",
    conflictPolicy: "RO",
    phase: "021",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 021 — desktop cache reprint lands 021",
  },
  {
    operation: "Master-data search (items, partners)",
    deviceClass: "tauri-desktop",
    capability: "READ-CACHED",
    conflictPolicy: "SAS",
    phase: "021",
    implemented: false,
    gate: null,
    note: "matrix Phase column: 016 ✓ / 021 / 022 — the desktop column lands 021",
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
