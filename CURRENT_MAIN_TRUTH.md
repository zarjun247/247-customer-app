# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-08.

> **Canonical warning:** older status documents in this repository may contain stale scores, stale branch assumptions, or pre-merge blocker lists. Until the final merge-captain pass completes, this file is the canonical audit entry for current-main readiness and launch gating.

> **2026-05-09 supersession note:** latest-main validation is now recorded in `LATEST_MAIN_VALIDATION_STATUS.md` at SHA `f7d049825eb17922e9fa0c47326620e26a396186`, with latest visible merge PR #107 and no duplicate migration prefixes detected. Treat older SHA/PR values below as historical context unless refreshed.

## 1. Current main baseline

| Item | Current value |
| --- | --- |
| Local baseline inspected | `work` branch at `924e319b73300830d1a75b7eefdf09655398e3e2` |
| Latest main SHA available in this environment | `924e319b73300830d1a75b7eefdf09655398e3e2` |
| Latest merged PR visible in local history | `#73` |
| Latest merged PR title | `test: add commercial lifecycle harness and integration-style fixtures` |
| Latest merged PR merge SHA | `924e319b73300830d1a75b7eefdf09655398e3e2` |
| Latest merged PR source branch | `zarjun247/codex/add-commercial-lifecycle-test-harness` |
| Remote verification status | Not verifiable locally: this checkout has no configured git remote and no GitHub CLI/auth available. Treat the SHA above as the latest main snapshot available to this branch, not as a fresh remote assertion. |

## 2. Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed | Demo flows can be shown with controlled data, explicit caveats, and operator supervision. |
| Controlled internal pilot | Allowed | Internal pilot use is acceptable only with limited stores/users, monitored manual fallback, and no unsupported production-readiness claims. |
| Multi-store beta | Not yet until proof layer passes | Multi-store beta requires stronger proof around CI/security scans, test DB lifecycle, provider contracts, observability, privacy/session controls, DB indexing, API abuse protection, and runtime workflow completion. |
| Race-mode unsupervised production | Not yet allowed | Unsupervised production remains blocked until proof maturity, concurrency behavior, lifecycle completion, backup/restore/deployment proof, monitoring, SOPs, and final merge-captain audit pass. |

## 3. Current estimated scores

These are conservative estimates based on current repository status documents and the latest local merge baseline. They are not a production certification.

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Code maturity | 7.1 / 10 | Significant domain foundations exist, but multiple production hardening and lifecycle gaps remain. |
| Proof maturity | 4.9 / 10 | Test harnesses and status docs exist, but current remote CI/security/provider/deployment proof could not be verified from this environment. |
| Investor-demo readiness | 8.0 / 10 | Strong enough for supervised demos with caveats and curated flows. |
| Controlled-pilot readiness | 6.5 / 10 | Suitable only for controlled internal pilot with tight scope, observation, and fallback. |
| Multi-store beta readiness | 4.8 / 10 | Not yet ready until Wave A proof layer and selected Wave B lifecycle gaps pass validation. |
| Race-mode readiness | 3.4 / 10 | Not ready for unsupervised, high-concurrency, multi-store production operation. |

## 4. Open blockers

### P0 blockers

- Remote truth is not fully verified from this environment: no configured git remote and no GitHub CLI/auth were available, so open PR state, CI checks, labels, conflicts, and latest protected-main SHA require GitHub-side confirmation before merge.
- Product-master runtime gates PR `#66` must be resolved or rebased separately if still open; it should not be closed as stale unless GitHub proves it was already superseded by a later accepted PR.
- Multi-store beta and race-mode launches are blocked until the proof layer passes with current-main validation evidence.
- Any stale duplicate PR that touches runtime, schema, payment, barcode, or accounting domains must not be merged directly because it can revert newer main behavior.

### P1 blockers

- CI/security scan proof is not captured as current-main evidence in this environment.
- MySQL test DB lifecycle proof remains required for production-like validation.
- HTTP security middleware, API abuse protection, provider contract matrix, and observability healthchecks need current-main proof.
- Payment lifecycle/webhook completion, atomic reservations, reservation lifecycle completion, and canonical commercial lifecycle completion remain future hardening work.
- Backup/restore/deployment proof and real-store UAT remain required before broader rollout.

### P2 blockers

- Staff SOP/training/demo-mode materials and production proof dashboard remain pending.
- AI governance and AI operational features must remain gated until core production proof passes.
- Documentation inventory still contains older status files with stale scores; this file is the current canonical warning until final merge-captain cleanup.

## 5. Required validation commands

Every accepted current-main hardening PR should publish the exact result of these commands for the merge commit being reviewed:

```bash
pnpm install
pnpm run check
pnpm test -- --runInBand
pnpm run build
git diff --check
```

## 6. Latest known validation status

| Command | Latest known status for this branch | Notes |
| --- | --- | --- |
| `pnpm install` | Passed on this branch | Completed with lockfile already up to date; pnpm warned that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved. |
| `pnpm run check` | Failed on this branch | Existing TypeScript errors in `server/connectors.ts` at lines 716 and 783 around optional `X-API-Key` header typing. This docs-only PR did not modify runtime code. |
| `pnpm test -- --runInBand` | Passed on this branch | 69 test files passed; 350 tests passed. |
| `pnpm run build` | Passed on this branch | Build completed with existing Vite warnings about unset analytics placeholders and large chunks. |
| `git diff --check` | Passed on this branch | No whitespace errors detected. |
| GitHub PR/CI status | Not verifiable locally | No remote, GitHub CLI, or authenticated GitHub API context is available in this checkout. |

## 7. Current source-of-truth rule

- Use this file first when discussing production readiness, launch eligibility, and stale-PR control.
- Use `STALE_PR_STATUS.md` for current stale/open PR classification and close/label instructions.
- Use `MERGE_GOVERNANCE_STATUS.md` for merge rules.
- Use `FINAL_HARDENING_ROADMAP_STATUS.md` for next-wave sequencing.
- Do not claim the repository is production 10/10 until the final merge-captain audit and proof dashboard validate that claim.
