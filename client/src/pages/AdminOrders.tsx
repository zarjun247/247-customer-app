import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { ShoppingCart, Search, ChevronRight, Clock, User, Package } from "lucide-react";
import { toast } from "sonner";

const ALL_STATUSES = [
  "draft", "awaiting_prescription", "awaiting_pharmacist_review",
  "clarification_needed", "rejected", "awaiting_allocation",
  "backorder_review", "reserved", "picking", "packed",
  "assigned_to_rider", "out_for_delivery", "delivery_exception",
  "returned", "delivered", "closed", "cancelled",
];

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-700/50 text-zinc-400",
  awaiting_prescription: "bg-amber-500/20 text-amber-400",
  awaiting_pharmacist_review: "bg-yellow-500/20 text-yellow-400",
  clarification_needed: "bg-orange-500/20 text-orange-400",
  rejected: "bg-red-600/20 text-red-500",
  awaiting_allocation: "bg-blue-500/20 text-blue-400",
  backorder_review: "bg-indigo-500/20 text-indigo-400",
  reserved: "bg-cyan-500/20 text-cyan-400",
  picking: "bg-violet-500/20 text-violet-400",
  packed: "bg-purple-500/20 text-purple-400",
  assigned_to_rider: "bg-pink-500/20 text-pink-400",
  out_for_delivery: "bg-orange-500/20 text-orange-400",
  delivery_exception: "bg-red-500/20 text-red-400",
  returned: "bg-zinc-500/20 text-zinc-400",
  delivered: "bg-green-500/20 text-green-400",
  closed: "bg-green-700/20 text-green-600",
  cancelled: "bg-red-500/20 text-red-400",
};

// Allowed transitions per current status
const NEXT_STATUSES: Record<string, string[]> = {
  awaiting_pharmacist_review: ["clarification_needed", "rejected", "awaiting_allocation"],
  clarification_needed: ["awaiting_pharmacist_review", "rejected"],
  awaiting_allocation: ["reserved", "backorder_review", "cancelled"],
  backorder_review: ["awaiting_allocation", "cancelled"],
  reserved: ["picking", "cancelled"],
  picking: ["packed", "cancelled"],
  packed: ["assigned_to_rider"],
  assigned_to_rider: ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_exception"],
  delivery_exception: ["out_for_delivery", "returned", "cancelled"],
  delivered: ["closed"],
  awaiting_prescription: ["awaiting_pharmacist_review", "cancelled"],
};

export default function AdminOrders() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: orders, refetch } = trpc.pharmacist.adminListOrders.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter, limit: 200 },
    { refetchInterval: 20_000 }
  );

  const advanceStatus = trpc.orders.advanceStatus.useMutation({
    onSuccess: () => {
      toast.success(`Order ORD-${selectedOrder?.id} → ${nextStatus.replace(/_/g, " ")}`);  
      setDialogOpen(false);
      setSelectedOrder(null);
      setNextStatus("");
      setReason("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (orders ?? []).filter((o: any) => {
    if (!search) return true;
    return String(o.id).includes(search) || o.userId?.toString().includes(search);
  });

  function openAdvance(order: any) {
    setSelectedOrder(order);
    const nexts = NEXT_STATUSES[order.status] ?? [];
    setNextStatus(nexts[0] ?? "");
    setDialogOpen(true);
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-100">Orders</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <Input
                placeholder="Search order ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 w-48 bg-zinc-900 border-white/10 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-52 bg-zinc-900 border-white/10 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="all">All statuses</SelectItem>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-zinc-900/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Order</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Placed</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">SLA</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500 text-sm">
                    No orders found
                  </td>
                </tr>
              ) : (
                filtered.map((order: any) => {
                  const placedAt = new Date(order.placedAt);
                  const slaMins = order.promisedSlaMins ?? 30;
                  const elapsed = Math.round((Date.now() - placedAt.getTime()) / 60000);
                  const slaOk = elapsed <= slaMins;
                  const nexts = NEXT_STATUSES[order.status] ?? [];
                  return (
                    <tr key={order.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-300">ORD-{order.id}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-zinc-600" />
                          #{order.userId}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[order.status] ?? "bg-zinc-700 text-zinc-300"}`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">₹{Number(order.total).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{placedAt.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${slaOk ? "text-green-400" : "text-red-400"}`}>
                          {elapsed}m / {slaMins}m
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {nexts.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-white/10 text-zinc-400 hover:text-zinc-100"
                            onClick={() => openAdvance(order)}
                          >
                            Advance <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advance status dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Advance Order ORD-{selectedOrder?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">Current status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selectedOrder?.status ?? ""] ?? "bg-zinc-700 text-zinc-300"}`}>
                {selectedOrder?.status?.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">New status</p>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger className="bg-zinc-800 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  {(NEXT_STATUSES[selectedOrder?.status ?? ""] ?? []).map(s => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">Reason (optional)</p>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Add a reason for this status change..."
                className="bg-zinc-800 border-white/10 text-sm resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              onClick={() => advanceStatus.mutate({ orderId: selectedOrder?.id, status: nextStatus as any, reason })}
              disabled={!nextStatus || advanceStatus.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {advanceStatus.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
