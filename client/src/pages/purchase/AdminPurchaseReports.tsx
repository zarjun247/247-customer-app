import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ReportType = "register" | "supplier" | "product" | "batch";

export default function AdminPurchaseReports() {
  const [reportType, setReportType] = useState<ReportType>("register");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState<string>("all");
  const [enabled, setEnabled] = useState(false);

  const { data: suppliersResp } = trpc.masterData.suppliers.list.useQuery({ limit: 200 });
  const suppliers = (suppliersResp as any)?.rows ?? [];

  const registerInput = { dateFrom: new Date(fromDate), dateTo: new Date(toDate), supplierId: supplierId !== "all" ? parseInt(supplierId) : undefined };
  const supplierInput = { dateFrom: new Date(fromDate), dateTo: new Date(toDate) };
  const productInput = { dateFrom: new Date(fromDate), dateTo: new Date(toDate) };
  const batchInput = { dateFrom: new Date(fromDate), dateTo: new Date(toDate), supplierId: supplierId !== "all" ? parseInt(supplierId) : undefined };

  const { data: registerData, isLoading: loadingReg, refetch: refetchReg } = trpc.purchase.reports.register.useQuery(registerInput, { enabled: enabled && reportType === "register" });
  const { data: supplierData, isLoading: loadingSupp, refetch: refetchSupp } = trpc.purchase.reports.supplierWise.useQuery(supplierInput, { enabled: enabled && reportType === "supplier" });
  const { data: productData, isLoading: loadingProd, refetch: refetchProd } = trpc.purchase.reports.productWise.useQuery(productInput, { enabled: enabled && reportType === "product" });
  const { data: batchData, isLoading: loadingBatch, refetch: refetchBatch } = trpc.purchase.reports.batchwiseReport.useQuery(batchInput, { enabled: enabled && reportType === "batch" });

  // Normalise each report's return shape into a flat rows array
  const rawData = reportType === "register" ? registerData : reportType === "supplier" ? supplierData : reportType === "product" ? productData : batchData;
  const isLoading = loadingReg || loadingSupp || loadingProd || loadingBatch;
  function refetch() { if (reportType === "register") refetchReg(); else if (reportType === "supplier") refetchSupp(); else if (reportType === "product") refetchProd(); else refetchBatch(); }
  // Flatten rows: register returns {rows, total, totalValue}; others return arrays directly
  const rows: any[] = !rawData ? [] : Array.isArray(rawData) ? rawData : (rawData as any).rows ?? [];
  const summary = !rawData || Array.isArray(rawData) ? undefined : (() => { const { rows: _r, ...rest } = rawData as any; return Object.keys(rest).length ? rest : undefined; })();

  function runReport() {
    if (!fromDate || !toDate) { toast.error("Date range required"); return; }
    setEnabled(true);
    setTimeout(() => refetch(), 100);
  }

  function exportCsv() {
    if (!rows.length) { toast.error("No data to export"); return; }
    const flatRow = (r: any) => typeof r === "object" && r !== null && !Array.isArray(r) ? Object.values(r).map(v => v instanceof Date ? v.toLocaleDateString() : String(v ?? "")) : [String(r)];
    const headers = typeof rows[0] === "object" && rows[0] !== null ? Object.keys(rows[0]) : ["value"];
    const csvRows = [headers, ...rows.map(flatRow)];
    const csv = csvRows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = `purchase_${reportType}_report.csv`; a.click();
  }

  const REPORT_LABELS: Record<ReportType, string> = {
    register: "Purchase Register",
    supplier: "Supplier-wise Summary",
    product: "Product-wise Summary",
    batch: "Batchwise Detail",
  };

  // rows and summary are computed above

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6" /> Purchase Reports</h1>
            <p className="text-sm text-muted-foreground">Analyse purchase data by register, supplier, product, or batch</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label className="text-xs">Report Type</Label>
                <Select value={reportType} onValueChange={v => { setReportType(v as ReportType); setEnabled(false); }}>
                  <SelectTrigger className="mt-1 w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="register">Purchase Register</SelectItem>
                    <SelectItem value="supplier">Supplier-wise</SelectItem>
                    <SelectItem value="product">Product-wise</SelectItem>
                    <SelectItem value="batch">Batchwise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setEnabled(false); }} className="mt-1 w-40" />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setEnabled(false); }} className="mt-1 w-40" />
              </div>
              {(reportType === "register" || reportType === "batch") && (
                <div>
                  <Label className="text-xs">Supplier</Label>
                  <Select value={supplierId} onValueChange={v => { setSupplierId(v); setEnabled(false); }}>
                    <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Suppliers</SelectItem>
                      {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 pb-0.5">
                <Button onClick={runReport} disabled={isLoading} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "Running..." : "Run Report"}
                </Button>
                {rows.length > 0 && (
                  <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="w-4 h-4" /> Export CSV</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Object.entries(summary).map(([key, val]) => (
              <Card key={key}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="text-xl font-bold mt-1">{typeof val === "number" && key.toLowerCase().includes("amount") ? `₹${val.toFixed(2)}` : String(val)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Results table */}
        {enabled && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{REPORT_LABELS[reportType]} — {rows.length} row(s)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Running report...</div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No data for the selected filters</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(rows[0]).map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row: any, i: number) => (
                        <TableRow key={i}>
                          {Object.values(row).map((v: any, j: number) => (
                            <TableCell key={j} className="whitespace-nowrap text-sm">
                              {v instanceof Date ? v.toLocaleDateString() : typeof v === "number" ? v.toFixed(2) : String(v ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!enabled && (
          <div className="text-center py-20 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Select a report type and date range, then click "Run Report"</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
