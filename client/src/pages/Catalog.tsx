import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, Plus, Minus, X, Pill, Stethoscope, Baby, Leaf, ShoppingBag, Sparkles, ShieldCheck, FileText, MapPin, AlertCircle, RefreshCw, Clock, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { TRPCClientError } from "@trpc/client";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";

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
  medicine:  { icon: Pill,        bg: "rgba(43,127,255,0.10)",  color: "#2B7FFF" },
  devices:   { icon: Stethoscope, bg: "rgba(0,200,150,0.10)",   color: "#00C896" },
  baby:      { icon: Baby,        bg: "rgba(244,63,94,0.10)",   color: "#F43F5E" },
  nutrition: { icon: Leaf,        bg: "rgba(0,200,150,0.10)",   color: "#00C896" },
  fmcg:      { icon: ShoppingBag, bg: "rgba(245,158,11,0.10)",  color: "#F59E0B" },
  wellness:  { icon: Sparkles,    bg: "rgba(43,127,255,0.10)",  color: "#2B7FFF" },
};
const DEFAULT_CONFIG = { icon: Pill, bg: "rgba(43,127,255,0.10)", color: "#2B7FFF" };

// ─── Availability language ────────────────────────────────────────────────────
function getAvailabilityLabel(
  availableQty: number,
  requiresPrescription: boolean,
  schedule: string
): { label: string; color: string } {
  if (availableQty > 0 && !requiresPrescription) {
    return { label: "Available now", color: "#00C896" };
  }
  if (availableQty > 0 && requiresPrescription) {
    return { label: "Prescription review required", color: "#F59E0B" };
  }
  if (availableQty === 0 && (schedule === "H" || schedule === "H1" || schedule === "X")) {
    return { label: "Available on request", color: "#6B6B75" };
  }
    return { label: "Arranging from nearby pharmacy", color: "#6B6B75" };
}

