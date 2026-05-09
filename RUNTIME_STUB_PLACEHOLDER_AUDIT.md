# Runtime Stub / Placeholder / Fake-Success Audit

**Branch:** `chore/runtime-stub-placeholder-fake-success-audit`  
**Latest main SHA inspected:** `f7d049825eb17922e9fa0c47326620e26a396186`  
**GitHub fetch status:** attempted `git fetch origin main`, but this container has no GitHub credentials for `https://github.com/zarjun247/247-customer-app.git`; audit is against the local main-equivalent HEAD above.  
**Scope:** docs/audit only. No runtime business logic, client runtime files, server routers/services, schema, SQL migrations, `package.json`, or lockfile were modified.

## Search patterns used

`TODO`, `FIXME`, `placeholder`, `stub`, `mock`, `fake`, `demo`, `not implemented`, `NOT_IMPLEMENTED`, `return { ok: true }`, `success: true`, `synced: true`, `verified: true`, `sent: true`, `printed: true`, `provider_unconfigured`, `provider disabled`, `fallback`, `noop`, `no-op`, `hardcoded`, `sample`, `dummy`, `test only`, `local only`, `development only`, `skip`, `bypass`, `allow all`, `admin: true`, `role: "admin"`, `entityId: 0`, `Number(`, `any as`, `as unknown as`.

Primary commands:

```bash
rg -n -i "TODO|FIXME|placeholder|stub|mock|fake|demo|not implemented|NOT_IMPLEMENTED|return \\{ ok: true \\}|success:\\s*true|synced:\\s*true|verified:\\s*true|sent:\\s*true|printed:\\s*true|provider_unconfigured|provider disabled|fallback|noop|no-op|hardcoded|sample|dummy|test only|local only|development only|skip|bypass|allow all|admin:\\s*true|role:\\s*['\\\"]admin['\\\"]|entityId:\\s*0|Number\\(|any as|as unknown as" . --glob '!node_modules/**' --glob '!dist/**' --glob '!coverage/**' --glob '!pnpm-lock.yaml'
rg -n -i "placeholder|mock|fake|demo|coming soon|not wired|TODO|sample|dummy|hardcoded|static" client/src/pages client/src/components client/src/routes --glob '!**/*.test.ts*'
node scripts/check-runtime-placeholders.mjs
node scripts/ci-governance-guards.mjs all
```

## Files inspected deeply

- Provider/connectors: `server/connectors.ts`, `server/config/providerContracts.ts`, `server/services/providerContract.ts`, `server/services/notificationService.ts`, `server/services/whatsappBridge.ts`.
- Payment/refund/webhook: `server/services/paymentGateway.ts`, `server/payment.ts`, `server/paymentWebhookRoutes.ts`, `server/services/paymentWebhookLifecycle.ts`, `server/services/refundService.ts`, `server/routers/paymentRouter.ts`.
- Stock/reservation: `server/services/reservationService.ts`, `server/services/stockInvariant.ts`, `server/services/stockTruthCertification.ts`, `server/routers/inventoryRouter.ts`, `server/routers/purchaseRouter.ts`, `server/routers/salesRouter.ts`, `scripts/ci-governance-guards.mjs`, `scripts/check-runtime-placeholders.mjs`.
- Compliance/Rx/H1: `server/services/complianceGate.ts`, `server/pharmacy.ts`, `server/routers/pharmacyRouter.ts`, `server/routers/prescriptionGovRouter.ts`, `server/routers/deliveryRouter.ts`.
- Worker/queue: `server/services/jobQueue.ts`, `server/services/workerRuntime.ts`, `server/worker.ts`.
- Storage/security/privacy: `server/_core/storageAccess.ts`, `server/_core/storageProxy.ts`, `server/services/privacyConsent.ts`, `server/services/prescriptionVault.ts`, `server/middleware/httpSecurity.ts`.
- Frontend/admin: `client/src/pages/admin/AdminCommandCenter.tsx`, `client/src/pages/AdminAccounting.tsx`, `client/src/pages/ocr/AdminOcr.tsx`, `client/src/pages/MedivisionSync.tsx`, `client/src/components/Map.tsx`, `client/src/routes/roleGuards.ts`.
- Docs/status: top-level `*_STATUS.md`, `CURRENT_MAIN_TRUTH*.md`, `PRODUCTION_READINESS_STATUS.md`, `LATEST_MAIN_VALIDATION_STATUS.md`, and governance docs.

