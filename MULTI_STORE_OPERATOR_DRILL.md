# MULTI_STORE_OPERATOR_DRILL

Updated: 2026-05-10.

## Drill rules

- Use staging or a controlled non-production dataset unless explicitly approved for live incident response.
- Do not expose PHI, PII, secrets, raw provider payloads, prescription images, or customer addresses in evidence packets.
- Do not bypass H/H1/pharmacist gates, AI governance, stockInvariant, reconciliation truth, or commercial truth.
- If a store-scope check is missing or ambiguous, **freeze the affected store path** and escalate.

## Exercises

| Exercise | Trigger | Expected fail-closed behavior | Evidence to capture |
| --- | --- | --- | --- |
| Store outage | Store A unavailable or intentionally frozen. | Store A stock-changing operations pause; Store B does not inherit Store A orders unless an audited transfer/fallback decision exists. | Freeze note, affected store ID, operator, timestamp, recovery check. |
| Provider outage affecting one store | Store A payment/notification/provider failures increase. | Store A provider actions move to retry/dead-letter review; paid/settled state is not invented; Store B operations continue only with its own provider checks healthy. | Provider event IDs redacted, order/payment store correlation, retry/dead-letter counts. |
| Reconciliation drift detection | Store A stock audit variance appears. | Store A reconciliation requires manager/pharmacist review where applicable; Store B audit remains separate. | Audit ID, variance count, correction movements, approval note. |
| Queue backlog at one node | Store A worker backlog grows. | Non-critical Store A jobs pause or retry; stock/commercial side effects are not duplicated; Store B queue processing is not manually replayed from Store A payloads. | Queue name/payload store correlation, backlog age, replay decisions. |
| Dead-letter growth isolation | Store A provider dead letters grow. | Store A dead letters require audited review; Store B staff cannot replay Store A events. | Current limitation: first-class storeId missing on provider dead letters; collect join-backed order/payment correlation. |
| Rollback affecting one store | Release rollback needed for Store A-specific failure. | Freeze affected stock/commercial mutations, run smoke checks, unfreeze only after reconciliation and runtime checks pass. | Rollback SHA/artifact, freeze window, health/readiness, stock anomaly counts. |
| Emergency freeze | Negative stock, cross-store leak, provider replay, or regulated gate concern. | Stop affected operation immediately; keep pharmacist/H/H1 gates closed; require incident commander approval to resume. | Incident note, impacted store(s), before/after counts, owner signoff. |

## Exit criteria

- No unresolved negative stock rows.
- No orphan orders without store ID.
- No active transfer reservation without matching in-transit/received transfer explanation.
- No unreviewed dead-letter growth for launch-critical providers.
- Store staff cross-store access attempts fail with `FORBIDDEN`.
- Admin break-glass access is reviewed and justified.
