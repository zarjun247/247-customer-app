import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, Plus, CheckCircle, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function PurchaseEntry() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState<"list" | "create" | "view">("list");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);

  // Form state for new invoice
  const [form, setForm] = useState({
    invoiceNo: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    supplierId: "",
    storeId: user?.staffStoreId ?? 1,
  });

  // Form state for new line
  const [lineForm, setLineForm] = useState({
    productId: "",
    batchNo: "",
    expiryDate: "",
    mrp: "",
    purchaseRate: "",
    qty: "",
    freeQty: "0",
    gstRate: "12",
    hsnCode: "",
  });

  const { data: invoices, refetch: refetchInvoices } = trpc.purchase.listInvoices.useQuery({ storeId: form.storeId });
  const { data: suppliersResp } = trpc.masterData.suppliers.list.useQuery({ limit: 200 });
  const suppliers = (suppliersResp as any)?.rows ?? [];
  const { data: invoiceDetail, refetch: refetchDetail } = trpc.purchase.getInvoice.useQuery(
    { id: selectedInvoiceId! },
    { enabled: !!selectedInvoiceId }
  );

  const createInvoice = trpc.purchase.createInvoice.useMutation({
    onSuccess: (data) => {
      toast.success("Invoice created");
      setSelectedInvoiceId(data.id);
      setStep("view");
      refetchInvoices();
    },
    onError: (e) => toast.error(e.message),
  });

  const addLine = trpc.purchase.addLine.useMutation({
    onSuccess: () => {
      toast.success("Line added");
      setShowAddLine(false);
      setLineForm({ productId: "", batchNo: "", expiryDate: "", mrp: "", purchaseRate: "", qty: "", freeQty: "0", gstRate: "12", hsnCode: "" });
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const commitInvoice = trpc.purchase.commitInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice committed — stock updated");
      refetchDetail();
      refetchInvoices();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreateInvoice = () => {
    if (!form.invoiceNo || !form.supplierId) { toast.error("Invoice number and supplier are required"); return; }
    createInvoice.mutate({
      invoiceNo: form.invoiceNo,
      invoiceDate: new Date(form.invoiceDate),
      supplierId: parseInt(form.supplierId),
      storeId: form.storeId,
    });
  };

  const handleAddLine = () => {
    if (!lineForm.productId || !lineForm.batchNo || !lineForm.expiryDate || !lineForm.mrp || !lineForm.purchaseRate || !lineForm.qty) {
      toast.error("All required fields must be filled"); return;
    }
    addLine.mutate({
      purchaseInvoiceId: selectedInvoiceId!,
      productId: parseInt(lineForm.productId),
      batchNo: lineForm.batchNo,
      expiryDate: new Date(lineForm.expiryDate),
      mrp: lineForm.mrp,
      purchaseRate: lineForm.purchaseRate,
      qty: parseInt(lineForm.qty),
      freeQty: parseInt(lineForm.freeQty),
      gstRate: lineForm.gstRate,
      hsnCode: lineForm.hsnCode || undefined,
    });
  };

  const statusColor: Record<string, string> = {
    draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    committed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => step === "list" ? setLocation("/pharmacy") : setStep("list")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Purchase Entry</h1>
            <p className="text-sm text-white/50">Create and manage purchase invoices</p>
          </div>
        </div>

        {step === "list" && (
          <>
            <div className="flex justify-between items-center mb-4">
              <p className="text-white/60 text-sm">{invoices?.length ?? 0} invoices</p>
              <Button onClick={() => setStep("create")} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Plus className="w-4 h-4" /> New Invoice
              </Button>
            </div>
            <div className="space-y-3">
              {invoices?.map((row) => (
                <Card key={row.invoice.id} className="bg-white/5 border-white/10 cursor-pointer hover:bg-white/8 transition-colors" onClick={() => { setSelectedInvoiceId(row.invoice.id); setStep("view"); }}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{row.invoice.invoiceNo}</p>
                      <p className="text-sm text-white/50">{row.supplierName ?? "Unknown supplier"} · {new Date(row.invoice.invoiceDate).toLocaleDateString()}</p>
                    </div>
                    <Badge className={statusColor[row.invoice.status] ?? "bg-white/10 text-white/60"}>{row.invoice.status}</Badge>
                  </CardContent>
                </Card>
              ))}
              {(!invoices || invoices.length === 0) && (
                <div className="text-center py-16 text-white/40">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No purchase invoices yet</p>
                  <p className="text-sm mt-1">Click "New Invoice" to start</p>
                </div>
              )}
            </div>
          </>
        )}

        {step === "create" && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-white">New Purchase Invoice</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/70">Invoice Number *</Label>
                  <Input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="e.g. INV-2024-001" />
                </div>
                <div>
                  <Label className="text-white/70">Invoice Date *</Label>
                  <Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-white/70">Supplier *</Label>
                <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleCreateInvoice} disabled={createInvoice.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {createInvoice.isPending ? "Creating..." : "Create Invoice"}
                </Button>
                <Button variant="ghost" onClick={() => setStep("list")} className="text-white/60">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "view" && invoiceDetail && (
          <div className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-lg font-semibold">{invoiceDetail.invoice.invoiceNo}</p>
                    <p className="text-sm text-white/50">{new Date(invoiceDetail.invoice.invoiceDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={statusColor[invoiceDetail.invoice.status] ?? "bg-white/10 text-white/60"}>{invoiceDetail.invoice.status}</Badge>
                    {invoiceDetail.invoice.status === "draft" && (
                      <Button size="sm" onClick={() => commitInvoice.mutate({ id: invoiceDetail.invoice.id })} disabled={commitInvoice.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {commitInvoice.isPending ? "Committing..." : "Commit & Update Stock"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-white text-base">Line Items ({invoiceDetail.lines.length})</CardTitle>
                {invoiceDetail.invoice.status === "draft" && (
                  <Dialog open={showAddLine} onOpenChange={setShowAddLine}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
                        <Plus className="w-3.5 h-3.5" /> Add Line
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-lg">
                      <DialogHeader><DialogTitle>Add Purchase Line</DialogTitle></DialogHeader>
                      <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-white/70 text-xs">Product ID *</Label>
                            <Input value={lineForm.productId} onChange={e => setLineForm(f => ({ ...f, productId: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="Product ID" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">Batch No *</Label>
                            <Input value={lineForm.batchNo} onChange={e => setLineForm(f => ({ ...f, batchNo: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="e.g. BT2024A" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">Expiry Date *</Label>
                            <Input type="date" value={lineForm.expiryDate} onChange={e => setLineForm(f => ({ ...f, expiryDate: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">MRP *</Label>
                            <Input value={lineForm.mrp} onChange={e => setLineForm(f => ({ ...f, mrp: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="0.00" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">Purchase Rate *</Label>
                            <Input value={lineForm.purchaseRate} onChange={e => setLineForm(f => ({ ...f, purchaseRate: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="0.00" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">Qty *</Label>
                            <Input type="number" value={lineForm.qty} onChange={e => setLineForm(f => ({ ...f, qty: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="0" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">Free Qty</Label>
                            <Input type="number" value={lineForm.freeQty} onChange={e => setLineForm(f => ({ ...f, freeQty: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="0" />
                          </div>
                          <div>
                            <Label className="text-white/70 text-xs">GST Rate %</Label>
                            <Input value={lineForm.gstRate} onChange={e => setLineForm(f => ({ ...f, gstRate: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="12" />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-white/70 text-xs">HSN Code</Label>
                            <Input value={lineForm.hsnCode} onChange={e => setLineForm(f => ({ ...f, hsnCode: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="e.g. 30049099" />
                          </div>
                        </div>
                        <Button onClick={handleAddLine} disabled={addLine.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                          {addLine.isPending ? "Adding..." : "Add Line"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {invoiceDetail.lines.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-white/50">Product</TableHead>
                        <TableHead className="text-white/50">Batch</TableHead>
                        <TableHead className="text-white/50">Expiry</TableHead>
                        <TableHead className="text-white/50 text-right">MRP</TableHead>
                        <TableHead className="text-white/50 text-right">Rate</TableHead>
                        <TableHead className="text-white/50 text-right">Qty</TableHead>
                        <TableHead className="text-white/50 text-right">Free</TableHead>
                        <TableHead className="text-white/50 text-right">GST%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceDetail.lines.map((row) => (
                        <TableRow key={row.line.id} className="border-white/5">
                          <TableCell className="text-white">{row.productName ?? `#${row.line.productId}`}</TableCell>
                          <TableCell className="text-white/70 font-mono text-xs">{row.line.batchNo}</TableCell>
                          <TableCell className="text-white/70 text-xs">{new Date(row.line.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</TableCell>
                          <TableCell className="text-right text-white/70">₹{row.line.mrp}</TableCell>
                          <TableCell className="text-right text-white/70">₹{row.line.purchaseRate}</TableCell>
                          <TableCell className="text-right text-white">{row.line.qty}</TableCell>
                          <TableCell className="text-right text-emerald-400">{row.line.freeQty ?? 0}</TableCell>
                          <TableCell className="text-right text-white/50">{row.line.gstRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-white/40">No lines added yet. Click "Add Line" to start.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
