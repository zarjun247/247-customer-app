import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { NodeMap } from "@/components/NodeMap";
import { ArrowLeft, Clock, CheckCircle2, Circle, RotateCcw, FileDown, MapPin } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const ORDER_STEPS = [
  { key: "created",              label: "Order Received",        sub: "Your order has been logged in the system." },
  { key: "pharmacist_reviewing", label: "Pharmacist Reviewing",  sub: "A licensed pharmacist is verifying your prescription." },
  { key: "picking",              label: "Picking",               sub: "Your medicines are being picked and packed at your local 24/7 pharmacy." },
  { key: "out_for_delivery",     label: "Out for Delivery",      sub: "Your order is en route to your flat." },
  { key: "delivered",            label: "Delivered",             sub: "Dispensed and delivered." },
];

const STATUS_ORDER = ORDER_STEPS.map(s => s.key);

function getStepIndex(status: string) {
  return STATUS_ORDER.indexOf(status);
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    created:               { label: "Order Received",       cls: "bg-muted text-muted-foreground" },
    pharmacist_reviewing:  { label: "Pharmacist Reviewing", cls: "bg-amber-500/15 text-amber-400" },
    picking:               { label: "Picking",              cls: "bg-primary/15 text-primary" },
    out_for_delivery:      { label: "Out for Delivery",     cls: "bg-primary/15 text-primary" },
    delivered:             { label: "Delivered",            cls: "bg-emerald-500/15 text-emerald-400" },
    cancelled:             { label: "Cancelled",            cls: "bg-destructive/15 text-destructive" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${s.cls}`}>
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
    if (order?.status !== 'out_for_delivery' || !store?.lat || !store?.lng) return;
    if (!window.google?.maps) return;
    const svc = new window.google.maps.DistanceMatrixService();
    svc.getDistanceMatrix({
      origins: [{ lat: Number(store.lat), lng: Number(store.lng) }],
      destinations: [{ lat: 19.1197, lng: 72.9050 }], // delivery building (use user's building coords in prod)
      travelMode: window.google.maps.TravelMode.DRIVING,
      drivingOptions: { departureTime: new Date(), trafficModel: window.google.maps.TrafficModel.BEST_GUESS },
    }, (res, status) => {
      if (status === 'OK' && res?.rows[0]?.elements[0]?.status === 'OK') {
        const secs = res.rows[0].elements[0].duration_in_traffic?.value ?? res.rows[0].elements[0].duration?.value ?? 0;
        setEtaMins(Math.ceil(secs / 60));
      }
    });
  }, [order?.status, store?.lat, store?.lng]);

  const reorder = trpc.orders.reorder.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      toast.success(`${data.itemCount} items added to cart`);
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
        <div className="px-5 pt-5 space-y-3">
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton h-48 rounded-lg" />
          <div className="skeleton h-32 rounded-lg" />
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="px-5 pt-5 text-center py-20">
          <p className="text-sm text-muted-foreground">Order not found.</p>
        </div>
      </AppLayout>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const nextStatus = getNextStatus(order.status);
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/orders")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold text-foreground">Order #{order.id}</h1>
              <StatusPill status={order.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
          </div>
        </div>

        {/* ── State machine timeline ───────────────────────────────────── */}
        {!isCancelled && (
          <div className="bg-card border border-border rounded-lg px-4 py-4 mb-4">
            <p className="section-label mb-4">Fulfilment Status</p>
            <div className="space-y-0">
              {ORDER_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const isLast = idx === ORDER_STEPS.length - 1;

                return (
                  <div key={step.key} className="flex items-start gap-3">
                    {/* Connector column */}
                    <div className="flex flex-col items-center w-5 flex-shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted
                          ? "bg-primary"
                          : "bg-muted border border-border"
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 size={12} className="text-primary-foreground" />
                        ) : (
                          <Circle size={8} className="text-muted-foreground/30" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-px flex-1 min-h-[28px] mt-1 mb-1 ${
                          idx < currentStepIdx ? "bg-primary/30" : "bg-border"
                        }`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                      <p className={`text-sm font-medium leading-tight ${
                        isCompleted ? "text-foreground" : "text-muted-foreground/50"
                      }`}>
                        {step.label}
                      </p>
                      {isCurrent && !isDelivered && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
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

        {/* ── Rider tracking map (out_for_delivery only) ──────────────── */}
        {order.status === "out_for_delivery" && (
          <div className="rounded-lg overflow-hidden border border-border mb-4">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="section-label">Live tracking</p>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En route
              </span>
            </div>
            <NodeMap
              className="h-48"
              centerLat={store?.lat ? Number(store.lat) : 19.1197}
              centerLng={store?.lng ? Number(store.lng) : 72.9050}
              zoom={15}
              nodes={store ? [{ id: store.id, name: store.name, lat: Number(store.lat ?? 19.1197), lng: Number(store.lng ?? 72.9050), isAssigned: true }] : []}
              riderPosition={store ? { lat: Number(store.lat ?? 19.1197) + 0.002, lng: Number(store.lng ?? 72.9050) + 0.002 } : undefined}
              deliveryLat={19.1197}
              deliveryLng={72.9050}
            />
            <div className="px-4 py-2.5 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {etaMins ? `Estimated arrival: ${etaMins} min · ` : ''}Rider location updates every 30 seconds. Map is indicative.
              </p>
            </div>
          </div>
        )}

        {/* ── SLA ─────────────────────────────────────────────────────── */}
        {!isDelivered && !isCancelled && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-lg mb-4">
            <Clock size={14} className="text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Committed delivery: {order.promisedSlaMins} minutes
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                SLA locked at time of order placement
              </p>
            </div>
          </div>
        )}

        {/* ── Delivery address ─────────────────────────────────────────── */}
        {order.flatNumber && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-lg mb-4">
            <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
            <div>
              <p className="section-label mb-0.5">Delivery Address</p>
              <p className="text-sm text-foreground font-medium">Flat {order.flatNumber}</p>
            </div>
          </div>
        )}

        {/* ── Items ───────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-4 mb-4">
          <p className="section-label mb-3">Dispensed Items</p>
          <div className="space-y-3">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium leading-snug">{item.name}</p>
                  {item.brand && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.brand}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Qty {item.quantity} × ₹{Number(item.unitPrice).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground flex-shrink-0">
                  ₹{Number(item.lineTotal).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="h-px bg-border my-3" />
          <div className="flex justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-sm font-semibold text-foreground">₹{Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="space-y-2 mb-6">
          {isDelivered && (
            <button
              onClick={() => reorder.mutate({ orderId: order.id })}
              disabled={reorder.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RotateCcw size={14} />
              {reorder.isPending ? "Adding to cart…" : "Reorder these items"}
            </button>
          )}

          {isDelivered && order.invoiceUrl && (
            <button
              onClick={() => window.open(order.invoiceUrl!, "_blank")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <FileDown size={14} />
              Download Invoice (PDF)
            </button>
          )}

          {/* Demo: advance status */}
          {nextStatus && !isDelivered && (
            <button
              onClick={() => advanceStatus.mutate({ orderId: order.id, status: nextStatus as any })}
              disabled={advanceStatus.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              {advanceStatus.isPending ? "Updating…" : `[Demo] Advance → ${nextStatus.replace(/_/g, " ")}`}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
