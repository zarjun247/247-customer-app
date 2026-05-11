import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  Search,
  X,
  Sparkles,
  FileText,
  MapPin,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { TRPCClientError } from "@trpc/client";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import {
  ProductCard,
  ProductDetailModal,
  ProductPlaceholder,
} from "./CatalogProductList";

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "medicine", label: "Medicines" },
  { key: "devices", label: "Devices" },
  { key: "nutrition", label: "Nutrition" },
  { key: "fmcg", label: "General" },
  { key: "baby", label: "Baby" },
  { key: "wellness", label: "Wellness" },
  { key: "personal_care", label: "Personal Care" },
];

// ─── Helper: detect ONBOARDING_REQUIRED tRPC error ─────────────────────────────────
function isOnboardingRequired(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return (
      error.data?.code === "PRECONDITION_FAILED" &&
      error.message === "ONBOARDING_REQUIRED"
    );
  }
  return false;
}
// ─── Main Catalog Page ────────────────────────────────────────────────────────
const LIMIT = 60;
export default function Catalog() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useOnboardingGuard();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [selectedSku, setSelectedSku] = useState<any | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<any>(null);

  // Read ?search= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("search");
    if (q) {
      setSearch(q);
      setDebouncedSearch(q);
    }
  }, []);

  // Only fire queries once onboarding is confirmed complete
  const { data: store, error: storeError } = trpc.catalog.store.useQuery(
    undefined,
    { enabled: isAuthenticated && isReady, retry: false }
  );
  const {
    data: items,
    isFetching,
    error: catalogError,
  } = trpc.catalog.list.useQuery(
    { search: debouncedSearch, category, limit: LIMIT, offset },
    { enabled: isAuthenticated && isReady, retry: false }
  );
  // Sponsored shelf — only for non-Rx categories when no search is active
  const sponsoredEnabled =
    isAuthenticated &&
    isReady &&
    !debouncedSearch &&
    ["all", "wellness", "nutrition", "devices", "fmcg"].includes(category);
  const { data: sponsoredItems } = trpc.catalog.sponsored.useQuery(undefined, {
    enabled: sponsoredEnabled,
  });
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const utils = trpc.useUtils();
  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => utils.cart.get.invalidate(),
    onError: e => toast.error(e.message),
  });

  const getCartQty = (skuId: number) =>
    cartItems?.find((i: any) => i.skuId === skuId)?.quantity ?? 0;
  const cartTotal =
    cartItems?.reduce((s: number, i: any) => s + i.quantity, 0) ?? 0;

  useEffect(() => {
    setOffset(0);
    setAllItems([]);
    setHasMore(true);
  }, [debouncedSearch, category]);

  useEffect(() => {
    if (!items) return;
    if (offset === 0) {
      setAllItems(items as any[]);
    } else {
      setAllItems(prev => {
        const ids = new Set(prev.map((i: any) => i.skuId));
        const fresh = (items as any[]).filter((i: any) => !ids.has(i.skuId));
        return [...prev, ...fresh];
      });
    }
    setHasMore((items as any[]).length === LIMIT);
  }, [items, offset]);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !isFetching) {
        setOffset(prev => prev + LIMIT);
      }
    },
    [hasMore, isFetching]
  );

  useEffect(() => {
    const obs = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    if (loadMoreRef.current) obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, [handleObserver]);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 350);
  };

  const handleAdd = (item: any) => {
    const current = getCartQty(item.skuId);
    const available = Number(item.availableQty) || 0;
    if (current >= available) {
      toast.error("Maximum available quantity reached");
      return;
    }
    upsertCart.mutate({
      skuId: item.skuId,
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      quantity: current + 1,
    });
  };

  const handleRemove = (item: any) => {
    const current = getCartQty(item.skuId);
    if (current <= 0) return;
    upsertCart.mutate({
      skuId: item.skuId,
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      quantity: current - 1,
    });
  };

  // ── Loading: auth/profile not yet resolved ──────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <AppLayout>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0A0A0B" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }}
            />
            <p className="text-xs" style={{ color: "#4B4B55" }}>
              Loading your pharmacy…
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Onboarding required (safety net if guard fires after render) ──────────────────────
  if (isOnboardingRequired(catalogError) || isOnboardingRequired(storeError)) {
    return (
      <AppLayout>
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "#0A0A0B" }}
        >
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(43,127,255,0.10)",
                border: "1px solid rgba(43,127,255,0.20)",
              }}
            >
              <MapPin
                size={22}
                strokeWidth={1.5}
                style={{ color: "#2B7FFF" }}
              />
            </div>
            <div>
              <p
                className="text-base font-semibold mb-2"
                style={{ color: "#F0F0F2" }}
              >
                Complete your setup
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#6B6B75" }}
              >
                Complete your address and pharmacy setup to view available
                medications.
              </p>
            </div>
            <button
              onClick={() => navigate("/onboarding")}
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              Set up my pharmacy
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Store closed / service unavailable ──────────────────────────────────────────────────
  if (
    isReady &&
    store &&
    (store as any).openNow === false &&
    !isFetching &&
    allItems.length === 0
  ) {
    return (
      <AppLayout>
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "#0A0A0B" }}
        >
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.20)",
              }}
            >
              <Clock size={22} strokeWidth={1.5} style={{ color: "#F59E0B" }} />
            </div>
            <div>
              <p
                className="text-base font-semibold mb-2"
                style={{ color: "#F0F0F2" }}
              >
                {store.name} is currently closed
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#6B6B75" }}
              >
                {(store as any).openingHoursText
                  ? `Opens ${(store as any).openingHoursText}. Upload a prescription and we'll prepare your order when we reopen.`
                  : "Your pharmacy is currently closed. Upload a prescription and we'll prepare your order when we reopen."}
              </p>
            </div>
            <button
              onClick={() => navigate("/rx-upload")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              <FileText size={14} strokeWidth={1.75} />
              Upload prescription for later
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Store query error (service unavailable) ───────────────────────────────────────────────
  if (storeError && !isOnboardingRequired(storeError)) {
    return (
      <AppLayout>
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "#0A0A0B" }}
        >
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.20)",
              }}
            >
              <AlertCircle
                size={22}
                strokeWidth={1.5}
                style={{ color: "#F59E0B" }}
              />
            </div>
            <div>
              <p
                className="text-base font-semibold mb-2"
                style={{ color: "#F0F0F2" }}
              >
                Service temporarily unavailable
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#6B6B75" }}
              >
                We could not reach your serving pharmacy right now. Please check
                your connection and try again.
              </p>
            </div>
            <button
              onClick={() => utils.catalog.store.invalidate()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "#141416",
                color: "#F0F0F2",
                border: "1px solid #2A2A2E",
              }}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
              Try again
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Network / other error ─────────────────────────────────────────────────────────────────
  if (catalogError && !isOnboardingRequired(catalogError)) {
    return (
      <AppLayout>
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "#0A0A0B" }}
        >
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.20)",
              }}
            >
              <AlertCircle
                size={22}
                strokeWidth={1.5}
                style={{ color: "#F59E0B" }}
              />
            </div>
            <div>
              <p
                className="text-base font-semibold mb-2"
                style={{ color: "#F0F0F2" }}
              >
                Unable to load catalog
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#6B6B75" }}
              >
                There was a problem connecting to your pharmacy. Please try
                again.
              </p>
            </div>
            <button
              onClick={() => utils.catalog.list.invalidate()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "#141416",
                color: "#F0F0F2",
                border: "1px solid #2A2A2E",
              }}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
              Try again
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="premium-page min-h-screen">
        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20"
          style={{ background: "#0A0A0B", borderBottom: "1px solid #1C1C1F" }}
        >
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Pharmacy + ETA banner */}
            {store && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: (store as any).openNow
                        ? "#00C896"
                        : "#FF6B6B",
                    }}
                  />
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: "#F0F0F2" }}
                  >
                    {store.name}
                  </span>
                  <span
                    className="text-xs flex-shrink-0"
                    style={{
                      color: (store as any).openNow ? "#00C896" : "#FF6B6B",
                    }}
                  >
                    {(store as any).openNow ? "Open" : "Closed"}
                  </span>
                  {(store as any).openingHoursText && (
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: "#4B4B55" }}
                    >
                      · {(store as any).openingHoursText}
                    </span>
                  )}
                </div>
                {((store as any).etaText || (store as any).etaMins) && (
                  <span
                    className="text-xs flex-shrink-0 ml-2 px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(43,127,255,0.10)",
                      color: "#2B7FFF",
                    }}
                  >
                    {(store as any).etaText ?? `~${(store as any).etaMins} min`}
                  </span>
                )}
              </div>
            )}

            <div className="trust-callout flex items-start gap-2 p-3 text-xs leading-relaxed">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>Search assist:</strong> suggestions and sponsored
                shelves are assistive only. Prescription, H/H1, and availability
                decisions remain pharmacist reviewed.
              </span>
            </div>

            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "#9CA3AF" }}
              />
              <input
                type="text"
                placeholder="Search by name, dosage, or generic…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="premium-input w-full pl-9 pr-9 text-sm transition-colors"
                style={{
                  background: "#141416",
                  border: "1px solid #2A2A2E",
                  color: "#F0F0F2",
                }}
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
                  style={{ color: "#9CA3AF" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Category tabs */}
            <div
              className="flex gap-1.5 overflow-x-auto pb-0.5"
              style={{ scrollbarWidth: "none" }}
            >
              {CATEGORIES.map(cat => {
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: active ? "#2B7FFF" : "transparent",
                      color: active ? "white" : "#6B6B75",
                      border: active
                        ? "1px solid transparent"
                        : "1px solid #2A2A2E",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sponsored shelf strip (non-Rx, no active search) ──────────── */}
        {sponsoredEnabled &&
          sponsoredItems &&
          (sponsoredItems as any[]).length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p
                  className="text-xs font-semibold tracking-widest uppercase"
                  style={{ color: "#4B4B55" }}
                >
                  Featured
                </p>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(43,127,255,0.10)",
                    color: "#2B7FFF",
                  }}
                >
                  Sponsored
                </span>
              </div>
              <div
                className="flex gap-2.5 overflow-x-auto pb-2"
                style={{ scrollbarWidth: "none" }}
              >
                {(sponsoredItems as any[]).map((item: any) => (
                  <div
                    key={item.skuId}
                    className="flex-shrink-0 w-36 rounded-xl overflow-hidden"
                    style={{
                      background: "#141416",
                      border: "1px solid rgba(43,127,255,0.15)",
                    }}
                  >
                    <div
                      className="relative"
                      style={{ aspectRatio: "4/3", background: "#141416" }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <ProductPlaceholder
                          category={item.category ?? "wellness"}
                        />
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <span
                          className="text-[9px] px-1 py-0.5 rounded"
                          style={{
                            background: "rgba(43,127,255,0.85)",
                            color: "white",
                          }}
                        >
                          Ad
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <p
                        className="text-xs font-semibold line-clamp-2 mb-1"
                        style={{ color: "#F0F0F2" }}
                      >
                        {item.name}
                      </p>
                      <p
                        className="text-xs font-semibold"
                        style={{ color: "#2B7FFF" }}
                      >
                        ₹{Number(item.sellingPrice).toFixed(0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        {/* ── Results count ──────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-1">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "#4B4B55" }}
          >
            {allItems.length > 0
              ? `${allItems.length}${hasMore ? "+" : ""} items`
              : isFetching
                ? "Loading…"
                : ""}
          </p>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="px-4 pb-28">
          {/* Loading skeleton while first page fetches */}
          {isFetching && allItems.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden animate-pulse"
                  style={{ background: "#141416", border: "1px solid #2A2A2E" }}
                >
                  <div style={{ aspectRatio: "4/3", background: "#1C1C1F" }} />
                  <div className="p-3 space-y-2">
                    <div
                      className="h-3 rounded"
                      style={{ background: "#1C1C1F", width: "80%" }}
                    />
                    <div
                      className="h-2.5 rounded"
                      style={{ background: "#1C1C1F", width: "60%" }}
                    />
                    <div
                      className="h-7 rounded-lg mt-3"
                      style={{ background: "#1C1C1F" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : allItems.length === 0 && !isFetching ? (
            /* True empty catalog state */
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "#141416", border: "1px solid #2A2A2E" }}
              >
                <Search
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: "#4B4B55" }}
                />
              </div>
              <div>
                <p
                  className="text-sm font-semibold mb-1"
                  style={{ color: "#F0F0F2" }}
                >
                  {search ? `No results for "${search}"` : "No items found"}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "#6B6B75", maxWidth: "18rem" }}
                >
                  {search
                    ? "Try the generic name, molecule, or a different spelling"
                    : "No items available in this category right now"}
                </p>
              </div>
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "#2B7FFF" }}
                >
                  Clear search
                </button>
              )}
              {!search && (
                <button
                  onClick={() => navigate("/rx-upload")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "#2B7FFF", color: "white" }}
                >
                  <FileText size={13} strokeWidth={1.75} />
                  Upload a prescription
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {allItems.map((item: any) => (
                <ProductCard
                  key={item.skuId}
                  item={item}
                  cartQty={getCartQty(item.skuId)}
                  onAdd={() => handleAdd(item)}
                  onRemove={() => handleRemove(item)}
                  onDetail={() => setSelectedSku(item)}
                  onConsult={
                    item.requiresPrescription
                      ? () => navigate("/doctor-consult")
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div
            ref={loadMoreRef}
            className="h-12 flex items-center justify-center mt-4"
          >
            {isFetching && allItems.length > 0 && (
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: "#4B4B55" }}
              >
                <div
                  className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{
                    borderColor: "#2B7FFF",
                    borderTopColor: "transparent",
                  }}
                />
                Loading more…
              </div>
            )}
            {!hasMore && allItems.length > 0 && (
              <p className="text-xs" style={{ color: "#4B4B55" }}>
                All {allItems.length} items loaded
              </p>
            )}
          </div>
        </div>

        {/* ── Cart bar ───────────────────────────────────────────────────── */}
        {cartTotal > 0 && (
          <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
            <div className="max-w-lg mx-auto">
              <button
                onClick={() => navigate("/cart")}
                className="bottom-action-bar w-full flex items-center justify-between px-5 py-4 font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ color: "white" }}
              >
                <span style={{ opacity: 0.85, fontSize: "0.8125rem" }}>
                  {cartTotal} {cartTotal === 1 ? "item" : "items"}
                </span>
                <span>Review order →</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {/* ── Product detail modal ─────────────────────────────────────── */}
      {selectedSku && (
        <ProductDetailModal
          item={selectedSku}
          cartQty={getCartQty(selectedSku.skuId)}
          onAdd={() => handleAdd(selectedSku)}
          onRemove={() => handleRemove(selectedSku)}
          onClose={() => setSelectedSku(null)}
        />
      )}
    </AppLayout>
  );
}
