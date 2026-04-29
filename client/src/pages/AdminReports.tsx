import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  BarChart3, Download, TrendingUp, Package, AlertTriangle,
  ClipboardList, Clock, FileText,
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { id: "daily", label: "Daily Sales", icon: TrendingUp },
  { id: "gst", label: "GST Report", icon: FileText },
  { id: "stock", label: "Stock Valuation", icon: Package },
  { id: "expiry", label: "Near Expiry", icon: AlertTriangle },
  { id: "h1", label: "H1 Register", icon: ClipboardList },
  { id: "sla", label: "SLA Performance", icon: Clock },
];

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminReports() {
  const [tab, setTab] = useState("daily");
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const [from, setFrom] = useState(formatDate(thirtyDaysAgo));
  const [to, setTo] = useState(formatDate(today));
  const [days] = useState(30);

  const [daysInput] = useState(() => ({ days }));
  const [slaInput] = useState(() => ({ days }));

  const dailyReport = trpc.reports.dailySale.useQuery(
    { fromDate: from, toDate: to },
    { enabled: tab === "daily" }
  );

  const gstReport = trpc.reports.gstSummary.useQuery(
    { fromDate: from, toDate: to },
    { enabled: tab === "gst" }
  );

  const stockReport = trpc.reports.stockValuation.useQuery(
    {},
    { enabled: tab === "stock" }
  );

  const expiryReport = trpc.reports.nearExpiry.useQuery(
    { days: 90 },
    { enabled: tab === "expiry" }
  );

  const h1Report = trpc.reports.h1Register.useQuery(
    { fromDate: from, toDate: to },
    { enabled: tab === "h1" }
  );

  const slaReport = trpc.payment.slaBoard.useQuery(slaInput, {
    enabled: tab === "sla",
  });

  function downloadCsv(data: any[], filename: string) {
    if (!data || data.length === 0) { toast.error("No data to export"); return; }
    const keys = Object.keys(data[0]);
    const csv = [keys.join(","), ...data.map(row => keys.map(k => JSON.stringify(row[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-100">Reports</h1>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="h-8 w-36 bg-zinc-900 border-white/10 text-sm text-zinc-300"
            />
            <span className="text-zinc-600 text-sm">to</span>
            <Input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-8 w-36 bg-zinc-900 border-white/10 text-sm text-zinc-300"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/5 pb-0">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg transition-colors ${
                  tab === t.id
                    ? "bg-zinc-800 text-zinc-100 border border-white/10 border-b-zinc-800"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Daily Sales */}
        {tab === "daily" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 text-zinc-400 hover:text-zinc-100 h-8"
                onClick={() => downloadCsv(dailyReport.data?.byCategory ?? [], `daily-sales-${from}-to-${to}.csv`)}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Date</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Orders</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Revenue</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Avg Order</th>
                  </tr>
                </thead>
                <tbody>
                  {!dailyReport.data ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
                  ) : (
                    <>
                      <tr className="border-b border-white/5 bg-zinc-800/50">
                        <td className="px-4 py-2.5 text-zinc-300 font-medium">{from} – {to}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-200 font-medium">{dailyReport.data.summary?.totalOrders ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-200 font-medium">₹{Number(dailyReport.data.summary?.totalRevenue ?? 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">
                          ₹{dailyReport.data.summary?.totalOrders > 0 ? (Number(dailyReport.data.summary?.totalRevenue ?? 0) / dailyReport.data.summary.totalOrders).toFixed(0) : "—"}
                        </td>
                      </tr>
                      {(dailyReport.data.byCategory ?? []).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                          <td className="px-4 py-2.5 text-zinc-400 capitalize">{row.category ?? "Other"}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">{row.units ?? 0} units</td>
                          <td className="px-4 py-2.5 text-right text-zinc-200 font-medium">₹{Number(row.revenue ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-500">—</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GST Report */}
        {tab === "gst" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 text-zinc-400 hover:text-zinc-100 h-8"
                onClick={() => downloadCsv(gstReport.data?.hsnRows ?? [], `gst-report-${from}-to-${to}.csv`)}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">HSN</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">GST%</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Taxable</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">CGST</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">SGST</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Total GST</th>
                  </tr>
                </thead>
                <tbody>
                  {(gstReport.data?.hsnRows ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No data for selected range</td></tr>
                  ) : (
                    (gstReport.data?.hsnRows ?? []).map((row: any, i: number) => {
                      const gst = Number(row.gstAmount ?? 0);
                      const cgst = gst / 2;
                      const sgst = gst / 2;
                      return (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                          <td className="px-4 py-2.5 font-mono text-zinc-400">{row.hsnCode ?? "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-300">GST {row.gstRate}%</td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">{row.gstRate}%</td>
                          <td className="px-4 py-2.5 text-right text-zinc-200">₹{Number(row.taxableValue ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">₹{cgst.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">₹{sgst.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-200 font-medium">₹{gst.toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock Valuation */}
        {tab === "stock" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 text-zinc-400 hover:text-zinc-100 h-8"
                onClick={() => downloadCsv(stockReport.data?.rows ?? [], `stock-valuation-${formatDate(today)}.csv`)}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Product</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Batch</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Qty</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">MRP</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Value</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {(stockReport.data?.rows ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No stock data</td></tr>
                  ) : (
                    (stockReport.data?.rows ?? []).map((row: any, i: number) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                        <td className="px-4 py-2.5 text-zinc-200">{row.productName}</td>
                        <td className="px-4 py-2.5 font-mono text-zinc-500 text-xs">{row.batchNumber}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">{row.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">₹{Number(row.mrp).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-200 font-medium">₹{Number(row.mrpValue ?? 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 text-zinc-500 text-xs">{String(row.expiryDate).slice(0, 10)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Near Expiry */}
        {tab === "expiry" && (
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-zinc-900/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Batch</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Expiry</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Days Left</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Zone</th>
                </tr>
              </thead>
              <tbody>
                  {(expiryReport.data ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No near-expiry items</td></tr>
                ) : (
                    (expiryReport.data ?? []).map((item: any, i: number) => {
                      const expiry = new Date(item.batch?.expiryDate ?? item.expiryDate);
                      const daysLeft = Math.round((expiry.getTime() - Date.now()) / 86400000);
                      const zone = daysLeft <= 30 ? "Quarantine" : daysLeft <= 60 ? "Critical" : "Warning";
                      const zoneColor = daysLeft <= 30 ? "text-red-400" : daysLeft <= 60 ? "text-orange-400" : "text-amber-400";
                      return (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                          <td className="px-4 py-2.5 text-zinc-200">{item.productName}</td>
                          <td className="px-4 py-2.5 font-mono text-zinc-500 text-xs">{item.batch?.batchNumber}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-300">{item.batch?.quantity}</td>
                          <td className="px-4 py-2.5 text-zinc-400 text-xs">{String(item.batch?.expiryDate ?? "").slice(0, 10)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${zoneColor}`}>{daysLeft}d</td>
                          <td className={`px-4 py-2.5 text-xs font-medium ${zoneColor}`}>{zone}</td>
                        </tr>
                      );
                    })
                  )}
              </tbody>
            </table>
          </div>
        )}

        {/* H1 Register */}
        {tab === "h1" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 text-zinc-400 hover:text-zinc-100 h-8"
                onClick={() => downloadCsv(h1Report.data ?? [], `h1-register-${from}-to-${to}.csv`)}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Product</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Qty</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Rx Ref</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Pharmacist</th>
                  </tr>
                </thead>
                <tbody>
                  {(h1Report.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No H1 dispensing records</td></tr>
                  ) : (
                    (h1Report.data ?? []).map((row: any, i: number) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                        <td className="px-4 py-2.5 text-zinc-400 text-xs">{String(row.dispensedAt).slice(0, 10)}</td>
                        <td className="px-4 py-2.5 text-zinc-200">{row.productName}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">{row.quantity}</td>
                        <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">Rx #{row.prescriptionId}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{row.pharmacistName ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SLA Performance */}
        {tab === "sla" && (
          <div className="space-y-4">
            {slaReport.data?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Orders", value: slaReport.data.summary.total },
                  { label: "On Time", value: slaReport.data.summary.onTime, color: "text-green-400" },
                  { label: "Breached", value: slaReport.data.summary.breached, color: "text-red-400" },
                  { label: "On-Time Rate", value: `${slaReport.data.summary.onTimeRate?.toFixed(1)}%`, color: slaReport.data.summary.onTimeRate >= 90 ? "text-green-400" : "text-amber-400" },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-zinc-900 border border-white/5 rounded-xl p-4">
                    <p className={`text-2xl font-bold ${kpi.color ?? "text-zinc-100"}`}>{kpi.value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Order</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Target (min)</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500">Remaining</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(slaReport.data?.openEvents ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No open SLA events</td></tr>
                  ) : (
                    (slaReport.data?.openEvents ?? []).map((evt: any) => (
                      <tr key={evt.id} className="border-b border-white/5 hover:bg-white/2">
                        <td className="px-4 py-2.5 font-mono text-zinc-300">ORD-{evt.orderId}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{evt.targetMins ?? 30}m</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${evt.minutesRemaining <= 0 ? "text-red-400" : evt.minutesRemaining <= 10 ? "text-amber-400" : "text-green-400"}`}>
                          {evt.minutesRemaining <= 0 ? "BREACHED" : `${evt.minutesRemaining}m`}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${evt.isBreached ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                            {evt.isBreached ? "Breached" : "On Track"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
