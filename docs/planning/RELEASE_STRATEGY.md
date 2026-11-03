# Release Strategy

> **Status:** STABLE · **Owner:** Platform Architecture · **Updated:** 2026-10-28

## Release tiers and definitions

| Release | Definition | Content |
|---------|-----------|---------|
| **MVP (v1.0)** | First paid customers, KSA + UAE back-office segment | Phases 001–014 |
| **v1.x industry releases** | Quarterly post-MVP | POS + industry templates (015–017), manufacturing/CRM (018–019) |
| **v2.0 multi-platform** | Desktop + Android + offline field sales | 020–022 |
| **GA** | Compliance integrations + hardening + SLOs | 023–025 |
| **Enterprise Depth** | Post-GA platform depth & breadth: financial depth, industry expansion II, consolidation | 026–034 (stages 9–11) |

Each release ships only phases marked `COMPLETE` in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) with evidence. **No release may
include partially verified phases.**

## Post-GA expansion releases (stages 9–11 — Blueprint v2.0)

Per [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md), stages 9–11 (PHASE-026…034) are
**additive post-GA releases**: they never alter the MVP (PHASE-014) or GA (PHASE-025)
gates (ED-01) and may ship as independent releases as their phases complete:

- **Stage 9 — financial depth (PHASE-026…029)**: fixed assets, cheques/promissory notes &
  installments, budgeting, payroll (financial scope) — entitlement-gated modules rolled
  out per the existing feature-flag + cohort rules.
- **Stage 10 — industry expansion II (PHASE-030…033)**: wholesale, electronics,
  healthcare, education, agriculture commercial-shell templates — configuration-layer
  releases on the v1.x industry pattern.
- **Stage 11 — enterprise consolidation (PHASE-034)**: multi-entity consolidation
  (ADR-0018).

**Enterprise Depth gate (after PHASE-034)**: consolidated statements reconcile to member
books with eliminations proven (INV-026, golden G-32); payroll, fixed-assets, and
notes/installments suites green (INV-023…025, goldens G-21…G-31); zero cross-tenant
writes demonstrated (ADR-0018). The release ships only `COMPLETE` phases with evidence
and is tagged per the CalVer scheme like every other release.

## Branching & versioning

- Trunk-based: `main` always releasable; short-lived feature branches; PR reviews use
  the [code review template](../implementation/templates/CODE_REVIEW_TEMPLATE.md).
- Versioning: **CalVer for releases** (`v1.YY.MM.patch`) + semver for `packages/*`
  consumed by apps. API versions follow [../api/API_VERSIONING.md](../api/API_VERSIONING.md)
  (URL-prefixed major).
- Every completed phase is tagged `phase/NNN`; every release tagged `release/vX`.

## Rollout

1. Internal dogfood tenant → 5–10 design-partner tenants (staging data isolation) →
   general availability by cohort.
2. Feature flags + entitlement gating for staged exposure of new modules.
3. Desktop/Android: staged rollout channels (10% → 50% → 100%) with crash-rate gates.
4. Migrations: expand-contract; never a destructive step in the same deploy that serves
   traffic (see [../database/MIGRATION_STRATEGY.md](../database/MIGRATION_STRATEGY.md)).

## Quality gates per release

- CI green (unit/integration/E2E/visual AR+EN/tenant isolation/accounting invariants).
- Migration rehearsal on staging succeeded.
- Security checklist: dependency audit, SAST, new-endpoint permission review.
- Performance smoke against NFR-006 budgets.
- Documentation freeze: IMPLEMENTATION_STATUS + CHANGELOG updated; docs validation
  script (link/section checks) passes.

## Communication

- Release notes generated from `CHANGELOG.md` entries (user-facing, bilingual).
- Breaking API changes: deprecation window per [../api/API_VERSIONING.md](../api/API_VERSIONING.md);
  never break offline clients mid-rollout (they lag).

## Rollback

- Apps/API: redeploy previous image (DB-compatible by expand-contract).
- Clients: force-update via minimum-version enforcement (ADR-0014/0013 channels).
- Data: documented per-phase rollback notes; forward-fix preferred over restore;
  restore-from-backup is the last resort with incident process
  ([../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md)).

## Release execution log (append-only)

| Release | Date | Tier | Quality gates | Evidence |
|---------|------|------|---------------|----------|
| **v1.0.0 (MVP)** — CalVer `v1.26.10.0` per §Branching & versioning | 2026-11-01 | MVP (PHASE-001…014) | CI-equivalent local gate: **ALL 17 steps green** (typecheck, lint + module boundaries, depcruise, permissions-drift 224=224, unit 244 tests, db suite 69 files/1153 tests on embedded PostgreSQL 16, build, token contrast, i18n parity 1723/1723, ui-catalog 37↔60, visual harness 16/16 + axe, web CSP/security probe, docs validation 29/29, negative meta-tests ×3). Migration rehearsal: fresh-apply of 0001–0021 proven by every db-suite boot + the restore drill's clean chain apply. Security checklist: [MVP_SECURITY_REVIEW.md](../security/MVP_SECURITY_REVIEW.md) — 0 prod criticals, findings triaged, zero open blockers (pen-test PHASE-024 per §Scope split). Performance smoke vs NFR-006: T-01 33 ms p95 @100k docs / T-02 10 ms / T-04 14 ms compute / T-06 156 ms AR + 160 ms EN / T-07 0.000% 5xx (local harness; hosted k6 staged). Docs freeze: IMPLEMENTATION_STATUS (001–014 COMPLETE), CHANGELOG, handoff set updated; docs validation green. Restore rehearsal: PASSED (runbook §8 drill record, 2026-11-01). | [PHASE-014-COMPLETION.md](../implementation/phases/reports/PHASE-014-COMPLETION.md) |

### v1.0.0 notes

- **Hosted-infra gates waived per the standing owner directive (2026-10-28)**: GitHub CI
  green run, compose healthcheck, Testcontainers run, hosted k6, staging-tier restore —
  local-equivalent evidence recorded in the completion report; first-infra-availability
  follow-ups tracked in [NEXT_ACTION.md](../handoff/NEXT_ACTION.md).
- **Tag instruction**: `release/v1.0.0` (+ `v1.26.10.0` CalVer alias) is to be created in
  the delivery repository when the PHASE-014 archive is restored to a git checkout — the
  sandbox handover is zip-based (no `.git`), so the tag cannot be created here; the
  completion report records this instruction as the release record.
- Rollback posture: expand-contract migrations (0001–0021 additive), entitlement-gated
  feature surface, no data rollback paths — per §Rollback above.
