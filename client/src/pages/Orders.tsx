import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import AppLayout from "@/components/AppLayout";
import { Clock, ChevronRight, RotateCcw, Package, Search, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_HUMAN: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  created:               { label: "Received",       bg: "rgba(43,127,255,0.10)",  color: "#2B7FFF", dot: "#2B7FFF" },
  pharmacist_reviewing:  { label: "Being verified", bg: "rgba(245,158,11,0.10)",  color: "#F59E0B", dot: "#F59E0B" },
  picking:               { label: "Preparing",      bg: "rgba(43,127,255,0.10)",  color: "#2B7FFF", dot: "#2B7FFF" },
  out_for_delivery:      { label: "On the way",     bg: "rgba(43,127,255,0.10)",  color: "#2B7FFF", dot: "#2B7FFF" },
  delivered:             { label: "Delivered",      bg: "rgba(0,200,150,0.10)",   color: "#00C896", dot: "#00C896" },
  cancelled:             { label: "Cancelled",      bg: "rgba(244,63,94,0.10)",   color: "#F43F5E", dot: "#F43F5E" },
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
  const { isReady } = useOnboardingGuard();
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
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "#F0F0F2" }}>
            Orders
          </h1>
          <p className="text-sm" style={{ color: "#6B6B75" }}>
            Your complete medication dispensation history
          </p>
        </div>

        {!orders || orders.length === 0 ? (
          /* ── Action empty state ──────────────────────────────────────── */
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
              <Package size={22} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
              Your medication history starts here
            </p>
            <p className="text-sm leading-relaxed mb-8"
              style={{ color: "#6B6B75", maxWidth: "20rem" }}>
              Once you place an order, your full dispensation history will appear here — including prescriptions, receipts, and delivery records.
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
            {/* ── Active orders ────────────────────────────────────────── */}
            {activeOrders.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                  style={{ color: "#4B4B55" }}>In progress</p>
                <div className="space-y-2">
                  {activeOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="w-full text-left bg-[#141416] rounded-xl p-4 transition-all hover:shadow-md"
                      style={{ border: "1px solid #2A2A2E", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                            ORD-{String(order.id).padStart(6,'0')}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#4B4B55" }}>
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short",
                              hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                          ₹{Number(order.total).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: "#2B7FFF" }}>
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
                <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                  style={{ color: "#4B4B55" }}>History</p>
                <div className="space-y-2">
                  {pastOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-[#141416] rounded-xl p-4"
                      style={{ border: "1px solid #2A2A2E", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                            ORD-{String(order.id).padStart(6,'0')}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#4B4B55" }}>
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric"
                            })}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                          ₹{Number(order.total).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-3">
                          {order.status === "delivered" && (
                            <button
                              onClick={() => reorder.mutate({ orderId: order.id })}
                              disabled={reorder.isPending}
                              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: "#6B6B75" }}
                            >
                              <RotateCcw size={11} />
                              Reorder quickly
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/orders/${order.id}`)}
                            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                            style={{ color: "#2B7FFF" }}
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
