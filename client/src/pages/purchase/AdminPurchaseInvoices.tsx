import { useState, useMemo } from "react";
import { useLocation } from "wouter";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Search, CheckCircle, Pencil, Trash2, ArrowLeft, FileText, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  committed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  partially_returned: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  returned: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

function calcMargin(mrp: string, landingCost: string) {
  const m = parseFloat(mrp), l = parseFloat(landingCost);
  if (!m || !l) return "—";
  return ((m - l) / m * 100).toFixed(1) + "%";
}

export default function AdminPurchaseInvoices() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddLine, setShowAddLine] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Create form
  const [createForm, setCreateForm] = useState({
    invoiceNo: "", invoiceDate: new Date().toISOString().split("T")[0],
    supplierId: "", storeId: "1", supplierGstin: "", sourceType: "manual" as const, notes: "",
  });

  // Line form
  const [lineForm, setLineForm] = useState({
    productId: "", batchNo: "", mfgDate: "", expiryDate: "", mrp: "", purchaseRate: "",
    saleRate: "", qty: "1", freeQty: "0", schemeDiscount: "0", cashDiscount: "0",
    gstRate: "12", hsnCode: "",
  });
  const [editLineId, setEditLineId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: invoicesData, isLoading } = trpc.purchase.listInvoices.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter as any,
    limit: 100,
  });
  const invoices = invoicesData?.rows ?? [];

  const { data: invoiceDetail, refetch: refetchDetail } = trpc.purchase.getInvoice.useQuery(
    { id: selectedId! }, { enabled: !!selectedId }
  );

  const { data: suppliersResp } = trpc.masterData.suppliers.list.useQuery({ limit: 200 });
  const suppliers = (suppliersResp as any)?.rows ?? [];

  const { data: productsResp } = trpc.masterData.products.list.useQuery({ limit: 500 });
  const products = (productsResp as any)?.rows ?? [];

  const createInvoice = trpc.purchase.createInvoice.useMutation({
    onSuccess: (data) => {
      toast.success("Invoice created");
      setSelectedId(data.id);
      setView("detail");
      utils.purchase.listInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateInvoice = trpc.purchase.updateInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice updated"); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const cancelInvoice = trpc.purchase.cancelInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice cancelled");
      setShowCancelDialog(false);
      refetchDetail();
      utils.purchase.listInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addLine = trpc.purchase.addLine.useMutation({
    onSuccess: (data) => {
      toast.success(`Line added — Landing cost: ₹${data.landingCost}, Margin: ${data.margin}%`);
      setShowAddLine(false);
      resetLineForm();
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLine = trpc.purchase.updateLine.useMutation({
    onSuccess: (data) => {
      toast.success(`Line updated — Landing cost: ₹${data.landingCost}, Margin: ${data.margin}%`);
      setEditLineId(null);
      setShowAddLine(false);
      resetLineForm();
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLine = trpc.purchase.deleteLine.useMutation({
    onSuccess: () => { toast.success("Line removed"); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const commitInvoice = trpc.purchase.commitInvoice.useMutation({
    onSuccess: (data) => {
      const gstKeys = Object.keys(data.gstSummary ?? {});
      toast.success(`Invoice committed — ${gstKeys.length} GST rate(s) applied. Stock updated.`);
      refetchDetail();
      utils.purchase.listInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetLineForm() {
    setLineForm({ productId: "", batchNo: "", mfgDate: "", expiryDate: "", mrp: "", purchaseRate: "", saleRate: "", qty: "1", freeQty: "0", schemeDiscount: "0", cashDiscount: "0", gstRate: "12", hsnCode: "" });
    setEditLineId(null);
  }

  function openEditLine(line: any) {
    setLineForm({
      productId: String(line.line.productId ?? ""),
      batchNo: line.line.batchNo ?? "",
      mfgDate: line.line.mfgDate ? new Date(line.line.mfgDate).toISOString().split("T")[0] : "",
      expiryDate: line.line.expiryDate ? new Date(line.line.expiryDate).toISOString().split("T")[0] : "",
      mrp: line.line.mrp ?? "",
      purchaseRate: line.line.purchaseRate ?? "",
      saleRate: line.line.saleRate ?? "",
      qty: String(line.line.qty ?? 1),
      freeQty: String(line.line.freeQty ?? 0),
      schemeDiscount: line.line.schemeDiscount ?? "0",
      cashDiscount: line.line.cashDiscount ?? "0",
      gstRate: line.line.gstRate ?? "12",
      hsnCode: line.line.hsnCode ?? "",
    });
    setEditLineId(line.line.id);
    setShowAddLine(true);
  }

  function handleSubmitLine() {
    if (!lineForm.productId || !lineForm.batchNo || !lineForm.expiryDate || !lineForm.mrp || !lineForm.purchaseRate || !lineForm.qty) {
      toast.error("Product, batch, expiry, MRP, purchase rate and qty are required"); return;
    }
    const payload = {
      productId: parseInt(lineForm.productId),
      batchNo: lineForm.batchNo,
      mfgDate: lineForm.mfgDate ? new Date(lineForm.mfgDate) : undefined,
      expiryDate: new Date(lineForm.expiryDate),
      mrp: lineForm.mrp,
      purchaseRate: lineForm.purchaseRate,
      saleRate: lineForm.saleRate || undefined,
      qty: parseInt(lineForm.qty),
      freeQty: parseInt(lineForm.freeQty || "0"),
      schemeDiscount: lineForm.schemeDiscount || "0",
      cashDiscount: lineForm.cashDiscount || "0",
      gstRate: lineForm.gstRate || "12",
      hsnCode: lineForm.hsnCode || undefined,
    };
    if (editLineId) {
      updateLine.mutate({ id: editLineId, ...payload });
    } else {
      addLine.mutate({ purchaseInvoiceId: selectedId!, ...payload });
    }
  }

  const filteredInvoices = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(r => r.invoice.invoiceNo.toLowerCase().includes(q) || (r.supplierName ?? "").toLowerCase().includes(q));
  }, [invoices, search]);

  // Export CSV
  function exportCsv() {
    const rows = [["Invoice No", "Supplier", "Date", "Status", "Net Amount", "Total GST"]];
    filteredInvoices.forEach(r => rows.push([r.invoice.invoiceNo, r.supplierName ?? "", new Date(r.invoice.invoiceDate).toLocaleDateString(), r.invoice.status, r.invoice.netAmount ?? "", r.invoice.totalGst ?? ""]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "purchase_invoices.csv"; a.click();
  }

  const inv = invoiceDetail?.invoice;
  const lines = invoiceDetail?.lines ?? [];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {view !== "list" && (
            <Button variant="ghost" size="icon" onClick={() => { setView("list"); setSelectedId(null); }}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {view === "list" ? "Purchase Invoices" : view === "create" ? "New Purchase Invoice" : `Invoice: ${inv?.invoiceNo ?? "..."}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {view === "list" ? "Manage purchase invoices, GRN, and stock inward" : view === "create" ? "Create a new purchase invoice" : `${inv?.status ?? ""} · ${inv ? new Date(inv.invoiceDate).toLocaleDateString() : ""}`}
            </p>
          </div>
          {view === "list" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv} size="sm">Export CSV</Button>
              <Button onClick={() => setView("create")} className="gap-2"><Plus className="w-4 h-4" /> New Invoice</Button>
            </div>
          )}
        </div>

        {/* ── LIST ─────────────────────────────────────────────────────────── */}
        {view === "list" && (
          <>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search invoice no or supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="partially_returned">Partially Returned</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredInvoices.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>
                  ) : filteredInvoices.map(r => (
                    <TableRow key={r.invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedId(r.invoice.id); setView("detail"); }}>
                      <TableCell className="font-medium">{r.invoice.invoiceNo}</TableCell>
                      <TableCell>{r.supplierName ?? "—"}</TableCell>
                      <TableCell>{new Date(r.invoice.invoiceDate).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.invoice.sourceType ?? "manual"}</Badge></TableCell>
                      <TableCell><Badge className={STATUS_COLORS[r.invoice.status] ?? ""}>{r.invoice.status}</Badge></TableCell>
                      <TableCell className="text-right font-mono">₹{r.invoice.netAmount ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">₹{r.invoice.totalGst ?? "—"}</TableCell>
                      <TableCell><FileText className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ── CREATE ───────────────────────────────────────────────────────── */}
        {view === "create" && (
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Invoice Number *</Label>
                  <Input value={createForm.invoiceNo} onChange={e => setCreateForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="e.g. INV-2024-001" className="mt-1" />
                </div>
                <div>
                  <Label>Invoice Date *</Label>
                  <Input type="date" value={createForm.invoiceDate} onChange={e => setCreateForm(f => ({ ...f, invoiceDate: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier GSTIN</Label>
                  <Input value={createForm.supplierGstin} onChange={e => setCreateForm(f => ({ ...f, supplierGstin: e.target.value }))} className="mt-1" placeholder="27AABCU9603R1ZX" />
                </div>
                <div>
                  <Label>Source Type</Label>
                  <Select value={createForm.sourceType} onValueChange={v => setCreateForm(f => ({ ...f, sourceType: v as any }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="ocr">OCR</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" placeholder="Optional notes" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => {
                    if (!createForm.invoiceNo || !createForm.supplierId) { toast.error("Invoice number and supplier required"); return; }
                    createInvoice.mutate({ invoiceNo: createForm.invoiceNo, invoiceDate: new Date(createForm.invoiceDate), supplierId: parseInt(createForm.supplierId), storeId: parseInt(createForm.storeId), supplierGstin: createForm.supplierGstin || undefined, sourceType: createForm.sourceType, notes: createForm.notes || undefined });
                  }}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending ? "Creating..." : "Create Invoice"}
                </Button>
                <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── DETAIL ───────────────────────────────────────────────────────── */}
        {view === "detail" && inv && (
          <div className="space-y-4">
            {/* Invoice header card */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Supplier</p><p className="font-medium">{invoiceDetail?.supplierName ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Invoice Date</p><p className="font-medium">{new Date(inv.invoiceDate).toLocaleDateString()}</p></div>
                  <div><p className="text-muted-foreground text-xs">Status</p><Badge className={STATUS_COLORS[inv.status] ?? ""}>{inv.status}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Source</p><Badge variant="outline">{inv.sourceType ?? "manual"}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Total Amount</p><p className="font-mono font-medium">₹{inv.totalAmount ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Discount</p><p className="font-mono font-medium text-red-500">-₹{inv.totalDiscount ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">GST</p><p className="font-mono font-medium text-blue-500">₹{inv.totalGst ?? "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Net Amount</p><p className="font-mono font-bold text-lg">₹{inv.netAmount ?? "—"}</p></div>
                </div>
                {(() => {
                  if (!inv.gstSummary) return null;
                  let parsed: Record<string, { taxable?: number; gst?: number }> = {};
                  try { parsed = JSON.parse(inv.gstSummary as string); } catch { return null; }
                  const entries = Object.entries(parsed);
                  if (!entries.length) return null;
                  return (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">GST Summary</p>
                      <div className="flex gap-4 flex-wrap">
                        {entries.map(([rate, vals]) => (
                          <div key={rate} className="text-xs bg-muted px-2 py-1 rounded">
                            <span className="font-medium">{rate}:</span> Taxable ₹{vals.taxable?.toFixed(2)} | GST ₹{vals.gst?.toFixed(2)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-2 mt-4">
                  {inv.status === "draft" && (
                    <>
                      <Button onClick={() => setShowAddLine(true)} variant="outline" size="sm" className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Line</Button>
                      <Button onClick={() => commitInvoice.mutate({ id: inv.id })} disabled={commitInvoice.isPending || lines.length === 0} size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle className="w-3.5 h-3.5" /> {commitInvoice.isPending ? "Committing..." : "Commit & Update Stock"}
                      </Button>
                      <Button onClick={() => setShowCancelDialog(true)} variant="outline" size="sm" className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10">
                        <X className="w-3.5 h-3.5" /> Cancel Invoice
                      </Button>
                    </>
                  )}
                  {inv.status === "committed" && (
                    <Button onClick={() => setLocation(`/admin/purchase/returns/new?invoiceId=${inv.id}`)} variant="outline" size="sm">Create Return</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Line Items ({lines.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Free</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Landing</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      {inv.status === "draft" && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">No lines yet. Click "Add Line" to begin.</TableCell></TableRow>
                    ) : lines.map(r => (
                      <TableRow key={r.line.id}>
                        <TableCell className="font-medium">{r.productName ?? `#${r.line.productId}`}</TableCell>
                        <TableCell className="font-mono text-xs">{r.line.batchNo}</TableCell>
                        <TableCell className="text-xs">{r.line.expiryDate ? new Date(r.line.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : "—"}</TableCell>
                        <TableCell className="text-right">{r.line.qty}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.line.freeQty ?? 0}</TableCell>
                        <TableCell className="text-right font-mono">₹{r.line.mrp}</TableCell>
                        <TableCell className="text-right font-mono">₹{r.line.purchaseRate}</TableCell>
                        <TableCell className="text-right font-mono text-blue-600">₹{r.line.landingCost ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">{r.line.margin ? r.line.margin + "%" : "—"}</TableCell>
                        <TableCell className="text-right">{r.line.gstRate}%</TableCell>
                        {inv.status === "draft" && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLine(r)}><Pencil className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { if (confirm("Remove this line?")) deleteLine.mutate({ id: r.line.id }); }}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ADD / EDIT LINE DIALOG ────────────────────────────────────────── */}
        <Dialog open={showAddLine} onOpenChange={v => { if (!v) { setShowAddLine(false); resetLineForm(); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editLineId ? "Edit Line Item" : "Add Line Item"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="text-xs">Product *</Label>
                <Select value={lineForm.productId} onValueChange={v => setLineForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name ?? p.displayName ?? `#${p.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Batch No *</Label>
                <Input value={lineForm.batchNo} onChange={e => setLineForm(f => ({ ...f, batchNo: e.target.value }))} className="mt-1" placeholder="e.g. BT2024A" />
              </div>
              <div>
                <Label className="text-xs">Mfg Date</Label>
                <Input type="date" value={lineForm.mfgDate} onChange={e => setLineForm(f => ({ ...f, mfgDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Expiry Date *</Label>
                <Input type="date" value={lineForm.expiryDate} onChange={e => setLineForm(f => ({ ...f, expiryDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">MRP (₹) *</Label>
                <Input value={lineForm.mrp} onChange={e => setLineForm(f => ({ ...f, mrp: e.target.value }))} className="mt-1" placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Purchase Rate (₹) *</Label>
                <Input value={lineForm.purchaseRate} onChange={e => setLineForm(f => ({ ...f, purchaseRate: e.target.value }))} className="mt-1" placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Sale Rate (₹)</Label>
                <Input value={lineForm.saleRate} onChange={e => setLineForm(f => ({ ...f, saleRate: e.target.value }))} className="mt-1" placeholder="Leave blank to use MRP" />
              </div>
              <div>
                <Label className="text-xs">HSN Code</Label>
                <Input value={lineForm.hsnCode} onChange={e => setLineForm(f => ({ ...f, hsnCode: e.target.value }))} className="mt-1" placeholder="30049099" />
              </div>
              <div>
                <Label className="text-xs">Qty *</Label>
                <Input type="number" value={lineForm.qty} onChange={e => setLineForm(f => ({ ...f, qty: e.target.value }))} className="mt-1" min="1" />
              </div>
              <div>
                <Label className="text-xs">Free Qty</Label>
                <Input type="number" value={lineForm.freeQty} onChange={e => setLineForm(f => ({ ...f, freeQty: e.target.value }))} className="mt-1" min="0" />
              </div>
              <div>
                <Label className="text-xs">Scheme Disc %</Label>
                <Input value={lineForm.schemeDiscount} onChange={e => setLineForm(f => ({ ...f, schemeDiscount: e.target.value }))} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Cash Disc %</Label>
                <Input value={lineForm.cashDiscount} onChange={e => setLineForm(f => ({ ...f, cashDiscount: e.target.value }))} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">GST Rate %</Label>
                <Select value={lineForm.gstRate} onValueChange={v => setLineForm(f => ({ ...f, gstRate: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["0","5","12","18","28"].map(r => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {lineForm.purchaseRate && lineForm.mrp && lineForm.qty && (
              <div className="mt-2 p-3 bg-muted rounded text-sm">
                {(() => {
                  const pr = parseFloat(lineForm.purchaseRate), gr = parseFloat(lineForm.gstRate || "12"), sd = parseFloat(lineForm.schemeDiscount || "0"), cd = parseFloat(lineForm.cashDiscount || "0"), qty = parseInt(lineForm.qty || "1"), mrp = parseFloat(lineForm.mrp);
                  const base = pr * qty, schemeDis = base * sd / 100, cashDis = (base - schemeDis) * cd / 100, taxable = base - schemeDis - cashDis, gst = taxable * gr / 100, landing = qty > 0 ? (taxable + gst) / qty : 0, margin = mrp > 0 ? ((mrp - landing) / mrp * 100) : 0;
                  return <span>Landing cost: <strong>₹{landing.toFixed(2)}</strong> · Margin: <strong className={margin < 0 ? "text-red-500" : "text-emerald-600"}>{margin.toFixed(1)}%</strong> · GST: <strong>₹{gst.toFixed(2)}</strong></span>;
                })()}
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <Button onClick={handleSubmitLine} disabled={addLine.isPending || updateLine.isPending}>
                {addLine.isPending || updateLine.isPending ? "Saving..." : editLineId ? "Update Line" : "Add Line"}
              </Button>
              <Button variant="outline" onClick={() => { setShowAddLine(false); resetLineForm(); }}>Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── CANCEL DIALOG ────────────────────────────────────────────────── */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Cancel Invoice</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This will mark the invoice as cancelled. Stock will not be affected.</p>
            <div className="mt-3">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="mt-1" placeholder="e.g. Duplicate entry" />
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="destructive" onClick={() => cancelInvoice.mutate({ id: selectedId!, reason: cancelReason || "No reason provided" })} disabled={cancelInvoice.isPending}>
                {cancelInvoice.isPending ? "Cancelling..." : "Confirm Cancel"}
              </Button>
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Back</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
