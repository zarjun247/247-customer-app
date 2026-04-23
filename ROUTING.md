# 24/7 Pharmacy — Routing Engine Documentation

## Overview

The routing engine (`server/routing.ts`) resolves which pharmacy store serves a given customer request. It is **deterministic**, **auditable**, and **building-first** — meaning every resolution is traceable to a specific building assignment or a documented geo-fallback.

---

## Resolution Order (Three-Pass Algorithm)

### Pass 1 — Primary Assignment (Highest Priority)

Every building record in the database has a `primaryStoreId` field, set by operations at onboarding time. This represents the pre-configured, contractually committed pharmacy node for that residential complex.

```
building.primaryStoreId → resolved store
resolutionPath = "primary_assignment"
```

This pass succeeds for all buildings that have been onboarded. It is the normal production path.

### Pass 2 — Geo Nearest (Fallback)

If the building has no `primaryStoreId`, or if the assigned store is inactive, the engine falls back to the nearest active store by **Haversine distance** using the building's `lat`/`lng` coordinates.

```
haversineMetres(building.lat, building.lng, store.lat, store.lng)
→ sorted ascending → first active store
resolutionPath = "geo_nearest"
```

This pass requires the building to have `lat`/`lng` populated. All buildings in the current dataset have coordinates.

### Pass 3 — Stock Availability Filter (Conditional)

When a `requiredSkuIds` array is passed (e.g., during cart checkout), the engine verifies that the resolved store has available stock (i.e., `stockQty - softLockedQty > 0`) for at least one of the requested SKUs.

If the resolved store fails the stock check, the engine iterates through remaining stores in ascending geo-distance order and selects the first one with available stock.

```
resolutionPath = "geo_nearest_with_stock"
```

---

## ETA Computation

ETA is computed in two layers:

| Layer | Source | Condition |
|---|---|---|
| **Google Maps Distance Matrix** | `maps.googleapis.com/distancematrix` (driving, best_guess traffic) | `GOOGLE_MAPS_API_KEY` env var set, building has lat/lng |
| **Static SLA fallback** | `stores.slaMins` (configured per store) | Maps API unavailable or no coordinates |

A **5-minute picking buffer** is added to the raw Maps driving time to produce the customer-facing ETA.

---

## Customer-Facing Output

The routing result is never exposed with internal terminology. The `displayLabel` field always returns:

```
"Serving from your local 24/7 pharmacy"
```

ETA is expressed in minutes: `"Estimated delivery: 18 min"`.

---

## Audit Logging

Every routing resolution is logged server-side via `formatRoutingAuditEntry()`:

```
[ROUTING] buildingId=2 → storeId=1 (primary_assignment) eta=18min
[ROUTING] buildingId=3 → storeId=4 (geo_nearest) eta=32min
[ROUTING] buildingId=1 → storeId=4 (geo_nearest_with_stock) eta=41min
```

These logs are written to `stdout` and captured by the server log pipeline. Future versions will write to the `audit_logs` table.

---

## tRPC API Surface

### `catalog.store` (protected query)

Returns the resolved store for the authenticated user's building, enriched with `etaMins`, `displayLabel`, and `resolutionPath`.

```ts
const { data: store } = trpc.catalog.store.useQuery();
// store.etaMins → number
// store.displayLabel → "Serving from your local 24/7 pharmacy"
// store.resolutionPath → "primary_assignment" | "geo_nearest" | "geo_nearest_with_stock"
```

### `routing.resolve` (protected query)

Explicit routing resolution with optional SKU stock check. Used at checkout to verify the serving store has stock for cart items.

```ts
const { data: routing } = trpc.routing.resolve.useQuery({
  requiredSkuIds: cartItems.map(i => i.skuId),
});
// routing.storeId, routing.etaMins, routing.resolutionPath
```

---

## Store + Building Data Model

### Stores

| Field | Type | Description |
|---|---|---|
| `id` | int | Primary key |
| `name` | varchar | e.g., "24/7 Pharmacy — Hiranandani Gardens" |
| `address` | text | Full street address |
| `lat` | decimal(10,8) | Latitude |
| `lng` | decimal(11,8) | Longitude |
| `serviceRadius` | int | Service radius in metres |
| `slaMins` | int | Static SLA fallback in minutes |
| `isActive` | boolean | Whether store is accepting orders |

### Buildings

| Field | Type | Description |
|---|---|---|
| `id` | int | Primary key |
| `name` | varchar | e.g., "Hiranandani Gardens" |
| `pincode` | varchar | 6-digit Indian pincode |
| `city` | varchar | City name |
| `lat` | decimal(10,8) | Latitude |
| `lng` | decimal(11,8) | Longitude |
| `primaryStoreId` | int FK | Assigned primary pharmacy |
| `fallbackStoreId` | int FK | Secondary fallback pharmacy |

---

## Current Store Assignments (Mumbai)

| Building | Pincode | Primary Store | SLA |
|---|---|---|---|
| Hiranandani Gardens, Powai | 400076 | 24/7 Pharmacy — Hiranandani Gardens | 20 min |
| Runwal Forests, Kanjurmarg | 400078 | 24/7 Pharmacy — Kanjurmarg | 35 min |
| Godrej Emerald, Thane | 400607 | 24/7 Pharmacy — Kanjurmarg | 35 min |
| Lodha Palava Phase 1, Dombivali | 421204 | 24/7 Pharmacy — Kanjurmarg | 35 min |
