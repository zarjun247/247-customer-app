# OPERATIONAL_READINESS_MATRIX

Updated: 2026-05-10.

## Purpose

Classify readiness levels honestly and distinguish simulated proof, observed proof, assumed operations, and unsupported assumptions. This matrix does not convert documented doctrine into real-world signoff.

| Classification | Meaning | Current status | Acceptable proof |
| --- | --- | --- | --- |
| Software-ready | Code, migrations, tests, guards, build, and documented runtime controls are ready for controlled validation. | Near-ready for controlled rehearsal if required validation is green. | Passing check/test/build/migration/governance commands and reviewed diff. |
| Deployment-ready | Release artifact, environment, secrets, health/readiness, rollback target, and deployment owner are proven in staging/prod-like runtime. | Not claimed. | Artifact ID, commit SHA, URL, health/readiness output, rollback proof/rehearsal. |
| Operator-ready | Named staff can open/close store, hand off shifts, review queues/dead letters/overrides/refunds, and execute fallback. | Improved doctrine; not evidenced. | Signed training, roster, observed opening/closing/handoff drills. |
| Pharmacist-ready | Pharmacist can execute intake, validation, H/H1/X, controlled-drug, rejection, repeat, discrepancy, and emergency stop SOPs. | Improved doctrine; not evidenced. | Pharmacist-in-charge signoff, staff acknowledgement, observed regulated-flow drills. |
| Legally reviewed | External legal/compliance review accepts launch scope or documents accountable exception. | Not claimed. | Written legal/compliance approval/exception attached. |
| Provider-verified | Payment/OCR/WhatsApp/SMS/maps/storage/accounting providers are configured and tested in sandbox/staging. | Not claimed. | Provider matrix with credentials status, test IDs, failures, owner signoff. |
| Production-approved | Accountable leadership approves constrained launch with all P0 evidence closed. | No-go. | Go/no-go record, evidence register, owners, rollback/stop plan, launch scope. |

## Proof taxonomy

| Proof type | Definition | Current examples |
| --- | --- | --- |
| Simulated proof | Scenario or guard proves expected behavior without real runtime/provider/staff execution. | Unit/guard tests, failure exercise matrix, dry-run restore planning. |
| Observed proof | A real command, hosted CI run, staging drill, provider sandbox transaction, or staff drill was executed and archived. | Local validation commands when run; hosted/deployment/provider/staff proof mostly pending. |
| Assumed operations | A procedure depends on named humans/coverage but names or training are not attached. | Pharmacist/manager/incident roles defined but not rostered in repo. |
| Unsupported assumption | A claim lacks evidence and must not be used for launch approval. | Legal compliance certification, live provider success, real 24/7 staffing coverage, production rollback success. |

## Updated readiness estimate

Operational doctrine and governance readiness improves to **8.9 / 10** for controlled staging rehearsal because pharmacist SOPs, shift/store controls, escalation doctrine, reconciliation governance, training packets, and readiness taxonomy now exist. Actual controlled-production readiness is **8.9 / 10**, not 9.5+, because P0 evidence remains open: legal review, pharmacist signoff, staff roster, provider verification, hosted CI observation, deployment/rollback proof, restore drill, monitoring rota, and observed operational drills.
