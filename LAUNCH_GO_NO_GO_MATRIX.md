# LAUNCH_GO_NO_GO_MATRIX

Updated: 2026-05-10.

## Current launch decision

**Decision: NO-GO for live controlled production on 2026-05-10.**

Reason: the repository shows strong software foundations, but live launch still lacks P0 evidence for provider verification, measured staging backup/restore, named operational ownership, staff access assignment, pharmacist SOP signoff, legal/compliance review, live monitoring ownership, hosted CI DB observation/deployment proof, and emergency rollback rehearsal.

## Go/no-go definitions

| Decision | Meaning |
| --- | --- |
| GO | First live store may process controlled real customer/pharmacy operations under the rollout cap. |
| CONDITIONAL GO | Staging rehearsal or staff dry-run may proceed; real customer/pharmacy operations remain blocked until named conditions close. |
| NO-GO | Real customer/pharmacy operations are blocked. Demos and non-production rehearsals only. |

## Required GO criteria

| Gate | GO requirement | Current result |
| --- | --- | --- |
| Software validation | Required local commands pass on release commit. | Pending this gate run. |
| Hosted CI | Target branch checks archived; DB concurrency workflow observed with logs and artifact. | Workflow wired; hosted run evidence not attached in repository. |
| Deployment proof | Staging/prod artifact ID, runtime URL, health/readiness proof, and rollback proof. | Not evidenced. |
| Provider verification | Payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally/export verified in sandbox/staging or explicitly disabled. | Not evidenced. |
| Backup/restore | Measured staging restore drill with data verification and owner signoff. | Not evidenced. |
| Staff access | Named launch staff, roles, store assignments, no shared admins. | Not evidenced. |
| Pharmacist SOP | Written pharmacist signoff for regulated workflows and exceptions. | Not evidenced. |
| Legal/compliance | Written review or leadership-approved launch exception. | Not evidenced. |
| Monitoring ownership | Primary/secondary owners and escalation rota for launch period. | Not evidenced. |
| Manual fallback | Staff-trained fallback for payment, stock, prescription, delivery, and outage scenarios. | Not evidenced. |
| Emergency stop/rollback | Rehearsed procedure with owner and timeline. | Not evidenced. |

## Blocker classification

| Blocker | Class | Live launch impact | Required closure evidence |
| --- | --- | --- | --- |
| Real provider credentials/sandbox verification missing | P0 launch blocker | Cannot process real payment, notification, OCR, storage, print, map, or accounting-provider flows safely. | Provider matrix with environment, credential status, test IDs, success/failure evidence, and owner signoff. |
| Measured staging backup/restore drill missing | P0 launch blocker | Cannot prove recovery from data loss or deployment incident. | Drill report with backup ID, restore target, duration, validation queries, screenshots/log IDs where allowed, and owner signoff. |
| Staff access assignment missing | P0 launch blocker | Shared/unscoped access risks PHI/PII, stock, payment, and regulated gate breaches. | Named user/role/store access roster and removal process. |
| Pharmacist SOP signoff missing | P0 launch blocker | Regulated dispensing workflows cannot be legally/operationally trusted. | Pharmacist-in-charge signed SOP and staff acknowledgement. |
| Legal/compliance review missing | P0 launch blocker | Repository controls do not equal jurisdictional compliance. | Counsel/compliance approval or accountable written exception. |
| Live monitoring ownership missing | P0 launch blocker | Failures/dead letters/refunds/security events may go unnoticed during launch. | Monitoring rota with primary/secondary owners and escalation thresholds. |
| Deployment proof missing | P0 launch blocker | Runtime and rollback readiness are not proven. | CI/CD run, artifact ID, runtime URL, health/readiness output, rollback proof. |
| Hosted CI DB observation missing | P1 controlled rollout blocker | Local proof and workflow wiring are useful, but release branch parity is not archived. | Hosted `DB Concurrency Proof` run URL, run ID, branch, commit SHA, full logs, and `db-concurrency-proof-*` artifact. |
| Supplier invoice duplicate backfill/migration approval | P1 controlled rollout blocker if live purchasing is enabled; P2 scale blocker if purchasing remains manually controlled | The commit seam blocks future committed duplicates, but duplicate statutory/commercial purchase records can survive until reviewed. | Business-reviewed duplicate report, remediation decisions, and approved non-destructive uniqueness migration plan. |
| Multi-store runtime data proof missing | P1 controlled rollout blocker before second store | Store isolation assumptions need production-like counts. | Staging/prod-like aggregate report for orphaned orders, missing staff stores, negative stock rows, and cross-store anomalies. |
| Incident command center incomplete | P2 scale blocker | Foundation exists but incident entities/SLA/provider heartbeat/anomaly rules are incomplete. | Incident record model/runbook implementation and backed metrics. |
| Provider heartbeat/SLA rollups absent | P2 scale blocker | Cannot safely scale without service-level trends. | Durable provider latency/availability counters and dashboards. |
| UX/operator polish | P3 polish/deferred | Does not block first controlled launch if SOP/manual fallback covers gaps. | Prioritized post-launch UX backlog from staff observation. |

## Final launch recommendation

- **Today:** NO-GO for real controlled production.
- **Next allowable activity:** staging launch rehearsal and evidence collection.
- **First live launch after P0 closure:** maximum 1 store, 7-day hold, daily reconciliation/stock/dead-letter review, named pharmacist and incident commander on call.
- **Expansion:** only after explicit day-7 go/no-go review and no open P0/P1 blocker affecting live scope.
