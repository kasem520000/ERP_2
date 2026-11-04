import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_TEMPLATE_MANIFEST,
  DISTRIBUTION_TEMPLATE_MANIFEST,
  FOOD_MANUFACTURING_TEMPLATE_MANIFEST,
  GROCERY_MANIFEST,
  PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST,
  RESTAURANT_MANIFEST,
  RETAIL_MANIFEST,
  SHIPPED_TEMPLATE_MANIFESTS,
  IndustryManifestValidationError,
  IndustryTemplateManifestSchema,
  canonicalManifestJson,
  getContractSchema,
  hashManifestJson,
  parseIndustryTemplateManifest,
  type IndustryTemplateManifest,
} from "../index";

/**
 * PHASE-015 T3 test hook (extended by PHASE-017 T2, PHASE-018 T2, and
 * PHASE-019 T2): all seven v1.0.0 manifests validate against the §3 schema;
 * negative fixtures are rejected with the precise issue; the content hash is
 * canonical and deterministic (applied_manifest_hash). The automotive/
 * distribution pair is transcribed verbatim from the migration 0025 registry
 * seeds (the canonical source; the automotive pins carry the reconciled live
 * report keys `inventory.valuation` + `ar.aging`). The food_manufacturing
 * template is transcribed verbatim from the migration 0026 registry seed
 * (docs mirror: docs/industries/templates/manifests/
 * manifest.food_manufacturing.json) and pins the live manufacturing report
 * keys. The professional_services template is transcribed verbatim from the
 * migration 0027 registry seed (docs mirror:
 * docs/industries/templates/manifests/manifest.professional_services.json —
 * the §12 doc reconciliation applied: bom_production N/A entry dropped,
 * ar_aging pinned to the live `ar.aging` registry key).
 */

function cloneManifest(manifest: IndustryTemplateManifest): IndustryTemplateManifest {
  return JSON.parse(JSON.stringify(manifest)) as IndustryTemplateManifest;
}

