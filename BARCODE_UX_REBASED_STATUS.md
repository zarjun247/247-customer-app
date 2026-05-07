# Barcode UX Rebased Status

## Branch and reference posture
- Branch: `feat/p20-16-barcode-ux-rebased`.
- PR #46 and PR #47 were treated as stale references only. The local environment has no GitHub CLI/remote access, so they were not fetched, merged, cherry-picked, or applied directly.
- Started from the current local main-equivalent history after merged PR #51 (`ff19315 Merge pull request #51 from zarjun247/codex/finish-stock-aggregation-and-reservation-truth`). Remote pull/rebase could not run because no `origin` remote is configured in this container.

## Implementation checklist executed
- Added reusable barcode scanner input with keyboard-wedge/manual entry, Enter submit, scan state display, safe callbacks, and canonical availability display.
- Added reusable barcode label preview with batch/product/barcode preview, explicit printer-not-configured warning, browser print fallback, and callback-based reprint action.
- Wired counter billing minimally to the existing lookup-only `sales.scanBarcodeForSale` query.
- Wired barcode print page to the reusable preview component while preserving downloadable ZPL and making browser print a fallback/preview path.
- Added component-helper and static guard tests for lookup-only scan behavior and no direct stock mutation in barcode UX files.

## Components added/updated
- Added `client/src/components/barcode/BarcodeScannerInput.tsx`.
  - Supports manual entry and keyboard-wedge scanners through a normal text input and Enter submit.
  - Tracks scan states: `idle`, `scanning`, `found`, `not_found`, `ambiguous`, `incomplete_master`, `blocked_regulated`, and `error`.
  - Exposes `onScan`, `onResolved`, and `onError` callbacks.
  - Displays last scanned value and canonical availability when the lookup response supplies it.
- Added `client/src/components/barcode/BarcodeLabelPreview.tsx`.
  - Renders batch/product/barcode label cards.
  - Shows `Printer not configured` and `Preview/browser print only` when no provider is configured.
  - Provides browser print fallback and callback-based reprint without claiming SDK success.

## Pages wired
- `client/src/pages/sales/AdminCounterBilling.tsx`
  - Uses `BarcodeScannerInput` for counter barcode lookup.
  - Calls only `sales.scanBarcodeForSale.fetch(...)` for lookup scan actions.
  - Does not mutate stock on scan; existing stock mutation remains in the confirmed sale flow.
- `client/src/pages/BarcodePrint.tsx`
  - Uses `BarcodeLabelPreview` for current local queue preview.
  - Keeps ZPL download as an operator-managed print artifact.
  - Marks browser print as fallback/preview only.

## Pages intentionally not wired to avoid conflicts
- Purchase invoice inwarding, stock audit, and returns pages were not wired beyond reusable component readiness because parallel branches are active in route/admin UI areas and stock/reservation services are explicitly protected from conflict.
- `client/src/App.tsx` was not edited.
- No admin route architecture was changed.

## Printer fallback behavior
- Printer provider configuration is not assumed.
- The preview component explicitly renders `Printer not configured` and `Preview/browser print only` for unconfigured status.
- The UI does not show or persist a printed/success state from SDK printing. Reprint is callback-based and currently used only as a preview notification on the barcode print page.

## Canonical availability behavior
- The scanner displays canonical availability when the current barcode lookup result includes `canonicalAvailability.availableQty`.
- If the endpoint omits canonical availability, the scanner shows `Canonical availability unavailable`.
- The frontend does not compute stock truth; it only displays backend-provided availability.

## Scan route non-mutation guard
- Existing scan routes remain lookup-only wrappers around barcode resolution.
- Added guard coverage that scan route bodies do not call stock mutation functions or mutate batch quantities directly.
- Added frontend static guard coverage that barcode UX files do not introduce direct stock mutations.

## Files changed
- `BARCODE_UX_REBASED_STATUS.md`
- `client/src/components/barcode/BarcodeScannerInput.tsx`
- `client/src/components/barcode/BarcodeLabelPreview.tsx`
- `client/src/components/barcode/barcode-components.test.ts`
- `client/src/pages/BarcodePrint.tsx`
- `client/src/pages/sales/AdminCounterBilling.tsx`
- `server/barcode-scan.guard.test.ts`
- `vitest.config.ts`

## Migrations
- None.

## Validation results
- `pnpm install` passed. pnpm reported existing ignored build scripts for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed after type validation.
- `pnpm test -- --runInBand` passed: 55 files, 214 tests.
- `pnpm run build` passed. Vite emitted existing warnings for missing analytics env placeholders and large chunks.

## Remaining risks
- P0: None known in the barcode UX changes; scan actions are lookup-only and no migrations were added.
- P1: Purchase/return/audit scanner wiring remains pending to avoid route/admin/stock conflicts; components are ready for later low-conflict integration.
- P2: Real printer provider integration is still a backend/device dependency; current behavior is preview/browser-print and downloadable ZPL only.
