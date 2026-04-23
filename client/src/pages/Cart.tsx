import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Minus, Plus, Trash2, Clock, ShieldCheck, AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Cart() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [checkingOut, setCheckingOut] = useState(false);

  const { data: cartItems, isLoading } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();

  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => utils.cart.get.invalidate(),
  });

  const checkout = trpc.orders.checkout.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      navigate(`/orders/${data.orderId}`);
    },
    onError: (e) => {
      setCheckingOut(false);
      toast.error(e.message);
    },
  });

  const subtotal = cartItems?.reduce((s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity, 0) ?? 0;
  const hasRxItems = cartItems?.some(i => i.requiresPrescription) ?? false;
  const totalItems = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const handleCheckout = () => {
    if (!cartItems || cartItems.length === 0) return;
    setCheckingOut(true);
    checkout.mutate({});
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-5 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/catalog")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-semibold text-foreground">Order Review</h1>
            {totalItems > 0 && (
              <p className="text-xs text-muted-foreground">
                {totalItems} {totalItems === 1 ? "item" : "items"} · {store?.name ?? "Your pharmacy"}
              </p>
            )}
          </div>
        </div>

        {!cartItems || cartItems.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-5">
              <ShieldCheck size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No items in your order</p>
            <p className="text-xs text-muted-foreground mb-6 max-w-[200px]">
              Add medicines from your local 24/7 pharmacy to get started.
            </p>
            <button
              onClick={() => navigate("/catalog")}
              className="text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              Browse medicines →
            </button>
          </div>
        ) : (
          <>
            {/* ── Cart items ──────────────────────────────────────────── */}
            <div className="space-y-2 mb-5">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-4 py-3.5 rounded-lg bg-card border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-foreground leading-snug">{item.name}</span>
                      {item.requiresPrescription && (
                        <span className="badge-rx">Rx</span>
                      )}
                    </div>
                    {item.brand && (
                      <p className="text-xs text-muted-foreground">{item.brand}</p>
                    )}
                    <div className="flex items-baseline gap-1.5 mt-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        ₹{(parseFloat(String(item.sellingPrice)) * item.quantity).toFixed(2)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ₹{Number(item.sellingPrice).toFixed(2)} × {item.quantity}
                      </span>
                    </div>
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: item.quantity - 1 })}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.quantity === 1
                        ? <Trash2 size={12} className="text-destructive/70" />
                        : <Minus size={12} />
                      }
                    </button>
                    <span className="text-sm font-semibold text-foreground w-5 text-center">{item.quantity}</span>
                    <button
                      onClick={() => upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: item.quantity + 1 })}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-muted text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── SLA window ──────────────────────────────────────────── */}
            {store && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg bg-card border border-border mb-3">
                <Clock size={15} className="text-primary flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Estimated delivery: {store.slaMins} minutes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fulfilled from {store.name} · SLA committed at checkout
                  </p>
                </div>
              </div>
            )}

            {/* ── Rx notice ───────────────────────────────────────────── */}
            {hasRxItems && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg bg-card border border-border mb-3">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Prescription review required</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Your order contains Schedule H medicines. A licensed pharmacist will verify your prescription before this order is picked.
                  </p>
                </div>
              </div>
            )}

            {/* ── Order summary ────────────────────────────────────────── */}
            <div className="bg-card rounded-lg border border-border px-4 py-4 mb-4">
              <p className="section-label mb-3">Order Summary</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
                  <span className="text-foreground font-medium">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery charge</span>
                  <span className="text-primary font-medium">Included</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-foreground">Total payable</span>
                  <span className="text-sm font-semibold text-foreground">₹{subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* ── Inventory lock notice ────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-5">
              <Lock size={11} className="text-muted-foreground flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Stock is reserved at the time of order placement, not when added to cart. Availability is confirmed at checkout.
              </p>
            </div>

            {/* ── Place order ──────────────────────────────────────────── */}
            <button
              onClick={handleCheckout}
              disabled={checkingOut || checkout.isPending}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
            >
              {checkingOut ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Placing order…
                </>
              ) : (
                `Confirm order · ₹${subtotal.toFixed(2)}`
              )}
            </button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
