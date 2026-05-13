/**
 * server/location.ts
 *
 * Location intelligence utilities:
 * - Places Autocomplete (address search)
 * - Geocoding (address → lat/lng)
 * - Reverse geocoding (lat/lng → address)
 * - Serviceability check (lat/lng → nearest eligible store)
 * - Opening hours resolver (is store open now?)
 * - ETA computation via Distance Matrix
 *
 * All Google Maps calls go through the Manus proxy (server/_core/map.ts).
 */

import { makeRequest } from "./_core/map";
import { getDb } from "./db";
import { stores } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string;
  pincode: string | null;
};

export type ServiceabilityResult = {
  serviceable: boolean;
  storeId: number | null;
  storeName: string | null;
  storeAddress: string | null;
  storeLat: number | null;
  storeLng: number | null;
  etaMins: number | null;
  etaText: string | null; // customer-safe: "Arriving in ~X min"
  slaMins: number | null;
  openNow: boolean;
  openingHoursText: string | null;
  distanceMetres: number | null;
  reason:
    | "primary_assignment"
    | "geo_nearest"
    | "pincode_fallback"
    | "out_of_range"
    | "no_stores";
};

export type OpeningHourSlot = {
  day: number; // 0=Sunday … 6=Saturday
  open: string; // "HH:MM"
  close: string; // "HH:MM"
};

// ─── Haversine distance ───────────────────────────────────────────────────────

export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Opening hours ────────────────────────────────────────────────────────────

/**
 * Parse the openingHours JSON stored in the stores table.
 * Returns null if the field is null/invalid.
 */
export function parseOpeningHours(
  raw: string | null
): OpeningHourSlot[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as OpeningHourSlot[];
  } catch {
    return null;
  }
}

/**
 * Determine if a store is currently open, given its openingHours JSON.
 * Uses the server's local time (IST via TZ env or UTC+5:30 offset).
 */
export function isStoreOpenNow(openingHoursRaw: string | null): boolean {
  const slots = parseOpeningHours(openingHoursRaw);
  if (!slots) return true; // if no hours configured, assume open

  // Get current IST time (UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0=Sunday
  const hhmm = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;

  const slot = slots.find(s => s.day === day);
  if (!slot) return false;

  return hhmm >= slot.open && hhmm <= slot.close;
}

/**
 * Return a human-readable opening hours string for today.
 * e.g. "Open 24 hours" or "08:00 – 22:00"
 */
export function getTodayHoursText(openingHoursRaw: string | null): string {
  const slots = parseOpeningHours(openingHoursRaw);
  if (!slots) return "Open 24 hours";

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay();

  const slot = slots.find(s => s.day === day);
  if (!slot) return "Closed today";
  if (slot.open === "00:00" && slot.close === "23:59") return "Open 24 hours";
  return `${slot.open} – ${slot.close}`;
}

// ─── Customer-safe ETA text ──────────────────────────────────────────────────

/**
 * Format raw ETA minutes into a customer-safe string.
 * e.g. 18 → "Arriving in ~20 min" (rounded up to nearest 5)
 */
export function formatEtaText(etaMins: number | null): string | null {
  if (etaMins === null) return null;
  // Round up to nearest 5 minutes for customer display
  const rounded = Math.ceil(etaMins / 5) * 5;
  return `Arriving in ~${rounded} min`;
}

// ─── Places Autocomplete ──────────────────────────────────────────────────────

/**
 * Fetch address suggestions from Google Places Autocomplete.
 * Biased to Mumbai (lat 19.076, lng 72.877) with a 50km radius.
 */
export async function getPlaceAutocomplete(
  query: string,
  sessionToken?: string
): Promise<PlacePrediction[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const params: Record<string, string> = {
      input: query,
      location: "19.0760,72.8777", // Mumbai centre
      radius: "50000",
      components: "country:in",
      language: "en",
    };
    if (sessionToken) params.sessiontoken = sessionToken;

    const result = await makeRequest<{
      predictions: Array<{
        place_id: string;
        description: string;
        structured_formatting?: {
          main_text: string;
          secondary_text: string;
        };
      }>;
      status: string;
    }>("/maps/api/place/autocomplete/json", params);

    if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
      console.warn("[location] Autocomplete status:", result.status);
      return [];
    }

    return (result.predictions ?? []).map(p => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? "",
    }));
  } catch (e) {
    console.error("[location] Autocomplete error:", e);
    return [];
  }
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

/**
 * Geocode a free-text address or a Google place_id to lat/lng.
 */
export async function geocodeAddress(
  addressOrPlaceId: string,
  isPlaceId = false
): Promise<GeocodeResult | null> {
  try {
    const params: Record<string, string> = isPlaceId
      ? { place_id: addressOrPlaceId }
      : { address: addressOrPlaceId, region: "in" };

    const result = await makeRequest<{
      results: Array<{
        place_id: string;
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        address_components: Array<{
          long_name: string;
          short_name: string;
          types: string[];
        }>;
      }>;
      status: string;
    }>("/maps/api/geocode/json", params);

    if (result.status !== "OK" || !result.results?.length) {
      console.warn("[location] Geocode status:", result.status);
      return null;
    }

    const r = result.results[0];
    const pincode =
      r.address_components.find(c => c.types.includes("postal_code"))
        ?.long_name ?? null;

    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
      placeId: r.place_id,
      pincode,
    };
  } catch (e) {
    console.error("[location] Geocode error:", e);
    return null;
  }
}