## Summary by category

| Category | Count | Summary |
|---|---:|---|
| Production blocker | 2 | OCR runtime can process mock invoice data and UI can persist placeholder storage URL when upload fails. |
| Production risk | 8 | Worker/OCR legacy gaps, admin placeholders, accounting placeholder UI, map demo id, audit placeholder IDs, refund pending `ok:true`, quick verify guard clarity, provider fake-success scanner coverage gap. |
| Acceptable fail-closed state | 9 | SMS, WhatsApp, Razorpay payment creation/verification/webhook, storage proxy, maps proxy, Tally CSV export-not-synced, printer preview/fail-closed contract, worker missing handler dead-letter. |
| Test fixture | 7 | `vi.mock`, demo statuses, fake success guard cases, local in-memory worker queue reset helpers, component showcase demo, guard tests. |
| Documentation/TODO only | 6 | Status docs and worker ops-alert TODOs describe missing work without marking production success. |
| False positive | 5 | Input placeholders, type-level status literals, scanner self-pattern, stock scanner pattern literals, healthcheck endpoint success for Vite probe. |

## Full findings table

| ID | File / line or pattern | Finding | Classification | Production impact | Recommended action | Owner/domain |
|---|---|---|---|---|---|---|
| F-001 | `server/routers/ocrIngestionRouter.ts` `mockOcrParse`, `processJob` fallback | Runtime OCR processing falls back to hardcoded mock distributor/invoice lines unless `useLlmOcr` image path is selected. It then writes extracted headers/lines and returns `success: true`. | Production blocker | Fake inventory purchase data can enter review/inwarding flow and look like OCR completion. | Replace fallback with fail-closed `provider_unconfigured` / `ocr_provider_required`; allow CSV only as explicit structured import and mark source distinctly. | OCR / purchase ingestion |
| F-002 | `client/src/pages/ocr/AdminOcr.tsx` placeholder storage fallback | Upload failure path initializes `https://placeholder.storage/...` and still calls `uploadBill` unless the mutation fails later. | Production blocker | File-backed OCR job can reference nonexistent placeholder storage. Operators may believe a bill was uploaded. | Require successful storage upload before creating OCR job; surface upload failure and block processing. | OCR / storage / frontend |
| F-003 | `server/worker.ts` legacy OCR worker | Legacy queue comments say production must use cron/message queue, but `processQueue` does not increment attempts in the shown retry update and TODO alert hooks remain. | Production risk | OCR jobs may retry unclearly and ops alerting is not durable. | Either retire legacy worker in favor of `server/services/workerRuntime.ts` or harden attempts/dead-letter/alerting in a targeted PR. | Worker / OCR |
| F-004 | `server/services/workerRuntime.ts` `isUnsafeProviderSuccess` | Worker blocks unavailable statuses, but only by `status` value; result shapes like `{ ok: true, sent: true }` without a status are not rejected by this helper. | Production risk | A handler could accidentally complete a fake provider result if it omits status. | Extend the guard to use `assertProviderNotFakeSuccessful` or inspect success-like booleans plus provider metadata. | Worker / providers |
| F-005 | `server/services/refundService.ts` unconfigured provider path | Refund initiation with missing Razorpay credentials returns `ok: true` with `status: "pending"` and provider state `provider_not_configured`. | Production risk | It does not fake refunded/success, but `ok:true` can be misread by callers as operational success unless UI keys off status/providerState. | Normalize response semantics to `accepted: true`, `providerSynced: false`, or `ok:false` for provider-unconfigured pending. | Payments / refunds |
| F-006 | `server/services/paymentGateway.ts` not implemented lifecycle helpers | `recordPaymentAttempt`, `markPaymentAuthorized`, and `markPaymentRefunded` throw `NOT_IMPLEMENTED` outside explicit non-production demo/test. | Acceptable fail-closed state | No fake payment success; runtime fails closed if helper is invoked. | Keep as fail-closed until wired; add owner-visible operational status if any endpoint can trigger these. | Payments |
| F-007 | `server/services/paymentGateway.ts` payment verification | Missing Razorpay secret returns `verified:false`, `provider_unconfigured`; demo/test returns `demo_skipped`, not verified. | Acceptable fail-closed state | Payment verification cannot silently pass without secret. | No cleanup required except keep scanner coverage. | Payments |
| F-008 | `server/services/paymentGateway.ts` webhook signature | Production webhook secret missing throws `PRECONDITION_FAILED`; bad/missing signature returns false. | Acceptable fail-closed state | Webhook replay/forgery is not accepted as success. | No cleanup required. | Payments / webhooks |
| F-009 | `server/connectors.ts` SMS/WhatsApp unconfigured | Missing SMS/WhatsApp credentials return `provider_unconfigured` in production or `skipped_demo` outside production, with `ok:false`; legacy boolean wrappers only return true for `sent`. | Acceptable fail-closed state | No fake send success from unconfigured providers. | Keep; ensure all callers prefer detailed result for operator visibility. | Providers / notifications |
| F-010 | `server/connectors.ts` printer connector | Printer path is typed to distinguish `printed`, `preview_only`, `not_printed`, `provider_unconfigured`, and `skipped_demo`. | Acceptable fail-closed state | No unconfigured provider should be marked printed by contract. | Verify runtime callers never convert preview to printed. | Printer / ops |
| F-011 | `server/services/tallyExport.ts` export result | Tally export generation returns CSV with `providerState: provider_unconfigured_export_generated`, `imported:false`, `synced:false`. | Acceptable fail-closed state | Export generation is not claimed as provider sync. | Keep; UI must show generated-not-synced. | Accounting / ERP |
| F-012 | `server/_core/storageProxy.ts` | Missing Forge credentials returns 500 “Storage proxy not configured”; unsafe keys and forbidden access are blocked. | Acceptable fail-closed state | Sensitive files are not served from a fake or open storage path. | No cleanup required. | Storage / security |
| F-013 | `server/_core/map.ts` | Maps proxy throws if credentials are missing. | Acceptable fail-closed state | No fake distance/geocode result is returned by server proxy. | No cleanup required. | Maps / routing |
| F-014 | `server/services/jobQueue.ts` / `workerRuntime.ts` missing handler | Missing explicit worker handler dead-letters rather than marking complete. | Acceptable fail-closed state | Disabled/unwired worker job does not fake completion. | Keep; improve status dashboards. | Worker |
| F-015 | `server/services/reservationService.ts` audit entity fallback | Reservation audit uses `reservationId ?? Number(input.orderId ?? 0)` and status update uses `Number(input.id ?? input.orderId ?? 0)`. | Production risk | Audit records can contain placeholder `0` when durable IDs are unavailable, weakening traceability. | Use string `entityRef`/commercial event ref or require durable reservation ID before audit. | Stock / audit |
| F-016 | `server/services/reservationService.ts` `syncStoreSkuSoftLocks` | Function resets `softLockedQty` and returns `synced:true`; it documents reservations as canonical. | Production risk | Real mutation, not fake provider sync, but “synced” wording can be confused with external stock truth certification. | Rename/result-shape in future to `reconciled:true` with inspected/updated counts. | Stock / reservation |
| F-017 | `server/pharmacy.ts` `quickVerifyRx` | Quick-verify directly sets prescription status to approved with note “Quick verified”. Router restricts to pharmacist roles, but the audit did not find schedule-specific safeguards in this function. | Production risk | May be acceptable for defined low-risk lane, but safety-critical shortcut needs explicit documented eligibility gates. | Add explicit quick-verify eligibility checks or remove shortcut for regulated Rx. | Compliance / Rx |
| F-018 | `server/services/complianceGate.ts` | Regulated sale validation returns `ok:true` only when `rxCleared` is set; H1 register requires pharmacist and doctor/patient fields. | Acceptable fail-closed state | No fake Rx clearance found in this code path. | No cleanup required; keep tests. | Compliance / H1 |
| F-019 | `client/src/pages/admin/AdminCommandCenter.tsx` | Payment/refund and supplier outstanding cards show “Not wired” with warning severity. | Production risk | Honest warning, not fake green, but production dashboard remains incomplete. | Replace with real safe endpoints or feature-flag out of production dashboards. | Admin / ops |
| F-020 | `client/src/pages/AdminAccounting.tsx` | Tally and ledger cards are explicit placeholders / coming next pass. | Production risk | Honest placeholder, but accounting production UI exposes incomplete modules. | Hide from production or wire real Tally/ledger endpoints. | Accounting UI |
| F-021 | `client/src/components/Map.tsx` | Google Map is initialized with hardcoded `DEMO_MAP_ID`. | Production risk | May load without production map styling/config; “DEMO” config leaks into runtime. | Use environment/configured map ID and fail visibly if absent where required. | Maps / frontend |
| F-022 | `client/src/pages/MedivisionSync.tsx` | Sample CSV can populate the import textarea via a “Sample” button. | Production risk | It is an explicit operator action, but sample product/import data is available in runtime UI. | Hide sample button in production or mark dev-only. | Product import / frontend |
| F-023 | `client/src/pages/ComponentShowcase.tsx` | Component showcase has demo AI responses. | Test fixture | Showcase/demo page behavior; not evidence of production flow if route is not staff/customer critical. | Ensure route is non-production/dev-only before launch. | Frontend |
| F-024 | `client/src/pages/*`, components | Many `placeholder=` strings are ordinary form input placeholders. | False positive | No runtime stub. | None. | Frontend |
| F-025 | `server/provider-contract.guard.test.ts`, other `*.test.ts` | `mock`, `fake`, `demo`, `provider_unconfigured`, `success:true` appear in tests and guard fixtures. | Test fixture | Valid negative/positive test coverage. | None. | QA |
| F-026 | `scripts/check-runtime-placeholders.mjs` | Governance scanner self-contains pattern strings like “mock/stub success”. | False positive | Governance scan flags this script; it is not runtime fake success. | Improve scanner path-aware self-exclusion without weakening runtime scanning. | Governance |
| F-027 | `server/services/stockTruthCertification.ts` pattern literals | Governance scan flags scanner pattern literals for stock mutation. | False positive | Pattern literals do not mutate stock. | Improve governance scanner to ignore scanner-pattern declarations only. | Governance / stock |
| F-028 | `vite.config.ts` healthcheck | Vite dev health endpoint returns `{ success: true }`. | False positive | Dev/server health probe, not provider/payment/print fake success. | None unless production server uses this path. | Platform |
| F-029 | Status docs claiming readiness | Several status docs record pass/fail claims; newer docs usually include limitations. Search did not prove all “production-ready/10/10” claims with fresh validation. | Documentation/TODO only | May mislead roadmap if not tied to latest validation. | Cross-link current truth to this audit and require proof for green claims. | Governance / docs |
| F-030 | `server/worker.ts` ops alert TODOs | Sentry/PagerDuty/Slack alerting is documented as stub/TODO and not called. | Documentation/TODO only | No fake success, but production observability incomplete if this worker is used. | Wire real alerting or keep worker excluded from production. | Worker / ops |

