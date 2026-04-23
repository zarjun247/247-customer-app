import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Clock, ChevronRight, RotateCcw, Package } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_HUMAN: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  created:               { label: "Received",       bg: "oklch(0.965 0.020 255)", color: "oklch(0.545 0.195 255)", dot: "oklch(0.545 0.195 255)" },
  pharmacist_reviewing:  { label: "Being verified", bg: "oklch(0.97 0.040 55)",   color: "oklch(0.620 0.150 55)",  dot: "oklch(0.720 0.150 55)" },
  picking:               { label: "Preparing",      bg: "oklch(0.965 0.020 255)", color: "oklch(0.545 0.195 255)", dot: "oklch(0.545 0.195 255)" },
  out_for_delivery:      { label: "On the way",     bg: "oklch(0.965 0.020 255)", color: "oklch(0.545 0.195 255)", dot: "oklch(0.545 0.195 255)" },
  delivered:             { label: "Delivered",      bg: "oklch(0.970 0.025 145)", color: "oklch(0.500 0.150 145)", dot: "oklch(0.600 0.160 145)" },
  cancelled:             { label: "Cancelled",      bg: "oklch(0.97 0.015 25)",   color: "oklch(0.550 0.180 25)",  dot: "oklch(0.620 0.210 25)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_HUMAN[status] ?? STATUS_HUMAN.created;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

const ACTIVE_STATUSES = new Set(["created", "pharmacist_reviewing", "picking", "out_for_delivery"]);

export default function Orders() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: orders, isLoading } = trpc.orders.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 20000,
  });

  const reorder = trpc.orders.reorder.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      toast.success(`${data.itemCount} items added`);
      navigate("/cart");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  const activeOrders = orders?.filter(o => ACTIVE_STATUSES.has(o.status)) ?? [];
  const pastOrders = orders?.filter(o => !ACTIVE_STATUSES.has(o.status)) ?? [];

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "oklch(0.175 0.012 255)" }}>
            Orders
          </h1>
          <p className="text-sm" style={{ color: "oklch(0.520 0.018 255)" }}>
            Dispensation history · All orders from your assigned pharmacy
          </p>
        </div>

        {!orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "oklch(0.965 0.004 255)" }}>
              <Package size={22} strokeWidth={1.5} style={{ color: "oklch(0.520 0.018 255)" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "oklch(0.175 0.012 255)" }}>
              No orders yet
            </p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "oklch(0.520 0.018 255)", maxWidth: "20rem" }}>
              Your dispensation history will appear here once you place your first order.
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
            {/* ── Active orders ────────────────────────────────────────── */}
            {activeOrders.length > 0 && (
              <div className="mb-6">
                <p className="section-label mb-3">In progress</p>
                <div className="space-y-2">
                  {activeOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="w-full text-left bg-white rounded-xl p-4 card-shadow transition-all hover:shadow-md"
                      style={{ border: "1px solid oklch(0.910 0.008 255)" }}
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                            Order #{order.id}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "oklch(0.650 0.012 255)" }}>
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short",
                              hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                          ₹{Number(order.total).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: "oklch(0.545 0.195 255)" }}>
                          <Clock size={11} />
                          <span>Track</span>
                          <ChevronRight size={12} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Past orders ───────────────────────────────────────────── */}
            {pastOrders.length > 0 && (
              <div className="mb-6">
                <p className="section-label mb-3">History</p>
                <div className="space-y-2">
                  {pastOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl p-4 card-shadow"
                      style={{ border: "1px solid oklch(0.910 0.008 255)" }}
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                            Order #{order.id}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "oklch(0.650 0.012 255)" }}>
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric"
                            })}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                          ₹{Number(order.total).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-3">
                          {order.status === "delivered" && (
                            <button
                              onClick={() => reorder.mutate({ orderId: order.id })}
                              disabled={reorder.isPending}
                              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: "oklch(0.520 0.018 255)" }}
                            >
                              <RotateCcw size={11} />
                              Reorder
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/orders/${order.id}`)}
                            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                            style={{ color: "oklch(0.545 0.195 255)" }}
                          >
                            View <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
