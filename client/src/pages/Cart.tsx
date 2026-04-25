import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import AppLayout from "@/components/AppLayout";
import { Minus, Plus, Trash2, Clock, ShieldCheck, Shield, ArrowLeft, Lock, ClipboardList, Search, FileText, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Cart() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useOnboardingGuard();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const [paymentStep, setPaymentStep] = useState<"idle" | "creating" | "modal" | "verifying" | "done">("idle");

  const { data: cartItems, isLoading } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();

  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => utils.cart.get.invalidate(),
  });

  const checkout = trpc.orders.checkout.useMutation({
    onSuccess: async (data) => {
      utils.cart.get.invalidate();
      // If Razorpay is configured, open payment modal; otherwise go directly to order
      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (keyId && keyId !== 'rzp_test_demo') {
        await openRazorpayModal(data.orderId, subtotal);
      } else {
        // Demo/stub mode — skip payment modal, go directly to order
        navigate(`/orders/${data.orderId}`);
      }
    },
    onError: (e) => {
      setConfirming(false);
      setPaymentStep("idle");
      toast.error(e.message);
    },
  });

  const createPaymentOrder = trpc.payment.createPaymentOrder.useMutation();
  const verifyPayment = trpc.payment.verifyPayment.useMutation();
  const failPayment = trpc.payment.failPayment.useMutation();

  const openRazorpayModal = async (orderId: number, amount: number) => {
    try {
      setPaymentStep("creating");
      const payOrder = await createPaymentOrder.mutateAsync({ orderId });
      setPaymentStep("modal");

      // Dynamically load Razorpay checkout script
      await new Promise<void>((resolve, reject) => {
        if ((window as any).Razorpay) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.head.appendChild(script);
      });

      const rzp = new (window as any).Razorpay({
        key: payOrder.keyId,
        amount: payOrder.amount,
        currency: payOrder.currency,
        order_id: payOrder.gatewayOrderId,
        name: "24/7 Pharmacy",
        description: `Order ${payOrder.receipt}`,
        theme: { color: "#2B7FFF" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; razorpay_payment_method?: string }) => {
          setPaymentStep("verifying");
          try {
            const result = await verifyPayment.mutateAsync({
              gatewayOrderId: response.razorpay_order_id,
              gatewayPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              method: response.razorpay_payment_method,
            });
            setPaymentStep("done");
            toast.success("Payment successful!");
            navigate(`/orders/${result.orderId}`);
          } catch (e: any) {
            setPaymentStep("idle");
            setConfirming(false);
            toast.error("Payment verification failed. Please contact support.");
          }
        },
        modal: {
          ondismiss: async () => {
            await failPayment.mutateAsync({ gatewayOrderId: payOrder.gatewayOrderId, reason: "User dismissed" });
            setPaymentStep("idle");
            setConfirming(false);
            toast.error("Payment cancelled.");
          },
        },
      });
      rzp.open();
    } catch (e: any) {
      setPaymentStep("idle");
      setConfirming(false);
      toast.error(e.message ?? "Payment setup failed");
    }
  };

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

  const isPaymentLoading = paymentStep !== "idle" && paymentStep !== "done";

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  if (!isReady) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10" style={{ background: "#0A0A0B", minHeight: "100%" }}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/catalog")}
            className="transition-opacity hover:opacity-60"
            style={{ color: "#6B6B75" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "#F0F0F2" }}>
              Your Order
            </h1>
            {totalItems > 0 && (
              <p className="text-sm" style={{ color: "#6B6B75" }}>
                {totalItems} {totalItems === 1 ? "item" : "items"} · {store?.name ?? "24/7 Pharmacy"}
              </p>
            )}
          </div>
        </div>

        {!cartItems || cartItems.length === 0 ? (
          /* ── Action empty state ──────────────────────────────────────── */
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
              <ShieldCheck size={22} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
              No items yet
            </p>
            <p className="text-sm leading-relaxed mb-8"
              style={{ color: "#6B6B75", maxWidth: "20rem" }}>
              Add medications from your assigned pharmacy to start an order.
            </p>
            <div className="w-full space-y-2.5" style={{ maxWidth: "22rem" }}>
              <button
                onClick={() => navigate("/catalog")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#2B7FFF", color: "white" }}
              >
                <Search size={15} />
                <span>Search for a medication</span>
              </button>
              <button
                onClick={() => navigate("/rx-upload")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#141416", color: "#F0F0F2", border: "1px solid #2A2A2E" }}
              >
                <FileText size={15} style={{ color: "#6B6B75" }} />
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
                    style={{ color: "#4B4B55" }}>Ready to prepare</p>
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
                  <Shield size={12} strokeWidth={1.75} style={{ color: "#F59E0B" }} />
                  <p className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "#F59E0B" }}>
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
                  style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <ClipboardList size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
                    style={{ color: "#F59E0B" }} />
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
                      style={{ color: "#2B7FFF" }}
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
                style={{ background: "rgba(43,127,255,0.10)", border: "1px solid rgba(43,127,255,0.25)" }}>
                <Clock size={15} strokeWidth={1.75} style={{ color: "#2B7FFF" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                    Arriving in ~{(store as any).etaMins ?? store.slaMins} minutes
                  </p>
                  <p className="text-xs" style={{ color: "#6B6B75" }}>
                    Dispensed from {store.name}
                  </p>
                </div>
              </div>
            )}

            {/* ── Order summary ────────────────────────────────────────── */}
            <div className="rounded-xl p-4 mb-4"
              style={{ border: "1px solid #2A2A2E", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                style={{ color: "#4B4B55" }}>Summary</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#6B6B75" }}>
                    Medications ({totalItems} {totalItems === 1 ? "item" : "items"})
                  </span>
                  <span className="font-medium" style={{ color: "#F0F0F2" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#6B6B75" }}>Delivery</span>
                  <span className="font-medium" style={{ color: "#00C896" }}>Included</span>
                </div>
                <div className="h-px" style={{ background: "#E5E7EB" }} />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>Total</span>
                  <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Trust + inventory note ───────────────────────────────── */}
            <div className="flex items-start gap-2 mb-5">
              <Lock size={11} className="flex-shrink-0 mt-0.5" style={{ color: "#4B4B55" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#4B4B55" }}>
                Stock is reserved when you confirm. All prescriptions are reviewed by a licensed pharmacist before dispensing.
              </p>
            </div>

            {/* ── Confirm order ────────────────────────────────────────── */}
            <button
              onClick={handleConfirm}
              disabled={confirming || checkout.isPending || isPaymentLoading}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 mb-6"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              {paymentStep === "creating" ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Setting up payment…</>
              ) : paymentStep === "verifying" ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Verifying payment…</>
              ) : confirming ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Confirming…</>
              ) : (
                <><CreditCard size={16} />{`Pay ₹${subtotal.toFixed(2)}`}</>
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
    <div className="rounded-xl p-4"
      style={{ border: "1px solid #2A2A2E", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold leading-snug" style={{ color: "#F0F0F2" }}>
              {item.name}
            </span>
            {item.requiresPrescription && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(245,158,11,0.10)", color: "#F59E0B" }}>
                Rx
              </span>
            )}
          </div>
          {item.packSize && (
            <p className="text-xs" style={{ color: "#6B6B75" }}>{item.packSize}</p>
          )}
          <p className="text-sm font-semibold mt-1.5" style={{ color: "#F0F0F2" }}>
            ₹{(parseFloat(String(item.sellingPrice)) * item.quantity).toFixed(2)}
          </p>
        </div>
        {/* Qty controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onUpdate(item.quantity - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "#141416", color: "#6B6B75", border: "1px solid #2A2A2E" }}
          >
            {item.quantity === 1
              ? <Trash2 size={13} style={{ color: "#DC2626" }} />
              : <Minus size={13} />
            }
          </button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: "#F0F0F2" }}>
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdate(item.quantity + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60"
            style={{ background: "rgba(43,127,255,0.10)", color: "#2B7FFF", border: "1px solid rgba(43,127,255,0.25)" }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
