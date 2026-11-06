# NEXT ACTION — post-PHASE-027

PHASE-027 (Cheques, Promissory Notes & Installments) is COMPLETE and
committed. CURRENT_SHIPPED_PHASE = "PHASE-027" (migration 0038,
schema_version 38; registry 76 contracts; permissions 245=245; i18n
3,799=3,799; check:rls 203 catalog tables).

**Next eligible: PHASE-028 / PHASE-029** (parallel-capable post-GA per
EXPANSION_REGISTER §B — each depends only on pre-GA phases). The agent
protocol executes ONE at a time: **take PHASE-028 (Budgeting & Variance
Control, DR-004) next** — identify only; do not implement without a fresh
phase order.

Key handoffs from 027 (read the PHASE-027 completion report first):
- The G-24/G-26 pair (settle + repoint-restore) is THE pattern every
  future custody-style feature must copy — documented in
  JOURNAL_RULES §7 + TABLES/notes-installments.md.
- Watch items carried: SF-026-001 (purge vs guards) unchanged;
  SF-026-002 (RC-10 accum sign) — RC-11 landed the correct convention;
  the RC-10 seeded-drift DB proof remains the accounting follow-up.
- Runbook note: notifications-email + ga-full-load EXPLAIN specs want
  dedicated (small-chunk) DB runs — pre-existing, both measured green
  standalone (5/5, 13/13).
