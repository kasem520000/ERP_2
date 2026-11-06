# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-06

## The single next action

**Execute PHASE-025 — Performance, Reliability & GA Readiness** per
[../implementation/phases/PHASE-025.md](../implementation/phases/PHASE-025.md): the GA
gate phase — load tests at 10× projection against NFR-006 latency budgets (the k6
T-01…T-08 evidence), the soak test, the DR drill within RTO with timing evidence
(region-loss tabletop + the cross-region restore rehearsal), the cold backup-restore
by a second engineer, runbooks cold-run validated, SLO dashboards + error budgets
live, the docs-drift final validation, and the **GA gate checklist green**
([../planning/MASTER_ROADMAP.md](../planning/MASTER_ROADMAP.md) §Release gates).

Why now: PHASE-024 is COMPLETE (2026-11-06; evidence:
[../planning/IMPLEMENTATION_STATUS.md](../planning/IMPLEMENTATION_STATUS.md) PHASE-024
row + the completion report at
  `docs/implementation/phases/reports/PHASE-024-COMPLETION.md`) — the security posture
of the GA candidate is evidenced: the internal pen-test re-verification executed over
the full SECURITY_TEST_PLAN §11 scope list (139 files / 2019 tests — the PHASE-024
baseline PHASE-025's GA checklist references), the findings log live
([../operations/security-findings.md](../operations/security-findings.md) — 0 Critical
open; every internal finding fixed in-phase with regression links), MFA enforcement
per role/plan live, the offboarding purge proven end-to-end, the secrets-rotation
drills executed with a runbook, dependency triage recorded (0 critical — the blocking
rule holds), the threat model refreshed with residual-risk owners, and the disclosure
policy published AR+EN. The two honest markers PHASE-025 must carry forward: the
**external pen-test firm leg remains the recorded infra-gated waiver** (the §11
cadence requires it + a scoped re-test before GA — the GA checklist re-reads the
engagement record), and **OQ-009 stays BLOCKED-EXTERNAL** (DR-024-02) until the legal
review lands — the 90-day retention working assumption and its named constants
remain in force.

How:

1. Follow the handoff protocol: read the PHASE-024 material first (the completion
   report; migration `0036_security_hardening.sql`; `identity/domain/mfa-policy.ts` +
   the bootstrap service + the session-middleware gate; the offboarding services +
   the purge sweep; `infra/security/rls-canary.ts`; `docs/operations/security-findings.md`
   — the living log PHASE-025 inherits), then the consumed-as-is specs:
   [../PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md) §2 (the NFR-006/007 budgets),
   [../operations/MONITORING.md](../operations/MONITORING.md) (SLOs + error budgets),
   [../operations/BACKUP_RESTORE_RUNBOOK.md](../operations/BACKUP_RESTORE_RUNBOOK.md),
   [../planning/RELEASE_STRATEGY.md](../planning/RELEASE_STRATEGY.md) (the GA gate
   checklist itself), and the PHASE-024 gate baseline (the completion report's test
   sections).
2. Confirm prerequisites per the dependency graph: PHASE-024 ✓ (+ the full delivered
   stack PHASE-001…023 ✓ — all verified in IMPLEMENTATION_STATUS).
3. Register any intake keys first per the FEATURE_CATALOG §25 protocol — PHASE-025
   is expected to be key-neutral (measurement + drills + dashboards), but anything
   new follows the protocol before landing.
4. Honor the binding constraints: the hosted-k6 leg may be infra-gated in this
   environment — the local harness substitutes are the recorded pattern (the
   PHASE-007 posting smoke + the PHASE-014 mvp-candidate local spec precedents);
   drills executed, not described; the GA checklist re-reads the PHASE-024 findings
   log + the external-leg waiver record before any GA claim.
5. Do NOT implement PHASE-026+ in the same run.

## Follow-up obligations (waived evidence — attach at first infra availability)

- First GitHub CI green run on `main` (ci.yml) — PHASE-001 (local gate output is
  the recorded substitute).
- `docker compose up -d` healthcheck capture on a Docker-capable host — PHASE-001.
- First ci-db.yml (Testcontainers) run — PHASE-002 (the embedded-PG16 db suite is
  the recorded local substitute).
- Hosted k6 runs — PHASE-007 posting smoke + PHASE-014 MVP-candidate scenario +
  **the PHASE-025 load/soak legs** (local harnesses are the recorded substitutes).
- Staging-tier restore rehearsal with the managed-PITR path (the sandbox drill of
  2026-11-01 is the recorded first rehearsal — BACKUP_RESTORE_RUNBOOK §8 actions).
- **The external pen-test firm engagement + the scoped re-test before GA** —
  PHASE-024 (the internal re-verification over the full §11 scope list is the
  recorded substitute; a partial-scope report is an INCOMPLETE marker, not a pass).
- **The OQ-009 legal review** — PHASE-024 DR-024-02 (BLOCKED-EXTERNAL; the working
  assumption + named constants stay in force until the record lands).
- CI gitleaks full-history scan — MVP_SECURITY_REVIEW §0 (the targeted local grep +
  the PHASE-024 `check:history-secrets` substitute are recorded).
- The `deps-audit` CI job stays red until SF-024-016/017 remediation or waiver —
  PHASE-024 (see [../operations/security-findings.md](../operations/security-findings.md)).
- `release/v1.0.0` tag: created in the delivery repository when the archive is
  restored to a git checkout (this sandbox hands over a zip; the tag instruction is
  recorded in the PHASE-014 completion report §Release).

## Do NOT

- Do not implement PHASE-026+ in the same run as PHASE-025.
- Do not modify the ADRs or the roadmap without the change-control process
  ([IMPLEMENTATION_PROTOCOL.md](IMPLEMENTATION_PROTOCOL.md) §3).
- Do not relax the frozen substrates (PHASE-002 infra, PHASE-003 identity trust —
  incl. the PHASE-024 MFA policy substrate + the enrollment-bootstrap gate,
  PHASE-004 provisioning/entitlements, PHASE-007 posting-engine invariants,
  PHASE-009 tax contracts + snapshot semantics INV-022, PHASE-010 stock-ledger
  append-only semantics INV-010/017/018, PHASE-011 match-before-approval +
  GRNI/RC-09 semantics, PHASE-012 §3.4 explicit-allocation open-item semantics +
  original-cost re-entry W-3, PHASE-013 report-contract semantics +
  assertion-gated exports + the audited print/export artifact trail, PHASE-014
  billing lifecycle + INV-022 limit discipline + the both-paths A-009 parity,
  PHASE-015 configuration-engine semantics — additive-only switching BR-038,
  fail-closed resolution, L2 jurisdiction-pack values read-only, terminology
  presentation-only, PHASE-016 POS/sync semantics — the SYNC_PROTOCOL §11
  narrow-slice boundary, exactly-once posting, offline state honesty, PHASE-017
  planning-only routes + van-as-VAN-warehouses + settlement variance posting,
  PHASE-018 costing semantics, PHASE-019 CRM/contract/billing semantics, PHASE-020
  sync protocol semantics, PHASE-021 desktop shell + write-intent registry,
  PHASE-022 mobile capabilities + budgets, PHASE-023 the submission-registry state
  machine + the no-fabrication gate, PHASE-024 the purge-path RLS policies + the
  audit anonymization exception + the MFA enrollment gate — the security phase's
  own substrate is now frozen).
- Do not mark GA green while the external pen-test leg + OQ-009 remain open records
  without the checklist explicitly re-reading them (the honest-marker discipline).
