# Provider Fail-Closed Status

## Scope

This branch hardens non-payment external connectors so production cannot report successful delivery when a connector is unconfigured. No database migration was added.

## Fixed connectors

- **SMS / MSG91** (`server/connectors.ts`)
  - Added explicit detailed result status: `sent`, `failed`, `provider_unconfigured`, or `skipped_demo`.
  - The legacy boolean `sendSms()` wrapper now returns `true` only for a real provider `sent` result.
- **WhatsApp Cloud API** (`server/connectors.ts`)
  - Added explicit detailed result status: `sent`, `failed`, `provider_unconfigured`, or `skipped_demo`.
  - Missing `WHATSAPP_PHONE_NUMBER_ID` or `WHATSAPP_API_TOKEN` is surfaced in the result reason.
  - The legacy boolean `sendWhatsApp()` wrapper now returns `true` only for a real provider `sent` result.
- **Label printer / ZPL** (`server/connectors.ts`)
  - Added explicit detailed result status: `printed`, `failed`, `provider_unconfigured`, `skipped_demo`, `preview_only`, or `not_printed`.
  - Missing `PRINTER_HOST` no longer claims a printed label in production.
  - The legacy boolean wrappers now return `true` only when ZPL was delivered to a configured printer socket.
- **ERP / Tally / SAP sync** (`server/connectors.ts`)
  - Missing `ERP_BASE_URL` or `ERP_API_KEY` no longer creates fake ERP references or reports `synced` in production.
  - Unconfigured results return `erpRef: null` and `status: provider_unconfigured` in production.

## Shared behavior

- Added scoped connector helpers in `server/connectors.ts`:
  - `isExplicitDemoMode()`
  - `isProductionMode()`
  - `providerUnavailableResult()`
- Production mode is detected with `NODE_ENV=production`.
- Explicit local/demo mode is enabled by either:
  - `PROVIDER_DEMO_MODE=1|true|yes|on|demo|local`
  - `DEMO_MODE=1|true|yes|on|demo|local`
  - `NODE_ENV=development` or `NODE_ENV=test`

## Production behavior

- Missing SMS credentials return `provider_unconfigured` and `ok: false`.
- Missing WhatsApp credentials return `provider_unconfigured` and `ok: false`.
- Missing printer host returns `provider_unconfigured`, `ok: false`, and generated ZPL for explicit handling/preview if a caller chooses to display it.
- Missing ERP credentials return `provider_unconfigured`, `ok: false`, and `erpRef: null`.
- Legacy boolean APIs remain compatible, but they fail closed: `true` means real provider success only.

## Demo/local behavior

- Unconfigured providers return `skipped_demo`, `ok: false`, and `demo: true`.
- Demo/local logging is visibly marked with `DEMO SKIPPED` instead of `STUB`.
- Demo/local mode does not report `sent`, `printed`, or `synced` unless a real provider is configured and called successfully.

## Remaining risks

- The connectors still use minimal provider response validation; a future hardening pass could normalize provider-specific response bodies more deeply.
- Printer socket delivery confirms TCP write completion, not physical label pickup from printer hardware.
- ERP endpoints remain generic REST paths (`/grn`, `/sales-orders`) pending concrete production ERP adapter details.

## Validation results

- `pnpm test -- server/connectors.failclosed.test.ts --runInBand` passed while adding focused fail-closed coverage.
- Full required validation was run before handoff and should be reviewed in the PR/final validation section.

## Files changed

- `server/connectors.ts`
- `server/connectors.failclosed.test.ts`
- `PROVIDER_FAILCLOSED_STATUS.md`
