import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, ClipboardList, AlertTriangle, Clock, Activity,
  CheckCircle, XCircle, Truck, Package, TrendingUp, Users,
  Zap, RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  awaiting_prescription: "bg-amber-500/20 text-amber-400",
  awaiting_pharmacist_review: "bg-yellow-500/20 text-yellow-400",
  awaiting_allocation: "bg-blue-500/20 text-blue-400",
  reserved: "bg-cyan-500/20 text-cyan-400",
  picking: "bg-indigo-500/20 text-indigo-400",
  packed: "bg-violet-500/20 text-violet-400",
  assigned_to_rider: "bg-purple-500/20 text-purple-400",
  out_for_delivery: "bg-orange-500/20 text-orange-400",
  delivered: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
  rejected: "bg-red-600/20 text-red-500",
  clarification_needed: "bg-amber-600/20 text-amber-500",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLOR[status] ?? "bg-zinc-700 text-zinc-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminCommandCenter() {
  const [refreshKey, setRefreshKey] = useState(0);

  const [metricsDate] = useState(() => ({ days: 30 }));
  const { data: metricsData } = trpc.metrics.dashboard.useQuery(metricsDate, {
    refetchInterval: 30_000,
  });

  const [slaInput] = useState(() => ({ days: 7 }));
  const { data: slaBoard } = trpc.payment.slaBoard.useQuery(slaInput, {
    refetchInterval: 30_000,
  });
  const slaData = slaBoard?.openEvents ?? [];

  const { data: pendingRx } = trpc.pharmacist.queue.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const detectBreaches = trpc.payment.detectBreaches.useMutation();

  const kpis = [
    {
      label: "Active Orders",
      value: metricsData?.sales?.length ?? "—",
      icon: ShoppingCart,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Pending Rx Reviews",
      value: pendingRx?.length ?? "—",
      icon: ClipboardList,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    {
      label: "SLA Breaches",
      value: slaData?.filter((e: any) => e.breached || e.isBreached).length ?? "—",
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "Delivered Today",
      value: metricsData?.sla?.onTime ?? "—",
      icon: CheckCircle,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Avg SLA (mins)",
      value: metricsData?.aov?.aov != null ? `${Math.round(metricsData.aov.aov)}` : "—",
      icon: Clock,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Revenue Today",
      value: metricsData?.aov?.totalRevenue != null ? `₹${Number(metricsData.aov.totalRevenue).toLocaleString("en-IN")}` : "—",
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Command Center</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Live operational overview</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshKey(k => k + 1);
              detectBreaches.mutate();
            }}
            className="gap-2 text-zinc-400 border-white/10 hover:text-zinc-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="bg-zinc-900 border-white/5">
                <CardContent className="p-4">
                  <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                    <Icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-zinc-100">{kpi.value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{kpi.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending Rx Reviews */}
          <Card className="bg-zinc-900 border-white/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-yellow-400" />
                  Pending Prescription Reviews
                </CardTitle>
                <Link href="/admin/prescriptions">
                  <Button variant="ghost" size="sm" className="text-xs text-zinc-500 hover:text-zinc-300 h-7">
                    View all
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!pendingRx || pendingRx.length === 0 ? (
                <div className="flex items-center gap-2 py-6 justify-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-zinc-500">All prescriptions reviewed</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRx.slice(0, 5).map((rx: any) => (
                    <div key={rx.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-sm text-zinc-200">Rx #{rx.id}</p>
                        <p className="text-xs text-zinc-500">
                          {rx.source === "whatsapp" ? "WhatsApp" : "App"} · {new Date(rx.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Link href="/admin/prescriptions">
                        <Button size="sm" className="h-7 text-xs bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 border-0">
                          Review
                        </Button>
                      </Link>
                    </div>
                  ))}
                  {pendingRx.length > 5 && (
                    <p className="text-xs text-zinc-500 text-center pt-1">
                      +{pendingRx.length - 5} more pending
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SLA Board */}
          <Card className="bg-zinc-900 border-white/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  SLA Status
                </CardTitle>
                <Link href="/pharmacy/sla">
                  <Button variant="ghost" size="sm" className="text-xs text-zinc-500 hover:text-zinc-300 h-7">
                    Full board
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!slaData || (slaData as any[]).length === 0 ? (
                <div className="flex items-center gap-2 py-6 justify-center">
                  <Zap className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-zinc-500">No active SLA events</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {(slaData as any[]).slice(0, 5).map((evt: any) => {
                    const elapsed = Math.round((Date.now() - new Date(evt.startedAt).getTime()) / 60000);
                    const pct = Math.min(100, (elapsed / (evt.targetMins ?? 30)) * 100);
                    const isBreached = evt.breached || pct >= 100;
                    return (
                      <div key={evt.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">Order #{evt.orderId}</span>
                          <span className={isBreached ? "text-red-400" : pct > 75 ? "text-amber-400" : "text-green-400"}>
                            {elapsed}m / {evt.targetMins ?? 30}m
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isBreached ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "New Purchase", href: "/admin/purchase", icon: Package },
              { label: "Counter Sale", href: "/admin/sales/counter", icon: ShoppingCart },
              { label: "OCR Ingestion", href: "/admin/ocr", icon: Activity },
              { label: "Expiry Report", href: "/admin/reports/expiry", icon: AlertTriangle },
              { label: "GST Export", href: "/pharmacy/gst-export", icon: TrendingUp },
              { label: "Shift Closing", href: "/pharmacy/shift", icon: Clock },
            ].map((a) => (
              <Link key={a.href} href={a.href}>
                <Button variant="outline" size="sm" className="gap-2 text-zinc-400 border-white/10 hover:text-zinc-100 hover:border-white/20">
                  <a.icon className="w-3.5 h-3.5" />
                  {a.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
