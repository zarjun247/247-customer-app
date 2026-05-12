# Post-Incident Report Template

Fill in this template within 48 hours of a P0/P1 incident closure. Do not include raw PHI, PII, payment secrets, or prescription details in this document.

---

## Incident metadata

| Field | Value |
|-------|-------|
| Incident ID | INC-YYYY-NNN |
| Severity | P0 / P1 / P2 |
| Date/time started | |
| Date/time resolved | |
| Total duration | |
| Incident commander | |
| Pharmacist-in-charge (if relevant) | |
| Platform owner | |
| Report author | |
| Review date | |

---

## Summary

_One paragraph: what happened, what was the customer/clinical impact, and how it was resolved._

---

## Timeline

| Time (IST) | Event | Actor |
|------------|-------|-------|
| HH:MM | Incident first detected / alert fired | |
| HH:MM | Incident commander assigned | |
| HH:MM | Root cause identified | |
| HH:MM | Mitigation applied | |
| HH:MM | Service restored | |
| HH:MM | Incident closed | |

---

## Impact

| Area | Impact |
|------|--------|
| Customers affected | |
| Orders affected | |
| Prescriptions affected | |
| Payment transactions affected | |
| Stock truth affected | |
| PHI/PII exposure risk | None / Assessed — [describe] |

---

## Root cause analysis (5 Whys)

**Why 1:** Why did the incident occur?

**Why 2:** Why did that condition exist?

**Why 3:** Why wasn't it caught earlier?

**Why 4:** Why didn't the monitoring detect it sooner?

**Why 5:** What is the systemic root cause?

**Root cause statement:** _One sentence._

---

## What went well

_List 2-4 things that worked well during the incident response._

- 
- 

---

## What could be improved

_List 2-4 things that slowed the response or could be done better._

- 
- 

---

## Action items

| Action | Owner | Due date | Priority |
|--------|-------|----------|----------|
| | | | P0/P1/P2 |
| | | | |

---

## Evidence links

- Pino log time range: `<start_ts>` to `<end_ts>` (no PHI/PII in links)
- Metrics dashboard: `/metrics` snapshot at `<ts>`
- Admin runtime detail: `/api/admin/runtime/detail` captured at `<ts>`
- Dead letter IDs: [list — no raw payload, no signatures]
- Backup/restore record (if relevant): `evidence/backup-drill-<id>.json`

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Incident commander | | |
| Pharmacist-in-charge (if regulated impact) | | |
| Platform owner | | |
| Compliance/legal (if PHI/security involved) | | |
