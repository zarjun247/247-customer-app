# Secret Hygiene Audit

## Audit identity

| Field | Value |
| --- | --- |
| Audit date | 2026-05-09 |
| Branch | `chore/supply-chain-dependency-secret-audit` |
| Main SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Runtime code changed | No |
| Secrets printed in this report | No; values are redacted or described by category only. |

## Search patterns used

Case-insensitive broad search:

- `secret`
- `api_key`
- `apikey`
- `token`
- `bearer`
- `password`
- `RAZORPAY`
- `AWS_`
- `DATABASE_URL`
- `JWT`
- `WHATSAPP`
- `TWILIO`
- `OTP`
- `S3`
- `ACCESS_KEY`

High-risk token/URL search:

- Stripe/Razorpay-like live/test key prefixes.
- AWS access key prefixes.
- private key block headers.
- GitHub token prefixes.
- Google API key prefix.
- credential-bearing database URLs.

Commands were run with `node_modules`, `.git`, `dist`, and `coverage` excluded. Real-looking values were not copied into this document.

## Files and categories inspected

- Root docs and production-readiness Markdown files.
- `.github/workflows/ci.yml`.
- `package.json`, `pnpm-lock.yaml`, `patches/*`, and `scripts/*`.
- Server configuration/env validation paths and guard tests.
- Client and server source by targeted secret-pattern search.
- Drizzle metadata and migration files by targeted secret-pattern search only; no schema/migration edits were made.
- Docker/test deployment file: `docker-compose.test.yml`.
- Env example presence: no root `.env.example` or `.env.production.example` was found.

## Findings table

| Area | Example category, redacted | Classification | Finding | Required fix |
| --- | --- | --- | --- | --- |
| CI MySQL service | `TEST_DATABASE_URL=mysql://[REDACTED]`, test DB username/password values | Test fixture | Test-only database credentials are present in CI for local MySQL service. This is acceptable if never reused outside CI and not used for production. | Keep scoped to disposable CI database; do not reuse in shared environments. |
| MySQL docs/status files | `mysql://[REDACTED]` examples in status/runbook docs | Placeholder/example | Documentation includes credential-bearing URL examples; values appear illustrative/test-oriented, but still normalize redaction in future docs. | Prefer `mysql://USER:PASSWORD@HOST:PORT/DB` placeholders in docs. |
| Backup/restore docs | `BACKUP_DATABASE_URL='mysql://[REDACTED]'`, `RESTORE_DATABASE_URL='mysql://[REDACTED]'` | Placeholder/example with documentation hygiene risk | Backup/restore command examples use credential-bearing URL shape. No real secret is printed here. | Convert examples to placeholder variables in a docs-only cleanup PR. |
| Deployment proof guard tests | `DATABASE_URL=mysql://[REDACTED]`, `RAZORPAY_KEY_ID=rzp_live_[REDACTED]` | Test fixture / placeholder | Tests intentionally use production-looking placeholder tokens to prove env validation behavior. | Keep values synthetic; ensure tests assert redaction and never include real provider credentials. |
| Provider contract guard tests | `RAZORPAY_KEY_ID=rzp_live_[REDACTED]` | Test fixture / placeholder | Production-looking Razorpay key IDs appear to be synthetic test fixtures. | Keep synthetic and never add key secrets. |
| Client cart provider path | Test key sentinel resembling `rzp_test_[REDACTED]` | Placeholder/client sentinel | Client code references a known test-key sentinel to avoid treating default test values as real provider configuration. | No runtime change in this branch; confirm fail-closed behavior remains covered. |
| Server/client env references | `JWT`, `WHATSAPP`, `OTP`, `S3`, `AWS_`, `DATABASE_URL` variable names | Env var reference | Broad hits are primarily variable names, validation logic, or documentation references. | Continue env-only secret injection. Do not commit concrete values. |
| Lockfile | package names containing searched tokens | False positive | Lockfile hits are dependency names/metadata, not secrets. | No action. |
| Drizzle metadata/schema | columns such as token/password/secret fields | Schema metadata / false positive for leak | Hits describe database columns and metadata, not committed secret values. | No action; keep real values in database/secret manager only. |
| Google Fonts URL | public `https://fonts.googleapis.com/...` URL | False positive/private URL check | Public URL found by URL search; not a secret. | No action. |
| Dedicated secret scanner | gitleaks/trufflehog not found in PATH, no dedicated CI secret scan observed | P1 process gap | This audit used regex/static review, not a full entropy/history scanner. | Add secret scanning CI and pre-merge process. |

## Required fixes and follow-ups

| Priority | Required fix | Owner expectation |
| --- | --- | --- |
| P1 | Add a dedicated secret scanning workflow or governance job using an approved scanner, with redacted output and fail-on-real-secret policy. | Security/platform owner. |
| P1 | Add `.env.example` and `.env.production.example` or equivalent production env docs that list required variables without values and without fake production defaults. | Platform/release owner. |
| P1 | Normalize documentation examples so credential-bearing URL shapes use explicit placeholders instead of sample passwords. | Docs/platform owner. |
| P1 | Confirm test fixtures using production-looking provider key prefixes are synthetic and covered by redaction/fail-closed assertions. | Payments/provider owner. |
| P2 | Add a production secret rotation SOP to deployment docs and incident response checklists. | Operations owner. |

## Production secret rotation SOP recommendation

Before production launch, document and rehearse a rotation process covering:

1. Inventory every production secret: database, JWT/session signing, Razorpay, WhatsApp/OTP/SMS, AWS/S3, email, backup/restore, analytics, and OAuth/provider secrets.
2. Store each secret only in the approved secret manager or deployment platform secret store.
3. Rotate provider keys with dual-key overlap where supported.
4. Deploy new secrets, verify health checks, then revoke old secrets.
5. Run a post-rotation smoke test for login/session, payments/webhooks, WhatsApp/OTP, S3/prescription vault, database, backup/restore, and provider integrations.
6. Record rotation date, owner, scope, and verification evidence without printing values.
7. If a committed real secret is ever discovered, revoke it immediately, rotate dependent credentials, purge logs/artifacts where possible, and treat repository history as compromised.

## No-secrets-printed statement

This report intentionally contains no real secret values. All credential-like examples are redacted or reduced to variable/category names. Based on targeted working-tree search, no confirmed real production secret was identified, but this is not a substitute for repository-history secret scanning.