/** Recursively reverse the key order of every object — a key-order permutation. */
function reversedKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reversedKeyOrder);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) {
      out[key] = reversedKeyOrder((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

interface ExpectedIssue {
  path: string;
  code: string;
  messagePattern?: RegExp;
}

/**
 * Mutate a fresh copy of the retail manifest and assert the §3 schema rejects
 * it with EXACTLY ONE issue at the expected path/code (surgical violations —
 * one rule broken per fixture).
 */
function expectSingleIssue(
  mutate: (draft: IndustryTemplateManifest) => void,
  expected: ExpectedIssue,
): void {
  const draft = cloneManifest(RETAIL_MANIFEST);
  mutate(draft);
  const result = IndustryTemplateManifestSchema.safeParse(draft);
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error("unreachable: expected the mutated manifest to be rejected");
  }
  expect(result.error.issues).toHaveLength(1);
  const issue = result.error.issues[0]!;
  expect(issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".")).toBe(expected.path);
  expect(issue.code).toBe(expected.code);
  if (expected.messagePattern) {
    expect(issue.message).toMatch(expected.messagePattern);
  }
}

describe("shipped industry template manifests (v1.0.0 — retail / grocery / restaurant / automotive / distribution / food_manufacturing / professional_services)", () => {
  it("all seven parse against the §3 schema and round-trip identically", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(parseIndustryTemplateManifest(manifest)).toStrictEqual(manifest);
    }
  });

  it("the registry ships exactly the seven ids at 1.0.0", () => {
    expect(SHIPPED_TEMPLATE_MANIFESTS.map((manifest) => manifest.id)).toEqual([
      "industry.retail",
      "industry.grocery",
      "industry.restaurant",
      "industry.automotive",
      "industry.distribution",
      "industry.food_manufacturing",
      "industry.professional_services",
    ]);
    expect(SHIPPED_TEMPLATE_MANIFESTS.every((manifest) => manifest.version === "1.0.0")).toBe(true);
  });

  it("manifest constants are deep-frozen (registry data is platform-owned, §8)", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(Object.isFrozen(manifest.inventory_policy_defaults)).toBe(true);
      expect(Object.isFrozen(manifest.terminology_overrides)).toBe(true);
      expect(Object.isFrozen(manifest.navigation_manifest.groups)).toBe(true);
      expect(Object.isFrozen(manifest.onboarding_steps)).toBe(true);
    }
    expect(Object.isFrozen(SHIPPED_TEMPLATE_MANIFESTS)).toBe(true);
  });

  it("the §3 schema is registered under its stable contract key (ADR-0002)", () => {
    expect(getContractSchema("industry.template-manifest.v1")).toBe(IndustryTemplateManifestSchema);
  });

  it("the PHASE-017 pair pins the live report keys (0025 reconciliation)", () => {
    // inventory.valuation / ar.aging are the live report-registry keys — the
    // pre-0025 doc drafts said inventory.stock_valuation / partners.ar_aging.
    expect(AUTOMOTIVE_TEMPLATE_MANIFEST.report_defaults.map((pin) => pin.report_key)).toEqual([
      "automotive.job_card_profitability",
      "automotive.vehicle_service_history",
      "inventory.valuation",
      "ar.aging",
    ]);
    expect(
      DISTRIBUTION_TEMPLATE_MANIFEST.report_defaults.map((pin) => pin.report_key),
    ).toEqual([
      "distribution.rep_settlement",
      "distribution.van_stock_balances",
      "distribution.route_visit_compliance",
      "sales.discount_management_effectiveness",
      "sales.commissions_due",
    ]);
    // The workshop + parts / field + settle navigation groups ship as-is.
    expect(AUTOMOTIVE_TEMPLATE_MANIFEST.navigation_manifest.groups.map((group) => group.id)).toEqual([
      "workshop",
      "parts",
    ]);
    expect(
      DISTRIBUTION_TEMPLATE_MANIFEST.navigation_manifest.groups.map((group) => group.id),
    ).toEqual(["field", "settle"]);
    // The PHASE-017 intake key rides in automotive's required set.
    expect(AUTOMOTIVE_TEMPLATE_MANIFEST.required_feature_keys).toContain("sales.job_cards");
  });

  it("the PHASE-018 template pins the live manufacturing report keys (0026)", () => {
    // The food_manufacturing report defaults pin the PHASE-018 registry keys
    // (manufacturing.production_cost / batch_genealogy /
    // qc_inspection_log) plus the two expiry reports the template composes
    // from the already-shipped grocery/inventory catalogs.
    expect(
      FOOD_MANUFACTURING_TEMPLATE_MANIFEST.report_defaults.map((pin) => pin.report_key),
    ).toEqual([
      "manufacturing.production_cost",
      "manufacturing.batch_genealogy",
      "manufacturing.qc_inspection_log",
      "inventory.expiry_list",
      "grocery.expiry_writeoff",
    ]);
    // The production/traceability navigation groups ship as-is.
    expect(
      FOOD_MANUFACTURING_TEMPLATE_MANIFEST.navigation_manifest.groups.map((group) => group.id),
    ).toEqual(["production", "trace"]);
    // The manufacturing capability set rides in the required keys (the
    // 0026 plan grants cover it on business/enterprise).
    for (const key of [
      "manufacturing.bom",
      "manufacturing.production_orders",
      "manufacturing.qc",
      "manufacturing.batch_genealogy",
    ]) {
      expect(FOOD_MANUFACTURING_TEMPLATE_MANIFEST.required_feature_keys).toContain(key);
    }
    // The four PHASE-018 workflow policies land as L1 defaults
    // (production_qc_gate → manufacturing.qc_gate via POLICY_REGISTRY).
    expect(FOOD_MANUFACTURING_TEMPLATE_MANIFEST.workflow_policies).toMatchObject({
      production_qc_gate: "required",
      scrap_reason_required: true,
      fg_batch_expiry_from_shelf_life: true,
      consumption_variance_threshold_pct: 5,
    });
    // The PRD- numbering rule: per-branch, reserved at approval.
    expect(FOOD_MANUFACTURING_TEMPLATE_MANIFEST.document_numbering_defaults.production_order)
      .toEqual({
        prefix: "PRD",
        format: "PRD-{yyyy}-{seq:5}",
        per_branch: true,
        reserve_on_approval: true,
      });
  });

  it("the PHASE-019 template pins the practice/billing navigation and the crm policy set (0027)", () => {
    // The report pins: the two PHASE-019 services.* registry keys plus the
    // composed already-live `ar.aging` (the §12 doc reconciliation — the
    // pre-0027 doc draft said partners.ar_aging) and sales.commissions_due.
    expect(
      PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.report_defaults.map((pin) => pin.report_key),
    ).toEqual([
      "services.contract_revenue_schedule",
      "services.time_billing_summary",
      "ar.aging",
      "sales.commissions_due",
    ]);
    expect(
      PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.report_defaults.find(
        (pin) => pin.report_key === "ar.aging",
      ),
    ).toMatchObject({ pinned: true, dashboard: false, default_period: "this_month" });
    // The practice/billing navigation groups ship as-is with the §14 target
    // keys (crm.time / crm.contracts / crm.recurring_billing /
    // accounting.projects).
    expect(
      PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.navigation_manifest.groups.map(
        (group) => group.id,
      ),
    ).toEqual(["practice", "billing"]);
    const practice = PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.navigation_manifest.groups.find(
      (group) => group.id === "practice",
    )!;
    expect(practice.items.map((item) => item.target)).toEqual([
      "accounting.projects",
      "crm.time",
      "crm.contracts",
    ]);
    const billing = PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.navigation_manifest.groups.find(
      (group) => group.id === "billing",
    )!;
    expect(billing.items.map((item) => item.target)).toEqual([
      "crm.recurring_billing",
      "sales.invoices",
      "partners.statements",
    ]);
    // The PHASE-019 intake set rides in the required keys (the 0027 plan
    // grants cover it on business/enterprise; starter excluded).
    for (const key of [
      "crm.service_contracts",
      "crm.recurring_billing",
      "accounting.projects",
    ]) {
      expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.required_feature_keys).toContain(key);
    }
    // The six §9 workflow policies land as L1 defaults (module "crm"; the
    // crm.* names map onto the SETTINGS_REGISTRY keys via POLICY_REGISTRY
    // settingsKey — e.g. contract_billing_mode → crm.contract_billing_mode).
    expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.workflow_policies).toEqual({
      contract_billing_mode: "retainer_or_milestones",
      time_entries_require_case: true,
      unbilled_time_review_before_invoice: true,
      invoice_approval_required: true,
      invoice_numbering_per_series: false,
      narrative_required_on_time_billing: true,
    });
    // The INV-/RCP-/CN- numbering rules (contract_invoice is a series-bearing
    // §3 document type; all four series are tenant-level, assigned at
    // posting).
    expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.document_numbering_defaults.contract_invoice)
      .toEqual({
        prefix: "INV",
        format: "INV-{yyyy}-{seq:6}",
        per_branch: false,
        reserve_on_approval: false,
      });
    expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.document_numbering_defaults.receipt).toEqual({
      prefix: "RCP",
      format: "RCP-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    });
    expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.document_numbering_defaults.credit_note).toEqual({
      prefix: "CN",
      format: "CN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    });
    // The terminology carries the practice-management Arabic (svc.case).
    expect(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST.terminology_overrides["svc.case"]).toEqual({
      en: "Case / Matter",
      ar: "القضية / الملف",
    });
  });
});

