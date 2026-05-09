# No Stubs / No Placeholders Production Doctrine

This doctrine is a launch gate for the Pharmacy OS. It applies to every production runtime path: customer, staff, admin, worker, provider, payment, inventory, compliance, privacy, reporting, and operational tooling.

## Production launch requirements

- No stubbed runtime path.
- No fake success.
- No `provider_unconfigured` success.
- No silent no-op mutation.
- No demo data in production.
- No placeholder UI metrics.
- No “coming soon” buttons in production staff/customer critical paths.
- No unproven docs claiming complete, green, launched, production-ready, or 10/10.
- Explicit fail-closed behavior is allowed only if surfaced to the operator and logged/audited where material.
- Demo/test paths must be isolated, impossible to trigger in production, and visibly marked.

## Provider operations

A provider operation may be marked successful only when one of these is true:

1. A real provider accepted or completed the operation and the response was verified.
2. The operation is explicitly queued/pending and not labeled as sent/synced/printed/paid/refunded/verified.
3. A manual operation is explicitly labeled manual/pending and cannot be confused with provider success.

Unconfigured/disabled/demo providers must return or persist one of these shapes instead:

- `provider_unconfigured`
- `disabled`
- `demo_skipped` / `skipped_demo` outside production only
- `preview_only`
- `manual_required`
- `pending_provider`
- `failed`
- `dead_letter`

## Payment and refund operations

- Payment verification requires cryptographic proof.
- Payment webhook acceptance requires signature verification and idempotent lifecycle handling.
- Refund success requires provider refund proof or confirmed manual settlement proof.
- `ok:true` must not be used where a caller could interpret provider-unconfigured pending work as paid/refunded/synced.

## Stock and compliance operations

- No stock mutation without stock movement/reservation truth.
- No placeholder quantities in production stock ledger paths.
- No `entityId: 0` or fake audit IDs in safety-critical stock/compliance audit paths.
- No prescription, H/H1, narcotic, or regulated release shortcut without pharmacist identity and explicit eligibility gates.
- AI/OCR may suggest or extract only; it must not approve, dispense, substitute, or release.

## UI and admin operations

- Production dashboards must not show fake metrics, sample counts, or green placeholder cards.
- Unwired cards must be hidden or shown as warning/blocked with a tracked owner and fix branch.
- Buttons that imply completion must either perform the real operation or be disabled/hidden in production.
- Sample/demo import data must be dev/test-only or visibly marked and blocked from production mutation paths.

## Documentation and governance

- A doc may claim green/complete/production-ready only when it links to current validation evidence.
- Known proof gaps must stay visible until fixed.
- Governance scanners must not be weakened to hide real findings.
- False positives may be classified only with path-aware, narrow logic and a test proving real risky patterns are still caught.
