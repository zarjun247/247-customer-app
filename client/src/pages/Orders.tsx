import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ChevronRight, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  created: { label: "Order Received", color: "bg-secondary text-muted-foreground border-border" },
  pharmacist_reviewing: { label: "Pharmacist Reviewing", color: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  picking: { label: "Picking", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  out_for_delivery: { label: "Out for Delivery", color: "bg-primary/15 text-primary border-primary/25" },
  delivered: { label: "Delivered", color: "bg-primary/20 text-primary border-primary/30" },
  cancelled: { label: "Cancelled", color: "bg-destructive/15 text-destructive border-destructive/25" },
};

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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold text-foreground mb-5">Orders</h1>

        {!orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-foreground font-medium mb-1">No orders yet</p>
            <p className="text-sm text-muted-foreground mb-6">Your order history will appear here</p>
            <Button variant="outline" className="border-border text-foreground hover:bg-secondary" onClick={() => navigate("/catalog")}>
              Browse Catalog
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.created;
              return (
                <div
                  key={order.id}
                  className="p-4 rounded-xl bg-card border border-border hover:border-border/80 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Order #{order.id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge className={`text-[10px] px-2 py-0.5 border ${config.color}`}>{config.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">₹{Number(order.total).toFixed(2)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => reorder.mutate({ orderId: order.id })}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary"
                        disabled={reorder.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reorder
                      </button>
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        Details <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
