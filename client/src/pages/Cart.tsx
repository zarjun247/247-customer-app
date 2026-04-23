import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Minus, Plus, Trash2, Clock, ShieldCheck, Shield, ArrowLeft, Lock, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Cart() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);

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
      setConfirming(false);
      toast.error(e.message);
    },
  });

  const subtotal = cartItems?.reduce((s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity, 0) ?? 0;
  const rxItems = cartItems?.filter(i => i.requiresPrescription) ?? [];
  const nonRxItems = cartItems?.filter(i => !i.requiresPrescription) ?? [];
  const hasRxItems = rxItems.length > 0;
  const totalItems = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const handleConfirm = () => {
    if (!cartItems || cartItems.length === 0) return;
    setConfirming(true);
    checkout.mutate({});
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/catalog")}
            className="transition-opacity hover:opacity-60"
            style={{ color: "oklch(0.520 0.018 255)" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
              Your Order
            </h1>
            {totalItems > 0 && (
              <p className="text-sm" style={{ color: "oklch(0.520 0.018 255)" }}>
                {totalItems} {totalItems === 1 ? "item" : "items"} · {store?.name ?? "24/7 Pharmacy"}
              </p>
            )}
          </div>
        </div>

        {!cartItems || cartItems.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "oklch(0.965 0.004 255)" }}>
              <ShieldCheck size={22} strokeWidth={1.5} style={{ color: "oklch(0.520 0.018 255)" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "oklch(0.175 0.012 255)" }}>
              No items yet
            </p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "oklch(0.520 0.018 255)", maxWidth: "20rem" }}>
              Add medications from your assigned pharmacy to start an order.
            </p>
            <button
              onClick={() => navigate("/catalog")}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "oklch(0.545 0.195 255)" }}
            >
              Browse medications →
            </button>
          </div>
        ) : (
          <>
            {/* ── Non-Rx items ────────────────────────────────────────── */}
            {nonRxItems.length > 0 && (
              <div className="mb-5">
                {hasRxItems && <p className="section-label mb-3">Ready to prepare</p>}
                <div className="space-y-2">
                  {nonRxItems.map((item) => (
                    <CartItem key={item.id} item={item} onUpdate={(qty) =>
                      upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: qty })
                    } />
                  ))}
                </div>
              </div>
            )}

            {/* ── Rx items ────────────────────────────────────────────── */}
            {hasRxItems && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={12} strokeWidth={2} style={{ color: "oklch(0.620 0.150 55)" }} />
                  <p className="section-label" style={{ color: "oklch(0.620 0.150 55)" }}>
                    Awaiting prescription
                  </p>
                </div>
                <div className="space-y-2 mb-3">
                  {rxItems.map((item) => (
                    <CartItem key={item.id} item={item} onUpdate={(qty) =>
                      upsertCart.mutate({ skuId: item.skuId, productId: item.productId, quantity: qty })
                    } />
                  ))}
                </div>
                {/* Rx notice */}
                <div className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: "oklch(0.97 0.040 55)", border: "1px solid oklch(0.920 0.030 55)" }}>
                  <ClipboardList size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
                    style={{ color: "oklch(0.620 0.150 55)" }} />
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: "oklch(0.620 0.150 55)" }}>
                      Prescription required
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.620 0.150 55)" }}>
                      These medicines will be prepared after a licensed pharmacist reviews your prescription.
                    </p>
                    <button
                      onClick={() => navigate("/rx-upload")}
                      className="mt-2 text-xs font-semibold transition-opacity hover:opacity-70"
                      style={{ color: "oklch(0.545 0.195 255)" }}
                    >
                      Upload prescription →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Delivery info ────────────────────────────────────────── */}
            {store && (
              <div className="flex items-center gap-3 p-4 rounded-xl mb-4"
                style={{ background: "oklch(0.965 0.020 255)", border: "1px solid oklch(0.900 0.040 255)" }}>
                <Clock size={15} strokeWidth={1.75} style={{ color: "oklch(0.545 0.195 255)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                    Arriving in ~{(store as any).etaMins ?? store.slaMins} minutes
                  </p>
                  <p className="text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
                    Dispensed from {store.name}
                  </p>
                </div>
              </div>
            )}

            {/* ── Order summary ────────────────────────────────────────── */}
            <div className="bg-white rounded-xl p-4 mb-4 card-shadow"
              style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
              <p className="section-label mb-3">Summary</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "oklch(0.520 0.018 255)" }}>
                    Medications ({totalItems} {totalItems === 1 ? "item" : "items"})
                  </span>
                  <span className="font-medium" style={{ color: "oklch(0.175 0.012 255)" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "oklch(0.520 0.018 255)" }}>Delivery</span>
                  <span className="font-medium" style={{ color: "oklch(0.600 0.160 145)" }}>Included</span>
                </div>
                <div className="h-px" style={{ background: "oklch(0.910 0.008 255)" }} />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                    Total
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Inventory note ───────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-5">
              <Lock size={11} className="flex-shrink-0" style={{ color: "oklch(0.650 0.012 255)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "oklch(0.650 0.012 255)" }}>
                Stock is reserved at the time of order placement. Availability is confirmed when you confirm.
              </p>
            </div>

            {/* ── Confirm order ────────────────────────────────────────── */}
            <button
              onClick={handleConfirm}
              disabled={confirming || checkout.isPending}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 mb-6"
              style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
            >
              {confirming ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Confirming…
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

// ─── Cart Item Row ────────────────────────────────────────────────────────────
function CartItem({ item, onUpdate }: { item: any; onUpdate: (qty: number) => void }) {
  return (
    <div className="bg-white rounded-xl p-4 card-shadow"
      style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold leading-snug" style={{ color: "oklch(0.175 0.012 255)" }}>
              {item.name}
            </span>
            {item.requiresPrescription && <span className="badge-rx">Rx</span>}
          </div>
          {item.packSize && (
            <p className="text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>{item.packSize}</p>
          )}
          <p className="text-sm font-semibold mt-1.5" style={{ color: "oklch(0.175 0.012 255)" }}>
            ₹{(parseFloat(String(item.sellingPrice)) * item.quantity).toFixed(2)}
          </p>
        </div>
        {/* Qty controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onUpdate(item.quantity - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "oklch(0.965 0.004 255)", color: "oklch(0.520 0.018 255)" }}
          >
            {item.quantity === 1
              ? <Trash2 size={13} style={{ color: "oklch(0.620 0.210 25)" }} />
              : <Minus size={13} />
            }
          </button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: "oklch(0.175 0.012 255)" }}>
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdate(item.quantity + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "oklch(0.965 0.020 255)", color: "oklch(0.545 0.195 255)" }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
