import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, ShoppingCart, Clock, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function StockBadge({ available }: { available: number }) {
  if (available <= 0) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">Out of Stock</Badge>;
  if (available <= 5) return <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30">Low Stock</Badge>;
  return <Badge className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border-primary/20">In Stock</Badge>;
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

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-2">
        {/* Store info */}
        {store && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">{store.name}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{store.slaMins} min delivery</span>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search medicines, brands, generics..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-11 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-xl"
          />
        </div>

        {/* Rx reminder */}
        <button
          onClick={() => navigate("/rx-upload")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 border border-primary/20 mb-5 hover:bg-primary/12 transition-colors"
        >
          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm text-primary font-medium">Upload a prescription</span>
        </button>
      </div>

      {/* Catalog */}
      <div className="px-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : catalog && catalog.length > 0 ? (
          <div className="space-y-2">
            {catalog.map((item) => {
              const available = Number(item.availableQty) || 0;
              const cartQty = getCartQty(item.skuId);
              const outOfStock = available <= 0;

              return (
                <div key={item.skuId} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border hover:border-border/80 transition-colors">
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground leading-tight">{item.name}</span>
                      {item.requiresPrescription && (
                        <Badge className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-400 border-amber-500/25 flex-shrink-0 mt-0.5">Rx</Badge>
                      )}
                    </div>
                    {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-semibold text-foreground">₹{Number(item.sellingPrice).toFixed(0)}</span>
                      {Number(item.mrp) > Number(item.sellingPrice) && (
                        <span className="text-xs text-muted-foreground line-through">₹{Number(item.mrp).toFixed(0)}</span>
                      )}
                      <StockBadge available={available} />
                    </div>
                    {item.packSize && <p className="text-[11px] text-muted-foreground mt-0.5">{item.packSize}</p>}
                  </div>

                  {/* Cart controls */}
                  <div className="flex-shrink-0">
                    {outOfStock ? (
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    ) : cartQty === 0 ? (
                      <Button
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => handleAdd(item.skuId, item.productId, available)}
                        disabled={upsertCart.isPending}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 rounded-lg border-border"
                          onClick={() => handleRemove(item.skuId, item.productId)}
                          disabled={upsertCart.isPending}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-sm font-semibold text-foreground w-5 text-center">{cartQty}</span>
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => handleAdd(item.skuId, item.productId, available)}
                          disabled={upsertCart.isPending}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {search ? (
              <>
                <Search className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No results for "{search}"</p>
              </>
            ) : (
              <>
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No products available at your node yet.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Floating cart button */}
      {(cartItems?.length ?? 0) > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
          <Button
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-lg shadow-primary/20"
            onClick={() => navigate("/cart")}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            View Cart · {cartItems?.reduce((s, i) => s + i.quantity, 0)} items
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