## P0 / P1 / P2 cleanup list

### P0 — must fix before production launch

1. **OCR mock ingestion fallback:** remove hardcoded mock invoice fallback from production OCR processing; do not persist mock supplier/line data as `ocr_complete`.
2. **OCR placeholder storage URL:** block OCR job creation unless storage upload returns a real URL/key.

### P1 — should fix before launch certification

1. Harden legacy `server/worker.ts` or retire it from production entrypoints.
2. Extend worker fake-success detection beyond unavailable `status` strings.
3. Clarify refund provider-unconfigured `ok:true` response semantics.
4. Replace reservation audit `entityId` fallback `0`/numeric fallback with durable refs.
5. Gate or remove prescription `quickVerifyRx` shortcut for regulated medicines unless eligibility is proven.
6. Remove/hide production admin placeholders: command-center “Not wired”, accounting placeholder panels, Medivision sample import button.
7. Replace hardcoded `DEMO_MAP_ID` with configured production map ID.
8. Add scanner false-positive classification for scanner self-patterns and stock scanner pattern literals without hiding real runtime findings.

### P2 — cleanup / clarity

1. Convert docs-only TODOs into linked backlog items with owners.
2. Ensure all provider callers use detailed result shapes and surface fail-closed state to operators.
3. Verify ComponentShowcase/dev demo routes are not available in production.
4. Rename `syncStoreSkuSoftLocks` response fields to avoid external “sync” ambiguity.

