import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, CheckCircle, Package, Truck, RotateCcw, FileDown } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const ORDER_STEPS = [
  { key: "created", label: "Order Received" },
  { key: "pharmacist_reviewing", label: "Pharmacist Reviewing" },
  { key: "picking", label: "Picking" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_ORDER = ["created", "pharmacist_reviewing", "picking", "out_for_delivery", "delivered"];

function getStepIndex(status: string) {
  return STATUS_ORDER.indexOf(status);
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

  const reorder = trpc.orders.reorder.useMutation({
    onSuccess: (data) => {
      utils.cart.get.invalidate();
      toast.success(`${data.itemCount} items added to cart`);
      navigate("/cart");
    },
    onError: (e) => toast.error(e.message),
  });

  // Demo: advance status
  const advanceStatus = trpc.orders.advanceStatus.useMutation({
    onSuccess: () => utils.orders.detail.invalidate({ orderId }),
    onError: (e) => toast.error(e.message),
  });

  const getNextStatus = (current: string) => {
    const idx = STATUS_ORDER.indexOf(current);
    return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-3">
          <div className="h-8 w-32 rounded-lg bg-card animate-pulse" />
          <div className="h-40 rounded-xl bg-card animate-pulse" />
          <div className="h-32 rounded-xl bg-card animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 text-center">
          <p className="text-muted-foreground">Order not found</p>
        </div>
      </AppLayout>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const nextStatus = getNextStatus(order.status);

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/orders")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Order #{order.id}</h1>
            <p className="text-xs text-muted-foreground">
              {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Status Timeline */}
        {order.status !== "cancelled" && (
          <div className="bg-card rounded-xl border border-border p-4 mb-4">
            <div className="space-y-3">
              {ORDER_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const isLast = idx === ORDER_STEPS.length - 1;
                return (
                  <div key={step.key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted ? "bg-primary" : "bg-secondary border border-border"
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-px h-6 mt-1 ${isCompleted && idx < currentStepIdx ? "bg-primary/40" : "bg-border"}`} />
                      )}
                    </div>
                    <div className="pt-0.5">
                      <p className={`text-sm font-medium ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {isCurrent && order.status !== "delivered" && (
                        <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          In progress
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SLA */}
        {order.status !== "delivered" && order.status !== "cancelled" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 border border-primary/20 mb-4">
            <Clock className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground">Promised delivery: <span className="font-semibold">{order.promisedSlaMins} minutes</span></p>
          </div>
        )}

        {/* Order Items */}
        <div className="bg-card rounded-xl border border-border p-4 mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Items</h3>
          <div className="space-y-2">
            {order.items?.map((item) => (
              <div key={item.id} className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm text-foreground">{item.name}</p>
                  {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-medium text-foreground">₹{Number(item.lineTotal).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-3 pt-3 flex justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-sm font-semibold text-foreground">₹{Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        {/* Delivery Address */}
        {order.flatNumber && (
          <div className="bg-card rounded-xl border border-border px-4 py-3 mb-4">
            <p className="text-xs text-muted-foreground mb-1">Delivery to</p>
            <p className="text-sm text-foreground font-medium">Flat {order.flatNumber}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 mb-6">
          {order.status === "delivered" && (
            <>
              <Button
                variant="outline"
                className="w-full h-11 border-border text-foreground hover:bg-secondary"
                onClick={() => reorder.mutate({ orderId: order.id })}
                disabled={reorder.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reorder
              </Button>
              {order.invoiceUrl && (
                <Button
                  variant="outline"
                  className="w-full h-11 border-border text-foreground hover:bg-secondary"
                  onClick={() => window.open(order.invoiceUrl!, "_blank")}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Download Invoice
                </Button>
              )}
            </>
          )}

          {/* Demo: advance status button */}
          {nextStatus && order.status !== "delivered" && (
            <Button
              variant="outline"
              className="w-full h-11 border-primary/30 text-primary hover:bg-primary/10 text-xs"
              onClick={() => advanceStatus.mutate({ orderId: order.id, status: nextStatus as any })}
              disabled={advanceStatus.isPending}
            >
              [Demo] Advance to: {STATUS_ORDER[STATUS_ORDER.indexOf(order.status) + 1]?.replace(/_/g, " ")}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
