# ADR-0001: Collapse 149 root markdown files into 5 living documents

## Status

Accepted — implemented in MP3, merged 2026-05-11.

---

## Context

Over many development sessions (each producing status reports, SOPs, runbooks, audit trails, checklists, proof documents, governance docs, and plans), the repository accumulated **153 markdown files at the root level** (149 targeted for deletion, 4 kept). The accumulation happened because:

1. Each session or mega-prompt had a mandate to document its own work, producing a new file.
2. Status reporting was mixed into the same files as operational procedures.
3. Files referenced each other inconsistently — different files contradicted on the same facts, with no clear resolution authority.
4. A new operator joining the project had no path to read the minimum set of docs needed to run the system safely.

The proliferation was not malicious or careless — it was the natural output of rapid, parallelized build sprints. But by 2026-05-11 the root directory had become an obstacle rather than a guide.

**Specific harms identified:**
- A new pharmacist or store manager trying to understand their SOP had to discover the right file among 153 candidates.
- Two files (`CURRENT_MAIN_TRUTH.md` and `CURRENT_MAIN_TRUTH_V2.md`) had overlapping but inconsistent claims about system readiness.
- The `PILOT_RUNBOOK.md` file still referenced an early pilot framing that had been superseded by production-readiness work.
- Status files from 3–4 sprints ago made "complete" claims about items that were still open.
- Every session had to be told to "read AGENT_INSTRUCTIONS.md and these 10 status files" before starting, which consumed context and caused errors when stale files were read.

---

## Decision

Collapse the 149 deletable root markdown files into **5 authoritative living documents** under `docs/`:

| File | Consolidates |
|------|-------------|
| `docs/OPERATIONS.md` | All `*_SOP.md`, `*_RUNBOOK.md`, `*_OPS_*.md`, `*_CHECKLIST.md` at root |
| `docs/RUNTIME.md` | All `*_OBSERVABILITY_*.md`, `*_RUNTIME_*.md`, `*_MONITORING_*.md`, OPS_BRIDGE, INCIDENT_COMMAND_CENTER |
| `docs/COMPLIANCE.md` | All `*_COMPLIANCE_*.md`, `*_PHARMACIST_*.md`, `*_REGULATED_*.md`, `*_HIPAA_*.md`, `*_PHI_*.md`, `*_DPDP_*.md`, `*_PRESCRIPTION_*.md`, `*_H1_*.md`, `*_AUDIT_*.md` |
| `docs/RELEASE.md` | All `*_RELEASE_*.md`, `*_DEPLOY_*.md`, `*_LAUNCH_*.md`, `*_CI_*.md`, `*_BRANCH_PROTECTION_*.md`, `*_MIGRATION_*.md`, `*_ROLLOUT_*.md`, `*_PR_*.md`, `*_GO_LIVE_*.md` |
| `docs/STATUS.md` | All `*_STATUS.md`, `*_AUDIT.md`, `*_PROOF.md`, `*_TRUTH.md`, `BASELINE_MAIN_AUDIT.md`, `CURRENT_MAIN_TRUTH*.md`, `INVESTOR_TECH_DILIGENCE_PACK.md`, `PRODUCTION_READINESS_STATUS.md`, `LATEST_MAIN_VALIDATION_STATUS.md` |

Additionally:
- `docs/adr/README.md` and `docs/adr/0001-doc-collapse.md` — this ADR.
- `docs/dpdp/data-flow.md` and `docs/dpdp/consent-matrix.md` — DPDP Act scaffolds (clearly marked, NOT compliance claims).
- `scripts/verify-docs-structure.mjs` — CI gate asserting the 5 living docs exist and root .md count is ≤ 8.

**The writing principle:** Living docs contain operational doctrine (who does what, when, and what evidence they capture). They do not contain status reporting, narrative about what was shipped last sprint, or "we achieved X" claims. Those belong in git history and PR descriptions.

---

## What was deleted

