import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "all",       label: "All" },
  { key: "medicine",  label: "Medicines" },
  { key: "devices",   label: "Devices" },
  { key: "nutrition", label: "Nutrition" },
  { key: "fmcg",      label: "General" },
  { key: "baby",      label: "Baby" },
  { key: "wellness",  label: "Wellness" },
];

// ─── Category placeholder colors (light, clinical) ───────────────────────────
const CATEGORY_BG: Record<string, string> = {
  medicine:  "oklch(0.965 0.020 255)",
  devices:   "oklch(0.965 0.015 200)",
  baby:      "oklch(0.970 0.020 340)",
  nutrition: "oklch(0.970 0.025 145)",
  fmcg:      "oklch(0.970 0.025 55)",
  wellness:  "oklch(0.970 0.020 290)",
};
const CATEGORY_TEXT: Record<string, string> = {
  medicine:  "oklch(0.545 0.195 255)",
  devices:   "oklch(0.500 0.160 200)",
  baby:      "oklch(0.550 0.180 340)",
  nutrition: "oklch(0.500 0.150 145)",
  fmcg:      "oklch(0.580 0.150 55)",
  wellness:  "oklch(0.530 0.160 290)",
};

// ─── Product Placeholder ──────────────────────────────────────────────────────
function ProductPlaceholder({ name, category, schedule }: {
  name: string; category: string; schedule: string;
}) {
  const bg = CATEGORY_BG[category] ?? CATEGORY_BG.medicine;
  const color = CATEGORY_TEXT[category] ?? CATEGORY_TEXT.medicine;
  const initials = name.split(/[\s\-\/]+/).slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
  const isRx = schedule === "H" || schedule === "H1" || schedule === "X";
  return (
    <div className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: bg }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold mb-1.5"
        style={{ background: "white", color }}>
        {initials}
      </div>
      {isRx && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "oklch(0.97 0.015 25)", color: "oklch(0.550 0.180 25)" }}>
          Rx
        </span>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ item, cartQty, onAdd, onRemove }: {
  item: any; cartQty: number;
  onAdd: () => void; onRemove: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isOutOfStock = available <= 0;
  const isRx = item.requiresPrescription;
  const etaMins = item.etaMins ?? null;

  return (
    <div className="bg-white rounded-xl overflow-hidden card-shadow transition-all hover:shadow-md"
      style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
      {/* Image area */}
      <div className="relative aspect-square overflow-hidden"
        style={{ background: "oklch(0.965 0.004 255)" }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <ProductPlaceholder
            name={item.name}
            category={item.category ?? "medicine"}
            schedule={item.schedule} />
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.75)" }}>
            <span className="text-xs font-medium" style={{ color: "oklch(0.520 0.018 255)" }}>
              Not available
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {/* Rx / OTC indicator */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {isRx ? (
            <span className="badge-rx">Rx</span>
          ) : (
            <span className="badge-otc">OTC</span>
          )}
          {item.isChronicMedication && (
            <span className="badge-chronic">Chronic</span>
          )}
        </div>

        {/* Name */}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-0.5"
          style={{ color: "oklch(0.175 0.012 255)" }}>
          {item.name}
        </h3>

        {/* Dosage / form */}
        {(item.displayLabel || item.packSize) && (
          <p className="text-xs mb-1" style={{ color: "oklch(0.520 0.018 255)" }}>
            {item.displayLabel || item.packSize}
          </p>
        )}

        {/* Company */}
        {item.companyName && (
          <p className="text-xs truncate mb-2" style={{ color: "oklch(0.650 0.012 255)" }}>
            {item.companyName}
          </p>
        )}

        {/* Availability + ETA */}
        <div className="flex items-center justify-between mb-2.5">
          {!isOutOfStock ? (
            <span className="text-xs font-medium" style={{ color: "oklch(0.600 0.160 145)" }}>
              Available
            </span>
          ) : (
            <span className="text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
              Not available
            </span>
          )}
          {!isOutOfStock && etaMins && (
            <span className="eta-chip">~{etaMins} min</span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-base font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
            ₹{Number(item.sellingPrice).toFixed(0)}
          </span>
          {Number(item.mrp) > Number(item.sellingPrice) && (
            <span className="text-xs line-through" style={{ color: "oklch(0.650 0.012 255)" }}>
              ₹{Number(item.mrp).toFixed(0)}
            </span>
          )}
        </div>

        {/* Add / qty control */}
        {!isOutOfStock && (
          cartQty === 0 ? (
            <button onClick={onAdd}
              className="w-full py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "oklch(0.545 0.195 255)", color: "white" }}>
              Add
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-xl px-3 py-1.5"
              style={{ background: "oklch(0.965 0.020 255)", border: "1px solid oklch(0.900 0.040 255)" }}>
              <button onClick={onRemove} className="transition-opacity hover:opacity-60"
                style={{ color: "oklch(0.545 0.195 255)" }}>
                <Minus size={14} />
              </button>
              <span className="text-sm font-semibold" style={{ color: "oklch(0.545 0.195 255)" }}>
                {cartQty}
              </span>
              <button onClick={onAdd} disabled={cartQty >= available}
                className="transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ color: "oklch(0.545 0.195 255)" }}>
                <Plus size={14} />
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Catalog Page ────────────────────────────────────────────────────────
const LIMIT = 60;

export default function Catalog() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<any>(null);

  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const { data: items, isFetching } = trpc.catalog.list.useQuery(
    { search: debouncedSearch, category, limit: LIMIT, offset },
    { enabled: isAuthenticated }
  );
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();
  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => utils.cart.get.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const getCartQty = (skuId: number) => cartItems?.find((i: any) => i.skuId === skuId)?.quantity ?? 0;
  const cartTotal = cartItems?.reduce((s: number, i: any) => s + i.quantity, 0) ?? 0;

  useEffect(() => {
    setOffset(0);
    setAllItems([]);
    setHasMore(true);
  }, [debouncedSearch, category]);

  useEffect(() => {
    if (!items) return;
    if (offset === 0) {
      setAllItems(items);
    } else {
      setAllItems(prev => {
        const ids = new Set(prev.map((i: any) => i.skuId));
        return [...prev, ...items.filter((i: any) => !ids.has(i.skuId))];
      });
    }
    setHasMore(items.length === LIMIT);
  }, [items, offset]);

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting && hasMore && !isFetching) {
      setOffset(prev => prev + LIMIT);
    }
  }, [hasMore, isFetching]);

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
    if (current >= available) { toast.error("Maximum available quantity reached"); return; }
    upsertCart.mutate({ skuId: item.skuId, productId: item.productId, variantId: item.variantId ?? undefined, quantity: current + 1 });
  };

  const handleRemove = (item: any) => {
    const current = getCartQty(item.skuId);
    if (current <= 0) return;
    upsertCart.mutate({ skuId: item.skuId, productId: item.productId, variantId: item.variantId ?? undefined, quantity: current - 1 });
  };

  return (
    <AppLayout>
      <div className="min-h-screen" style={{ background: "oklch(0.990 0.000 0)" }}>
        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-white" style={{ borderBottom: "1px solid oklch(0.910 0.008 255)" }}>
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Pharmacy + ETA */}
            {store && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
                  {store.name}
                </span>
                {(store as any).etaMins && (
                  <>
                    <span style={{ color: "oklch(0.800 0.008 255)" }}>·</span>
                    <span className="text-xs" style={{ color: "oklch(0.545 0.195 255)" }}>
                      Arriving in ~{(store as any).etaMins} min
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "oklch(0.650 0.012 255)" }} />
              <input
                type="text"
                placeholder="Search by name, dosage, or generic…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none transition-colors"
                style={{
                  background: "oklch(0.965 0.004 255)",
                  border: "1px solid oklch(0.910 0.008 255)",
                  color: "oklch(0.175 0.012 255)",
                }}
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
                  style={{ color: "oklch(0.520 0.018 255)" }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {CATEGORIES.map(cat => {
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: active ? "oklch(0.545 0.195 255)" : "transparent",
                      color: active ? "white" : "oklch(0.520 0.018 255)",
                      border: active ? "1px solid transparent" : "1px solid oklch(0.910 0.008 255)",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-1">
          <p className="section-label">
            {allItems.length > 0
              ? `${allItems.length}${hasMore ? "+" : ""} medications`
              : isFetching ? "Loading…" : ""}
          </p>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="px-4 pb-28">
          {allItems.length === 0 && !isFetching ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "oklch(0.965 0.004 255)" }}>
                <Search size={20} strokeWidth={1.5} style={{ color: "oklch(0.520 0.018 255)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {search ? `No results for "${search}"` : "No medications found"}
                </p>
                <p className="text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
                  {search
                    ? "Try a different name, dosage, or generic"
                    : "No medications available in this category"}
                </p>
              </div>
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "oklch(0.545 0.195 255)" }}>
                  Clear search
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
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="h-12 flex items-center justify-center mt-4">
            {isFetching && allItems.length > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
                <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "oklch(0.545 0.195 255)", borderTopColor: "transparent" }} />
                Loading more…
              </div>
            )}
            {!hasMore && allItems.length > 0 && (
              <p className="text-xs" style={{ color: "oklch(0.650 0.012 255)" }}>
                All {allItems.length} medications loaded
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
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
              >
                <span style={{ opacity: 0.8, fontSize: "0.8125rem" }}>
                  {cartTotal} {cartTotal === 1 ? "item" : "items"}
                </span>
                <span>Review order →</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