// ─── Product Placeholder ──────────────────────────────────────────────────────
function ProductPlaceholder({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const Icon = cfg.icon;
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "#141416" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: cfg.bg }}>
        <Icon size={18} strokeWidth={1.5} style={{ color: cfg.color }} />
      </div>
    </div>
  );
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────
function ProductDetailModal({ item, cartQty, onAdd, onRemove, onClose }: {
  item: any; cartQty: number;
  onAdd: () => void; onRemove: () => void; onClose: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isRx = item.requiresPrescription;
  const avail = getAvailabilityLabel(available, isRx, item.schedule ?? "");
  const canAdd = available > 0;
  const images = [
    item.imageUrl, item.imageHeroUrl, item.imageSideUrl,
    item.imageRearUrl, item.imageLabelUrl, item.imageNutritionUrl,
  ].filter(Boolean) as string[];
  const [imgIdx, setImgIdx] = useState(0);
  const safeIdx = Math.min(imgIdx, Math.max(0, images.length - 1));
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "#141416", border: "1px solid #2A2A2E", maxHeight: "92dvh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold leading-snug pr-4" style={{ color: "#F0F0F2" }}>{item.name}</h2>
          <button onClick={onClose} className="p-1 rounded-lg transition-opacity hover:opacity-60 shrink-0"
            style={{ color: "#6B6B75" }}><X size={16} /></button>
        </div>
        {images.length > 0 ? (
          <div className="relative mx-4 mb-3 rounded-xl overflow-hidden" style={{ aspectRatio: "4/3", background: "#0A0A0B" }}>
            <img src={images[safeIdx]} alt={`${item.name} view ${safeIdx + 1}`}
              className="w-full h-full object-contain" />
            {images.length > 1 && (
              <>
                <button onClick={() => setImgIdx(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-20"
                  style={{ background: "rgba(14,14,16,0.80)", color: "#F0F0F2" }}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))} disabled={safeIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-20"
                  style={{ background: "rgba(14,14,16,0.80)", color: "#F0F0F2" }}>
                  <ChevronRight size={14} />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ background: i === safeIdx ? "#2B7FFF" : "rgba(255,255,255,0.25)" }} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ aspectRatio: "4/3", background: "#0A0A0B" }}>
            <ProductPlaceholder category={item.category ?? "medicine"} />
          </div>
        )}
        <div className="px-4 pb-5 space-y-3">
          {(item.displayLabel || item.packSize) && (
            <p className="text-sm" style={{ color: "#A0A0A8" }}>{item.displayLabel || item.packSize}</p>
          )}
          {item.companyName && (
            <p className="text-xs" style={{ color: "#6B6B75" }}>{item.companyName}</p>
          )}
          {isRx && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg w-fit"
              style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <ShieldCheck size={12} strokeWidth={2} style={{ color: "#F59E0B" }} />
              <span className="text-xs font-semibold" style={{ color: "#F59E0B" }}>Prescription required</span>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold" style={{ color: "#F0F0F2" }}>₹{Number(item.sellingPrice).toFixed(0)}</span>
            {Number(item.mrp) > Number(item.sellingPrice) && (
              <span className="text-sm line-through" style={{ color: "#4B4B55" }}>₹{Number(item.mrp).toFixed(0)}</span>
            )}
            {item.gstRate && (
              <span className="text-xs ml-auto" style={{ color: "#4B4B55" }}>incl. {item.gstRate}% GST</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: avail.color }} />
            <span className="text-xs font-medium" style={{ color: avail.color }}>{avail.label}</span>
          </div>
          {canAdd && (
            cartQty === 0 ? (
              <button onClick={onAdd}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: "#2B7FFF", color: "white" }}>
                Add to order
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: "rgba(43,127,255,0.12)", border: "1px solid rgba(43,127,255,0.25)" }}>
                <button onClick={onRemove} className="transition-opacity hover:opacity-60" style={{ color: "#2B7FFF" }}>
                  <Minus size={16} />
                </button>
                <span className="text-sm font-semibold" style={{ color: "#2B7FFF" }}>{cartQty} in order</span>
                <button onClick={onAdd} disabled={cartQty >= available}
                  className="transition-opacity hover:opacity-60 disabled:opacity-30" style={{ color: "#2B7FFF" }}>
                  <Plus size={16} />
                </button>
              </div>
            )
          )}
          {item.genericName && (
            <div className="flex items-start gap-2 p-3 rounded-lg"
              style={{ background: "#0A0A0B", border: "1px solid #1C1C1F" }}>
              <Info size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" style={{ color: "#4B4B55" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
                Generic name: <span style={{ color: "#A0A0A8" }}>{item.genericName}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ item, cartQty, onAdd, onRemove, onDetail }: {
  item: any; cartQty: number;
  onAdd: () => void; onRemove: () => void; onDetail: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isRx = item.requiresPrescription;
  const etaMins = item.etaMins ?? null;
  const etaText = item.etaText ?? (etaMins ? `~${etaMins} min` : null);
  const avail = getAvailabilityLabel(available, isRx, item.schedule ?? "");
  const canAdd = available > 0;

  return (
    <div className="flex flex-col rounded-xl overflow-hidden transition-all hover:opacity-90"
      style={{ background: "#141416", border: "1px solid #2A2A2E" }}
      onClick={onDetail}>

      {/* ── Visual zone ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "4/3", background: "#141416" }}>
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
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{ background: "rgba(14,14,16,0.92)", border: "1px solid rgba(245,158,11,0.40)" }}>
              <ShieldCheck size={10} strokeWidth={2} style={{ color: "#F59E0B" }} />
              <span className="text-[10px] font-semibold"
                style={{ color: "#F59E0B" }}>
                Prescription required
              </span>
            </div>
          </div>
        )}

        {/* Out-of-stock overlay */}
        {!canAdd && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(10,10,11,0.60)" }}>
            <span className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{ color: "#A0A0A8", background: "#1C1C1F", border: "1px solid #2A2A2E" }}>
              {avail.label}
            </span>
          </div>
        )}
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <div className="p-3">
        {/* Name */}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-0.5"
          style={{ color: "#F0F0F2" }}>
          {item.name}
        </h3>

        {/* Dosage / form */}
        {(item.displayLabel || item.packSize) && (
          <p className="text-xs mb-0.5 leading-snug" style={{ color: "#6B6B75" }}>
            {item.displayLabel || item.packSize}
          </p>
        )}

        {/* Manufacturer */}
        {item.companyName && (
          <p className="text-[10px] truncate mb-2.5 leading-snug" style={{ color: "#4B4B55" }}>
            {item.companyName}
          </p>
        )}

        {/* Availability */}
        {canAdd && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium" style={{ color: avail.color }}>
              {avail.label}
            </span>
            {etaText && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: "rgba(43,127,255,0.12)", color: "#2B7FFF" }}>
                {etaText}
              </span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
            ₹{Number(item.sellingPrice).toFixed(0)}
          </span>
          {Number(item.mrp) > Number(item.sellingPrice) && (
            <span className="text-[10px] line-through" style={{ color: "#4B4B55" }}>
              ₹{Number(item.mrp).toFixed(0)}
            </span>
          )}
        </div>

        {/* Add / qty control */}
        {canAdd && (
          cartQty === 0 ? (
            <button onClick={e => { e.stopPropagation(); onAdd(); }}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: "#2B7FFF", color: "white" }}>
              Add
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-lg px-3 py-1.5"
              style={{ background: "rgba(43,127,255,0.12)", border: "1px solid rgba(43,127,255,0.25)" }}>
              <button onClick={e => { e.stopPropagation(); onRemove(); }} className="transition-opacity hover:opacity-60"
                style={{ color: "#2B7FFF" }}>
                <Minus size={13} />
              </button>
              <span className="text-xs font-semibold" style={{ color: "#2B7FFF" }}>
                {cartQty}
              </span>
              <button onClick={e => { e.stopPropagation(); onAdd(); }} disabled={cartQty >= available}
                className="transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ color: "#2B7FFF" }}>
                <Plus size={13} />
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

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
    if (q) { setSearch(q); setDebouncedSearch(q); }
  }, []);

  // Only fire queries once onboarding is confirmed complete
  const { data: store, error: storeError } = trpc.catalog.store.useQuery(
    undefined,
    { enabled: isAuthenticated && isReady, retry: false }
  );
  const { data: items, isFetching, error: catalogError } = trpc.catalog.list.useQuery(
    { search: debouncedSearch, category, limit: LIMIT, offset },
    { enabled: isAuthenticated && isReady, retry: false }
  );
  // Sponsored shelf — only for non-Rx categories when no search is active
  const sponsoredEnabled = isAuthenticated && isReady && !debouncedSearch &&
    ["all", "wellness", "nutrition", "devices", "fmcg"].includes(category);
  const { data: sponsoredItems } = trpc.catalog.sponsored.useQuery(
    undefined,
    { enabled: sponsoredEnabled }
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

  // ── Loading: auth/profile not yet resolved ──────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
            <p className="text-xs" style={{ color: "#4B4B55" }}>Loading your pharmacy…</p>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Onboarding required (safety net if guard fires after render) ──────────────────────
  if (isOnboardingRequired(catalogError) || isOnboardingRequired(storeError)) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0A0A0B" }}>
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(43,127,255,0.10)", border: "1px solid rgba(43,127,255,0.20)" }}>
              <MapPin size={22} strokeWidth={1.5} style={{ color: "#2B7FFF" }} />
            </div>
            <div>
              <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
                Complete your setup
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Complete your address and pharmacy setup to view available medications.
              </p>
            </div>
            <button
              onClick={() => navigate("/onboarding")}
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#2B7FFF", color: "white" }}>
              Set up my pharmacy
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }
  // ── Store closed / service unavailable ──────────────────────────────────────────────────
  if (isReady && store && (store as any).openNow === false && !isFetching && allItems.length === 0) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0A0A0B" }}>
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)" }}>
              <Clock size={22} strokeWidth={1.5} style={{ color: "#F59E0B" }} />
            </div>
            <div>
              <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
                {store.name} is currently closed
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                {(store as any).openingHoursText
                  ? `Opens ${(store as any).openingHoursText}. Upload a prescription and we'll prepare your order when we reopen.`
                  : "Your pharmacy is currently closed. Upload a prescription and we'll prepare your order when we reopen."}
              </p>
            </div>
            <button
              onClick={() => navigate("/rx-upload")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#2B7FFF", color: "white" }}>
              <FileText size={14} strokeWidth={1.75} />
              Upload prescription for later
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
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0A0A0B" }}>
          <div className="flex flex-col items-center text-center gap-5 max-w-xs">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)" }}>
              <AlertCircle size={22} strokeWidth={1.5} style={{ color: "#F59E0B" }} />
            </div>
            <div>
              <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
                Unable to load catalog
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                There was a problem connecting to your pharmacy. Please try again.
              </p>
            </div>
            <button
              onClick={() => utils.catalog.list.invalidate()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#141416", color: "#F0F0F2", border: "1px solid #2A2A2E" }}>
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
      <div className="min-h-screen" style={{ background: "#0A0A0B" }}>
        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20" style={{ background: "#0A0A0B", borderBottom: "1px solid #1C1C1F" }}>
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Pharmacy + ETA banner */}
            {store && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: (store as any).openNow ? "#00C896" : "#FF6B6B" }}
                  />
                  <span className="text-xs font-medium truncate" style={{ color: "#F0F0F2" }}>
                    {store.name}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: (store as any).openNow ? "#00C896" : "#FF6B6B" }}>
                    {(store as any).openNow ? "Open" : "Closed"}
                  </span>
                  {(store as any).openingHoursText && (
                    <span className="text-xs flex-shrink-0" style={{ color: "#4B4B55" }}>
                      · {(store as any).openingHoursText}
                    </span>
                  )}
                </div>
                {((store as any).etaText || (store as any).etaMins) && (
                  <span className="text-xs flex-shrink-0 ml-2 px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(43,127,255,0.10)", color: "#2B7FFF" }}>
                    {(store as any).etaText ?? `~${(store as any).etaMins} min`}
                  </span>
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
                  background: "#141416",
                  border: "1px solid #2A2A2E",
                  color: "#F0F0F2",
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
                      background: active ? "#2B7FFF" : "transparent",
                      color: active ? "white" : "#6B6B75",
                      border: active ? "1px solid transparent" : "1px solid #2A2A2E",
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
        {sponsoredEnabled && sponsoredItems && (sponsoredItems as any[]).length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#4B4B55" }}>Featured</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "rgba(43,127,255,0.10)", color: "#2B7FFF" }}>Sponsored</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {(sponsoredItems as any[]).map((item: any) => (
                <div key={item.skuId} className="flex-shrink-0 w-36 rounded-xl overflow-hidden"
                  style={{ background: "#141416", border: "1px solid rgba(43,127,255,0.15)" }}>
                  <div className="relative" style={{ aspectRatio: "4/3", background: "#141416" }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <ProductPlaceholder category={item.category ?? "wellness"} />
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      <span className="text-[9px] px-1 py-0.5 rounded"
                        style={{ background: "rgba(43,127,255,0.85)", color: "white" }}>Ad</span>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold line-clamp-2 mb-1" style={{ color: "#F0F0F2" }}>{item.name}</p>
                    <p className="text-xs font-semibold" style={{ color: "#2B7FFF" }}>₹{Number(item.sellingPrice).toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── Results count ──────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-1">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#4B4B55" }}>
            {allItems.length > 0
              ? `${allItems.length}${hasMore ? "+" : ""} items`
              : isFetching ? "Loading…" : ""}
          </p>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="px-4 pb-28">
          {/* Loading skeleton while first page fetches */}
          {isFetching && allItems.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden animate-pulse"
                  style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
                  <div style={{ aspectRatio: "4/3", background: "#1C1C1F" }} />
                  <div className="p-3 space-y-2">
                    <div className="h-3 rounded" style={{ background: "#1C1C1F", width: "80%" }} />
                    <div className="h-2.5 rounded" style={{ background: "#1C1C1F", width: "60%" }} />
                    <div className="h-7 rounded-lg mt-3" style={{ background: "#1C1C1F" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : allItems.length === 0 && !isFetching ? (
            /* True empty catalog state */
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
                <Search size={20} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#F0F0F2" }}>
                  {search ? `No results for "${search}"` : "No items found"}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#6B6B75", maxWidth: "18rem" }}>
                  {search
                    ? "Try the generic name, molecule, or a different spelling"
                    : "No items available in this category right now"}
                </p>
              </div>
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "#2B7FFF" }}>
                  Clear search
                </button>
              )}
              {!search && (
                <button
                  onClick={() => navigate("/rx-upload")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "#2B7FFF", color: "white" }}>
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
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="h-12 flex items-center justify-center mt-4">
            {isFetching && allItems.length > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "#4B4B55" }}>
                <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
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
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "#2B7FFF", color: "white" }}
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
