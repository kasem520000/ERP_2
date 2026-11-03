import type { LocalizedText } from "@erp/contracts";

/**
 * Activity → template resolution (PHASE-015 T5; industries/README §4 step 1:
 * "Resolve activity to template id"): the bilingual business-activity catalog
 * the onboarding wizard renders. A declared activity maps to an industry
 * template key; an activity outside the catalog resolves to `null` — the
 * registrant onboards on the plain ERP core (no template, platform
 * defaults), never onto a wrong-industry guess.
 *
 * Catalog rules (README §1: industries are configuration):
 * - every entry carries AR + EN labels plus keywords in BOTH languages, so
 *   an Arabic-only or English-only registrant resolves identically;
 * - keyword matching normalizes case/whitespace and matches exact keywords
 *   with `confidence: "exact"`, looser containment with `"suggested"` —
 *   the wizard confirms suggestions with the registrant before applying;
 * - unknown activities never guess: `null` = plain onboarding (§4).
 */

/** One catalog row: a declared business activity → its template. */
export interface ActivityCatalogEntry {
  /** Canonical activity key (lowercase, ASCII). */
  readonly activity: string;
  /** Bilingual display label (the wizard's card title). */
  readonly label: LocalizedText;
  /** Match keywords, AR + EN, normalized (lowercase, trimmed). */
  readonly keywords: readonly string[];
  /** The industry template this activity resolves to. */
  readonly templateKey: string;
}

/**
 * The supported-activity catalog (three PHASE-015 templates). Exported for
 * the onboarding UI (`GET /api/v1/configuration/templates/activity-map`).
 */
export const SUPPORTED_ACTIVITIES: readonly ActivityCatalogEntry[] = Object.freeze([
  Object.freeze({
    activity: "retail",
    label: Object.freeze({ en: "Retail store", ar: "متجر تجزئة" }),
    keywords: Object.freeze([
      "retail",
      "retail store",
      "retail shop",
      "clothing store",
      "fashion store",
      "electronics store",
      "phone shop",
      "تجزئة",
      "متجر تجزئة",
      "محل تجزئة",
      "متاجر التجزئة",
      "محل ملابس",
      "محل موبايلات",
    ]),
    templateKey: "industry.retail",
  }),
  Object.freeze({
    activity: "grocery",
    label: Object.freeze({ en: "Grocery / supermarket", ar: "بقالة / سوبرماركت" }),
    keywords: Object.freeze([
      "grocery",
      "grocery store",
      "supermarket",
      "mini market",
      "corner shop",
      "بقالة",
      "بقال",
      "سوبرماركت",
      "سوبر ماركت",
      "ميني ماركت",
      "دكان",
    ]),
    templateKey: "industry.grocery",
  }),
  Object.freeze({
    activity: "restaurant",
    label: Object.freeze({ en: "Restaurant / café", ar: "مطعم / مقهى" }),
    keywords: Object.freeze([
      "restaurant",
      "cafe",
      "café",
      "coffee shop",
      "diner",
      "food court",
      "مطعم",
      "مقهى",
      "مقاهي",
      "مطاعم",
      "كافيه",
      "وجبات سريعة",
    ]),
    templateKey: "industry.restaurant",
  }),
]);

/** Normalize free-text input for matching (case + whitespace folding). */
function normalizeActivity(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a declared business activity to a template key.
 *
 * - an exact keyword hit (either language) → `{ confidence: "exact" }`;
 * - a containment hit (the activity contains a keyword of ≥ 4 characters,
 *   or a keyword contains the activity — e.g. "retail and wholesale" or
 *   "supermarket branch") → `{ confidence: "suggested" }` (the wizard
 *   confirms before applying);
 * - anything else → `null` — plain onboarding, no template (§4).
 */
export function resolveTemplateForActivity(
  activity: string,
): { templateKey: string; confidence: "exact" | "suggested" } | null {
  const normalized = normalizeActivity(activity);
  if (normalized.length === 0) {
    return null;
  }
  for (const entry of SUPPORTED_ACTIVITIES) {
    if (entry.keywords.includes(normalized) || entry.activity === normalized) {
      return { templateKey: entry.templateKey, confidence: "exact" };
    }
  }
  // Looser pass: containment in either direction, both sides ≥ 4 chars so
  // a stray fragment ("caf") inside an unrelated word can never fire.
  for (const entry of SUPPORTED_ACTIVITIES) {
    for (const keyword of entry.keywords) {
      if (
        keyword.length >= 4 &&
        normalized.length >= 4 &&
        (normalized.includes(keyword) || keyword.includes(normalized))
      ) {
        return { templateKey: entry.templateKey, confidence: "suggested" };
      }
    }
  }
  return null;
}