// ─── ETA via Distance Matrix ──────────────────────────────────────────────────

/**
 * Get driving ETA in minutes from store to customer address using Distance Matrix.
 * Returns null if the API call fails.
 */
export async function getDrivingEtaMins(
  storeLat: number,
  storeLng: number,
  destLat: number,
  destLng: number
): Promise<number | null> {
  try {
    const result = await makeRequest<{
      rows: Array<{
        elements: Array<{
          status: string;
          duration: { value: number };
          duration_in_traffic?: { value: number };
        }>;
      }>;
      status: string;
    }>("/maps/api/distancematrix/json", {
      origins: `${storeLat},${storeLng}`,
      destinations: `${destLat},${destLng}`,
      mode: "driving",
      departure_time: "now",
    });

    const element = result.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;

    const secs =
      element.duration_in_traffic?.value ?? element.duration?.value ?? null;
    if (!secs) return null;

    // Add 5-minute picking buffer
    return Math.ceil(secs / 60) + 5;
  } catch (e) {
    console.error("[location] Distance Matrix error:", e);
    return null;
  }
}

// ─── Serviceability check ─────────────────────────────────────────────────────

/**
 * Given a lat/lng, find the best eligible store and return serviceability info.
 *
 * Resolution order:
 * 1. Building's primary store (if within its service radius).
 * 2. Nearest active store whose serviceRadius covers the point.
 * 3. Pincode fallback: nearest active store in the same pincode (expanded radius).
 * 4. Out of range — return serviceable=false.
 */
export async function checkServiceability(
  lat: number,
  lng: number,
  buildingPrimaryStoreId?: number | null,
  pincode?: string | null
): Promise<ServiceabilityResult> {
  const db = await getDb();
  if (!db) {
    return {
      serviceable: false,
      storeId: null,
      storeName: null,
      storeAddress: null,
      storeLat: null,
      storeLng: null,
      etaMins: null,
      etaText: null,
      slaMins: null,
      openNow: false,
      openingHoursText: null,
      distanceMetres: null,
      reason: "no_stores",
    };
  }

  const allStores = await db
    .select()
    .from(stores)
    .where(eq(stores.isActive, true));

  if (allStores.length === 0) {
    return {
      serviceable: false,
      storeId: null,
      storeName: null,
      storeAddress: null,
      storeLat: null,
      storeLng: null,
      etaMins: null,
      etaText: null,
      slaMins: null,
      openNow: false,
      openingHoursText: null,
      distanceMetres: null,
      reason: "no_stores",
    };
  }

  // Compute distances for all stores
  const withDistance = allStores
    .filter(s => s.lat && s.lng)
    .map(s => ({
      store: s,
      distanceM: haversineMetres(lat, lng, Number(s.lat), Number(s.lng)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  let chosen: (typeof withDistance)[0] | null = null;
  let reason: ServiceabilityResult["reason"] = "out_of_range";

  // Pass 1: building's primary store (if within its service radius)
  if (buildingPrimaryStoreId) {
    const primary = withDistance.find(
      w => w.store.id === buildingPrimaryStoreId
    );
    if (primary && primary.distanceM <= primary.store.serviceRadius) {
      chosen = primary;
      reason = "primary_assignment";
    }
  }

  // Pass 2: nearest store within its service radius
  if (!chosen) {
    const nearest = withDistance.find(
      w => w.distanceM <= w.store.serviceRadius
    );
    if (nearest) {
      chosen = nearest;
      reason = "geo_nearest";
    }
  }

  // Pass 3: pincode fallback — nearest active store in the same pincode
  // (uses an expanded 8km radius to handle large pincodes)
  if (!chosen && pincode) {
    const pincodeMatch = withDistance.find(
      w => w.store.pincode === pincode && w.distanceM <= 8000
    );
    if (pincodeMatch) {
      chosen = pincodeMatch;
      reason = "pincode_fallback";
    }
  }

  if (!chosen) {
    return {
      serviceable: false,
      storeId: null,
      storeName: null,
      storeAddress: null,
      storeLat: null,
      storeLng: null,
      etaMins: null,
      etaText: null,
      slaMins: null,
      openNow: false,
      openingHoursText: null,
      distanceMetres: null,
      reason: "out_of_range",
    };
  }

  const s = chosen.store;
  const openNow = isStoreOpenNow(s.openingHours ?? null);
  const openingHoursText = getTodayHoursText(s.openingHours ?? null);

  // Try real ETA via Distance Matrix; fall back to store's slaMins
  let etaMins = s.slaMins;
  const mapsEta = await getDrivingEtaMins(
    Number(s.lat),
    Number(s.lng),
    lat,
    lng
  );
  if (mapsEta !== null) etaMins = mapsEta;

  return {
    serviceable: true,
    storeId: s.id,
    storeName: s.name,
    storeAddress: s.address ?? null,
    storeLat: Number(s.lat),
    storeLng: Number(s.lng),
    etaMins,
    etaText: formatEtaText(etaMins),
    slaMins: s.slaMins,
    openNow,
    openingHoursText,
    distanceMetres: Math.round(chosen.distanceM),
    reason,
  };
}
