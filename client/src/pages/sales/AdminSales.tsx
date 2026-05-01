/**
 * AdminSales.tsx — PART 7: Sales List + Detail + Return
 */
import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Eye, RotateCcw, Download, RefreshCw } from "lucide-react";
import { Link } from "wouter";

type SaleStatus = "draft" | "confirmed" | "cancelled" | "returned";
type ReturnDisposition = "resaleable" | "quarantine" | "disposal";

interface ReturnLineForm {
  lineId: string;
  productName: string;
  batchNo: string | null;
  maxQty: number;
  returnQty: number;
  reason: string;
  stockDisposition: ReturnDisposition;
  selected: boolean;
}

const STATUS_COLORS: Record<SaleStatus, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  returned: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function AdminSales() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnLines, setReturnLines] = useState<ReturnLineForm[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [refundMode, setRefundMode] = useState<"cash" | "upi" | "credit_note">("cash");

  const listQuery = trpc.sales.listSales.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter as SaleStatus : undefined,
    page,
    pageSize: 20,
  });

  const detailQuery = trpc.sales.getDraft.useQuery(
    { saleId: selectedSaleId ?? "" },
    { enabled: !!selectedSaleId }
  );

  const createReturn = trpc.sales.createReturn.useMutation({
    onSuccess: (data) => {
      toast.success(`Return ${data.returnNo} created`);
      setShowReturnDialog(false);
      listQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExportCsv = () => {
    toast.info("CSV export coming soon");
  };

  const openReturnDialog = () => {
    if (!detailQuery.data) return;
    const lines = detailQuery.data.lines.map(l => ({
      lineId: l.line.id,
      productName: l.productName ?? "Unknown",
      batchNo: l.line.batchNo,
      maxQty: l.line.qty,
      returnQty: l.line.qty,
      reason: "",
      stockDisposition: "resaleable" as ReturnDisposition,
      selected: false,
    }));
    setReturnLines(lines);
    setShowReturnDialog(true);
  };

  const handleSubmitReturn = () => {
    if (!selectedSaleId) return;
    const selected = returnLines.filter(l => l.selected && l.returnQty > 0);
    if (selected.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    createReturn.mutate({
      saleId: selectedSaleId,
      reason: returnReason,
      refundMode,
      lines: selected.map(l => ({
        saleLineId: l.lineId,
        productId: "0",
        returnQty: l.returnQty,
        unitPrice: 0,
        stockDisposition: l.stockDisposition,
      })),
    });
  };

  const sale = detailQuery.data;
  const saleTotal = sale?.lines.reduce((s, l) => s + parseFloat(l.line.lineTotal ?? "0"), 0) ?? 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sales</h1>
            <p className="text-muted-foreground text-sm">View and manage all sales transactions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Link href="/admin/sales/counter">
              <Button size="sm">New Counter Sale</Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bill no, customer, product..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => listQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3">Bill No</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Payment</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              )}
              {listQuery.data?.rows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No sales found</td></tr>
              )}
              {listQuery.data?.rows.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono font-medium">{s.billNo}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">{s.customerName ?? s.customerMobile ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{s.saleType}</td>
                  <td className="px-4 py-3 text-right font-semibold">₹{parseFloat(s.total ?? "0").toFixed(2)}</td>
                  <td className="px-4 py-3 capitalize">{s.paymentMode ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status as SaleStatus] ?? ""}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedSaleId(s.id)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {listQuery.data && listQuery.data.total > 20 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, listQuery.data.total)} of {listQuery.data.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= listQuery.data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sale Detail Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!selectedSaleId} onOpenChange={open => !open && setSelectedSaleId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {sale?.sale.billNo ?? "Sale Detail"}
              {sale && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sale.sale.status as SaleStatus] ?? ""}`}>
                  {sale.sale.status}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading && <p className="text-center py-8 text-muted-foreground">Loading...</p>}

          {sale && (
            <div className="space-y-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p>{new Date(sale.sale.createdAt).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p>{sale.sale.customerName ?? sale.sale.customerMobile ?? "Walk-in"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sale Type</p>
                  <p className="capitalize">{sale.sale.saleType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment</p>
                  <p className="capitalize">{sale.sale.paymentMode ?? "—"}</p>
                </div>
                {sale.sale.pharmacistName && (
                  <div>
                    <p className="text-muted-foreground">Pharmacist</p>
                    <p>{sale.sale.pharmacistName} ({sale.sale.pharmacistRegNo})</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Lines */}
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Batch</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Rate</th>
                    <th className="text-right px-3 py-2">Disc</th>
                    <th className="text-right px-3 py-2">GST</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map(l => (
                    <tr key={l.line.id} className="border-b">
                      <td className="px-3 py-2">
                        <div>{l.productName}</div>
                        {l.line.scheduleCode && <Badge variant="outline" className="text-xs">{l.line.scheduleCode}</Badge>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <div>{l.line.batchNo ?? "—"}</div>
                        {l.line.expiryDate && (
                          <div className="text-muted-foreground">
                            {new Date(l.line.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{l.line.qty}</td>
                      <td className="px-3 py-2 text-right">₹{parseFloat(l.line.saleRate ?? "0").toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-green-600">-₹{parseFloat(l.line.discountAmount ?? "0").toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">₹{parseFloat(l.line.gstAmount ?? "0").toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-semibold">₹{parseFloat(l.line.lineTotal ?? "0").toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={6} className="px-3 py-2 text-right">Total</td>
                    <td className="px-3 py-2 text-right">₹{saleTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <DialogFooter>
            {sale?.sale.status === "confirmed" && (
              <Button variant="outline" onClick={openReturnDialog}>
                <RotateCcw className="h-4 w-4 mr-1" /> Create Return
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button variant="outline" onClick={() => setSelectedSaleId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Return Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Create Sale Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Return Reason</Label>
              <Input
                placeholder="Reason for return..."
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Refund Mode</Label>
              <Select value={refundMode} onValueChange={v => setRefundMode(v as typeof refundMode)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash Refund</SelectItem>
                  <SelectItem value="upi">UPI Refund</SelectItem>
                  <SelectItem value="credit_note">Credit Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Items to Return</Label>
              {returnLines.map((l, i) => (
                <div key={l.lineId} className={`p-3 border rounded-lg ${l.selected ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={l.selected}
                      onChange={e => setReturnLines(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{l.productName}</p>
                      {l.batchNo && <p className="text-xs text-muted-foreground font-mono">{l.batchNo}</p>}
                    </div>
                    {l.selected && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Qty (max {l.maxQty})</Label>
                        <Input
                          type="number" min={1} max={l.maxQty}
                          value={l.returnQty}
                          onChange={e => setReturnLines(prev => prev.map((r, j) => j === i ? { ...r, returnQty: Math.min(parseInt(e.target.value) || 1, l.maxQty) } : r))}
                          className="w-16 h-7 text-sm"
                        />
                        <Select
                          value={l.stockDisposition}
                          onValueChange={v => setReturnLines(prev => prev.map((r, j) => j === i ? { ...r, stockDisposition: v as ReturnDisposition } : r))}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="resaleable">Resaleable</SelectItem>
                            <SelectItem value="quarantine">Quarantine</SelectItem>
                            <SelectItem value="disposal">Disposal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitReturn} disabled={createReturn.isPending}>
              Submit Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