## Acceptable fail-closed list

- SMS/WhatsApp missing credentials return `provider_unconfigured` in production and `ok:false`.
- Payment order creation requires Razorpay provider enabled and credentials.
- Payment verification returns `verified:false` on missing secret; no fake verification.
- Payment webhook secret missing in production throws precondition error.
- Payment lifecycle helpers that are not wired throw `NOT_IMPLEMENTED` outside explicit non-production demo/test.
- Tally CSV export is generated locally but marks `imported:false`, `synced:false`, and provider unconfigured/not synced.
- Storage proxy blocks unsafe/forbidden keys and fails when Forge storage credentials are absent.
- Maps server proxy throws when credentials are absent.
- Worker runtime dead-letters missing handlers/provider-unavailable statuses rather than completing them.

## False positive list

- Form input placeholders and CSS `placeholder:` classes.
- Test mocks/fakes/demos in `*.test.ts` guard fixtures.
- Provider status type literals (`sent`, `verified`, `printed`) in contracts without success conversion.
- Governance scanner self-pattern strings in `scripts/check-runtime-placeholders.mjs`.
- Stock scanner regex literals in `server/services/stockTruthCertification.ts`.
- Vite dev healthcheck `{ success: true }`.

## Docs-only TODO list

- Worker Sentry/PagerDuty/Slack comments in `server/worker.ts`.
- Status docs describing known placeholder/admin/accounting gaps.
- Runbook/checklist items that explicitly say proof is pending or next pass.
- `docs/ADDITIONAL_FEATURES.md` roadmap items such as replacing fake ETA.
- Placeholder status docs that do not drive runtime behavior.
- Governance docs updated in this branch to prohibit future runtime stubs.

