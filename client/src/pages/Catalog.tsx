import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, Plus, Minus, X, Pill, Stethoscope, Baby, Leaf, ShoppingBag, Sparkles, ShieldCheck } from "lucide-react";
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

// ─── Category icon + palette ──────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  medicine:  { icon: Pill,          bg: "#EFF6FF", color: "#1F6FEB" },
  devices:   { icon: Stethoscope,   bg: "#F0FDFA", color: "#0D9488" },
  baby:      { icon: Baby,          bg: "#FFF0F3", color: "#E11D48" },
  nutrition: { icon: Leaf,          bg: "#F0FDF4", color: "#16A34A" },
  fmcg:      { icon: ShoppingBag,   bg: "#FFFBEB", color: "#D97706" },
  wellness:  { icon: Sparkles,      bg: "#EFF6FF", color: "#1F6FEB" },
};
const DEFAULT_CONFIG = { icon: Pill, bg: "#EFF6FF", color: "#1F6FEB" };

// ─── Availability language ────────────────────────────────────────────────────
function getAvailabilityLabel(
  availableQty: number,
  requiresPrescription: boolean,
  schedule: string
): { label: string; color: string } {
  if (availableQty > 0 && !requiresPrescription) {
    return { label: "Available now", color: "#16A34A" };
  }
  if (availableQty > 0 && requiresPrescription) {
    return { label: "Prescription review required", color: "#D97706" };
  }
  if (availableQty === 0 && (schedule === "H" || schedule === "H1" || schedule === "X")) {
    return { label: "Available on request", color: "#667085" };
  }
  return { label: "Arranging from nearby pharmacy", color: "#667085" };
}

// ─── Product Placeholder ──────────────────────────────────────────────────────
function ProductPlaceholder({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const Icon = cfg.icon;
  return (
    <div className="w-full h-full flex items-center justify-center"
      style={{ background: cfg.bg }}>
      <Icon size={28} strokeWidth={1.5} style={{ color: cfg.color, opacity: 0.7 }} />
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ item, cartQty, onAdd, onRemove }: {
  item: any; cartQty: number;
  onAdd: () => void; onRemove: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isRx = item.requiresPrescription;
  const etaMins = item.etaMins ?? null;
  const avail = getAvailabilityLabel(available, isRx, item.schedule ?? "");
  const canAdd = available > 0;

  return (
    <div className="bg-white rounded-xl overflow-hidden transition-all hover:shadow-md"
      style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>

      {/* ── Visual zone ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "4/3", background: "#F8FAFB" }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <ProductPlaceholder category={item.category ?? "medicine"} />
        )}

        {/* Rx treatment — prominent, not tiny */}
        {isRx && (
          <div className="absolute top-2 left-2">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md"
              style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #E5E7EB" }}>
              <ShieldCheck size={10} strokeWidth={1.75} style={{ color: "#D97706" }} />
              <span className="text-[9px] font-semibold tracking-wide uppercase"
                style={{ color: "#D97706" }}>
                Prescription required
              </span>
            </div>
          </div>
        )}

        {/* Out-of-stock overlay */}
        {!canAdd && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.65)" }}>
            <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-white"
              style={{ color: "#667085", border: "1px solid #E5E7EB" }}>
              {avail.label}
            </span>
          </div>
        )}
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <div className="p-3">
        {/* Name */}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-0.5"
          style={{ color: "#111827" }}>
          {item.name}
        </h3>

        {/* Dosage / form */}
        {(item.displayLabel || item.packSize) && (
          <p className="text-xs mb-0.5 leading-snug" style={{ color: "#667085" }}>
            {item.displayLabel || item.packSize}
          </p>
        )}

        {/* Manufacturer */}
        {item.companyName && (
          <p className="text-[10px] truncate mb-2.5 leading-snug" style={{ color: "#9CA3AF" }}>
            {item.companyName}
          </p>
        )}

        {/* Availability */}
        {canAdd && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium" style={{ color: avail.color }}>
              {avail.label}
            </span>
            {etaMins && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: "#EFF6FF", color: "#1F6FEB" }}>
                ~{etaMins} min
              </span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-sm font-semibold" style={{ color: "#111827" }}>
            ₹{Number(item.sellingPrice).toFixed(0)}
          </span>
          {Number(item.mrp) > Number(item.sellingPrice) && (
            <span className="text-[10px] line-through" style={{ color: "#9CA3AF" }}>
              ₹{Number(item.mrp).toFixed(0)}
            </span>
          )}
        </div>

        {/* Add / qty control */}
        {canAdd && (
          cartQty === 0 ? (
            <button onClick={onAdd}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: "#1F6FEB", color: "white" }}>
              Add
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-lg px-3 py-1.5"
              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <button onClick={onRemove} className="transition-opacity hover:opacity-60"
                style={{ color: "#1F6FEB" }}>
                <Minus size={13} />
              </button>
              <span className="text-xs font-semibold" style={{ color: "#1F6FEB" }}>
                {cartQty}
              </span>
              <button onClick={onAdd} disabled={cartQty >= available}
                className="transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ color: "#1F6FEB" }}>
                <Plus size={13} />
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

  // Read ?search= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("search");
    if (q) { setSearch(q); setDebouncedSearch(q); }
  }, []);

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

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !isFetching) {
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
      <div className="min-h-screen" style={{ background: "#F8FAFB" }}>
        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-white" style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Pharmacy + ETA */}
            {store && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
                <span className="text-xs" style={{ color: "#667085" }}>
                  {store.name}
                </span>
                {(store as any).etaMins && (
                  <>
                    <span style={{ color: "#D1D5DB" }}>·</span>
                    <span className="text-xs font-medium" style={{ color: "#1F6FEB" }}>
                      Arriving in ~{(store as any).etaMins} min
                    </span>
                  </>
                )}
              </div>
            )}
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "#9CA3AF" }} />
              <input
                type="text"
                placeholder="Search by name, dosage, or generic…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none transition-colors"
                style={{
                  background: "#F8FAFB",
                  border: "1px solid #E5E7EB",
                  color: "#111827",
                }}
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
                  style={{ color: "#9CA3AF" }}>
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
                      background: active ? "#1F6FEB" : "transparent",
                      color: active ? "white" : "#667085",
                      border: active ? "1px solid transparent" : "1px solid #E5E7EB",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Results count ──────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-1">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#9CA3AF" }}>
            {allItems.length > 0
              ? `${allItems.length}${hasMore ? "+" : ""} items`
              : isFetching ? "Loading…" : ""}
          </p>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="px-4 pb-28">
          {allItems.length === 0 && !isFetching ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "#F8FAFB", border: "1px solid #E5E7EB" }}>
                <Search size={20} strokeWidth={1.5} style={{ color: "#9CA3AF" }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#111827" }}>
                  {search ? `No results for "${search}"` : "No items found"}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#667085", maxWidth: "18rem" }}>
                  {search
                    ? "Try the generic name, molecule, or a different spelling"
                    : "No items available in this category right now"}
                </p>
              </div>
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "#1F6FEB" }}>
                  Clear search
                </button>
              )}
              {!search && (
                <button
                  onClick={() => navigate("/rx-upload")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "#1F6FEB", color: "white" }}>
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
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="h-12 flex items-center justify-center mt-4">
            {isFetching && allItems.length > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#1F6FEB", borderTopColor: "transparent" }} />
                Loading more…
              </div>
            )}
            {!hasMore && allItems.length > 0 && (
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
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
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "#1F6FEB", color: "white" }}
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
    </AppLayout>
  );
}
