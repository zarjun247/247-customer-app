# MONITORING_STATUS

Documentation-only monitoring status and runbook. This document lists required alerting, logging, and dashboard expectations; it does not claim that the observability stack is implemented.

## Monitoring posture
- Production monitoring must be active before go-live.
- Alerts must page an accountable owner for customer/store blocking failures.
- Warnings must be visible to operations with clear triage instructions.
- Every alert should include environment, store scope where applicable, release commit, correlation/request ID where available, and immediate runbook link.

## Required alerts

| Alert | Trigger expectation | Severity | First response |
| --- | --- | --- | --- |
| App down | Health endpoint or load balancer reports unavailable. | Critical | Confirm deploy status, rollback candidate, infra health, and incident owner. |
| DB unavailable | App cannot connect or query latency/error threshold breached. | Critical | Freeze risky writes, inspect DB provider, failover/restore plan, and app retry storm. |
| Migration failure | Migration command fails, times out, or leaves schema partially applied. | Critical | Stop deploy, keep workers disabled, capture DB state, follow migration rollback policy. |
| Worker/queue failure | Worker heartbeat missing, queue processing stops, or retry/dead-letter threshold breached. | High/Critical | Disable new job sources if needed, inspect poisoned jobs, verify idempotency before replay. |
| Payment webhook failure | Signature verification failures, webhook processing errors, or reconciliation mismatch spike. | Critical | Stop assuming payment state from app alone; reconcile with Razorpay dashboard/export. |
| Provider unconfigured | Required payment/SMS/WhatsApp/printer/storage/ERP config missing while feature enabled. | High | Disable dependent feature or add approved config; confirm fail-closed behavior. |
| Stock negative attempt | Any invariant guard rejects negative stock or illegal stock mutation. | Critical | Investigate sale/reservation/return/import path, preserve audit trail, reconcile affected SKU/batch. |
| Reservation expiry backlog | Expired reservations exceed threshold or expiry worker lags beyond SLA. | High | Run/repair expiry worker, check queue lag, inspect stuck reservations. |
| H1 missing data | Regulated H1 sale/release lacks required fields or register completeness drops below threshold. | Critical | Block/repair regulated release process; review statutory report impact. |
| SLA breach | Delivery/customer SLA exceeds configured threshold. | High | Triage delivery queue, rider/store capacity, notification status, and customer communication. |
| Failed notification burst | SMS/WhatsApp/email/push failures exceed threshold. | High | Check provider status/credentials/rate limits; pause retry storm; reconcile customer impact. |
| Storage access denied spike | Object storage 403/permission errors spike for prescriptions, invoices, reports, or labels. | Critical | Check IAM/bucket policy, signed URL/proxy config, and restore access for critical documents. |

## Logging requirements

Structured logs should be queryable by environment, store ID, user/staff ID where applicable, request/correlation ID, entity ID, and result. Sensitive prescription, customer, payment, and auth data must be redacted.

| Domain | Events to log | Required fields |
| --- | --- | --- |
| Stock mutation | Every stock movement, rejected negative attempt, adjustment, transfer, opening stock import, audit correction. | storeId, productId, batchId, qtyBefore/after, movement type, actor, reason, source document. |
| Reservation lifecycle | Create, confirm, expire, cancel, release, backlog processing. | reservationId, orderId/cartId, storeId, productId/batchId, qty, expiry timestamp, worker ID. |
| Regulated release | Rx required/reviewed/released, H1/schedule-controlled release checks. | prescriptionId, sale/order ID, product/batch, reviewer, required statutory fields presence, decision. |
| Payment/refund | Payment intent/order, capture, webhook, verification failure, refund request/approval/settlement. | provider, provider IDs, sale/order ID, amount, currency, status, signature result, reconciliation status. |
| Invoice generation | Invoice number allocation, invoice artifact creation, regeneration/reprint, failure. | invoice number/sequence, sale/order ID, storeId, checksum/artifact ID, actor, error code. |
| Prescription vault access | Upload, view/download, proxy access, denied access, retention/delete if applicable. | prescriptionId, actor, patient/customer link, access reason, IP/request ID, decision. |
| Delivery status/SLA | Assignment, pickup, in-transit, delivered, failed, cancellation, SLA breach. | deliveryId, orderId, storeId, rider/staff, timestamps, SLA bucket, notification status. |
| Provider failures | Payment, SMS, WhatsApp, storage, printer, ERP/Tally, OAuth/app ID failures. | provider, operation, config state, error class/code, retry count, fail-open/fail-closed decision. |

## Dashboard wishlist

| Dashboard panel | Purpose | Suggested dimensions |
| --- | --- | --- |
| Daily sales | Track store activity and payment mix. | store, payment mode, order source, refund-adjusted net sales. |
| Stock mismatch | Detect inventory drift and negative/near-negative risk. | store, SKU, batch, ledger vs aggregate, ageing since mismatch. |
| H1 completeness | Monitor statutory completeness for regulated sales. | store, reviewer, missing field type, sale date. |
| Pending Rx | Operational queue for prescriptions awaiting review. | store, age bucket, SLA risk, reviewer assignment. |
| Refunds pending | Track unresolved customer/payment liabilities. | provider, status, age bucket, amount, store. |
| Supplier outstanding | Monitor purchase liabilities and ageing. | supplier, store, invoice age, allocated/unallocated payments. |
| Queue lag | Verify workers are healthy. | queue/job type, oldest job age, retry count, dead-letter count. |
| SLA breaches | Track customer delivery/service misses. | store, delivery mode, rider/staff, breach reason, notification status. |

## Alert triage minimums

- Confirm whether the issue is release-related by checking the latest deployment commit and deploy time.
- Confirm whether the issue is store-scoped or system-wide.
- Preserve logs and audit records before replaying jobs or manually editing data.
- Prefer provider disablement and fail-closed behavior over unsafe fake-success paths.
- Open a post-incident action item for every critical alert, even if self-resolved.
