# BACKUP_RESTORE_RUNBOOK

Documentation-only backup and restore runbook. This runbook defines the operating procedure expected before real production cutover and must be rehearsed outside a crisis.

> Warning: Do not test restore for the first time during a crisis. Restore must be rehearsed on staging with named owners, measured timings, and verification evidence before production go-live.

## Scope
- Database backups and restores.
- Object storage backups for prescriptions, invoices, reports, and barcode labels where retained.
- Restore drills, verification checklists, and RPO/RTO placeholders.
- This document does not implement backup tooling and does not certify that backups are currently configured.

## Recommended RPO/RTO placeholders

| Environment | Recommended RPO target | Recommended RTO target | Owner action before go-live |
| --- | --- | --- | --- |
| Staging | 24 hours or better for rehearsal data. | 4 hours or better. | Keep enough recent data to rehearse migrations and restore verification. |
| Production | 15 minutes or better for DB if business volume requires it; otherwise formally approve a larger target. | 1 hour for app/database service restoration target, plus provider reconciliation time. | Confirm backup product supports the approved target and measure real restore time. |

Record the approved RPO/RTO values in the release evidence. If the business accepts weaker targets, capture explicit approval and customer/store impact.

## DB backup frequency

- **Production full backup:** at least daily.
- **Production incremental/WAL/binlog/PITR backup:** target every 15 minutes or continuous point-in-time recovery where supported.
- **Pre-deployment backup:** mandatory immediately before production migrations or high-risk data changes.
- **Staging backup:** daily or before migration rehearsal if staging contains useful validation data.
- **Local backup:** optional and developer-owned; never rely on local backups for production recovery.

## DB backup retention

Recommended minimum retention:

| Backup type | Minimum retention | Notes |
| --- | --- | --- |
| PITR/incremental logs | 7-14 days | Must cover the expected detection window for data corruption. |
| Daily full backups | 30 days | Keep encrypted and access-controlled. |
| Weekly full backups | 12 weeks | Useful for delayed corruption or audit investigation. |
| Monthly archive | 12 months or statutory requirement, whichever is longer | Confirm legal/accounting retention requirements before deletion. |
| Pre-deployment snapshots | At least until the deployment is accepted and the next stable backup is verified | Keep migration evidence linked to backup ID. |

## Storage backup policy

| Storage class | Examples | Backup policy | Restore notes |
| --- | --- | --- | --- |
| Prescriptions | Uploaded Rx images/documents and prescription vault attachments. | Versioned, encrypted object storage with daily inventory and cross-region or separate-account replication where available. | Verify authorization metadata and audit log links after restore. |
| Invoices | Generated invoice PDFs/exports and immutable invoice artifacts where stored. | Versioning enabled; retain according to statutory/accounting requirements. | Verify invoice number continuity and file checksum where available. |
| Reports | Generated operational/accounting/statutory report exports. | Daily backup or reproducible regeneration policy documented per report. | If reports are regenerated, verify source records and report parameters. |
| Barcode labels | Queued/generated label files if retained; printer jobs if persisted. | Back up retained label artifacts if they are not reproducible from product/batch/barcode data. | If labels are reproducible, verify barcode data and reprint procedure instead of restoring stale printer jobs. |

## Restore drill steps

1. **Declare drill scope**
   - Choose restore point, database backup ID, storage backup/snapshot ID, and target staging environment.
2. **Freeze target staging environment**
   - Disable staging workers/cron and inbound webhooks before restore.
   - Confirm no production secrets are exposed in staging.
3. **Restore database**
   - Restore full backup and apply incremental/PITR logs to the selected timestamp.
   - Record start time, end time, tooling, backup IDs, and errors.
4. **Restore storage**
   - Restore prescriptions, invoices, reports, and label artifacts or validate regeneration policy.
   - Ensure object permissions are staging-safe and do not expose production data publicly.
5. **Reconfigure staging secrets**
   - Replace production providers with staging/sandbox credentials.
   - Disable sending providers unless the drill explicitly includes safe test sends.
6. **Run migrations if rehearsing post-restore upgrade**
   - Apply the release migration set to restored staging data.
   - Capture migration output and duration.
7. **Run verification checklist**
   - Verify data categories listed below.
8. **Measure RPO/RTO**
   - Compare achieved restore point and elapsed recovery time against approved targets.
9. **Document findings**
   - Record blockers, missing data, permission issues, slow steps, and owner/date for remediation.
10. **Clean up drill environment**
   - Destroy restored copies or keep them only under approved staging retention policy.

## Restore verification checklist

After a restore, verify at least the following categories:

- [ ] Users: staff/customer/admin users, roles, login/session behavior, locked/disabled users.
- [ ] Products: master records, duplicate review state, barcodes, GST/HSN/schedule metadata.
- [ ] Stock ledger: movement history, batch quantities, on-hand/reserved/quarantine values, no negative invariant violations.
- [ ] Reservations: active/reserved/expired states and expiry job behavior.
- [ ] Sales/orders: order headers, line items, statuses, delivery associations, customer links.
- [ ] Prescriptions: file availability, Rx review state, regulated release links, access audit continuity.
- [ ] Invoices: invoice artifacts, invoice numbering continuity, immutable snapshot/checksum where available.
- [ ] Payments/refunds: captured payments, webhook events, refund state, reconciliation reports.
- [ ] Audit logs: security, stock, prescription, payment/refund, invoice, delivery, and provider failure logs.

## Staging restore drill procedure

- Schedule at least once before production go-live and after any backup tooling change.
- Use the most recent production-like backup allowed by privacy/security policy.
- Disable outbound SMS/WhatsApp/email/payment capture before bringing the restored app online.
- Run the release validation commands and smoke checks on restored data.
- Confirm object storage URLs, signed URL generation, and proxy access are staging scoped.
- Verify worker/cron can start, process safe staging jobs, and stop cleanly.
- Publish a short drill report with backup IDs, restore duration, verification results, and remaining gaps.

## Crisis restore checklist

- [ ] Incident commander assigned.
- [ ] Restore owner assigned.
- [ ] Data-loss cutoff timestamp approved.
- [ ] Backup ID and storage snapshot selected.
- [ ] Production writes frozen or traffic drained where needed.
- [ ] Restore performed using rehearsed procedure only.
- [ ] Providers reconciled before reopening payment/notification flows.
- [ ] Store operators briefed on manual fallback and reconciliation steps.
