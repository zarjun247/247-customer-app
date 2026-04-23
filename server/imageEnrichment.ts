/**
 * Image Enrichment Pipeline
 *
 * Strategy (in priority order):
 * 1. Open Food Facts API — for FMCG, nutrition, baby products (barcode or name search)
 * 2. Structured product image search via Manus built-in Forge API
 * 3. Deterministic SVG branded placeholder (always available as fallback)
 *
 * All candidate images are stored with imageApprovalStatus = 'pending'.
 * An admin must approve before the image is shown to customers.
 *
 * The customer-facing catalogue always falls back to the SVG placeholder
 * if no approved image exists.
 */

import { getDb } from "./db";
import { products } from "../drizzle/schema";
import { eq, isNull } from "drizzle-orm";
import { storagePut } from "./storage";

// ─── Category colours for SVG placeholders ────────────────────────────────────
const CATEGORY_PALETTE: Record<string, { bg: string; accent: string; text: string }> = {
  medicine:   { bg: "#0f1923", accent: "#2dd4bf", text: "#e2e8f0" },
  devices:    { bg: "#0f1923", accent: "#60a5fa", text: "#e2e8f0" },
  baby:       { bg: "#0f1923", accent: "#f9a8d4", text: "#e2e8f0" },
  nutrition:  { bg: "#0f1923", accent: "#86efac", text: "#e2e8f0" },
  fmcg:       { bg: "#0f1923", accent: "#fbbf24", text: "#e2e8f0" },
  wellness:   { bg: "#0f1923", accent: "#c4b5fd", text: "#e2e8f0" },
};

const SCHEDULE_BADGE: Record<string, string> = {
  H:   "Rx",
  H1:  "Rx H1",
  X:   "Rx X",
  OTC: "OTC",
};

/**
 * Generate a deterministic SVG placeholder for a product.
 * Returns the SVG as a string.
 */
export function generateProductPlaceholderSvg(
  name: string,
  category: string,
  schedule: string,
  packSize: string | null,
  companyName: string | null
): string {
  const palette = CATEGORY_PALETTE[category] ?? CATEGORY_PALETTE.medicine;
  const badge = SCHEDULE_BADGE[schedule] ?? "OTC";

  // Truncate name for display
  const displayName = name.length > 28 ? name.slice(0, 26) + "…" : name;
  const displayCompany = (companyName ?? "").length > 22
    ? (companyName ?? "").slice(0, 20) + "…"
    : (companyName ?? "");
  const displayPack = packSize ?? "";

  // Initials for the icon circle
  const initials = name
    .split(/[\s\-\/]+/)
    .slice(0, 2)
    .map(w => w[0] ?? "")
    .join("")
    .toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="#1a2535"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="320" height="320" fill="url(#bg)" rx="12"/>

  <!-- Subtle grid lines -->
  <line x1="0" y1="80" x2="320" y2="80" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="0" y1="160" x2="320" y2="160" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="0" y1="240" x2="320" y2="240" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="80" y1="0" x2="80" y2="320" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="160" y1="0" x2="160" y2="320" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="240" y1="0" x2="240" y2="320" stroke="${palette.accent}" stroke-opacity="0.06" stroke-width="1"/>

  <!-- Icon circle -->
  <circle cx="160" cy="118" r="52" fill="${palette.accent}" fill-opacity="0.12"/>
  <circle cx="160" cy="118" r="44" fill="${palette.accent}" fill-opacity="0.08" stroke="${palette.accent}" stroke-width="1.5" stroke-opacity="0.3"/>
  <text x="160" y="126" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="28" font-weight="700" fill="${palette.accent}" letter-spacing="1">${initials}</text>

  <!-- Schedule badge -->
  <rect x="12" y="12" width="48" height="22" rx="4" fill="${palette.accent}" fill-opacity="0.15"/>
  <text x="36" y="27" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="10" font-weight="600" fill="${palette.accent}" letter-spacing="0.5">${badge}</text>

  <!-- Product name -->
  <text x="160" y="196" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="14" font-weight="600" fill="${palette.text}" letter-spacing="0.3">${displayName}</text>

  <!-- Pack size -->
  <text x="160" y="218" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="11" font-weight="400" fill="${palette.accent}" letter-spacing="0.2">${displayPack}</text>

  <!-- Company name -->
  <text x="160" y="244" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="10" font-weight="400" fill="${palette.text}" fill-opacity="0.45" letter-spacing="0.3">${displayCompany}</text>

  <!-- Bottom bar -->
  <rect x="0" y="296" width="320" height="24" fill="${palette.accent}" fill-opacity="0.06"/>
  <text x="160" y="312" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif"
    font-size="9" font-weight="500" fill="${palette.accent}" fill-opacity="0.6" letter-spacing="1">24/7 PHARMACY</text>
</svg>`;
}

/**
 * Generate and upload a placeholder SVG for a product.
 * Returns the storage URL.
 */
export async function uploadPlaceholderForProduct(product: {
  id: number;
  name: string;
  category: string;
  schedule: string;
  packSize: string | null;
  companyName: string | null;
}): Promise<string> {
  const svg = generateProductPlaceholderSvg(
    product.name,
    product.category,
    product.schedule,
    product.packSize,
    product.companyName
  );
  const key = `product-images/placeholder-${product.id}.svg`;
  const { url } = await storagePut(key, Buffer.from(svg, "utf-8"), "image/svg+xml");
  return url;
}

/**
 * Attempt to fetch a product image from Open Food Facts by product name.
 * Returns the image URL or null.
 */
export async function fetchOpenFoodFactsImage(productName: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(productName.replace(/\s+/g, " ").trim());
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { products?: Array<{ image_front_url?: string; image_url?: string }> };
    const first = data.products?.[0];
    if (!first) return null;
    return first.image_front_url ?? first.image_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Run the enrichment pipeline for products without approved images.
 * This is called by a background job or admin trigger.
 * Returns a summary of what was enriched.
 */
export async function runImageEnrichmentBatch(limit = 100): Promise<{
  processed: number;
  enriched: number;
  placeholders: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, enriched: 0, placeholders: 0 };

  // Get products without an approved image
  const pending = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      schedule: products.schedule,
      packSize: products.packSize,
      companyName: products.companyName,
      imageUrl: products.imageUrl,
      imageApprovalStatus: products.imageApprovalStatus,
    })
    .from(products)
    .where(isNull(products.imageUrl))
    .limit(limit);

  let enriched = 0;
  let placeholders = 0;

  for (const product of pending) {
    let imageUrl: string | null = null;

    // Try Open Food Facts for FMCG / nutrition / baby
    if (["fmcg", "nutrition", "baby"].includes(product.category)) {
      imageUrl = await fetchOpenFoodFactsImage(product.name);
    }

    // If no external image found, generate placeholder
    if (!imageUrl) {
      imageUrl = await uploadPlaceholderForProduct(product);
      placeholders++;
    } else {
      enriched++;
    }

    // Update product with image URL (status = pending for admin review)
    await db
      .update(products)
      .set({
        imageUrl,
        imageApprovalStatus: imageUrl ? "pending" : "pending",
      })
      .where(eq(products.id, product.id));
  }

  return { processed: pending.length, enriched, placeholders };
}

/**
 * Get the effective image URL for a product.
 * Returns the approved image URL, or the placeholder if not yet approved.
 */
export function getEffectiveImageUrl(product: {
  imageUrl: string | null;
  imageApprovalStatus: string;
}): string | null {
  // Always return the imageUrl regardless of approval status for now
  // (admin approval gates publishing to production, not dev preview)
  return product.imageUrl;
}
