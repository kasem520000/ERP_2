import { describe, expect, it } from "vitest";

import {
  AUTOMOTIVE_TEMPLATE_MANIFEST,
  DISTRIBUTION_TEMPLATE_MANIFEST,
  GROCERY_MANIFEST,
  PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST,
  RESTAURANT_MANIFEST,
  RETAIL_MANIFEST,
} from "@erp/contracts";

import {
  CURRENT_SHIPPED_PHASE,
  TemplatePrerequisitesBlockedError,
  checkPrerequisites,
  phaseNumber,
} from "../application/apply/prerequisites";
import { PLAN_KEYS } from "./layer-fixtures";

/**
 * PHASE-015 T5/T7 unit tests — the §4 entitlement + phase-gate
 * classification and the BR-040 dependency-closure check
 * (`degraded-entitlement` + `dependency-closure` db specs exercise the same
 * rules end-to-end against a real tenant).
 */

const business = () => [...PLAN_KEYS.business];
const enterprise = () => [...PLAN_KEYS.enterprise];

function stateOf(check: ReturnType<typeof checkPrerequisites>, capabilityId: string) {
  return check.capabilities.find((state) => state.capabilityId === capabilityId);
}

describe("phase gate helpers", () => {
  it("parses PHASE-0NN gates numerically", () => {
    expect(phaseNumber("PHASE-010")).toBe(10);
    expect(phaseNumber("PHASE-015")).toBe(15);
    expect(phaseNumber("PHASE-016")).toBe(16);
    expect(phaseNumber("PHASE-017")).toBe(17);
    expect(phaseNumber("PHASE-018")).toBe(18);
    expect(phaseNumber("PHASE-019")).toBe(19);
    expect(() => phaseNumber("PHASE-16")).toThrow();
  });

  it("CURRENT_SHIPPED_PHASE is PHASE-027 (the notes/installments release shipped with it)", () => {
    expect(CURRENT_SHIPPED_PHASE).toBe("PHASE-027");
    expect(phaseNumber(CURRENT_SHIPPED_PHASE)).toBe(27);
  });
});

