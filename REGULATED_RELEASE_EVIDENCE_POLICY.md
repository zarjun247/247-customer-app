# Regulated Release Evidence Policy

## Gate matrix

| Item category | Store license | Pharmacist on duty | Pharmacist registration | Prescription | Patient evidence | Doctor evidence | Batch/quantity evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OTC | Not required by this release gate | Not required | Not required | Not required | Normal sale context | Not required | Stock invariant applies |
| Schedule H | Required | Required | Required | Required unless explicitly classified non-Rx by product master | Required | Required when product/prescription policy requires | Required where batch is available |
| Schedule H1 | Required | Required | Required | Required | Required | Required | Required where batch is available; H1 register remains mandatory |
| Schedule X | Required | Required | Required | Required | Required | Required | Required where batch is available |
| Rx-required product | Required | Required | Required | Required | Required | Required where legally required | Required where batch is available |

## Required release evidence

A regulated release cannot proceed unless the evidence pack proves:

1. Active store drug license for the dispensing store.
2. Active pharmacist duty session at the store.
3. Active pharmacist registration for the approving pharmacist.
4. Prescription reference for Rx/H/H1/X-required medicines.
5. Patient/customer reference.
6. Doctor name or registration reference where legally required, always for H1/X/Rx release in this foundation.
7. Drug name, schedule category, quantity, and batch reference where the sale has batch evidence.
8. No unresolved cold-chain breach for the affected batch.
9. No open recall for the affected batch.

## AI/OCR/provider limitations

- AI, OCR, support, WhatsApp, payment provider callbacks, and delivery providers cannot approve regulated release.
- OCR can assist extraction only; it is not pharmacist approval.
- Provider/payment success and reservation consumption are commercial/stock states, not legal release approval.

## Forbidden bypasses

- No missing/expired/suspended license dispensing.
- No generic admin-as-pharmacist substitution.
- No `entityId: 0` or `Number(uuid)` audit references for new legal ops code.
- No H1/Rx release without evidence pack.
- No recalled or unresolved cold-chain breach batch release.
- No fake notification-sent state without provider confirmation.