describe("negative fixtures — each §3 violation is rejected with the right issue", () => {
  it("(a) costing method outside the WAC|FIFO enum", () => {
    expectSingleIssue(
      (draft) => {
        (draft.inventory_policy_defaults as { costing_method: string }).costing_method = "ABC";
      },
      { path: "inventory_policy_defaults.costing_method", code: "invalid_value" },
    );
  });

  it("(b) orphan module 'logistics' not in the 20-value module enum", () => {
    expectSingleIssue(
      (draft) => {
        (draft.default_modules_enabled as string[]).push("logistics");
      },
      {
        path: `default_modules_enabled.${RETAIL_MANIFEST.default_modules_enabled.length}`,
        code: "invalid_value",
      },
    );
  });

  it("(c) allow_negative_stock: true violates const false (templates may never enable it)", () => {
    expectSingleIssue(
      (draft) => {
        (
          draft.inventory_policy_defaults as { allow_negative_stock: boolean }
        ).allow_negative_stock = true;
      },
      {
        path: "inventory_policy_defaults.allow_negative_stock",
        code: "invalid_value",
        messagePattern: /negative stock/,
      },
    );
  });

  it("(d) id without the industry.<key> prefix", () => {
    expectSingleIssue(
      (draft) => {
        draft.id = "retail";
      },
      { path: "id", code: "invalid_format" },
    );
  });

  it("(e) version that is not MAJOR.MINOR.PATCH", () => {
    expectSingleIssue(
      (draft) => {
        draft.version = "1.0";
      },
      { path: "version", code: "invalid_format" },
    );
  });

  it("(f) unknown extra property (additionalProperties: false)", () => {
    expectSingleIssue(
      (draft) => {
        (draft as Record<string, unknown>).unknown_extra_field = true;
      },
      {
        path: "(root)",
        code: "unrecognized_keys",
        messagePattern: /unknown_extra_field/,
      },
    );
  });

  it("(g) numbering prefix in lowercase", () => {
    expectSingleIssue(
      (draft) => {
        draft.document_numbering_defaults.sales_invoice!.prefix = "inv";
      },
      {
        path: "document_numbering_defaults.sales_invoice.prefix",
        code: "invalid_format",
        messagePattern: /uppercase/,
      },
    );
  });

  it("(h) onboarding_steps with only 2 items (minItems 3)", () => {
    expectSingleIssue(
      (draft) => {
        draft.onboarding_steps = draft.onboarding_steps.slice(0, 2);
      },
      {
        path: "onboarding_steps",
        code: "too_small",
        messagePattern: /3/,
      },
    );
  });

  it("(i) capability level outside REQUIRED|OPTIONAL", () => {
    expectSingleIssue(
      (draft) => {
        const capability = draft.capability_prerequisites.barcode_pos!;
        (capability as { level: string }).level = "SUGGESTED";
      },
      { path: "capability_prerequisites.barcode_pos.level", code: "invalid_value" },
    );
  });

  it("(j) feature key with a non-cataloged module segment", () => {
    expectSingleIssue(
      (draft) => {
        draft.required_feature_keys[0] = "logistics.trucks";
      },
      { path: "required_feature_keys.0", code: "invalid_format" },
    );
  });

  it("(k) navigation group with an empty items array (minItems 1)", () => {
    expectSingleIssue(
      (draft) => {
        draft.navigation_manifest.groups[0]!.items = [];
      },
      { path: "navigation_manifest.groups.0.items", code: "too_small" },
    );
  });

  it("(l) terminology value missing the ar leg (localizedText requires en + ar)", () => {
    expectSingleIssue(
      (draft) => {
        const term = draft.terminology_overrides["pos.terminal"]!;
        delete (term as { ar?: string }).ar;
      },
      { path: "terminology_overrides.pos.terminal.ar", code: "invalid_type" },
    );
  });

  it("(m) duplicate entries violate uniqueItems (feature keys, modules, report defaults)", () => {
    const draft = cloneManifest(RETAIL_MANIFEST);
    draft.required_feature_keys.push(draft.required_feature_keys[0]!);
    draft.default_modules_enabled.push(draft.default_modules_enabled[0]!);
    draft.report_defaults.push(draft.report_defaults[0]!);
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected duplicate entries to be rejected");
    }
    const messages = result.error.issues.map((issue) => issue.message);
    expect(messages).toContain("required_feature_keys entries must be unique (uniqueItems)");
    expect(messages).toContain("default_modules_enabled entries must be unique (uniqueItems)");
    expect(messages).toContain("report_defaults entries must be unique (uniqueItems)");
  });

  // PHASE-018 negative fixtures on the food_manufacturing manifest — one
  // surgical §3 violation per case against the newest template's own shape.
  it("(n) food_manufacturing: phase gate outside the PHASE-0NN pattern", () => {
    const draft = cloneManifest(FOOD_MANUFACTURING_TEMPLATE_MANIFEST);
    draft.capability_prerequisites.qc_inspections!.available_from_phase = "PHASE-18";
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "invalid_format",
      path: ["capability_prerequisites", "qc_inspections", "available_from_phase"],
    });
  });

  it("(o) food_manufacturing: terminology entry missing the en leg", () => {
    const draft = cloneManifest(FOOD_MANUFACTURING_TEMPLATE_MANIFEST);
    delete (draft.terminology_overrides["mfg.recipe"] as { en?: string }).en;
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "invalid_type",
      path: ["terminology_overrides", "mfg.recipe", "en"],
    });
  });

  it("(p) food_manufacturing: report default with an unknown period preset", () => {
    const draft = cloneManifest(FOOD_MANUFACTURING_TEMPLATE_MANIFEST);
    (
      draft.report_defaults[0] as unknown as { default_period: string }
    ).default_period = "this_quarter";
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "invalid_value",
      path: ["report_defaults", 0, "default_period"],
    });
  });

  // PHASE-019 negative fixtures on the professional_services manifest —
  // one surgical §3 violation per case against the newest template's own
  // shape (three §3 surfaces never exercised by (a)–(p)).
  it("(q) professional_services: workflow policy key outside lower_snake_case", () => {
    const draft = cloneManifest(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST);
    (draft.workflow_policies as Record<string, unknown>)["Contract Billing Mode"] =
      "retainer_or_milestones";
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      // zod 4 record-key violations report the generic `invalid_key` code
      // ("Invalid key in record") — the path pins the offending key.
      code: "invalid_key",
      path: ["workflow_policies", "Contract Billing Mode"],
    });
  });

  it("(r) professional_services: numbering default keyed by a non-series-bearing document type", () => {
    const draft = cloneManifest(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST);
    // `service_contract` (the document lifecycle table) is NOT one of the
    // §3 series-bearing DOCUMENT_TYPES (contract numbers are contract-side
    // state, never a tenant numbering series).
    (draft.document_numbering_defaults as Record<string, unknown>).service_contract = {
      prefix: "CT",
      format: "CT-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: true,
    };
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      path: ["document_numbering_defaults"],
    });
    expect(result.error.issues[0]!.message).toMatch(/service_contract/);
  });

  it("(s) professional_services: capability with an empty feature_keys array (minItems 1)", () => {
    const draft = cloneManifest(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST);
    draft.capability_prerequisites.commissions!.feature_keys = [];
    const result = IndustryTemplateManifestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable: expected the mutated manifest to be rejected");
    }
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "too_small",
      path: ["capability_prerequisites", "commissions", "feature_keys"],
    });
    expect(result.error.issues[0]!.message).toMatch(/at least one key/);
  });
});

