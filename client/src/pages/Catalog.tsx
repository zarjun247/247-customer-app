import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, Plus, Minus, AlertCircle, X, Pill, Baby, Cpu, Leaf, ShoppingBag, Sparkles } from "lucide-react";
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

const SCHEDULE_BADGE: Record<string, { label: string; cls: string }> = {
  H:   { label: "Rx · Sch H",  cls: "badge-rx" },
  H1:  { label: "H1 · Controlled", cls: "badge-rx" },
  X:   { label: "Rx · Sch X",  cls: "badge-rx" },
  OTC: { label: "OTC",         cls: "badge-otc" },
};

const CATEGORY_ACCENT: Record<string, string> = {
  medicine:  "#2dd4bf",
  devices:   "#60a5fa",
  baby:      "#f9a8d4",
  nutrition: "#86efac",
  fmcg:      "#fbbf24",
  wellness:  "#c4b5fd",
};

// ─── SVG Placeholder ─────────────────────────────────────────────────────────
function ProductPlaceholder({ name, category, schedule, packSize, companyName }: {
  name: string; category: string; schedule: string;
  packSize: string | null; companyName: string | null;
}) {
  const accent = CATEGORY_ACCENT[category] ?? "#2dd4bf";
  const initials = name.split(/[\s\-\/]+/).slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
  const badge = schedule === "H1" ? "H1" : schedule === "H" ? "Rx" : schedule === "X" ? "Rx X" : "OTC";

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f1923 0%, #1a2535 100%)" }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
        backgroundSize: "40px 40px"
      }} />
      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-semibold"
        style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}30` }}>
        {badge}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-1.5 px-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: `${accent}15`, border: `1.5px solid ${accent}30`, color: accent }}>
          {initials}
        </div>
        <p className="text-[10px] font-medium text-slate-200 text-center leading-tight max-w-[90px] line-clamp-2">
          {name}
        </p>
        {packSize && <p className="text-[9px] font-medium" style={{ color: accent }}>{packSize}</p>}
        {companyName && <p className="text-[8px] text-slate-500 text-center max-w-[80px] truncate">{companyName}</p>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-5 flex items-center justify-center"
        style={{ background: `${accent}08` }}>
        <span className="text-[7px] font-medium tracking-widest" style={{ color: `${accent}70` }}>
          24/7 PHARMACY
        </span>
      </div>
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
  const discount = Number(item.mrp) > Number(item.sellingPrice)
    ? Math.round(((Number(item.mrp) - Number(item.sellingPrice)) / Number(item.mrp)) * 100)
    : 0;
  const scheduleCfg = SCHEDULE_BADGE[item.schedule] ?? SCHEDULE_BADGE.OTC;

  return (
    <div className={`group flex flex-col bg-card border rounded-xl overflow-hidden transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${isOutOfStock ? "opacity-55" : "border-border"}`}>
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-[#0f1923]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <ProductPlaceholder
            name={item.name} category={item.category ?? "medicine"}
            schedule={item.schedule} packSize={item.packSize} companyName={item.companyName} />
        )}
        {item.requiresPrescription && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">Rx</div>
        )}
        {discount > 0 && !isOutOfStock && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30">{discount}% off</div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <h3 className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</h3>
        {item.packSize && <p className="text-[10px] text-primary/80 font-medium">{item.packSize}</p>}
        {item.companyName && <p className="text-[10px] text-muted-foreground truncate">{item.companyName}</p>}

        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          <span className={scheduleCfg.cls} style={{ fontSize: "9px" }}>{scheduleCfg.label}</span>
          {item.isChronicMedication && <span className="badge-chronic" style={{ fontSize: "9px" }}>Chronic</span>}
        </div>

        <div className="flex items-baseline gap-1.5 mt-auto pt-1">
          <span className="text-sm font-bold text-foreground">₹{Number(item.sellingPrice).toFixed(0)}</span>
          {discount > 0 && <span className="text-[10px] text-muted-foreground line-through">₹{Number(item.mrp).toFixed(0)}</span>}
        </div>

        {!isOutOfStock && (
          <div className="mt-1.5">
            {cartQty === 0 ? (
              <button onClick={onAdd}
                className="w-full py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
                Add
              </button>
            ) : (
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-2 py-1">
                <button onClick={onRemove} className="text-primary hover:text-primary/80 p-0.5"><Minus size={12} /></button>
                <span className="text-xs font-bold text-primary">{cartQty}</span>
                <button onClick={onAdd} disabled={cartQty >= available} className="text-primary hover:text-primary/80 p-0.5 disabled:opacity-40"><Plus size={12} /></button>
              </div>
            )}
          </div>
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

  // Reset on search/category change
  useEffect(() => {
    setOffset(0);
    setAllItems([]);
    setHasMore(true);
  }, [debouncedSearch, category]);

  // Accumulate items
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

  // Infinite scroll
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
    if (current >= available) { toast.error("Maximum available stock reached"); return; }
    upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: current + 1 });
  };

  const handleRemove = (item: any) => {
    const current = getCartQty(item.skuId);
    if (current <= 0) return;
    upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: current - 1 });
  };

  return (
    <AppLayout>
      <div className="min-h-screen">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50">
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Pharmacy info */}
            {store && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  Fulfilled by <span className="text-primary font-medium">{store.name}</span>
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs text-muted-foreground">SLA {store.slaMins} min</span>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by brand, generic, or product name…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="w-full bg-card border border-border rounded-lg pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 transition-colors"
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                    category === cat.key
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-transparent text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="px-4 pt-3 pb-1">
          <p className="section-label">
            {allItems.length > 0
              ? `${allItems.length}${hasMore ? "+" : ""} products`
              : isFetching ? "Loading…" : ""}
          </p>
        </div>

        {/* Grid */}
        <div className="px-4 pb-28">
          {allItems.length === 0 && !isFetching ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center">
                <Search size={20} className="text-muted-foreground opacity-50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {search ? `No results for "${search}"` : "No products found"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search
                    ? "Try a different name, generic, or brand"
                    : "No products available in this category at your local pharmacy"}
                </p>
              </div>
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="text-xs text-primary hover:text-primary/80 underline underline-offset-2">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <div className="w-3 h-3 border border-primary/40 border-t-primary rounded-full animate-spin" />
                Loading more…
              </div>
            )}
            {!hasMore && allItems.length > 0 && (
              <p className="text-muted-foreground/40 text-xs">All {allItems.length} products loaded</p>
            )}
          </div>
        </div>

        {/* Cart bar */}
        {cartTotal > 0 && (
          <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
            <div className="max-w-lg mx-auto">
              <button
                onClick={() => navigate("/cart")}
                className="w-full flex items-center justify-between bg-primary text-primary-foreground px-5 py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                <span className="text-primary-foreground/80 text-xs">
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