**Categories of deleted files (149 total):**
- `*_STATUS.md` (~80 files) — session-by-session status reports. Stale facts extracted into STATUS.md; procedures extracted into OPERATIONS/RUNTIME/COMPLIANCE/RELEASE.
- `*_RUNBOOK.md`, `*_SOP.md` — operational procedures. Extracted into OPERATIONS.md.
- `*_CHECKLIST.md` — opening, closing, shift handoff, onboarding, rollout, staging drill checklists. Extracted into OPERATIONS.md and RELEASE.md.
- `*_AUDIT.md`, `*_PROOF.md`, `*_TRUTH.md` — evidence snapshots. Relevant live facts extracted into STATUS.md; historical evidence is in git history and the `evidence/` directory.
- `*_PLAN.md`, `*_PACK.md`, `*_MATRIX.md` — planning docs, investor packs, readiness matrices. Operational facts extracted; narrative dropped.
- `*_GOVERNANCE.md`, `*_CONSTITUTION.md`, `*_DOCTRINE.md` — governance/policy docs. Substance extracted into COMPLIANCE.md and RELEASE.md.
- `*_LOCK.md`, `*_ORDER.md`, `*_LEDGER.md`, `*_BACKLOG.md`, `*_MANIFEST.md` — execution-control docs. Dropped (execution state belongs in git branches and PRs, not static files).
- Miscellaneous: `todo.md`, `ROUTING.md`, `VALIDATION_COMMANDS.md`, `PARALLEL_EXECUTION_CONTROL.md`, `NEXT_WAVE_EXECUTION_LOCK.md`, `NO_STUBS_NO_PLACEHOLDERS_PRODUCTION_DOCTRINE.md`, `PRODUCTION_9_5_READINESS.md` — content either extracted or dropped as superseded/redundant.

**Production evidence files deleted (evidence was not discarded — it lives in `evidence/`):**
- `BACKUP_RESTORE_PROOF_STATUS.md` — evidence links are in `evidence/` directory; procedure moved to OPERATIONS.md.
- `DEPLOYMENT_PROOF_STATUS.md` — same; procedure in RELEASE.md.

---

## What was preserved

**At repo root (explicitly kept):**
- `AGENT_INSTRUCTIONS.md` — non-negotiable execution doctrine. Updated to add new living docs to mandatory reads.
- `HANDOFF.md` — session continuity marker for resuming agent sessions.
- `README.md` — rewritten to point to the 5 living docs.
- `OPEN_BLOCKERS.md` — live blocker tracking; single source of truth for P0/P1/P2 blockers.

**In `docs/` subdirectory (all preserved untouched):**
- `docs/PRODUCT_NORTH_STAR.md` — the business thesis (strategy doc, sacred).
- `docs/PHARMACY_OS_BLUEPRINT.md` — the domain architecture (strategy doc, sacred).
- `docs/dashboards/*.json` and `docs/dashboards/*.md` — Grafana/ops dashboard definitions.
- `docs/ADDITIONAL_FEATURES.md` and `docs/ADDITIONAL_FEATURES_2.md`.

**All code, schemas, scripts, and tests** are completely untouched by this PR.

---

## Consequences

### Positive

- **Discoverability:** A new operator can read `AGENT_INSTRUCTIONS.md + docs/OPERATIONS.md + docs/COMPLIANCE.md + docs/STATUS.md` and understand how to run the system.
- **Accuracy:** Living docs contain the current doctrine, not a snapshot from 3 sessions ago. Conflicts between old docs are resolved (older or superseded claims dropped; "needs verification" items are in STATUS.md §Open items).
- **Reduced agent context waste:** Future sessions no longer need to read 15 status files to understand where things stand.
- **CI enforcement:** `scripts/verify-docs-structure.mjs` enforces the structure persists — the living docs cannot be accidentally deleted without a CI failure.
- **ADR discipline:** Starting an ADR directory creates the pattern for future architectural decisions.

### Negative

- **History lost in file form:** The narrative history of what was built in which session is no longer in individual files. It is preserved in git history and PR descriptions, but not as browsable markdown. Future developers who want the "why" behind a decision need to use `git log` rather than reading a status file.
- **External links broken:** Any external reference (bookmarks, Notion links, Slack shares) to the deleted files will be broken. Given this is a private repo with no external documentation site, the impact should be minimal.
- **Consolidation risk:** Consolidating many files into a few creates a merge conflict surface if multiple agents edit the same living doc simultaneously. Mitigated by: each MP is docs-only OR code-only (not both), and the living docs are not in the file scope of code-focused MPs.
- **First-reader trust:** A new contributor unfamiliar with the context may find a single 600-line OPERATIONS.md harder to skim than many smaller files. Mitigated by clear section headers and internal cross-references.
