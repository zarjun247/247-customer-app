import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Trash2, Clock, ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
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
      toast.success("Order placed successfully!");
      navigate(`/orders/${data.orderId}`);
    },
    onError: (e) => {
      setCheckingOut(false);
      toast.error(e.message);
    },
  });

  const subtotal = cartItems?.reduce((s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity, 0) ?? 0;
  const hasRxItems = cartItems?.some(i => i.requiresPrescription) ?? false;

  const handleCheckout = () => {
    if (!cartItems || cartItems.length === 0) return;
    setCheckingOut(true);
    checkout.mutate({});
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/catalog")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Your Cart</h1>
          {(cartItems?.length ?? 0) > 0 && (
            <span className="text-sm text-muted-foreground ml-auto">{cartItems?.reduce((s, i) => s + i.quantity, 0)} items</span>
          )}
        </div>

        {!cartItems || cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-foreground font-medium mb-1">Your cart is empty</p>
            <p className="text-sm text-muted-foreground mb-6">Add medicines from the catalog</p>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-secondary"
              onClick={() => navigate("/catalog")}
            >
              Browse Catalog
            </Button>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="space-y-2 mb-5">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                      {item.requiresPrescription && (
                        <Badge className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-400 border-amber-500/25">Rx</Badge>
                      )}
                    </div>
                    {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                    <p className="text-sm font-semibold text-foreground mt-1">
                      ₹{(parseFloat(String(item.sellingPrice)) * item.quantity).toFixed(0)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        ₹{Number(item.sellingPrice).toFixed(0)} each
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 rounded-lg border-border"
                      onClick={() => upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: item.quantity - 1 })}
                    >
                      {item.quantity === 1 ? <Trash2 className="h-3.5 w-3.5 text-destructive" /> : <Minus className="h-3.5 w-3.5" />}
                    </Button>
                    <span className="text-sm font-semibold text-foreground w-5 text-center">{item.quantity}</span>
                    <Button
                      size="sm"
                      className="h-8 w-8 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: item.quantity + 1 })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* SLA Info */}
            {store && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 border border-primary/20 mb-4">
                <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Delivery in {store.slaMins} minutes</p>
                  <p className="text-xs text-muted-foreground">From {store.name}</p>
                </div>
              </div>
            )}

            {/* Rx Warning */}
            {hasRxItems && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Prescription required</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your order contains Rx items. A pharmacist will review your prescription before dispatch.
                  </p>
                </div>
              </div>
            )}

            {/* Order Summary */}
            <div className="bg-card rounded-xl border border-border p-4 mb-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Order Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-primary font-medium">Free</span>
                </div>
                <div className="border-t border-border pt-2 mt-2 flex justify-between">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-foreground">₹{subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Soft-lock notice */}
            <p className="text-xs text-muted-foreground text-center mb-4">
              Stock will be reserved when you place the order.
            </p>

            <Button
              className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              onClick={handleCheckout}
              disabled={checkingOut || checkout.isPending}
            >
              {checkingOut ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Placing Order...
                </span>
              ) : `Place Order · ₹${subtotal.toFixed(2)}`}
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
