import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Plus, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminStockAdjustment() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Create form state
  const [form, setForm] = useState({
    storeId: "",
    batchId: "",
    adjustmentType: "increase" as "increase" | "decrease",
    qty: 1,
    reason: "",
    supportingNote: "",
  });

  const { data, isLoading, refetch } = trpc.inventoryLedger.adjustment.list.useQuery(
    { page, pageSize: 50, status: statusFilter as any },
    { placeholderData: (prev: any) => prev }
  );

  const createMut = trpc.inventoryLedger.adjustment.create.useMutation({
    onSuccess: () => { toast.success("Adjustment submitted for approval"); setShowCreate(false); setForm({ storeId: "", batchId: "", adjustmentType: "increase", qty: 1, reason: "", supportingNote: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.inventoryLedger.adjustment.approve.useMutation({
    onSuccess: () => { toast.success("Adjustment approved and applied"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.inventoryLedger.adjustment.reject.useMutation({
    onSuccess: () => { toast.success("Adjustment rejected"); setRejectModal(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Adjustments</h1>
            <p className="text-muted-foreground text-sm">Managed stock corrections requiring manager approval</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> New Adjustment</Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter ?? "all"} onValueChange={v => { setStatusFilter(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !data?.rows?.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No adjustments found</TableCell></TableRow>
                ) : data.rows.map((row: any) => {
                  const a = row.adj;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground text-xs">#{a.id}</TableCell>
                      <TableCell className="font-mono text-sm">{row.batchNo ?? `Batch #${a.batchId}`}</TableCell>
                      <TableCell>{`Store #${a.storeId}`}</TableCell>
                      <TableCell>
                        <Badge variant={a.adjustmentType === "increase" ? "default" : "destructive"} className="text-xs">
                          {a.adjustmentType === "increase" ? "▲ Increase" : "▼ Decrease"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{a.qty}</TableCell>
                      <TableCell className="max-w-40 truncate text-sm" title={a.reason}>{a.reason}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[a.status] ?? ""}>{a.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {a.status === "pending_approval" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-200 text-xs"
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate({ id: a.id })}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs"
                              onClick={() => { setRejectModal({ id: a.id }); setRejectReason(""); }}>
                              <XCircle className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} · {data?.total ?? 0} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* Create Adjustment Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Stock Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Adjustments require manager approval before stock is updated.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Store ID</Label>
                <Input type="number" placeholder="e.g. 1" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Batch ID</Label>
                <Input type="number" placeholder="e.g. 42" value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.adjustmentType} onValueChange={v => setForm(f => ({ ...f, adjustmentType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">▲ Increase</SelectItem>
                    <SelectItem value="decrease">▼ Decrease</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason (required)</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Physical count variance, damage write-off..." />
            </div>
            <div className="space-y-1">
              <Label>Supporting Note (optional)</Label>
              <Textarea value={form.supportingNote} onChange={e => setForm(f => ({ ...f, supportingNote: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!form.storeId || !form.batchId || !form.reason || createMut.isPending}
              onClick={() => createMut.mutate({ storeId: Number(form.storeId), batchId: Number(form.batchId), adjustmentType: form.adjustmentType, qty: form.qty, reason: form.reason, supportingNote: form.supportingNote || undefined })}>
              {createMut.isPending ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!rejectModal} onOpenChange={() => setRejectModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Adjustment #{rejectModal?.id}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Reason for rejection</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Explain why this adjustment is being rejected..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" disabled={rejectMut.isPending}
              onClick={() => rejectModal && rejectMut.mutate({ id: rejectModal.id, reason: rejectReason })}>
              {rejectMut.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
