import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Minus, Plus, Trash2, Clock, ShieldCheck, Shield, ArrowLeft, Lock, ClipboardList, Search, FileText } from "lucide-react";
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
            style={{ color: "#667085" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "#111827" }}>
              Your Order
            </h1>
            {totalItems > 0 && (
              <p className="text-sm" style={{ color: "#667085" }}>
                {totalItems} {totalItems === 1 ? "item" : "items"} · {store?.name ?? "24/7 Pharmacy"}
              </p>
            )}
          </div>
        </div>

        {!cartItems || cartItems.length === 0 ? (
          /* ── Action empty state ──────────────────────────────────────── */
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "#F8FAFB", border: "1px solid #E5E7EB" }}>
              <ShieldCheck size={22} strokeWidth={1.5} style={{ color: "#9CA3AF" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "#111827" }}>
              No items yet
            </p>
            <p className="text-sm leading-relaxed mb-8"
              style={{ color: "#667085", maxWidth: "20rem" }}>
              Add medications from your assigned pharmacy to start an order.
            </p>
            <div className="w-full space-y-2.5" style={{ maxWidth: "22rem" }}>
              <button
                onClick={() => navigate("/catalog")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#1F6FEB", color: "white" }}
              >
                <Search size={15} />
                <span>Search for a medication</span>
              </button>
              <button
                onClick={() => navigate("/rx-upload")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#F8FAFB", color: "#111827", border: "1px solid #E5E7EB" }}
              >
                <FileText size={15} style={{ color: "#667085" }} />
                <span>Upload a prescription</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Non-Rx items ────────────────────────────────────────── */}
            {nonRxItems.length > 0 && (
              <div className="mb-5">
                {hasRxItems && (
                  <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                    style={{ color: "#9CA3AF" }}>Ready to prepare</p>
                )}
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
                  <Shield size={12} strokeWidth={1.75} style={{ color: "#D97706" }} />
                  <p className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "#D97706" }}>
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
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <ClipboardList size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
                    style={{ color: "#D97706" }} />
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: "#92400E" }}>
                      Prescription required
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "#B45309" }}>
                      These medicines will be prepared after a licensed pharmacist reviews your prescription.
                    </p>
                    <button
                      onClick={() => navigate("/rx-upload")}
                      className="mt-2 text-xs font-semibold transition-opacity hover:opacity-70"
                      style={{ color: "#1F6FEB" }}
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
                style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <Clock size={15} strokeWidth={1.75} style={{ color: "#1F6FEB" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                    Arriving in ~{(store as any).etaMins ?? store.slaMins} minutes
                  </p>
                  <p className="text-xs" style={{ color: "#667085" }}>
                    Dispensed from {store.name}
                  </p>
                </div>
              </div>
            )}

            {/* ── Order summary ────────────────────────────────────────── */}
            <div className="bg-white rounded-xl p-4 mb-4"
              style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                style={{ color: "#9CA3AF" }}>Summary</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#667085" }}>
                    Medications ({totalItems} {totalItems === 1 ? "item" : "items"})
                  </span>
                  <span className="font-medium" style={{ color: "#111827" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#667085" }}>Delivery</span>
                  <span className="font-medium" style={{ color: "#16A34A" }}>Included</span>
                </div>
                <div className="h-px" style={{ background: "#E5E7EB" }} />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold" style={{ color: "#111827" }}>Total</span>
                  <span className="text-sm font-semibold" style={{ color: "#111827" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Trust + inventory note ───────────────────────────────── */}
            <div className="flex items-start gap-2 mb-5">
              <Lock size={11} className="flex-shrink-0 mt-0.5" style={{ color: "#9CA3AF" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
                Stock is reserved when you confirm. All prescriptions are reviewed by a licensed pharmacist before dispensing.
              </p>
            </div>

            {/* ── Confirm order ────────────────────────────────────────── */}
            <button
              onClick={handleConfirm}
              disabled={confirming || checkout.isPending}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 mb-6"
              style={{ background: "#1F6FEB", color: "white" }}
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
    <div className="bg-white rounded-xl p-4"
      style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold leading-snug" style={{ color: "#111827" }}>
              {item.name}
            </span>
            {item.requiresPrescription && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "#FFFBEB", color: "#D97706" }}>
                Rx
              </span>
            )}
          </div>
          {item.packSize && (
            <p className="text-xs" style={{ color: "#667085" }}>{item.packSize}</p>
          )}
          <p className="text-sm font-semibold mt-1.5" style={{ color: "#111827" }}>
            ₹{(parseFloat(String(item.sellingPrice)) * item.quantity).toFixed(2)}
          </p>
        </div>
        {/* Qty controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onUpdate(item.quantity - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "#F8FAFB", color: "#667085", border: "1px solid #E5E7EB" }}
          >
            {item.quantity === 1
              ? <Trash2 size={13} style={{ color: "#DC2626" }} />
              : <Minus size={13} />
            }
          </button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: "#111827" }}>
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdate(item.quantity + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "#EFF6FF", color: "#1F6FEB", border: "1px solid #BFDBFE" }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
