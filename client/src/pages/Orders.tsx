import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Package, ChevronRight, RotateCcw, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  created:               { label: "Order Received",       cls: "bg-muted text-muted-foreground" },
  pharmacist_reviewing:  { label: "Pharmacist Reviewing", cls: "bg-amber-500/15 text-amber-400" },
  picking:               { label: "Picking",              cls: "bg-primary/15 text-primary" },
  out_for_delivery:      { label: "Out for Delivery",     cls: "bg-primary/15 text-primary" },
  delivered:             { label: "Delivered",            cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled:             { label: "Cancelled",            cls: "bg-destructive/15 text-destructive" },
};

const ACTIVE_STATUSES = ["created", "pharmacist_reviewing", "picking", "out_for_delivery"];

export default function Orders() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: orders, isLoading } = trpc.orders.list.useQuery(undefined, { enabled: isAuthenticated });

  const reorder = trpc.orders.reorder.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      toast.success(`${data.itemCount} items added to cart`);
      navigate("/cart");
    },
    onError: (e) => toast.error(e.message),
  });

  const activeOrders = orders?.filter(o => ACTIVE_STATUSES.includes(o.status)) ?? [];
  const pastOrders = orders?.filter(o => !ACTIVE_STATUSES.includes(o.status)) ?? [];

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
        <h1 className="text-base font-semibold text-foreground mb-5">Orders</h1>

        {!orders || orders.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-5">
              <Package size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No orders on record</p>
            <p className="text-xs text-muted-foreground mb-6 max-w-[200px] leading-relaxed">
              Your complete order history, invoices, and dispensation records will appear here.
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
            {/* ── Active orders ─────────────────────────────────────────── */}
            {activeOrders.length > 0 && (
              <div className="mb-6">
                <p className="section-label mb-3">Active</p>
                <div className="space-y-2">
                  {activeOrders.map((order) => {
                    const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.created;
                    return (
                      <button
                        key={order.id}
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="w-full text-left px-4 py-3.5 rounded-lg bg-card border border-border hover:border-border/80 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Order #{order.id}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short",
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${config.cls}`}>
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">₹{Number(order.total).toFixed(2)}</span>
                          <div className="flex items-center gap-1 text-xs text-primary">
                            <Clock size={11} />
                            <span>Track order</span>
                            <ChevronRight size={12} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Past orders ───────────────────────────────────────────── */}
            {pastOrders.length > 0 && (
              <div className="mb-6">
                <p className="section-label mb-3">History</p>
                <div className="space-y-2">
                  {pastOrders.map((order) => {
                    const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.created;
                    return (
                      <div
                        key={order.id}
                        className="px-4 py-3.5 rounded-lg bg-card border border-border"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Order #{order.id}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric"
                              })}
                            </p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${config.cls}`}>
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">₹{Number(order.total).toFixed(2)}</span>
                          <div className="flex items-center gap-3">
                            {order.status === "delivered" && (
                              <button
                                onClick={() => reorder.mutate({ orderId: order.id })}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                disabled={reorder.isPending}
                              >
                                <RotateCcw size={11} />
                                Reorder
                              </button>
                            )}
                            <button
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                            >
                              View <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
