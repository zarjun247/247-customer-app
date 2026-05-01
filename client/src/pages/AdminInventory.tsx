import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Link, useRoute } from "wouter";
import { cn } from "@/lib/utils";
import {
  Warehouse, AlertTriangle, Printer, Archive,
  Package, TrendingDown, RefreshCw, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SUB_TABS = [
  { label: "Stock Overview", href: "/admin/inventory", icon: Warehouse },
  { label: "Expiry Board", href: "/admin/inventory/expiry", icon: AlertTriangle },
  { label: "Barcodes & Labels", href: "/admin/inventory/barcodes", icon: Printer },
  { label: "Adjustments", href: "/admin/inventory/adjustments", icon: Archive },
];

function SubNav({ active }: { active: string }) {
  return (
    <div className="flex gap-1 border-b border-white/5 px-6 pt-4">
      {SUB_TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = active === tab.href;
        return (
          <Link key={tab.href} href={tab.href}>
            <button
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-blue-500 text-blue-400 bg-blue-500/5"
                  : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

function StockOverview() {
  const { data: metrics } = trpc.metrics.dashboard.useQuery({ days: 30 });
  const { data: expiryData } = trpc.reports.nearExpiry.useQuery({ days: 90 });
  const { data: stockouts } = trpc.metrics.dashboard.useQuery({ days: 30 });

  const stats = [
    {
      label: "Stockouts",
      value: metrics?.stockouts?.length ?? "—",
      icon: Package,
      color: "text-blue-400",
    },
    {
      label: "Near Expiry (90d)",
      value: (Array.isArray(expiryData?.rows) ? expiryData?.rows.length : 0) || "—",
      icon: AlertTriangle,
      color: "text-orange-400",
    },
    {
      label: "Expiry Exposure",
      value: metrics?.expiry ? `₹${(metrics.expiry.expiringValue / 1000).toFixed(0)}k` : "—",
      icon: TrendingDown,
      color: "text-amber-400",
    },
    {
      label: "Pending Queue",
      value: metrics?.queue?.pending ?? "—",
      icon: RefreshCw,
      color: "text-red-400",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Stock Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Real-time inventory across all stores</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="bg-zinc-900 border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500">{stat.label}</span>
                  <Icon className={cn("w-4 h-4", stat.color)} />
                </div>
                <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-zinc-900 border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/admin/inventory/expiry">
            <Button variant="outline" size="sm" className="gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              View Expiry Board
            </Button>
          </Link>
          <Link href="/admin/inventory/barcodes">
            <Button variant="outline" size="sm" className="gap-2">
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              Print Labels
            </Button>
          </Link>
          <Link href="/admin/inventory/adjustments">
            <Button variant="outline" size="sm" className="gap-2">
              <Archive className="w-3.5 h-3.5 text-purple-400" />
              Stock Adjustments
            </Button>
          </Link>
          <Link href="/admin/purchase">
            <Button variant="outline" size="sm" className="gap-2">
              <Package className="w-3.5 h-3.5 text-green-400" />
              New Purchase
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ExpiryBoard() {
  const { data } = trpc.reports.nearExpiry.useQuery({ days: 90 });
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const zone = (daysLeft: number) => {
    if (daysLeft < 0) return { label: "Expired", color: "bg-red-500/20 text-red-400 border-red-500/30" };
    if (daysLeft <= 30) return { label: "Quarantine", color: "bg-red-500/20 text-red-400 border-red-500/30" };
    if (daysLeft <= 60) return { label: "Critical", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    return { label: "Warning", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Expiry Board</h2>
        <p className="text-sm text-zinc-500 mt-1">Batches expiring within 90 days</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500 text-xs">
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">Batch</th>
              <th className="text-left px-4 py-3">Expiry</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="text-left px-4 py-3">Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-zinc-600">No near-expiry batches</td></tr>
            ) : rows.map((row: any, i: number) => {
              const exp = new Date(row.batch?.expiryDate ?? row.expiryDate);
              const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86400000);
              const z = zone(daysLeft);
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/2">
                  <td className="px-4 py-3 text-zinc-200">{row.productName}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{row.batch?.batchNumber ?? row.batchNumber}</td>
                  <td className="px-4 py-3 text-zinc-400">{exp.toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-zinc-300">{row.batch?.quantity ?? row.quantity}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn("text-[10px]", z.color)}>
                      {z.label} ({daysLeft}d)
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarcodesPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Barcodes & Labels</h2>
        <p className="text-sm text-zinc-500 mt-1">Generate ZPL labels for batches and dispatch</p>
      </div>
      <Card className="bg-zinc-900 border-white/5">
        <CardContent className="p-8 text-center space-y-3">
          <Printer className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-zinc-400">Label generation is available in the dedicated Barcode Print tool.</p>
          <Link href="/admin/inventory/barcodes">
            <Button variant="outline" size="sm">Open Barcode Print</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function AdjustmentsPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Stock Adjustments</h2>
        <p className="text-sm text-zinc-500 mt-1">Manual corrections, write-offs, and transfers</p>
      </div>
      <Card className="bg-zinc-900 border-white/5">
        <CardContent className="p-8 text-center space-y-3">
          <Archive className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-zinc-400">Stock adjustment entry form — coming in next build.</p>
          <p className="text-xs text-zinc-600">Schema: stock_adjustments table is ready.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminInventory({ sub }: { sub?: "expiry" | "barcodes" | "adjustments" }) {
  const activeHref = sub ? `/admin/inventory/${sub}` : "/admin/inventory";

  return (
    <AdminLayout>
      <SubNav active={activeHref} />
      {!sub && <StockOverview />}
      {sub === "expiry" && <ExpiryBoard />}
      {sub === "barcodes" && <BarcodesPage />}
      {sub === "adjustments" && <AdjustmentsPage />}
    </AdminLayout>
  );
}
