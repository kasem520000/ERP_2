# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-06

## The single next action

**The 25-phase blueprint is CLOSED — the platform is GA** (PHASE-025 COMPLETE
2026-11-06; release `v1.1.0` / CalVer `v1.26.11.0`, tags real in this repository;
evidence: [../implementation/phases/reports/PHASE-025-COMPLETION.md](../implementation/phases/reports/PHASE-025-COMPLETION.md)
+ the closed [GA-RELEASE-CHECKLIST.md](../implementation/phases/reports/GA-RELEASE-CHECKLIST.md)).

Post-GA work is governed by two tracks (no vague aspirations — every item has a home):

1. **The expansion releases (stages 9–11 — PHASE-026…034)** per
   [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md) +
   [../planning/RELEASE_STRATEGY.md](../planning/RELEASE_STRATEGY.md) — additive
   post-GA releases that never alter the MVP/GA gate criteria (ED-01). **Next
   eligible phase: PHASE-026 — Fixed Assets & Depreciation** (asset register &
   categories, monthly depreciation runs, revaluation, disposal with gain/loss
   mirrors — INV-023, goldens G-21…G-23; prerequisites 025 ✓ + 007 ✓ + 013 ✓ per
   the dependency graph).
2. **The decision-record queue** (the PHASE-025 T14 stubs + the standing records):
   DR-P25-01 bug bounty · DR-P25-02 support SLA (OQ-008) · DR-P25-03 personal
   payments (OQ-007) · DR-P25-04 ETA/UAE adapter follow-ups · DR-P25-05 iOS ·
   DR-P25-06 the observability exporter swap (SF-024-021 → the live in-process
   substrate's pipeline leg) · DR-P25-07 the report-run quota — plus the standing
   open records GA shipped with: DR-001 (ZATCA option C — the launch segment
   excludes e-invoicing-requiring taxpayers; certification path per the
   verification gate), DR-002 (payment production cutover), DR-003 (Egypt ETA),
   DR-024-02 (OQ-009 legal review — BLOCKED-EXTERNAL, 90-day working assumption).

Why now: GA shipped with the honest ledger — the internal evidence legs are ALL
GREEN (143 files/2035 tests; the 10× local load harness T-01…T-08 within every
budget; both restore drills PASSED with timings; SLOs/error budgets live with the
seeded-burn proof; the observability audit green; docs-drift battery green), and
the hosted legs carry the standing owner-directive waiver pattern with named
follow-up obligations: **the production-class hosted k6 full-load + the 12 h
staging soak + the recovery-region wall time** (PERFORMANCE_TEST_PLAN §8 —
passing on weaker hardware does not close the hosted gate; re-run before any
production-scale claim is re-quoted), **the external pen-test firm leg** (the
PHASE-024 waiver re-read at the GA checklist), and **the November backup
attestation honestly NOT SIGNED** (first due 2026-12-01 — the first full month
post-GA; the nightly smoke exists as an executable procedure, not 30 calendar
days of scheduled runs).

How (the standing operating rules, now the product's operating system):

1. The maintenance protocols of every governing document own the cadences: test
   plan §14 (new hot queries → the top-10 EXPLAIN list), performance §9
   (historical results never re-quoted without a re-run note), secrets §8
   (rotation drills), chaos §9, compliance matrix §6 (official-source
   monitoring), backup runbook §8 (quarterly cold drills + monthly
   attestations), DR §7 (readiness inventory quarterly).
2. Every new phase intake follows the handoff protocol: read the completion
   report + the consumed-as-is specs first; register intake keys per
   FEATURE_CATALOG §25 BEFORE code (catalog drift: migrations manifest +
   ENTITY_CATALOG + AUTHORIZATION_MATRIX + schema.ts mirror + runtime
   FEATURE_DEPS + check-rls + attack-suite fixtures for every new table).
3. Do not mark a hosted leg green without its hosted evidence (the honest-marker
   discipline: a documented INCOMPLETE beats a fabricated pass — directive
   §1.10–1.11).
4. The staged client channels' crash gates (10/50/100, halt < 98.5%) stay live
   through and after every rollout; error-budget exhaustion pauses feature
   releases (MONITORING §5 — the policy recorded in the GA checklist).
