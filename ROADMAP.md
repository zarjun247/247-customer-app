\# 24/7 Pharmacy OS — Score-lift Roadmap (post-MP8)



Current state: \~9.65 after MP1-MP8 + MP8 intelligence pillar.

Target: 9.95. Last 0.05 reserved for the 7 humans-must-do items in SCORECARD.md (created in SM-D).



\## Plan (4 super-megas + interim repairs)



| # | Name | Score after | Agent hours |

|---|---|---|---|

| CI-baseline-repair | Fix 2 pre-existing test failures, unlock real CI signal | 9.65 | 0.5 |

| SM-A | MP9+MP10+P1+P2: correctness + foundations + architecture | 9.83 | 15-20 |

| SM-B | Security hardening + DPDP completion | 9.88 | 6-8 |

| SM-C | CI hardening + operational tooling | 9.92 | 6-8 |

| SM-D | Product clarity + phase gating (MP8 already shipped) | 9.95 | 2-3 |



Then: 90-day burn-in + 7 humans-must-do items → 10.0



\## SM-A — Correctness + Foundations + Architecture

\- Phase 1+2 (MP9+MP10): atomicity + entity-derived store-scope RBAC

\- Phase 3 (P1-stripped): ESLint flat + husky + tests-in-tsc + pnpm audit

\- Phase 4 (P2): 138-table schema split, 10 router splits, db.ts split, DOMAINS.md



\## SM-B — Security + DPDP

Skip what MP7 shipped (audit chain, rate-limit service, capability grants, cspEnforcer).

Ship: CSP enforce default-on, CSRF middleware, vault envelope encryption,

DSR endpoints (access/export/rectification/erasure/consentLog/grievanceContact),

notice version registry, retention worker, children consent, India-region

storage assertion, breach notification template, LEGAL\_REVIEW\_PACK.md.



Migrations: 0055 consent\_notice\_versions, 0056 dsr\_requests,

&#x20;           0057 family\_consent, 0058 vault\_encryption\_columns

(MP8 took 0057 for ai\_eval\_ledger — renumber SM-B's migrations to 0058-0061)



\## SM-C — CI + Operational Tooling

SBOM (cyclonedx), Dockerfile multi-stage, Trivy scan, signed attestation,

staging deploy + rollback workflows (dry-run default), release-please,

realistic-data seed, backup-drill workflow, restore-drill workflow,

provider verification matrix (with mocks), on-call rota.yml + validator,

5 incident rehearsal scripts, emergency stop script, capacity planning,

SLO coverage verifier, pharmacist SOP template, staff access roster template.



\## SM-D — Product Clarity + Phase Gating

Strip AI-tool exhaust, delete HANDOFF.md, rename AGENTS.MD → AGENT\_INSTRUCTIONS.md,

trim PHARMACY\_OS\_BLUEPRINT.md, overwrite ROADMAP.md (this file) with final phase-gated

version, APP\_PHASE env + featureFlags.ts, 12 admin surfaces Phase 2-gated,

intelligence/aiEval routers Phase 3-gated (MP8 services already shipped),

OPEN\_BLOCKERS restructure, README rewrite, SCORECARD.md.



\## Migration numbers (reserved)

0050 SLO events (MP1)               — shipped

0051 command\_outbox (MP5)           — shipped

0052 reservation\_ledger (MP6)       — shipped

0053 stock\_movement\_locks (MP6)     — shipped

0054 audit\_log\_chain (MP7)          — shipped

0055 pii\_encryption\_keys (MP7)      — shipped

0056 capability\_grants (MP7)        — shipped

0057 ai\_eval\_ledger (MP8)           — shipped

0058 SM-B consent\_notice\_versions

0059 SM-B dsr\_requests

0060 SM-B family\_consent

0061 SM-B vault\_encryption\_columns

0062+ reserved

