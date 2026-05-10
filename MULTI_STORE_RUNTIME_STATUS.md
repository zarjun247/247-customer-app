# MULTI_STORE_RUNTIME_STATUS

Updated: 2026-05-10.

## Scope

This document records the multi-store runtime visibility and isolation checks added for staff/admin operational use. It does not expose customer PHI/PII and does not assert production deployment proof.

## Added tRPC surfaces

| Surface | Access | Purpose |
| --- | --- | --- |
| `multiStoreRuntime.overview` | staff/admin only | Aggregate store counts, active store SKU rows, negative stock rows, and isolation anomaly counts. |
| `multiStoreRuntime.isolationChecks` | staff/admin only | Same aggregate isolation checks plus policy reminder that only operational metadata is returned. |
| `multiStoreRuntime.store` | staff/admin only | Per-store operational metadata and counts for one store ID. |

## Store isolation checks

The runtime service checks for:

- Onboarded users without an assigned store.
- Orders without a store ID.
- Negative store SKU stock rows.

These are aggregate operational anomalies. They intentionally do not return customer names, phones, addresses, prescriptions, order contents, or other PHI/PII.

## Remaining blockers

- Add dashboards backed by these tRPC surfaces only after real operators confirm required fields.
- Add alert thresholds for negative stock rows, orphaned orders, and missing assigned stores.
- Run the checks against staging/production-like data and document actual counts before launch.
