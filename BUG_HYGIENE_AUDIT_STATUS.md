Date: 2026-05-05
Branch: feat/mega-01-auth-checkout-customer-safety

# BUG_HYGIENE_AUDIT_STATUS

Date: 2026-05-07
Branch: feat/mega-01-auth-checkout-customer-safety

## Fixed (this pass)
- Purchase commit stock mutation path hardened: removed direct qty increments on `batchLedger.qtyOnHand`, `batches.quantity`, and `storeSkus.stockQty` before canonical movement; canonical stock movement now drives post-movement sync values.
- H1 register path hardened against unsafe `Number(line.id)`/UUID-style coercion, with string-safe sale/line refs recorded via `prescriptionRef` and audit `entityRef`.
- Storage proxy bearer-spoof closed: removed bearer-presence-as-admin behavior and enforced session auth via `sdk.authenticateRequest` before key policy.
- Delivery photo POD now executes regulated-release check gate before delivery completion.
- Payment webhook signature verification hardened for malformed signature lengths; payment verify now fails closed when Razorpay secret missing outside explicit local/demo mode.

## Remaining P0/P1
- Full schema-level H1 reference expansion (`saleRef`, `saleLineRef` dedicated columns) still pending migration planning.
- Purchase return/read-model consistency should be expanded with DB integration tests (current pass adds static regression guards).
- Storage proxy ownership matrix needs deeper runtime integration tests across user/store role permutations.
- Checkout still needs DB-backed integration coverage for partial order/audit/refill failures and reconciliation of created orders when downstream post-lock work fails.
- Prescription upload magic-byte validation is practical for JPEG/PNG/PDF headers but not a full malware/content scanner.

## Deferred
- Multi-domain deep migrations (reservation lifecycle tables, full audit entityRef rollout, broad accounting invariants) deferred to focused follow-up PRs to avoid unsafe broad blast radius.

## Fixed (customer/auth/onboarding/checkout safety pass)
- OTP phone sessions now sign with `ENV.appId`, production OTP responses keep `devCode` undefined, and authenticateRequest has a regression for `phone:` sessions.
- Cart upsert and checkout validate SKU/store/activity/product/availability server-side before trusting cart mutations or applying soft locks.
- Checkout lock cleanup releases SKU and cart soft-lock state if any post-lock step fails.
- Onboarding treats frontend `assignedStoreId` as a hint only and persists the server-resolved store from building routing or address serviceability.
- Prescription upload enforces max size, MIME allowlist, server-generated key extension, and magic-byte checks for JPEG/PNG/PDF.
- Dosage APIs are covered by guessed schedule ID ownership rejection tests.

## Mega 02 stock reservation truth pass (2026-05-07)

### Fixed items
- Purchase commit no longer overwrites `storeSkus.stockQty` with a single batch movement quantity; the aggregate sync helper recalculates product-store stock from active canonical batch ledger rows.
- Purchase return now prevents split truth by using the same aggregate sync helper after an invariant ledger movement and by blocking returns beyond canonical batch availability.
- Durable reservation lifecycle implemented for active/released/expired/consumed/cancelled states and wired into app checkout after PR #49 soft-lock safety.
- Availability reads for catalog/cart, POS batch selection, barcode lookup, and current-stock report now account for active reservations plus quarantine/expiry deductions.
- Removed the production "Deferred to stock-truth hardening" reservation stub.

### Remaining risks
- Real concurrent-reservation DB integration coverage remains a P1 gap even though canonical availability subtracts active persisted reservations.
- Broader legacy dashboard/report consumers should continue migrating from `storeSkus.stockQty` presentation reads to canonical availability objects.
- Payment/Rx/cancel release helpers now persist release statuses, but all external lifecycle callers should be audited in the next order-state-machine pass.

### Deferred with reason
- No H1/payment/accounting/UI/barcode UX redesign was attempted; this pass only touched barcode availability reads as required.
- No large stock schema normalization was attempted beyond the reservation-ledger migration to keep blast radius focused.

### New score estimate
- Bug hygiene / stock truth area: 8.0 / 10.