describe("capability classification (industries/README §4)", () => {
  it("retail × business plan: fully satisfiable — POS capabilities included, no block", () => {
    const check = checkPrerequisites(RETAIL_MANIFEST, business());
    expect(check.status).toBe("ok");
    expect(check.missingChain).toEqual([]);
    // The business plan grants every pos.* key: barcode_pos + cashier_shifts
    // are classified included (their WORKFLOW ships 016, the keys resolve).
    expect(stateOf(check, "barcode_pos")?.status).toBe("included");
    expect(stateOf(check, "cashier_shifts")?.status).toBe("included");
    expect(stateOf(check, "imei_tracking")?.status).toBe("included");
    expect(stateOf(check, "landed_costs")?.status).toBe("included");
  });

  it("retail × starter plan: blocked with the exact uncovered required keys", () => {
    const check = checkPrerequisites(RETAIL_MANIFEST, [...PLAN_KEYS.starter]);
    expect(check.status).toBe("blocked");
    // PHASE-016 shipped the barcode_pos capability — it is no longer
    // phase-gated, so the starter plan's missing pos.* keys are honest
    // uncovered REQUIRED keys in the guided-plan-selection chain.
    expect(check.missingChain).toContain("industry.template_engine");
    expect(check.missingChain).toContain("pos.sales");
    expect(stateOf(check, "barcode_pos")).toMatchObject({ status: "blocked" });
    // Bilingual guidance names the chain (never silent degradation).
    expect(check.guidance?.ar).toContain("industry.template_engine");
    expect(check.guidance?.en).toContain("industry.template_engine");
  });

  it("grocery × business: customer_price_tiers is LIVE (PHASE-017 shipped + the 0025 grant)", () => {
    const check = checkPrerequisites(GROCERY_MANIFEST, business());
    expect(check.status).toBe("ok");
    // The "coming with PHASE-017" tier entry resolved available: the phase
    // shipped (CURRENT_SHIPPED_PHASE bumped 16 → 17) and migration 0025
    // granted distribution.customer_tiers to business/enterprise — the
    // REQUIRED capability is now INCLUDED, no acknowledgement needed.
    expect(stateOf(check, "customer_price_tiers")).toMatchObject({
      status: "included",
    });
    expect(stateOf(check, "expiry_tracking_fefo")?.status).toBe("included");
    expect(stateOf(check, "free_goods_promo")?.status).toBe("included");
    expect(check.requiresAcknowledgement).toBe(false);
    // The tier entry degrades to a HARD block only when the key is truly
    // missing on a shipped phase (guided plan selection, never a gate).
    const withoutTiers = business().filter((key) => key !== "distribution.customer_tiers");
    const degraded = checkPrerequisites(GROCERY_MANIFEST, withoutTiers);
    expect(degraded.status).toBe("blocked");
    expect(degraded.missingChain).toContain("distribution.customer_tiers");
    expect(stateOf(degraded, "customer_price_tiers")).toMatchObject({ status: "blocked" });
  });

  it("automotive × business: job_cards resolves LIVE at PHASE-017 (sales.job_cards intake + grant)", () => {
    const check = checkPrerequisites(AUTOMOTIVE_TEMPLATE_MANIFEST, business());
    expect(check.status).toBe("ok");
    expect(check.missingChain).toEqual([]);
    expect(check.closureViolations).toEqual([]);
    // The PHASE-017 intake key (sales.job_cards — registered in FEATURE_DEPS
    // with its quotations+reservations chain, granted by 0025) is LIVE.
    expect(stateOf(check, "job_cards")).toMatchObject({ status: "included" });
    expect(stateOf(check, "commissions")?.status).toBe("included");
    expect(stateOf(check, "landed_costs")?.status).toBe("included");
    // OPTIONAL later-phase capabilities label coming-soon (020 — the
    // rental-logistics intake horizon). The PHASE-018 qc_inspections entry
    // resolved LIVE at the 018 bump; the PHASE-019 service_contracts entry
    // resolved LIVE at THIS bump (the 0027 plan grants put crm.service_contracts
    // on business AND the phase shipped) — INCLUDED, not phase_gated.
    expect(stateOf(check, "service_contracts")).toMatchObject({
      status: "included",
      featureKeys: ["crm.service_contracts"],
    });
    expect(stateOf(check, "qc_inspections")).toMatchObject({
      status: "included",
      featureKeys: ["manufacturing.qc"],
    });
    expect(check.requiresAcknowledgement).toBe(false);
  });

  it("distribution × business: the full van-sales set is INCLUDED (0025 grants)", () => {
    const check = checkPrerequisites(DISTRIBUTION_TEMPLATE_MANIFEST, business());
    expect(check.status).toBe("ok");
    expect(check.missingChain).toEqual([]);
    expect(check.closureViolations).toEqual([]);
    for (const capabilityId of [
      "van_stock",
      "route_planning",
      "field_collections",
      "customer_price_tiers",
      "free_goods_promo",
      "commissions",
      "cashier_shifts",
      "expiry_tracking_fefo",
    ]) {
      expect(stateOf(check, capabilityId), capabilityId).toMatchObject({ status: "included" });
    }
    expect(stateOf(check, "landed_costs")?.status).toBe("included");
    expect(check.requiresAcknowledgement).toBe(false);
  });

  it("automotive without sales.job_cards: blocked with the exact missing chain (BR-040 closure named)", () => {
    const keys = business().filter((key) => key !== "sales.job_cards");
    const check = checkPrerequisites(AUTOMOTIVE_TEMPLATE_MANIFEST, keys);
    expect(check.status).toBe("blocked");
    expect(check.missingChain).toContain("sales.job_cards");
    expect(stateOf(check, "job_cards")).toMatchObject({
      status: "blocked",
      missingKeys: ["sales.job_cards"],
    });
  });

  it("restaurant × business: table_service LIVE (PHASE-016 shipped the §3 intake set)", () => {
    const check = checkPrerequisites(RESTAURANT_MANIFEST, business());
    expect(check.status).toBe("ok");
    // The intake keys registered at 0024 + granted by the business plan:
    // table_service + kitchen_display resolve INCLUDED, not phase-gated.
    expect(stateOf(check, "table_service")).toMatchObject({ status: "included" });
    expect(stateOf(check, "kitchen_display")?.status).toBe("included");
    // composite_kits ships PHASE-015 → already live.
    expect(stateOf(check, "composite_kits")?.status).toBe("included");
  });

  it("OPTIONAL missing hides cleanly — never blocks, never phase-labels", () => {
    // Retail's imei_tracking is OPTIONAL and SHIPPED (PHASE-010): a plan
    // without inventory.serial_tracking degrades it to hidden.
    const keys = business().filter((key) => key !== "inventory.serial_tracking");
    const check = checkPrerequisites(RETAIL_MANIFEST, keys);
    expect(check.status).toBe("ok");
    expect(stateOf(check, "imei_tracking")).toMatchObject({
      status: "hidden",
      missingKeys: ["inventory.serial_tracking"],
    });
    // An OPTIONAL capability whose roadmap phase has not shipped labels
    // coming-soon instead — hidden vs phase_gated is exactly the §4 optional
    // split. No shipped manifest carries an OPTIONAL capability past
    // PHASE-027 any more (the 0027/0029 grants put the crm + offline sets on
    // business and the 020..026 bumps lifted the last gates), so the later-phase
    // example is a synthetic OPTIONAL PHASE-028 entry (the rental-logistics
    // intake horizon, §17 — crm.rental_contracts is not yet a catalog key).
    const autoWithLater = JSON.parse(JSON.stringify(AUTOMOTIVE_TEMPLATE_MANIFEST)) as typeof AUTOMOTIVE_TEMPLATE_MANIFEST;
    autoWithLater.capability_prerequisites.rental_logistics = {
      level: "OPTIONAL",
      feature_keys: ["crm.rental_contracts"],
      available_from_phase: "PHASE-028",
    };
    const laterCheck = checkPrerequisites(autoWithLater, keys);
    expect(stateOf(laterCheck, "rental_logistics")).toMatchObject({
      status: "phase_gated",
      phase: "PHASE-028",
    });
    // Retail's free_goods_promo (PHASE-017 keys) is now included on the
    // post-0025 business set — the gate lifted with the phase bump.
    expect(stateOf(check, "free_goods_promo")).toMatchObject({ status: "included" });
  });

  it("REQUIRED shipped-missing blocks with the capability's exact key named", () => {
    // Business minus inventory.batch_tracking: grocery's REQUIRED
    // expiry_tracking_fefo ships with PHASE-010 (shipped) — a hard block.
    const keys = business().filter((key) => key !== "inventory.batch_tracking");
    const check = checkPrerequisites(GROCERY_MANIFEST, keys);
    expect(check.status).toBe("blocked");
    expect(check.missingChain).toContain("inventory.batch_tracking");
    expect(stateOf(check, "expiry_tracking_fefo")).toMatchObject({
      status: "blocked",
      missingKeys: ["inventory.batch_tracking"],
    });
  });

  it("a REQUIRED capability beyond the shipped phase still phase-gates (the mechanism outlives the 027 bump)", () => {
    // No shipped template carries a REQUIRED capability past PHASE-027 any
    // more (the bump is the point of this task — the 027 release resolves
    // LIVE), so prove the §4 mechanism on a synthetic manifest: a REQUIRED
    // PHASE-028 capability whose key is off-plan ⇒ phase_gated +
    // requiresAcknowledgement — the switch flow's acknowledgement contract
    // (TemplateSwitchAcknowledgementRequiredError) keys off exactly this
    // flag. (A PHASE-026 synthetic no longer works: 026/027 shipped and no
    // template requires a post-027 key, so such a capability classifies on
    // its keys alone, not gated. §18 lesson 5 keeps the proof on
    // budgeting.budgets@PHASE-028 — a real catalog key that no plan grants
    // today and whose own phase is 028 per the roadmap.)
    const synthetic = JSON.parse(JSON.stringify(GROCERY_MANIFEST)) as typeof GROCERY_MANIFEST;
    synthetic.capability_prerequisites.budgeting = {
      level: "REQUIRED",
      feature_keys: ["budgeting.budgets"],
      available_from_phase: "PHASE-028",
    };
    const check = checkPrerequisites(synthetic, business());
    expect(check.status).toBe("ok"); // phase-gated keys are satisfied-but-labeled
    expect(stateOf(check, "budgeting")).toMatchObject({
      status: "phase_gated",
      phase: "PHASE-028",
      missingKeys: ["budgeting.budgets"],
    });
    expect(check.requiresAcknowledgement).toBe(true);
  });

  it("professional_services × business: the full practice set is INCLUDED (0027 grants)", () => {
    const check = checkPrerequisites(PROFESSIONAL_SERVICES_TEMPLATE_MANIFEST, business());
    expect(check.status).toBe("ok");
    expect(check.missingChain).toEqual([]);
    expect(check.closureViolations).toEqual([]);
    for (const capabilityId of ["service_contracts", "recurring_billing", "commissions", "job_cards"]) {
      expect(stateOf(check, capabilityId), capabilityId).toMatchObject({ status: "included" });
    }
    // The deposits_late_fees entry (OPTIONAL, crm.contract_deposits +
    // crm.late_fees — the §17 pending-intake set) degrades HIDDEN on the
    // shipped phase 19 (an ungrantable key on a shipped capability is an
    // upgrade path, never a coming-soon label).
    expect(stateOf(check, "deposits_late_fees")).toMatchObject({
      status: "hidden",
      missingKeys: ["crm.contract_deposits", "crm.late_fees"],
    });
    expect(check.requiresAcknowledgement).toBe(false);
  });
});

