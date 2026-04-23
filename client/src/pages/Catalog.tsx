import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, Plus, Minus, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function ScheduleBadge({ schedule, requiresRx }: { schedule: string | null; requiresRx: boolean | number }) {
  if (!schedule) return null;
  if (!requiresRx || schedule === "OTC") return <span className="badge-otc">OTC</span>;
  if (schedule === "H1") return <span className="badge-rx">H1 · Controlled</span>;
  return <span className="badge-rx">Rx · Sch {schedule}</span>;
}

export default function Catalog() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const { data: catalog, isLoading } = trpc.catalog.list.useQuery(
    { search: debouncedSearch },
    { enabled: isAuthenticated }
  );
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();

  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => utils.cart.get.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const getCartQty = (skuId: number) => cartItems?.find(i => i.skuId === skuId)?.quantity ?? 0;

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => setDebouncedSearch(val), 350);
  };

  const handleAdd = (skuId: number, productId: number, available: number) => {
    const current = getCartQty(skuId);
    if (current >= available) { toast.error("Maximum available stock reached"); return; }
    upsertCart.mutate({ skuId, productId, quantity: current + 1 });
  };

  const handleRemove = (skuId: number, productId: number) => {
    const current = getCartQty(skuId);
    if (current <= 0) return;
    upsertCart.mutate({ skuId, productId, quantity: current - 1 });
  };

  const cartTotal = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        {/* Node + SLA strip */}
        {store && (
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="section-label mb-0.5">Pharmacy Node</p>
              <p className="text-sm font-medium text-foreground">{store.name}</p>
            </div>
            <div className="text-right">
              <p className="section-label mb-0.5">Committed SLA</p>
              <p className="text-sm font-semibold text-primary">{store.slaMins} min</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-5">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, generic, or brand…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setDebouncedSearch(""); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Catalogue ───────────────────────────────────────────────────── */}
      <div className="px-5 pb-6">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-lg" />
            ))}
          </div>
        ) : catalog && catalog.length > 0 ? (
          <>
            {!debouncedSearch && (
              <p className="section-label mb-3">
                {catalog.length} medicines in stock
              </p>
            )}
            <div className="space-y-2">
              {catalog.map((item) => {
                const available = Number(item.availableQty) || 0;
                const cartQty = getCartQty(item.skuId);
                const outOfStock = available <= 0;
                const discount = Number(item.mrp) > Number(item.sellingPrice)
                  ? Math.round(((Number(item.mrp) - Number(item.sellingPrice)) / Number(item.mrp)) * 100)
                  : 0;

                return (
                  <div
                    key={item.skuId}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-lg bg-card border transition-colors ${
                      outOfStock ? "border-border/40 opacity-60" : "border-border hover:border-border/80"
                    }`}
                  >
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground leading-snug">{item.name}</span>
                      </div>
                      {item.genericName && (
                        <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed truncate">
                          {item.genericName}
                          {item.strength && <span className="text-muted-foreground/60"> · {item.strength}</span>}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <ScheduleBadge schedule={item.schedule} requiresRx={item.requiresPrescription} />
                        {item.isChronicMedication && <span className="badge-chronic">Chronic</span>}
                        {item.packSize && (
                          <span className="text-[10px] text-muted-foreground/70">{item.packSize}</span>
                        )}
                      </div>
                    </div>

                    {/* Price + qty controls */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-foreground">
                          ₹{Number(item.sellingPrice).toFixed(0)}
                        </span>
                        {discount > 0 && (
                          <span className="ml-1.5 text-[10px] text-primary font-medium">{discount}%</span>
                        )}
                      </div>

                      {outOfStock ? (
                        <span className="text-[10px] text-muted-foreground font-medium">Unavailable</span>
                      ) : cartQty === 0 ? (
                        <button
                          onClick={() => handleAdd(item.skuId, item.productId, available)}
                          disabled={upsertCart.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <Plus size={11} />
                          Add
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-muted rounded-md px-1.5 py-1">
                          <button
                            onClick={() => handleRemove(item.skuId, item.productId)}
                            disabled={upsertCart.isPending}
                            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="text-xs font-semibold text-foreground w-4 text-center">{cartQty}</span>
                          <button
                            onClick={() => handleAdd(item.skuId, item.productId, available)}
                            disabled={upsertCart.isPending}
                            className="w-5 h-5 flex items-center justify-center text-primary hover:text-primary/80 transition-colors"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {search ? (
              <>
                <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
                <p className="text-sm font-medium text-foreground mb-1">No results</p>
                <p className="text-xs text-muted-foreground">
                  No medicines matching "{search}" in your node's current stock.
                </p>
              </>
            ) : (
              <>
                <AlertCircle size={24} className="text-muted-foreground mb-3 opacity-40" />
                <p className="text-sm font-medium text-foreground mb-1">No stock data</p>
                <p className="text-xs text-muted-foreground">
                  Your pharmacy node has not been assigned yet. Complete onboarding first.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Cart summary bar ─────────────────────────────────────────────── */}
      {cartTotal > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-5 pb-2">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => navigate("/cart")}
              className="w-full flex items-center justify-between bg-primary text-primary-foreground px-5 py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              <span className="text-primary-foreground/80 text-xs">
                {cartTotal} {cartTotal === 1 ? "item" : "items"} in cart
              </span>
              <span>Review order →</span>
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
