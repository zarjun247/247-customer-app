import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowLeft, CheckCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  committed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export default function AdminPurchaseReturns() {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);

  const [createForm, setCreateForm] = useState({
    purchaseInvoiceId: "", supplierId: "", storeId: "1", reason: "", debitNoteNo: "",
  });

  const [lineForm, setLineForm] = useState({
    purchaseLineId: "", batchId: "", qty: "1", returnRate: "", reason: "",
  });

  const utils = trpc.useUtils();

  const { data: returns, isLoading } = trpc.purchase.listReturns.useQuery({ limit: 100 });
  const { data: returnDetail, refetch: refetchDetail } = trpc.purchase.getReturn.useQuery(
    { id: selectedId! }, { enabled: !!selectedId }
  );
  const { data: suppliersResp } = trpc.masterData.suppliers.list.useQuery({ limit: 200 });
  const suppliers = (suppliersResp as any)?.rows ?? [];

  const createReturn = trpc.purchase.createReturn.useMutation({
    onSuccess: (data) => {
      toast.success("Purchase return created");
      setSelectedId(data.id);
      setView("detail");
      utils.purchase.listReturns.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addReturnLine = trpc.purchase.addReturnLine.useMutation({
    onSuccess: () => {
      toast.success("Return line added");
      setShowAddLine(false);
      setLineForm({ purchaseLineId: "", batchId: "", qty: "1", returnRate: "", reason: "" });
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const commitReturn = trpc.purchase.commitReturn.useMutation({
    onSuccess: () => {
      toast.success("Return committed — stock reduced");
      refetchDetail();
      utils.purchase.listReturns.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const ret = returnDetail?.ret;
  const lines = returnDetail?.lines ?? [];

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {view !== "list" && (
            <Button variant="ghost" size="icon" onClick={() => { setView("list"); setSelectedId(null); }}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RotateCcw className="w-6 h-6" />
              {view === "list" ? "Purchase Returns" : view === "create" ? "New Purchase Return" : `Return #${selectedId}`}
            </h1>
            <p className="text-sm text-muted-foreground">Manage purchase returns and debit notes</p>
          </div>
          {view === "list" && (
            <Button onClick={() => setView("create")} className="gap-2"><Plus className="w-4 h-4" /> New Return</Button>
          )}
        </div>

        {/* ── LIST ─────────────────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Debit Note</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !returns?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No purchase returns yet</TableCell></TableRow>
                ) : returns.map(r => (
                  <TableRow key={r.ret.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedId(r.ret.id); setView("detail"); }}>
                    <TableCell className="font-medium">#{r.ret.id}</TableCell>
                    <TableCell>{r.invoiceNo ?? "—"}</TableCell>
                    <TableCell>{r.supplierName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.ret.debitNoteNo ?? "—"}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[r.ret.status] ?? ""}>{r.ret.status}</Badge></TableCell>
                    <TableCell className="text-right font-mono">₹{r.ret.totalAmount ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.ret.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── CREATE ───────────────────────────────────────────────────────── */}
        {view === "create" && (
          <Card className="max-w-xl">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Purchase Invoice ID *</Label>
                  <Input value={createForm.purchaseInvoiceId} onChange={e => setCreateForm(f => ({ ...f, purchaseInvoiceId: e.target.value }))} className="mt-1" placeholder="Invoice ID to return against" />
                </div>
                <div>
                  <Label>Supplier *</Label>
                  <Select value={createForm.supplierId} onValueChange={v => setCreateForm(f => ({ ...f, supplierId: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Store ID *</Label>
                  <Input value={createForm.storeId} onChange={e => setCreateForm(f => ({ ...f, storeId: e.target.value }))} className="mt-1" placeholder="1" />
                </div>
                <div>
                  <Label>Debit Note No</Label>
                  <Input value={createForm.debitNoteNo} onChange={e => setCreateForm(f => ({ ...f, debitNoteNo: e.target.value }))} className="mt-1" placeholder="DN-2024-001" />
                </div>
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={createForm.reason} onChange={e => setCreateForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" placeholder="e.g. Damaged goods, short expiry" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => {
                    if (!createForm.purchaseInvoiceId || !createForm.supplierId) { toast.error("Invoice ID and supplier required"); return; }
                    createReturn.mutate({ purchaseInvoiceId: parseInt(createForm.purchaseInvoiceId), supplierId: parseInt(createForm.supplierId), storeId: parseInt(createForm.storeId), reason: createForm.reason || "Return initiated", debitNoteNo: createForm.debitNoteNo || undefined });
                  }}
                  disabled={createReturn.isPending}
                >
                  {createReturn.isPending ? "Creating..." : "Create Return"}
                </Button>
                <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── DETAIL ───────────────────────────────────────────────────────── */}
        {view === "detail" && ret && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Status</p><Badge className={STATUS_COLORS[ret.status] ?? ""}>{ret.status}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Debit Note</p><p className="font-mono">{ret.debitNoteNo ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Total Amount</p><p className="font-mono font-bold">₹{ret.totalAmount ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Reason</p><p>{ret.reason ?? "—"}</p></div>
                </div>
                <div className="flex gap-2 mt-4">
                  {ret.status === "draft" && (
                    <>
                      <Button onClick={() => setShowAddLine(true)} variant="outline" size="sm" className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Return Line</Button>
                      <Button onClick={() => commitReturn.mutate({ id: ret.id })} disabled={commitReturn.isPending || lines.length === 0} size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle className="w-3.5 h-3.5" /> {commitReturn.isPending ? "Committing..." : "Commit Return"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Return Lines ({lines.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Return Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No return lines. Click "Add Return Line".</TableCell></TableRow>
                    ) : lines.map(r => (
                      <TableRow key={r.line.id}>
                        <TableCell>{r.productName ?? `#${r.line.purchaseReturnId}`}</TableCell>
                        <TableCell className="font-mono text-xs">{r.batchNumber ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.line.qty}</TableCell>
                        <TableCell className="text-right font-mono">₹{r.line.returnRate}</TableCell>
                        <TableCell className="text-right font-mono">₹{(parseFloat(r.line.returnRate ?? "0") * r.line.qty).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.line.reason ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ADD RETURN LINE DIALOG ────────────────────────────────────────── */}
        <Dialog open={showAddLine} onOpenChange={setShowAddLine}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Return Line</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Purchase Line ID *</Label>
                <Input value={lineForm.purchaseLineId} onChange={e => setLineForm(f => ({ ...f, purchaseLineId: e.target.value }))} className="mt-1" placeholder="Line ID from original invoice" />
              </div>
              <div>
                <Label className="text-xs">Batch ID *</Label>
                <Input value={lineForm.batchId} onChange={e => setLineForm(f => ({ ...f, batchId: e.target.value }))} className="mt-1" placeholder="Batch ID" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Return Qty *</Label>
                  <Input type="number" value={lineForm.qty} onChange={e => setLineForm(f => ({ ...f, qty: e.target.value }))} className="mt-1" min="1" />
                </div>
                <div>
                  <Label className="text-xs">Return Rate (₹) *</Label>
                  <Input value={lineForm.returnRate} onChange={e => setLineForm(f => ({ ...f, returnRate: e.target.value }))} className="mt-1" placeholder="0.00" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason</Label>
                <Input value={lineForm.reason} onChange={e => setLineForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" placeholder="e.g. Damaged" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => {
                  if (!lineForm.purchaseLineId || !lineForm.batchId || !lineForm.qty || !lineForm.returnRate) { toast.error("All required fields must be filled"); return; }
                  addReturnLine.mutate({ purchaseReturnId: selectedId!, purchaseLineId: parseInt(lineForm.purchaseLineId), batchId: parseInt(lineForm.batchId), qty: parseInt(lineForm.qty), returnRate: lineForm.returnRate, reason: lineForm.reason || "Line return adjustment" });
                }}
                disabled={addReturnLine.isPending}
              >
                {addReturnLine.isPending ? "Adding..." : "Add Line"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddLine(false)}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