describe("parseIndustryTemplateManifest (fail-closed)", () => {
  it("throws the typed error carrying the zod issues and the manifest id", () => {
    const draft = cloneManifest(RETAIL_MANIFEST);
    draft.version = "1.0";
    let thrown: unknown;
    try {
      parseIndustryTemplateManifest(draft);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IndustryManifestValidationError);
    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as IndustryManifestValidationError;
    expect(error.name).toBe("IndustryManifestValidationError");
    expect(error.manifestId).toBe("industry.retail");
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.message).toContain("industry.retail");
    expect(error.message).toContain("version");
  });

  it("returns structurally identical data for a valid manifest", () => {
    expect(parseIndustryTemplateManifest(GROCERY_MANIFEST)).toStrictEqual(GROCERY_MANIFEST);
  });
});

describe("hashManifestJson — the applied_manifest_hash content hash", () => {
  it("produces sha256:<64 lowercase hex>", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(hashManifestJson(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("is stable across key-order permutations of the same manifest", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      const permuted = reversedKeyOrder(manifest) as IndustryTemplateManifest;
      expect(hashManifestJson(permuted)).toBe(hashManifestJson(manifest));
    }
  });

  it("matches node:crypto sha256 over the canonical JSON (cross-implementation oracle, Arabic included)", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      const oracle = `sha256:${createHash("sha256").update(canonicalManifestJson(manifest), "utf8").digest("hex")}`;
      expect(hashManifestJson(manifest)).toBe(oracle);
    }
  });

  it("different manifests hash differently (drift detection is meaningful)", () => {
    const hashes = new Set(
      SHIPPED_TEMPLATE_MANIFESTS.map((manifest) => hashManifestJson(manifest)),
    );
    expect(hashes.size).toBe(SHIPPED_TEMPLATE_MANIFESTS.length);
  });

  it("canonical JSON is key-sorted and round-trips to an equal manifest", () => {
    const canonical = canonicalManifestJson(RESTAURANT_MANIFEST);
    expect(canonical.startsWith('{"capability_prerequisites":')).toBe(true);
    expect(JSON.parse(canonical)).toStrictEqual(RESTAURANT_MANIFEST);
  });
});

describe("registry invariants (industries/README §8)", () => {
  it("template ids are unique across the shipped registry", () => {
    const ids = SHIPPED_TEMPLATE_MANIFESTS.map((manifest) => manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("versions are semver MAJOR.MINOR.PATCH", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("required_feature_keys are non-empty and unique", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(manifest.required_feature_keys.length).toBeGreaterThan(0);
      expect(new Set(manifest.required_feature_keys).size).toBe(
        manifest.required_feature_keys.length,
      );
    }
  });

  it("default_modules_enabled entries are unique", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      expect(new Set(manifest.default_modules_enabled).size).toBe(
        manifest.default_modules_enabled.length,
      );
    }
  });

  it("report_defaults entries are unique by report_key", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      const keys = manifest.report_defaults.map((report) => report.report_key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("onboarding_steps ids are unique", () => {
    for (const manifest of SHIPPED_TEMPLATE_MANIFESTS) {
      const ids = manifest.onboarding_steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
