import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { NodeMap } from "@/components/NodeMap";
import { ArrowLeft, Clock, CheckCircle2, RotateCcw, FileDown, MapPin } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState, useEffect } from "react";

// ─── Human-language order states ─────────────────────────────────────────────
const ORDER_STEPS = [
  {
    key: "created",
    label: "Received",
    sub: "Your order has been received and is being prepared.",
  },
  {
    key: "pharmacist_reviewing",
    label: "Being verified",
    sub: "A licensed pharmacist is reviewing your prescription.",
  },
  {
    key: "picking",
    label: "Preparing",
    sub: "Your medications are being picked and packed at the pharmacy.",
  },
  {
    key: "out_for_delivery",
    label: "On the way",
    sub: "Your order is on its way to you.",
  },
  {
    key: "delivered",
    label: "Delivered",
    sub: "Your medications have been delivered.",
  },
];

const STATUS_ORDER = ORDER_STEPS.map(s => s.key);

function getStepIndex(status: string) {
  return STATUS_ORDER.indexOf(status);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string; dot: string }> = {
    created:               { label: "Received",       bg: "#EFF6FF", color: "#1F6FEB", dot: "#1F6FEB" },
    pharmacist_reviewing:  { label: "Being verified", bg: "#FFFBEB",   color: "#D97706",  dot: "#F59E0B" },
    picking:               { label: "Preparing",      bg: "#EFF6FF", color: "#1F6FEB", dot: "#1F6FEB" },
    out_for_delivery:      { label: "On the way",     bg: "#EFF6FF", color: "#1F6FEB", dot: "#1F6FEB" },
    delivered:             { label: "Delivered",      bg: "#F0FDF4", color: "#16A34A", dot: "#22C55E" },
    cancelled:             { label: "Cancelled",      bg: "#FEF2F2",   color: "#DC2626",  dot: "#DC2626" },
  };
  const s = map[status] ?? map.created;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export default function OrderDetail() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const orderId = parseInt(params.id);
  const utils = trpc.useUtils();

  const { data: order, isLoading } = trpc.orders.detail.useQuery(
    { orderId },
    { enabled: isAuthenticated && !isNaN(orderId), refetchInterval: 15000 }
  );
  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const [etaMins, setEtaMins] = useState<number | null>(null);

  // Compute real ETA via Google Maps Directions API when order is out for delivery
  useEffect(() => {
    if (order?.status !== "out_for_delivery" || !store?.lat || !store?.lng) return;
    if (!window.google?.maps) return;
    const svc = new window.google.maps.DistanceMatrixService();
    svc.getDistanceMatrix({
      origins: [{ lat: Number(store.lat), lng: Number(store.lng) }],
      destinations: [{ lat: 19.1197, lng: 72.9050 }],
      travelMode: window.google.maps.TravelMode.DRIVING,
      drivingOptions: { departureTime: new Date(), trafficModel: window.google.maps.TrafficModel.BEST_GUESS },
    }, (res, status) => {
      if (status === "OK" && res?.rows[0]?.elements[0]?.status === "OK") {
        const secs = res.rows[0].elements[0].duration_in_traffic?.value ?? res.rows[0].elements[0].duration?.value ?? 0;
        setEtaMins(Math.ceil(secs / 60));
      }
    });
  }, [order?.status, store?.lat, store?.lng]);

  const reorder = trpc.orders.reorder.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      toast.success(`${data.itemCount} items added`);
      navigate("/cart");
    },
    onError: (e) => toast.error(e.message),
  });

  const advanceStatus = trpc.orders.advanceStatus.useMutation({
    onSuccess: () => utils.orders.detail.invalidate({ orderId }),
    onError: (e) => toast.error(e.message),
  });

  const getNextStatus = (current: string) => {
    const idx = STATUS_ORDER.indexOf(current);
    return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          <div className="skeleton h-6 w-40 rounded-xl" />
          <div className="skeleton h-48 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 text-center py-20">
          <p className="text-sm" style={{ color: "#667085" }}>Order not found.</p>
        </div>
      </AppLayout>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const nextStatus = getNextStatus(order.status);
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const isOutForDelivery = order.status === "out_for_delivery";
  const displayEta = etaMins ?? order.promisedSlaMins;

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/orders")}
            className="transition-opacity hover:opacity-60"
            style={{ color: "#667085" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold" style={{ color: "#111827" }}>
                Order #{order.id}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-sm mt-0.5" style={{ color: "#667085" }}>
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
          </div>
        </div>

        {/* ── ETA banner (active orders) ───────────────────────────────── */}
        {!isDelivered && !isCancelled && displayEta && (
          <div className="flex items-center gap-3 p-4 rounded-xl mb-4"
            style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
            <Clock size={15} strokeWidth={1.75} style={{ color: "#1F6FEB" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                {isOutForDelivery
                  ? `Arriving in ~${displayEta} min`
                  : `Expected in ~${displayEta} min`}
              </p>
              <p className="text-xs" style={{ color: "#667085" }}>
                Dispensed from {store?.name ?? "24/7 Pharmacy"}
              </p>
            </div>
          </div>
        )}

        {/* ── Progress timeline ────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="bg-white rounded-xl p-5 mb-4 card-shadow"
            style={{ border: "1px solid #E5E7EB" }}>
            {/* Progress bar */}
            <div className="mb-5">
              <div className="h-1.5 rounded-full mb-2" style={{ background: "#E5E7EB" }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    background: isDelivered ? "#22C55E" : "#1F6FEB",
                    width: `${Math.max(5, ((currentStepIdx + 1) / ORDER_STEPS.length) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                Step {Math.min(currentStepIdx + 1, ORDER_STEPS.length)} of {ORDER_STEPS.length}
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-0">
              {ORDER_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const isLast = idx === ORDER_STEPS.length - 1;
                return (
                  <div key={step.key} className="flex items-start gap-3">
                    {/* Connector column */}
                    <div className="flex flex-col items-center w-5 flex-shrink-0">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: isCompleted
                            ? (isDelivered && idx === currentStepIdx ? "#22C55E" : "#1F6FEB")
                            : "#F8FAFB",
                          border: isCompleted ? "none" : "1.5px solid #D1D5DB",
                        }}>
                        {isCompleted ? (
                          <CheckCircle2 size={12} color="white" />
                        ) : (
                          <span className="w-2 h-2 rounded-full"
                            style={{ background: "#D1D5DB" }} />
                        )}
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 min-h-[28px] mt-1 mb-1"
                          style={{ background: idx < currentStepIdx ? "#1F6FEB" : "#E5E7EB" }} />
                      )}
                    </div>
                    {/* Content */}
                    <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                      <p className="text-sm font-semibold leading-tight"
                        style={{ color: isCompleted ? "#111827" : "#9CA3AF" }}>
                        {step.label}
                      </p>
                      {isCurrent && !isDelivered && (
                        <p className="text-xs mt-0.5 leading-relaxed"
                          style={{ color: "#667085" }}>
                          {step.sub}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Live map (out_for_delivery only) ─────────────────────────── */}
        {isOutForDelivery && (
          <div className="rounded-xl overflow-hidden mb-4 card-shadow"
            style={{ border: "1px solid #E5E7EB" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid #E5E7EB" }}>
              <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                Live tracking
              </p>
              {etaMins && (
                <span className="eta-chip">~{etaMins} min away</span>
              )}
            </div>
            <NodeMap
              className="h-[200px] w-full"
              nodes={store ? [{ id: store.id, name: store.name, lat: Number(store.lat ?? 19.1197), lng: Number(store.lng ?? 72.9050) }] : []}
              riderPosition={store ? { lat: Number(store.lat ?? 19.1197) + 0.002, lng: Number(store.lng ?? 72.9050) + 0.002 } : undefined}
              deliveryLat={19.1197}
              deliveryLng={72.9050}
            />
            <div className="px-4 py-2.5" style={{ borderTop: "1px solid #E5E7EB" }}>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                {etaMins ? `Arriving in ~${etaMins} min · ` : ""}Rider location updates every 30 seconds.
              </p>
            </div>
          </div>
        )}

        {/* ── Delivery address ─────────────────────────────────────────── */}
        {order.flatNumber && (
          <div className="flex items-center gap-3 p-4 rounded-xl mb-4 bg-white card-shadow"
            style={{ border: "1px solid #E5E7EB" }}>
            <MapPin size={14} strokeWidth={1.75} style={{ color: "#667085" }} />
            <div>
              <p className="section-label mb-0.5">Delivery address</p>
              <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                Flat {order.flatNumber}
              </p>
            </div>
          </div>
        )}

        {/* ── Items ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl p-4 mb-4 card-shadow"
          style={{ border: "1px solid #E5E7EB" }}>
          <p className="section-label mb-3">Medications</p>
          <div className="space-y-3">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug" style={{ color: "#111827" }}>
                    {item.name}
                  </p>
                  {item.brand && (
                    <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{item.brand}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "#667085" }}>
                    Qty {item.quantity} × ₹{Number(item.unitPrice).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-semibold flex-shrink-0" style={{ color: "#111827" }}>
                  ₹{Number(item.lineTotal).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="h-px my-3" style={{ background: "#E5E7EB" }} />
          <div className="flex justify-between">
            <span className="text-sm font-semibold" style={{ color: "#111827" }}>Total</span>
            <span className="text-sm font-semibold" style={{ color: "#111827" }}>
              ₹{Number(order.total).toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="space-y-2 mb-6">
          {isDelivered && (
            <button
              onClick={() => reorder.mutate({ orderId: order.id })}
              disabled={reorder.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "#EFF6FF", color: "#1F6FEB", border: "1px solid #BFDBFE" }}
            >
              <RotateCcw size={14} />
              {reorder.isPending ? "Adding…" : "Reorder these medications"}
            </button>
          )}
          {isDelivered && order.invoiceUrl && (
            <button
              onClick={() => window.open(order.invoiceUrl!, "_blank")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "white", color: "#667085", border: "1px solid #E5E7EB" }}
            >
              <FileDown size={14} />
              Download invoice
            </button>
          )}
          {/* Demo: advance status */}
          {nextStatus && !isDelivered && (
            <button
              onClick={() => advanceStatus.mutate({ orderId: order.id, status: nextStatus as any })}
              disabled={advanceStatus.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-dashed text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ border: "1px dashed #D1D5DB", color: "#9CA3AF" }}
            >
              {advanceStatus.isPending ? "Updating…" : `[Demo] Advance → ${nextStatus.replace(/_/g, " ")}`}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
