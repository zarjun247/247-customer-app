# Staff Session Security Status

> Status: additive foundation. No broad auth redesign or staff workflow blocking has been introduced in this PR.

## Staff timeout policy

- Foundation constant: 15-minute idle timeout and 12-hour absolute timeout.
- Enforcement in middleware/session runtime remains P1 because current auth/session flow was not redesigned.

## Terminal lock policy

- Terminal lock is required by policy for unattended staff terminals.
- UI/runtime enforcement remains P1 pending integration with active staff shell and terminal/device identity.

## Device/session audit status

- Added `staff_device_sessions` schema and helpers to record device/session metadata.
- Helpers support listing active staff sessions and targeted revocation.
- Current PR does not force every login/session through this table yet.

## Lost-device force logout status

- `revokeStaffSession` foundation added for targeted revocation.
- Full lost-device force logout requires auth middleware/session-store wiring and is P1.

## Shared account prevention

- Policy marks shared super-admin/staff accounts as prohibited.
- Durable detection/enforcement remains P1/P2 depending on account management UI and HR/ops process.

## Cashier PIN / sensitive action enforcement status

- Policy states cashier PIN or equivalent re-auth should be required for sensitive actions when the existing PIN/auth pattern is available.
- No payment/provider or cashier flow logic was modified in this PR.

## Role switch prevention

- Policy requires a single authenticated staff identity per terminal session and no in-session role elevation without re-auth.
- Enforcement remains P1 after current staff routing/auth flow review.

## Remaining risks

- P0: none introduced by additive schema/services/tests/docs.
- P1: wire staff session recording/revocation into auth/session runtime.
- P1: add terminal lock timeout enforcement in staff UI/session middleware.
- P1: add targeted acknowledgement gates for prescription/H1/payment handling actions.
- P2: reporting dashboard for active sessions, stale sessions, revoked devices, and acknowledgement coverage.
