Date: 2026-05-05
Branch: feat/mega-01-auth-checkout-customer-safety

# BUG_HYGIENE_AUDIT_STATUS

Date: 2026-05-04
Branch: feat/p0-backend-truth-security-pass

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

## Deferred
- Multi-domain deep migrations (reservation lifecycle tables, full audit entityRef rollout, broad accounting invariants) deferred to focused follow-up PRs to avoid unsafe broad blast radius.
