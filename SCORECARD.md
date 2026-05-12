# SCORECARD.md — Humans Must Do

These 10 items cannot be completed by automated agents. Each is a hard blocker for production launch.

| # | Item | Why agents can't do it |
|---|------|------------------------|
| 1 | SMTP / SES credentials in production `.env` | Requires real email account provisioning and DNS verification |
| 2 | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (production) | Razorpay KYC and merchant onboarding — human identity required |
| 3 | SSL certificate for production domain | Domain ownership verification |
| 4 | `BREACH_NOTIFY_RECIPIENT_EMAIL` set to real DPO address | Organizational decision — who receives breach alerts |
| 5 | Pharmacist UAT sign-off on dispensing flow | Regulatory requirement; licensed pharmacist must validate |
| 6 | DPDP Data Protection Officer (DPO) registration | Legal filing — cannot be automated |
| 7 | Production MySQL credentials in Vault / Secrets Manager | Infrastructure provisioning with real credentials |
| 8 | `APP_PHASE` promoted to `scaled` after multi-store QA | Business decision requiring store-level validation |
| 9 | WhatsApp Business Account approval (Meta) | Meta requires manual business verification |
| 10 | Security penetration test by qualified assessor | Requires human expert; automated scans are insufficient |

## Score floor

Current automated score: ~9.65/10. The remaining ~0.35 is locked behind these 10 items. No amount of code changes can substitute for human action on the above.