## Governance scan result

`node scripts/ci-governance-guards.mjs all` failed with 4 findings on this SHA:

1. `scripts/check-runtime-placeholders.mjs:9` provider-risk — scanner self-pattern “mock/stub success”. Classified **false positive**.
2. `server/services/stockTruthCertification.ts:27` stock-mutation-risk — scanner regex literal `insert(stockReservations)`. Classified **false positive**.
3. `server/services/stockTruthCertification.ts:28` stock-mutation-risk — scanner regex literal `update(stockReservations)`. Classified **false positive**.
4. `server/services/stockTruthCertification.ts:29` stock-mutation-risk — scanner regex literal `delete(stockReservations)`. Classified **false positive**.

No scanner was weakened in this audit branch. Recommended future PR: path-aware scanner self-exclusion for scanner pattern declarations only.

## Exact next prompts needed

1. `Fix P0 OCR fake ingestion and placeholder storage paths without changing schema: remove mock OCR fallback from production, require real storage upload, keep CSV import explicit and audited.`
2. `Harden worker fake-success detection and retire or productionize legacy OCR worker: no provider-unconfigured/demo result may complete a job, attempts/dead-letter/ops alerting must be durable.`
3. `Clean up production admin placeholders: replace command-center payment/supplier cards, accounting placeholders, Medivision sample import, and DEMO_MAP_ID with production-safe endpoints/config or hide them in production.`
4. `Clarify refund unconfigured-provider response semantics and UI handling: no ok:true may be interpreted as refunded/synced when providerState is provider_not_configured.`
5. `Replace reservation audit entityId fallback with durable entity refs; no entityId:0 in stock/reservation audit paths.`
6. `Prove or remove pharmacist quick-verify shortcut for regulated prescriptions; add explicit eligibility gates and tests.`
7. `Improve governance scanner false-positive classification for scanner self-patterns and stock scanner regex declarations only; do not weaken runtime scanning.`

## Safe-to-merge assessment

Safe to merge as an audit/docs branch only. It introduces no runtime fixes and therefore does not make the app production-ready. Production launch remains blocked by the P0 OCR findings and P1 cleanup list above.

## Validation results for this audit branch

| Command | Result | Notes |
|---|---|---|
| `pnpm install` | Passed with warnings | Lockfile up to date; Node `[DEP0169] url.parse()` deprecation warning; pnpm ignored build scripts warning for `@tailwindcss/oxide` and `esbuild`. |
| `pnpm run check` | Passed | TypeScript completed with no errors. |
| `pnpm test -- --runInBand` | Passed with environment-limited skip | 84 test files passed, 1 skipped; 490 tests passed, 1 skipped. MySQL lifecycle integration skipped because `TEST_DATABASE_URL` is not set. OAuth test logged missing `OAUTH_SERVER_URL` while passing. |
| `pnpm run build` | Passed with warnings | Vite warned about missing analytics placeholders and a >500 kB chunk. |
| `node scripts/verify-migrations.mjs` | Passed | 49 files, 46 numbered, latest `0048`, 0 blocking issues, 0 warnings. |
| `git diff --check` | Passed | No whitespace errors. |
| `node scripts/ci-governance-guards.mjs all` | Failed | 4 findings classified above as scanner/self-pattern false positives; scanner was not changed. |
