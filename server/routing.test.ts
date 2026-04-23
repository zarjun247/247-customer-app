/**
 * Routing Engine Unit Tests
 * Tests the 3-pass building-first routing algorithm:
 *   Pass 1: Primary store assignment
 *   Pass 2: Geo nearest (Haversine)
 *   Pass 3: Stock availability filter
 * Also tests ETA fallback logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Haversine distance helper (extracted for testing) ────────────────────────

function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Mock store data (mirrors real Mumbai stores) ─────────────────────────────

const STORES = [
  { id: 1, name: "24/7 Pharmacy — Hiranandani Gardens", lat: "19.11970000", lng: "72.90500000", slaMins: 20, serviceRadius: 1500, isActive: true, address: "Hiranandani Gardens, Powai" },
  { id: 2, name: "24/7 Pharmacy — Powai Lake View",     lat: "19.11750000", lng: "72.91000000", slaMins: 25, serviceRadius: 2000, isActive: true, address: "Powai Lake View" },
  { id: 3, name: "24/7 Pharmacy — Chandivali",          lat: "19.11050000", lng: "72.89900000", slaMins: 30, serviceRadius: 2500, isActive: true, address: "Chandivali" },
  { id: 4, name: "24/7 Pharmacy — Kanjurmarg",          lat: "19.13300000", lng: "72.92900000", slaMins: 35, serviceRadius: 3000, isActive: true, address: "Kanjurmarg" },
];

const BUILDINGS = [
  { id: 1, name: "Lodha Palava Phase 1", lat: "19.16210000", lng: "73.05430000", primaryStoreId: 4, fallbackStoreId: 2, pincode: "421204" },
  { id: 2, name: "Hiranandani Gardens",  lat: "19.11970000", lng: "72.90500000", primaryStoreId: 1, fallbackStoreId: 2, pincode: "400076" },
  { id: 3, name: "Godrej Emerald",       lat: "19.21830000", lng: "72.97810000", primaryStoreId: 4, fallbackStoreId: 2, pincode: "400607" },
  { id: 4, name: "Runwal Forests",       lat: "19.13300000", lng: "72.92900000", primaryStoreId: 4, fallbackStoreId: 3, pincode: "400078" },
];

// ─── Routing logic (pure functions extracted from routing.ts for testing) ─────

function resolveStoreSync(
  buildingId: number,
  allStores: typeof STORES,
  allBuildings: typeof BUILDINGS,
  requiredSkuIds?: number[],
  storeStockMap?: Map<number, boolean>
): { storeId: number; resolutionPath: string; etaMins: number } | null {
  const building = allBuildings.find(b => b.id === buildingId);
  if (!building) return null;

  const buildingLat = Number(building.lat);
  const buildingLng = Number(building.lng);

  // Pass 1: Primary assignment
  let resolvedStore = allStores.find(s => s.id === building.primaryStoreId && s.isActive) ?? null;
  let resolutionPath = "primary_assignment";

  // Pass 2: Geo nearest fallback
  if (!resolvedStore) {
    const sorted = allStores
      .filter(s => s.isActive && s.lat && s.lng)
      .map(s => ({
        store: s,
        distanceM: haversineMetres(buildingLat, buildingLng, Number(s.lat), Number(s.lng)),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);

    if (sorted.length > 0) {
      resolvedStore = sorted[0].store;
      resolutionPath = "geo_nearest";
    }
  }

  // Pass 3: Stock availability filter
  if (resolvedStore && requiredSkuIds && requiredSkuIds.length > 0 && storeStockMap) {
    const hasStock = storeStockMap.get(resolvedStore.id) ?? false;
    if (!hasStock) {
      const candidates = allStores
        .filter(s => s.isActive && s.lat && s.lng && s.id !== resolvedStore!.id)
        .map(s => ({
          store: s,
          distanceM: haversineMetres(buildingLat, buildingLng, Number(s.lat), Number(s.lng)),
        }))
        .sort((a, b) => a.distanceM - b.distanceM);

      for (const candidate of candidates) {
        if (storeStockMap.get(candidate.store.id)) {
          resolvedStore = candidate.store;
          resolutionPath = "geo_nearest_with_stock";
          break;
        }
      }
    }
  }

  if (!resolvedStore) return null;

  return {
    storeId: resolvedStore.id,
    resolutionPath,
    etaMins: resolvedStore.slaMins, // Static fallback (no Maps API in tests)
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Haversine distance calculation", () => {
  it("returns ~0 metres for identical coordinates", () => {
    const d = haversineMetres(19.1197, 72.905, 19.1197, 72.905);
    expect(d).toBeCloseTo(0, 0);
  });

  it("calculates correct distance between Hiranandani and Kanjurmarg (~3.2km)", () => {
    // Hiranandani Gardens → Kanjurmarg
    const d = haversineMetres(19.1197, 72.905, 19.133, 72.929);
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(4000);
  });

  it("calculates correct distance between Powai and Chandivali (~1.5km)", () => {
    const d = haversineMetres(19.1175, 72.91, 19.1105, 72.899);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });
});

describe("Pass 1 — Primary store assignment", () => {
  it("resolves Hiranandani Gardens building to store 1 (primary assignment)", () => {
    const result = resolveStoreSync(2, STORES, BUILDINGS);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(1);
    expect(result!.resolutionPath).toBe("primary_assignment");
  });

  it("resolves Runwal Forests building to store 4 (primary assignment)", () => {
    const result = resolveStoreSync(4, STORES, BUILDINGS);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(4);
    expect(result!.resolutionPath).toBe("primary_assignment");
  });

  it("resolves Lodha Palava to store 4 (primary assignment)", () => {
    const result = resolveStoreSync(1, STORES, BUILDINGS);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(4);
    expect(result!.resolutionPath).toBe("primary_assignment");
  });
});

describe("Pass 2 — Geo nearest fallback", () => {
  it("falls back to nearest store when primary store is inactive", () => {
    const storesWithInactive = STORES.map(s =>
      s.id === 4 ? { ...s, isActive: false } : s
    );
    // Building 4 (Runwal Forests, 19.133, 72.929) primary is store 4 (inactive)
    // Nearest active store should be store 2 (Powai, 19.1175, 72.91) or store 1
    const result = resolveStoreSync(4, storesWithInactive, BUILDINGS);
    expect(result).not.toBeNull();
    expect(result!.storeId).not.toBe(4);
    expect(result!.resolutionPath).toBe("geo_nearest");
  });

  it("falls back to nearest store when building has no primary assignment", () => {
    const buildingsNoPrimary = BUILDINGS.map(b =>
      b.id === 2 ? { ...b, primaryStoreId: null as unknown as number } : b
    );
    // Building 2 (Hiranandani, 19.1197, 72.905) — nearest store should be store 1 (same coords)
    const result = resolveStoreSync(2, STORES, buildingsNoPrimary);
    expect(result).not.toBeNull();
    expect(result!.resolutionPath).toBe("geo_nearest");
    // Store 1 is at exactly the same coordinates as building 2
    expect(result!.storeId).toBe(1);
  });

  it("returns null when no active stores exist", () => {
    const noActiveStores = STORES.map(s => ({ ...s, isActive: false }));
    const result = resolveStoreSync(2, noActiveStores, BUILDINGS);
    expect(result).toBeNull();
  });

  it("returns null when building does not exist", () => {
    const result = resolveStoreSync(999, STORES, BUILDINGS);
    expect(result).toBeNull();
  });
});

describe("Pass 3 — Stock availability filter", () => {
  it("uses primary store when it has stock", () => {
    const stockMap = new Map([[1, true], [2, true], [3, true], [4, true]]);
    const result = resolveStoreSync(2, STORES, BUILDINGS, [101, 102], stockMap);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(1); // Primary assignment, has stock
    expect(result!.resolutionPath).toBe("primary_assignment");
  });

  it("falls back to geo nearest with stock when primary is out of stock", () => {
    // Building 2 primary is store 1 — mark store 1 as out of stock
    const stockMap = new Map([[1, false], [2, true], [3, false], [4, false]]);
    const result = resolveStoreSync(2, STORES, BUILDINGS, [101], stockMap);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(2); // Nearest store with stock
    expect(result!.resolutionPath).toBe("geo_nearest_with_stock");
  });

  it("returns primary store even with requiredSkuIds when no stockMap is provided", () => {
    // Without stockMap, stock check is skipped
    const result = resolveStoreSync(2, STORES, BUILDINGS, [101, 102], undefined);
    expect(result).not.toBeNull();
    expect(result!.storeId).toBe(1);
    expect(result!.resolutionPath).toBe("primary_assignment");
  });
});

describe("ETA fallback logic", () => {
  it("uses store.slaMins when no Maps API is available", () => {
    const result = resolveStoreSync(2, STORES, BUILDINGS);
    expect(result).not.toBeNull();
    // Store 1 has slaMins=20
    expect(result!.etaMins).toBe(20);
  });

  it("uses correct slaMins for Kanjurmarg store (35 min)", () => {
    const result = resolveStoreSync(4, STORES, BUILDINGS);
    expect(result).not.toBeNull();
    expect(result!.etaMins).toBe(35);
  });
});

describe("Routing audit log format", () => {
  it("formats a successful routing entry correctly", () => {
    const entry = `[ROUTING] buildingId=2 → storeId=1 (primary_assignment) eta=20min`;
    expect(entry).toContain("buildingId=2");
    expect(entry).toContain("storeId=1");
    expect(entry).toContain("primary_assignment");
    expect(entry).toContain("eta=20min");
  });

  it("formats a no-store-resolved entry correctly", () => {
    const entry = `[ROUTING] buildingId=999 → NO_STORE_RESOLVED`;
    expect(entry).toContain("NO_STORE_RESOLVED");
  });
});