describe("BR-040 dependency closure over required_feature_keys (§7)", () => {
  it("rejects a set activating pos.sales without its sales.invoices dependency", () => {
    const keys = business().filter((key) => key !== "sales.invoices");
    const check = checkPrerequisites(RETAIL_MANIFEST, keys);
    expect(check.status).toBe("blocked");
    // The closure names the exact missing chain (pos.sales → sales.invoices).
    expect(check.missingChain).toContain("sales.invoices");
    expect(check.closureViolations).toContainEqual({
      featureKey: "pos.sales",
      missing: ["sales.invoices"],
    });
  });

  it("a satisfiable set applies (enterprise carries the full closure)", () => {
    for (const manifest of [
      RETAIL_MANIFEST,
      GROCERY_MANIFEST,
      RESTAURANT_MANIFEST,
      AUTOMOTIVE_TEMPLATE_MANIFEST,
      DISTRIBUTION_TEMPLATE_MANIFEST,
    ]) {
      const check = checkPrerequisites(manifest, enterprise());
      expect(check.status, manifest.id).toBe("ok");
      expect(check.closureViolations, manifest.id).toEqual([]);
    }
  });

  it("the shipped intake keys grant cleanly on enterprise (BR-040 closure holds)", () => {
    // pos.table_service/pos.kitchen_display are full catalog keys since
    // 0024 with their closure (pos.sales) carried by the plan.
    const check = checkPrerequisites(RESTAURANT_MANIFEST, enterprise());
    expect(check.status).toBe("ok");
    expect(check.missingChain).not.toContain("pos.table_service");
    expect(check.missingChain).not.toContain("pos.kitchen_display");
  });
});

describe("the typed blocked error", () => {
  it("carries the chain + bilingual guidance + closure violations", () => {
    const check = checkPrerequisites(
      RETAIL_MANIFEST,
      business().filter((key) => key !== "sales.invoices"),
    );
    const error = new TemplatePrerequisitesBlockedError(
      RETAIL_MANIFEST.id,
      check.missingChain,
      check.guidance!,
      check.closureViolations,
    );
    expect(error.code).toBe("configuration/template-prerequisites-blocked");
    expect(error.missingChain).toContain("sales.invoices");
    expect(error.guidance.ar).toContain("sales.invoices");
    expect(error.guidance.en).toContain("sales.invoices");
  });
});
