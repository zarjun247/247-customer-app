import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, TrendingUp, ShoppingCart, Package, AlertTriangle, Clock, FileText } from "lucide-react";
import { toast } from "sonner";

type Tab = "daily_sale" | "daily_purchase" | "gst" | "stock" | "near_expiry" | "sla" | "shift";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "daily_sale", label: "Daily Sale", icon: TrendingUp },
  { id: "daily_purchase", label: "Daily Purchase", icon: ShoppingCart },
  { id: "gst", label: "GST Summary", icon: FileText },
  { id: "stock", label: "Stock Valuation", icon: Package },
  { id: "near_expiry", label: "Near Expiry", icon: AlertTriangle },
  { id: "sla", label: "SLA Performance", icon: Clock },
];

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) { toast.error("No data to export"); return; }
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("daily_sale");
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const dailySale = trpc.reports.dailySale.useQuery({ fromDate: from, toDate: to }, { enabled: tab === "daily_sale" });
  const dailyPurchase = trpc.reports.dailyPurchase.useQuery({ fromDate: from, toDate: to }, { enabled: tab === "daily_purchase" });
  const gstSummary = trpc.reports.gstSummary.useQuery({ fromDate: from, toDate: to }, { enabled: tab === "gst" });
  const stockVal = trpc.reports.stockValuation.useQuery({}, { enabled: tab === "stock" });
  const nearExpiry = trpc.reports.nearExpiry.useQuery({ days: 90 }, { enabled: tab === "near_expiry" });
  const slaPerf = trpc.reports.slaPerformance.useQuery({ fromDate: from, toDate: to }, { enabled: tab === "sla" });

  const dailySaleRows = Array.isArray(dailySale.data?.rows) ? dailySale.data.rows : [];
  const dailyPurchaseRows = Array.isArray(dailyPurchase.data?.rows) ? dailyPurchase.data.rows : [];
  const gstRows = Array.isArray(gstSummary.data?.rows) ? gstSummary.data.rows : [];
  const stockRows = Array.isArray(stockVal.data?.rows) ? stockVal.data.rows : [];
  const nearExpiryRows = Array.isArray(nearExpiry.data?.rows) ? nearExpiry.data.rows : [];
  const slaTotals = slaPerf.data?.totals;

  const fmt = (v: unknown) => v != null ? `₹${parseFloat(String(v)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";
  const fmtN = (v: unknown) => v != null ? parseFloat(String(v)).toLocaleString("en-IN") : "—";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/pharmacy")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Reports</h1>
            <p className="text-sm text-white/50">Business intelligence and compliance reports</p>
          </div>
        </div>

        {/* Date range */}
        <Card className="bg-white/5 border-white/10 mb-5">
          <CardContent className="p-4 flex flex-wrap gap-4 items-end">
            <div>
              <Label className="text-white/60 text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-white/10 border-white/20 text-white mt-1 w-40" />
            </div>
            <div>
              <Label className="text-white/60 text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-white/10 border-white/20 text-white mt-1 w-40" />
            </div>
            <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent" onClick={() => { setFrom(firstOfMonth); setTo(today); }}>
              This Month
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-5">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white hover:bg-white/8"}`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Daily Sale */}
        {tab === "daily_sale" && (
          <div className="space-y-4">
            {dailySale.data && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Orders Delivered", value: fmtN(dailySale.data?.totals?.totalOrders) },
                    { label: "Revenue", value: fmt(dailySale.data?.totals?.totalRevenue) },
                    { label: "Units Sold", value: fmtN(dailySale.data?.totals?.totalItems) },
                  ].map(m => (
                    <Card key={m.label} className="bg-white/5 border-white/10">
                      <CardContent className="p-4">
                        <p className="text-xs text-white/50">{m.label}</p>
                        <p className="text-xl font-semibold mt-1">{m.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="bg-white/5 border-white/10">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-white text-base">By Category</CardTitle>
                    <Button size="sm" variant="ghost" className="text-white/60 gap-1" onClick={() => downloadCsv((dailySale.data?.csvData as Record<string, unknown>[] | undefined) ?? [], `daily-sale-${from}-${to}.csv`)}>
                      <Download className="w-3.5 h-3.5" /> Export
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-white/50">Category</TableHead>
                          <TableHead className="text-white/50 text-right">Revenue</TableHead>
                          <TableHead className="text-white/50 text-right">Units</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailySaleRows.map((row, i) => (
                          <TableRow key={i} className="border-white/5">
                            <TableCell className="text-white capitalize">{row.category ?? "Unknown"}</TableCell>
                            <TableCell className="text-right text-white/70">{fmt(row.revenue)}</TableCell>
                            <TableCell className="text-right text-white/70">{fmtN(row.units)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
            {dailySale.isLoading && <p className="text-center py-12 text-white/40">Loading...</p>}
          </div>
        )}

        {/* Daily Purchase */}
        {tab === "daily_purchase" && (
          <div className="space-y-4">
            {dailyPurchase.data && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Invoices", value: fmtN(dailyPurchase.data.totals?.totalInvoices) },
                    { label: "Total Amount", value: fmt(dailyPurchase.data.totals?.totalAmount) },
                    { label: "GST Paid", value: fmt(dailyPurchase.data.totals?.totalGst) },
                  ].map(m => (
                    <Card key={m.label} className="bg-white/5 border-white/10">
                      <CardContent className="p-4">
                        <p className="text-xs text-white/50">{m.label}</p>
                        <p className="text-xl font-semibold mt-1">{m.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="bg-white/5 border-white/10">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-white text-base">Invoices</CardTitle>
                    <Button size="sm" variant="ghost" className="text-white/60 gap-1" onClick={() => downloadCsv((dailyPurchase.data?.csvData as Record<string, unknown>[] | undefined) ?? [], `purchase-${from}-${to}.csv`)}>
                      <Download className="w-3.5 h-3.5" /> Export
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-white/50">Invoice No</TableHead>
                          <TableHead className="text-white/50">Supplier</TableHead>
                          <TableHead className="text-white/50">Date</TableHead>
                          <TableHead className="text-white/50 text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyPurchaseRows.map((row: any) => (
                          <TableRow key={row.id} className="border-white/5">
                            <TableCell className="text-white font-mono text-xs">{row.invoiceNo}</TableCell>
                            <TableCell className="text-white/70">{row.supplierName ?? "—"}</TableCell>
                            <TableCell className="text-white/50 text-xs">{new Date(row.invoiceDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right text-white/70">{fmt(row.netAmount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
            {dailyPurchase.isLoading && <p className="text-center py-12 text-white/40">Loading...</p>}
          </div>
        )}

        {/* GST Summary */}
        {tab === "gst" && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">HSN-wise GST Summary</CardTitle>
              {gstSummary.data && (
                <Button size="sm" variant="ghost" className="text-white/60 gap-1" onClick={() => downloadCsv((gstSummary.data?.csvData as Record<string, unknown>[] | undefined) ?? [], `gst-${from}-${to}.csv`)}>
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {gstSummary.data ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/50">HSN Code</TableHead>
                      <TableHead className="text-white/50 text-right">GST Rate</TableHead>
                      <TableHead className="text-white/50 text-right">Taxable Value</TableHead>
                      <TableHead className="text-white/50 text-right">GST Amount</TableHead>
                      <TableHead className="text-white/50 text-right">Total Value</TableHead>
                      <TableHead className="text-white/50 text-right">Units</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstRows.map((row, i) => (
                      <TableRow key={i} className="border-white/5">
                        <TableCell className="text-white font-mono text-xs">{row.hsnCode ?? "—"}</TableCell>
                        <TableCell className="text-right text-white/70">{row.gstRate}%</TableCell>
                        <TableCell className="text-right text-white/70">{fmt(row.taxableValue)}</TableCell>
                        <TableCell className="text-right text-emerald-400">{fmt(row.gstAmount)}</TableCell>
                        <TableCell className="text-right text-white">{fmt(row.totalValue)}</TableCell>
                        <TableCell className="text-right text-white/50">{fmtN(row.units)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-center py-12 text-white/40">Loading...</p>}
            </CardContent>
          </Card>
        )}

        {/* Stock Valuation */}
        {tab === "stock" && (
          <div className="space-y-4">
            {stockVal.data && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Stock Value (Cost)", value: fmt(stockVal.data.totals?.totalStockValue) },
                    { label: "Stock Value (MRP)", value: fmt(stockVal.data.totals?.totalMrpValue) },
                    { label: "Total Units", value: fmtN(stockVal.data.totals?.totalUnits) },
                  ].map(m => (
                    <Card key={m.label} className="bg-white/5 border-white/10">
                      <CardContent className="p-4">
                        <p className="text-xs text-white/50">{m.label}</p>
                        <p className="text-xl font-semibold mt-1">{m.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="bg-white/5 border-white/10">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-white text-base">Batch-wise Stock</CardTitle>
                    <Button size="sm" variant="ghost" className="text-white/60 gap-1" onClick={() => downloadCsv((stockVal.data?.csvData as Record<string, unknown>[] | undefined) ?? [], "stock-valuation.csv")}>
                      <Download className="w-3.5 h-3.5" /> Export
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-white/50">Product</TableHead>
                          <TableHead className="text-white/50">Batch</TableHead>
                          <TableHead className="text-white/50">Expiry</TableHead>
                          <TableHead className="text-white/50 text-right">Qty</TableHead>
                          <TableHead className="text-white/50 text-right">Cost Value</TableHead>
                          <TableHead className="text-white/50 text-right">MRP Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockRows.slice(0, 100).map((row, i) => (
                          <TableRow key={i} className="border-white/5">
                            <TableCell className="text-white text-sm">{String(row.productName ?? "—")}</TableCell>
                            <TableCell className="text-white/60 font-mono text-xs">{String(row.batchNumber ?? "—")}</TableCell>
                            <TableCell className="text-white/50 text-xs">{row.expiryDate ? new Date(row.expiryDate as unknown as string).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : "—"}</TableCell>
                            <TableCell className="text-right text-white/70">{String(row.quantity ?? 0)}</TableCell>
                            <TableCell className="text-right text-white/70">{fmt(row.stockValue)}</TableCell>
                            <TableCell className="text-right text-white/50">{fmt(row.mrpValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {stockRows.length > 100 && <p className="text-center text-xs text-white/40 mt-3">Showing first 100 rows. Export CSV for full data.</p>}
                  </CardContent>
                </Card>
              </>
            )}
            {stockVal.isLoading && <p className="text-center py-12 text-white/40">Loading...</p>}
          </div>
        )}

        {/* Near Expiry */}
        {tab === "near_expiry" && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">Near-Expiry Stock (next 90 days)</CardTitle>
              {nearExpiry.data && (
                <Button size="sm" variant="ghost" className="text-white/60 gap-1" onClick={() => downloadCsv((nearExpiry.data?.csvData as Record<string, unknown>[] | undefined) ?? [], "near-expiry.csv")}>
                  <Download className="w-3.5 h-3.5" /> Export
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {nearExpiry.data ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/50">Product</TableHead>
                      <TableHead className="text-white/50">Schedule</TableHead>
                      <TableHead className="text-white/50">Batch</TableHead>
                      <TableHead className="text-white/50">Expiry</TableHead>
                      <TableHead className="text-white/50 text-right">Qty</TableHead>
                      <TableHead className="text-white/50 text-right">Days Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nearExpiryRows.map((row: any, i: number) => {
                      const daysLeft = Math.ceil((new Date(row.batch?.expiryDate ?? row.expiryDate).getTime() - Date.now()) / 86400000);
                      const color = daysLeft <= 30 ? "text-red-400" : daysLeft <= 60 ? "text-amber-400" : "text-yellow-400";
                      return (
                        <TableRow key={i} className="border-white/5">
                          <TableCell className="text-white text-sm">{row.productName ?? "—"}</TableCell>
                          <TableCell className="text-white/50 text-xs">{row.schedule ?? "OTC"}</TableCell>
                          <TableCell className="text-white/60 font-mono text-xs">{row.batch?.batchNumber ?? row.batchNumber}</TableCell>
                          <TableCell className="text-white/70 text-xs">{new Date(row.batch?.expiryDate ?? row.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                          <TableCell className="text-right text-white/70">{row.batch?.quantity ?? row.quantity}</TableCell>
                          <TableCell className={`text-right font-semibold ${color}`}>{daysLeft}d</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : <p className="text-center py-12 text-white/40">Loading...</p>}
            </CardContent>
          </Card>
        )}

        {/* SLA Performance */}
        {tab === "sla" && (
          <div className="space-y-4">
            {slaPerf.data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Orders", value: fmtN(slaTotals?.total) },
                  { label: "On Time", value: fmtN(slaTotals?.onTime), color: "text-emerald-400" },
                  { label: "Breached", value: fmtN(slaTotals?.breached), color: "text-red-400" },
                  { label: "Avg Delivery", value: slaTotals?.avgDeliveryMins ? `${parseFloat(String(slaTotals?.avgDeliveryMins)).toFixed(0)} min` : "—" },
                ].map(m => (
                  <Card key={m.label} className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                      <p className="text-xs text-white/50">{m.label}</p>
                      <p className={`text-xl font-semibold mt-1 ${m.color ?? "text-white"}`}>{m.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {slaPerf.isLoading && <p className="text-center py-12 text-white/40">Loading...</p>}
          </div>
        )}
      </div>
    </div>
  );
}
