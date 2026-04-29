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
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

const MODE_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cheque: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  neft: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  upi: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  rtgs: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function AdminSupplierPayments() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    supplierId: "", storeId: "1", amount: "", paymentMode: "neft",
    referenceNo: "", paymentDate: new Date().toISOString().split("T")[0],
    invoiceId: "", notes: "",
  });

  const utils = trpc.useUtils();

  const { data: payments, isLoading } = trpc.purchase.listPayments.useQuery({ limit: 100 });
  const { data: suppliersResp } = trpc.masterData.suppliers.list.useQuery({ limit: 200 });
  const suppliers = (suppliersResp as any)?.rows ?? [];

  const recordPayment = trpc.purchase.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      setShowCreate(false);
      setForm({ supplierId: "", storeId: "1", amount: "", paymentMode: "neft", referenceNo: "", paymentDate: new Date().toISOString().split("T")[0], invoiceId: "", notes: "" });
      utils.purchase.listPayments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function exportCsv() {
    const rows = [["Date", "Supplier", "Amount", "Mode", "Reference", "Invoice ID"]];
    (payments ?? []).forEach((r: any) => rows.push([
      new Date(r.payment.paymentDate).toLocaleDateString(),
      r.supplierName ?? "", r.payment.amount, r.payment.paymentMode,
      r.payment.referenceNo ?? "", r.payment.invoiceId ?? "",
    ]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "supplier_payments.csv"; a.click();
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6" /> Supplier Payments</h1>
            <p className="text-sm text-muted-foreground">Record and track payments to suppliers</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} size="sm">Export CSV</Button>
            <Button onClick={() => setShowCreate(true)} className="gap-2"><Plus className="w-4 h-4" /> Record Payment</Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : !payments?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payments recorded yet</TableCell></TableRow>
              ) : (payments as any[]).map((r: any) => (
                <TableRow key={r.payment.id}>
                  <TableCell>{new Date(r.payment.paymentDate).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{r.supplierName ?? "—"}</TableCell>
                  <TableCell><Badge className={MODE_COLORS[r.payment.paymentMode] ?? ""}>{r.payment.paymentMode?.toUpperCase()}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{r.payment.referenceNo ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.payment.invoiceId ? `#${r.payment.invoiceId}` : "—"}</TableCell>
                  <TableCell className="text-right font-mono font-medium">₹{r.payment.amount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.payment.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── CREATE DIALOG ─────────────────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier *</Label>
                  <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                    <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Payment Date *</Label>
                  <Input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Amount (₹) *</Label>
                  <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs">Payment Mode *</Label>
                  <Select value={form.paymentMode} onValueChange={v => setForm(f => ({ ...f, paymentMode: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="neft">NEFT</SelectItem>
                      <SelectItem value="rtgs">RTGS</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reference / Cheque No</Label>
                  <Input value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} className="mt-1" placeholder="UTR / Cheque No" />
                </div>
                <div>
                  <Label className="text-xs">Against Invoice ID</Label>
                  <Input value={form.invoiceId} onChange={e => setForm(f => ({ ...f, invoiceId: e.target.value }))} className="mt-1" placeholder="Invoice ID (optional)" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => {
                  if (!form.supplierId || !form.amount || !form.paymentMode) { toast.error("Supplier, amount and payment mode are required"); return; }
                  recordPayment.mutate({
                    supplierId: parseInt(form.supplierId),
                    storeId: parseInt(form.storeId),
                    amount: form.amount,
                    paymentMode: form.paymentMode as any,
                    referenceNo: form.referenceNo || undefined,
                    paymentDate: new Date(form.paymentDate),
                    purchaseInvoiceId: form.invoiceId ? parseInt(form.invoiceId) : undefined,
                    notes: form.notes || undefined,
                  });
                }}
                disabled={recordPayment.isPending}
              >
                {recordPayment.isPending ? "Recording..." : "Record Payment"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
