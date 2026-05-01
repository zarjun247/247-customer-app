import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

const BUCKET_COLORS: Record<string, string> = {
  normal: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  critical: "bg-orange-100 text-orange-800",
  quarantine_candidate: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800 line-through",
};

const BUCKET_LABELS: Record<string, string> = {
  normal: ">90d",
  warning: "61–90d",
  critical: "31–60d",
  quarantine_candidate: "≤30d",
  expired: "Expired",
};

export default function AdminBatchwiseBalance() {
  const [page, setPage] = useState(1);
  const [storeId, setStoreId] = useState<number | undefined>();
  const [expiryBucket, setExpiryBucket] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [quarantineModal, setQuarantineModal] = useState<{ batchId: number; batchNo: string; maxQty: number } | null>(null);
  const [disposeModal, setDisposeModal] = useState<{ batchId: number; batchNo: string; maxQty: number } | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string>("near_expiry");
  const [note, setNote] = useState("");

  const { data, isLoading, refetch } = trpc.inventoryLedger.batch.list.useQuery({
    page, pageSize: 50,
    storeId,
    expiryBucket: expiryBucket as any,
    status: status as any,
  }, { placeholderData: (prev: any) => prev });

  const { data: storeList } = trpc.masterData.stores.list.useQuery({ limit: 100 });

  const quarantineMut = trpc.inventoryLedger.batch.quarantine.useMutation({
    onSuccess: () => { toast.success("Batch quarantined"); setQuarantineModal(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const disposeMut = trpc.inventoryLedger.batch.dispose.useMutation({
    onSuccess: () => { toast.success("Batch disposed"); setDisposeModal(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Batchwise Balance</h1>
            <p className="text-muted-foreground text-sm">Per-batch stock with FEFO expiry tracking</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Select value={storeId ? String(storeId) : "all"} onValueChange={v => { setStoreId(v === "all" ? undefined : Number(v)); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Stores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {storeList?.rows?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={expiryBucket ?? "all"} onValueChange={v => { setExpiryBucket(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Buckets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buckets</SelectItem>
              <SelectItem value="normal">Normal (&gt;90d)</SelectItem>
              <SelectItem value="warning">Warning (61–90d)</SelectItem>
              <SelectItem value="critical">Critical (31–60d)</SelectItem>
              <SelectItem value="quarantine_candidate">Quarantine (≤30d)</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status ?? "all"} onValueChange={v => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="quarantined">Quarantined</SelectItem>
              <SelectItem value="depleted">Depleted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Batch No</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Quarantined</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Sale Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !data?.rows?.length ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No batches found</TableCell></TableRow>
                ) : data.rows.map((row: any) => {
                  const b = row.batch;
                  const expiry = new Date(b.expiryDate);
                  const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86400000);
                  return (
                    <TableRow key={b.id} className={b.expiryBucket === "expired" ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{row.productName ?? `#${b.productId}`}</TableCell>
                      <TableCell>{row.storeName ?? `#${b.storeId}`}</TableCell>
                      <TableCell className="font-mono text-sm">{b.batchNo}</TableCell>
                      <TableCell>
                        <span className={daysLeft <= 30 ? "text-red-600 font-medium" : daysLeft <= 60 ? "text-orange-600" : daysLeft <= 90 ? "text-amber-600" : ""}>
                          {expiry.toLocaleDateString()}
                          {daysLeft >= 0 && <span className="ml-1 text-xs">({daysLeft}d)</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={BUCKET_COLORS[b.expiryBucket] ?? ""}>
                          {BUCKET_LABELS[b.expiryBucket] ?? b.expiryBucket}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{b.qtyOnHand}</TableCell>
                      <TableCell className="text-right text-amber-600">{b.qtyReserved}</TableCell>
                      <TableCell className="text-right text-orange-600">{b.qtyQuarantined}</TableCell>
                      <TableCell>₹{b.mrp}</TableCell>
                      <TableCell>₹{b.saleRate}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {b.status === "active" && b.qtyOnHand > 0 && (
                            <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 text-xs"
                              onClick={() => { setQuarantineModal({ batchId: b.id, batchNo: b.batchNo, maxQty: b.qtyOnHand }); setQty(1); setReason("near_expiry"); setNote(""); }}>
                              Quarantine
                            </Button>
                          )}
                          {(b.qtyOnHand > 0 || b.qtyQuarantined > 0) && (
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs"
                              onClick={() => { setDisposeModal({ batchId: b.id, batchNo: b.batchNo, maxQty: b.qtyOnHand + b.qtyQuarantined }); setQty(1); setNote(""); }}>
                              Dispose
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} · {data?.total ?? 0} total batches</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* Quarantine Modal */}
      <Dialog open={!!quarantineModal} onOpenChange={() => setQuarantineModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quarantine Batch: {quarantineModal?.batchNo}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Quantity (max {quarantineModal?.maxQty})</Label>
                <Input type="number" min={1} max={quarantineModal?.maxQty} value={qty} onChange={e => setQty(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="near_expiry">Near Expiry</SelectItem>
                    <SelectItem value="quality_issue">Quality Issue</SelectItem>
                    <SelectItem value="recall">Recall</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="cold_chain_breach">Cold Chain Breach</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuarantineModal(null)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" disabled={quarantineMut.isPending}
              onClick={() => quarantineModal && quarantineMut.mutate({ batchId: quarantineModal.batchId, qty, reason: reason as any, note: note })}>
              {quarantineMut.isPending ? "Processing..." : "Quarantine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispose Modal */}
      <Dialog open={!!disposeModal} onOpenChange={() => setDisposeModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispose Batch: {disposeModal?.batchNo}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-md border border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">Disposal is irreversible. Stock will be permanently written off.</p>
            </div>
            <div className="space-y-1">
              <Label>Quantity (max {disposeModal?.maxQty})</Label>
              <Input type="number" min={1} max={disposeModal?.maxQty} value={qty} onChange={e => setQty(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Reason (required)</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. Expired batch, cold chain failure..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeModal(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!note.trim() || disposeMut.isPending}
              onClick={() => disposeModal && disposeMut.mutate({ batchId: disposeModal.batchId, qty, note })}>
              {disposeMut.isPending ? "Processing..." : "Dispose"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
