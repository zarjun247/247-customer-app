# Stock Truth Certification Status — Wave 1 / Prompt 14

## Scope and posture

This certification is intentionally narrow and additive. It documents the current stock-truth perimeter, adds reusable static and behavioral guard helpers, and does **not** claim live-store proof without `TEST_DATABASE_URL` backed execution.

## Approved mutation gateways

All physical inventory-affecting changes must remain behind these approved stock/reservation gateways:

| Source | Approved gateway |
|---|---|
| Purchase commit | `increaseStockForPurchaseCommit` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Sale confirmation | `decreaseStockForSaleConfirmation` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Resaleable sale return | `reverseStockForSaleReturn` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Stock adjustment approval | `adjustStock` or `applyStockAuditCorrection` in `server/services/stockInvariant.ts` |
| Purchase return commit | `decreaseStockForPurchaseReturn` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Quarantine on-hand decrement | `quarantineBatch` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Disposal on-hand decrement | `disposeBatch` / `applyStockMovement` in `server/services/stockInvariant.ts` |
| Transfer receive | `transferStock` in `server/services/stockInvariant.ts` |
| Release quarantine | `releaseQuarantine` in `server/services/stockInvariant.ts` |
| Opening stock / batch create | `createBatchWithOpeningStock` in `server/services/stockInvariant.ts` |
| Stock audit correction movement | `applyStockAuditCorrection` in `server/services/stockInvariant.ts` |
| Reservation create/release/consume | Durable reservation lifecycle in `server/services/reservationService.ts` |

Everything outside these gateways is expected to be read-only for physical stock truth unless explicitly documented as metadata-only or test/seed/migration setup.

## Static scanner rules

`server/services/stockTruthCertification.ts` defines a static no-rogue-mutation scanner. It flags stock-affecting writes involving:

- `qtyOnHand`, `stockQty`, `availableQty`, `qtyReserved`, `qtyQuarantined`
- `stockMovements` insert/update
- `stockReservations` insert/update/delete
- `batchLedger` insert/update
- `batches` update
- `storeSkus` update
- direct inventory adjustment/quarantine/disposal/transfer update patterns

The default allowlist is limited to:

- `server/services/stockInvariant.ts`
- `server/services/reservationService.ts`
- `server/services/stockTruthCertification.ts`
- controlled test utilities/tests
- additive migration/seed setup paths

## Canonical availability formula

The certification helper documents and implements the canonical formula:

```text
available = onHand - activeReserved - quarantined/unavailable - blocked/expired where applicable
```

The helper returns both raw and clamped availability so reports can surface negative availability while app-facing views can avoid showing negative quantities.

## FEFO rules

`selectFefoBatch`, `assertFefoPick`, and `buildFefoDeviationReport` enforce these rules:

- Sale/pick selection prefers the earliest valid expiry batch.
- Expired batches are not selected.
- Quarantined, recalled, damaged, or otherwise blocked batches are not selected.
- Near-expiry can be surfaced as warning metadata and does not block unless product/store policy separately requires a block.
- Manual FEFO deviation requires an override reason/audit trail; otherwise the helper reports audit as required.

## Barcode / OCR / sale / purchase safety status

- Barcode lookup remains lookup-only for sale, return, audit, and purchase-scanner readiness flows. Static tests assert scanner procedures do not write `stockMovements`, `batchLedger`, or `storeSkus`.
- OCR ingestion remains an exception-gated draft workflow and must hand off to the purchase commit path instead of mutating stock directly.
- Purchase commit is expected to call `increaseStockForPurchaseCommit` and then resync read models through `syncStoreSkuAggregate`.
- Sale confirmation is expected to call `decreaseStockForSaleConfirmation` and consume durable reservations through reservation lifecycle helpers.
- Reservation lifecycle changes reservation rows only; physical on-hand stock remains controlled by stock invariant movement gateways.

## Reconciliation report shape

`buildStockTruthReconciliationReport` emits:

- `rows`
- `totals`
- `csvData`

Each row includes:

- `productId`
- `storeId`
- `batchId`
- `batchLedgerId`
- `onHand`
- `activeReserved`
- `quarantined`
- `expired`
- `calculatedAvailable`
- `appVisibleAvailable`
- `ledgerMovementTotal`
- `varianceQty`
- `anomalyType`

Supported anomaly types:

- `negative_on_hand`
- `negative_available`
- `reserved_exceeds_on_hand`
- `batch_ledger_mismatch`
- `store_sku_mismatch`
- `expired_marked_available`
- `quarantined_marked_available`
- `missing_batch_ref`
- `direct_mutation_suspected`

## Tests added

`server/stock-truth-certification.guard.test.ts` adds guard coverage for:

1. rogue direct stock mutation detection
2. approved `stockInvariant` allowlisting
3. barcode lookup-only safety
4. OCR draft no-direct-stock-mutation safety
5. purchase commit gateway routing
6. sale confirmation gateway routing
7. canonical availability subtracting active reservations
8. canonical availability subtracting quarantined/unavailable/expired stock
9. expired/quarantined batches excluded from FEFO
10. earliest valid expiry FEFO selection
11. negative stock reconciliation anomaly
12. reserved-greater-than-on-hand reconciliation anomaly
13. report `rows` / `totals` / `csvData`
14. no new `Number(uuid)` or `entityId: 0` stock-audit reference in this certification patch

## DB-backed proof status

`TEST_DATABASE_URL` was not present in the local environment during this certification run, so DB-backed reconciliation/negative-stock/reservation availability proof remains pending. The added helpers are pure and deterministic; production certification still requires a live or fixture-backed database reconciliation run before go-live signoff.

## Migration status

No migration was added. No old migration was edited.

## Remaining risks before production

- Run DB-backed stock truth tests with realistic batch, reservation, quarantine, sale, and purchase fixtures.
- Review any legacy direct stock update surfaces before enabling them for production stores.
- Add CI enforcement to fail if new non-allowlisted stock mutations appear outside approved gateways.
- Compare reconciliation output against live store exports and physical cycle-count samples.
- Keep sale confirmation, OCR commit, and barcode lookup behaviors under regression tests whenever routers are refactored.

## Certification statement

This PR certifies stock mutation routing by static and behavioral tests; physical stock mutation must remain behind approved stock/reservation gateways.
