# On-Call Runbook

On-call response SOP, escalation matrix, and rotation rules for 247 Pharmacy OS launch period.

See also: [OPERATIONS.md](./OPERATIONS.md) §On-call expectations, [RUNBOOK_INCIDENTS.md](./RUNBOOK_INCIDENTS.md).

---

## On-call expectations

| Role | Coverage | Response time (P0) | Escalation trigger |
|------|---------|-------------------|--------------------|
| Incident commander | Primary + secondary named on rota | 15 minutes | Any P0 trigger (see below) |
| Pharmacist-in-charge | Every regulated dispensing hour | Immediate (shift hours) | Any prescription/H/H1/X concern |
| Platform owner | Business hours + on-call for deploy/rollback | 30 minutes | DB failure, deploy failure, rollback needed |
| Provider owner | Business hours + on-call for payment/WhatsApp | 30 minutes | Payment double-settlement risk, WhatsApp outage |
| Store manager | On-shift | 15 minutes | Cash/reconciliation, rider, local ops |

**During the first 14 launch days:** all roles have an explicit named backup. No "shared" on-call — a specific human is accountable per shift.

---

## P0 triggers (page immediately)

Any of these conditions triggers a P0 alert and requires the incident commander to be notified within 15 minutes:

- `/health/ready` returns HTTP 503 for > 2 minutes
- `stock_anomaly_count` increasing (new negative stock rows)
- Payment webhook failure rate > 5% over a 10-minute window
- H/H1/X gate bypass attempt logged in audit
- PHI/PII keyword appearing in pino logs
- Dead letters without assigned owner > 4 hours during launch period
- Data loss detected (table row count drops unexpectedly)
- Unauthorized access attempt (failed login surge, privilege escalation attempt)
- Emergency stop set by any staff member

---

## Alert thresholds

| Alert | Threshold | Response |
|-------|-----------|----------|
| Dead letters (no owner) | > 4 hours | P1 — assign owner within 1 hour |
| DB readiness failure | > 2 minutes | P0 — incident commander immediately |
| Payment webhook failure rate | > 5% over 10 min | P0 — provider owner + incident commander |
| Stock anomaly | Any new row | P0 — pharmacist-in-charge + store manager |
| OCR job stuck | > 5 minutes | P1 — human review fallback + OCR provider owner |
| SLO budget breach | `withinBudget=false` for any critical path | P1 — platform owner |

---

## Tools available on-call

| Tool | URL / command | Purpose |
|------|---------------|---------|
| Health check | `GET /health/ready` | DB, workers, stock sanity |
| Metrics | `GET /metrics` (staff auth) | Prometheus counters and gauges |
| Admin Command Center | `/admin/command-center` | SLA board, dead letters, provider health |
| Dead letter review | `/admin/dead-letters` | View and replay provider dead letters |
| Deployment readiness | `node scripts/deployment-readiness-check.mjs` | Full deployment gate check |
| Emergency stop | `node scripts/emergency-stop.mjs --status` | Check flag state |
| Provider contracts | `pnpm run contract:verify` | Verify provider API shapes |
| Incident rehearsal | `pnpm run incident-rehearsal --list` | List available drill scenarios |

---

## Escalation chain

**Step 1:** Detect incident. Assign severity (P0/P1/P2/P3) using the matrix in [OPERATIONS.md](./OPERATIONS.md) §Escalation matrix.

**Step 2:** P0/P1 → assign incident commander immediately. Page via PagerDuty (`ONCALL_PAGERDUTY_INTEGRATION_KEY`) or the on-call phone list in `rota.yml`.

**Step 3:** Notify domain-specific owner:
- Clinical/regulated/stock concern → pharmacist-in-charge
- Deploy/DB/rollback concern → platform owner
- Payment/WhatsApp/SMS failure → provider owner
- Local ops/cash/rider → store manager

**Step 4:** Keep a running incident log (use `templates/incident_report.md`). Update every 30 minutes during active P0.

**Step 5:** Close only after:
- Root cause confirmed
- Affected entities reconciled
- Pharmacist/manager/provider/platform owners have closed domain actions
- Customer communication sent if needed
- Post-mortem scheduled (P0/P1)

---

## Handoff procedure

**Outgoing on-call must provide:**
1. Open incidents (ID, severity, owner, status, next checkpoint)
2. Dead-letter summary (count, oldest age, owner)
3. Provider health status (any degraded/unhealthy providers)
4. Stock anomaly count (any unresolved rows)
5. Pending reconciliation items
6. Any emergency stop flag status

**Incoming on-call must confirm:**
1. They have received and reviewed the handoff summary
2. They have access to all required tools (admin UI, pager alerts, monitoring dashboards)
3. They know the current incident commander contact

Handoff is incomplete until both outgoing and incoming on-call have signed off.

---

## Rotation rules

- No human on primary for more than 14 consecutive days.
- Every week must have a named primary and secondary.
- Weekend coverage must be explicitly assigned (not "on-call by default").
- Holiday dates must have named coverage (not TBD).
- Rota is validated by: `pnpm run rota:validate`

Create your rota from the template:
```bash
cp templates/rota.yml.example rota.yml
# Fill in real names and dates
# Add rota.yml to .gitignore (do not commit real staff data)
pnpm run rota:validate
```

---

## Emergency escalation contacts (TBD)

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Incident commander (primary) | TBD | TBD | TBD |
| Incident commander (secondary) | TBD | TBD | TBD |
| Pharmacist-in-charge | TBD | TBD | TBD |
| Platform owner | TBD | TBD | TBD |
| Provider owner (Razorpay) | TBD | TBD | TBD |
| Legal/compliance | TBD | TBD | TBD |
| DPO | TBD | dpo@example.com | TBD |

**Fill in before production launch.** These contacts are required P0 closure evidence.
