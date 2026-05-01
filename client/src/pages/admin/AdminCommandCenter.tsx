/**
 * PART 12 — Admin Command Center
 * 21 live cards + 4 sub-dashboard tabs (SLA, Expiry, Refill, Sync/Compliance).
 * Auto-refreshes every 30 seconds.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, AlertTriangle, CheckCircle, Clock, Package,
  Truck, Users, MessageSquare, ShoppingCart, Pill, BarChart3,
  Activity, Zap, Shield, TrendingUp, MapPin, FileText,
  Thermometer, Calendar, Eye, AlertCircle, Wifi,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}
function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n}%`;
}
function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Status colour helpers ────────────────────────────────────────────────────
type Severity = "ok" | "warn" | "critical";
function severityColor(s: Severity) {
  return s === "ok" ? "text-emerald-400" : s === "warn" ? "text-amber-400" : "text-red-400";
}
function severityBg(s: Severity) {
  return s === "ok" ? "bg-emerald-500/10 border-emerald-500/20" : s === "warn" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";
}

// ─── Mini card ────────────────────────────────────────────────────────────────
interface CardProps {
  title: string;
  value: string | number;
  sub?: string;
  severity?: Severity;
  icon: React.ReactNode;
  loading?: boolean;
}
function MiniCard({ title, value, sub, severity = "ok", icon, loading }: CardProps) {
  return (
    <Card className={`border ${severityBg(severity)} transition-all`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            {loading ? (
              <div className="h-7 w-16 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className={`text-2xl font-bold mt-0.5 ${severityColor(severity)}`}>{value}</p>
            )}
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={`mt-0.5 shrink-0 ${severityColor(severity)}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminCommandCenter() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [tab, setTab] = useState("overview");

  // Snapshot query (all 21 cards in one call)
  const snapshot = trpc.commandCenter.snapshot.useQuery(
    { storeId: undefined },
    { refetchInterval: autoRefresh ? 30000 : false }
  );

  // Sub-dashboard queries
  const slaDash = trpc.commandCenter.slaDashboard.useQuery({ days: 30 }, { enabled: tab === "sla" });
  const expiryDash = trpc.commandCenter.expiryDashboard.useQuery({}, { enabled: tab === "expiry" });
  const refillDash = trpc.commandCenter.refillDashboard.useQuery({ days: 30 }, { enabled: tab === "refill" });
  const syncDash = trpc.commandCenter.syncComplianceDashboard.useQuery({ days: 30 }, { enabled: tab === "sync" });

  // Recent events
  const events = trpc.commandCenter.recentEvents.useQuery(
    { severity: "critical", limit: 20 },
    { refetchInterval: autoRefresh ? 30000 : false }
  );

  useEffect(() => {
    if (snapshot.data) setLastRefresh(new Date());
  }, [snapshot.data]);

  const d = snapshot.data;
  const loading = snapshot.isLoading;

  function refresh() {
    snapshot.refetch();
    events.refetch();
    toast.success("Refreshed");
  }

  // ─── Order status colours ──────────────────────────────────────────────────
  const statusBadge: Record<string, string> = {
    awaiting_prescription: "bg-yellow-500/20 text-yellow-300",
    awaiting_pharmacist_review: "bg-blue-500/20 text-blue-300",
    awaiting_allocation: "bg-purple-500/20 text-purple-300",
    picking: "bg-cyan-500/20 text-cyan-300",
    packed: "bg-teal-500/20 text-teal-300",
    assigned_to_rider: "bg-indigo-500/20 text-indigo-300",
    out_for_delivery: "bg-emerald-500/20 text-emerald-300",
    delivery_exception: "bg-red-500/20 text-red-300",
    reserved: "bg-slate-500/20 text-slate-300",
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Last refreshed {timeAgo(lastRefresh)} · {autoRefresh ? "Auto-refresh on (30s)" : "Auto-refresh off"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(v => !v)}
            >
              <Wifi className={`h-4 w-4 mr-1.5 ${autoRefresh ? "text-emerald-400" : "text-muted-foreground"}`} />
              {autoRefresh ? "Live" : "Paused"}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={snapshot.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${snapshot.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Critical events banner */}
        {events.data && events.data.events.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-red-300">{events.data.events.length} critical event{events.data.events.length > 1 ? "s" : ""}</span>
              <span className="text-muted-foreground ml-2">
                {events.data.events.slice(0, 3).map(e => e.eventType.replace(/_/g, " ")).join(" · ")}
                {events.data.events.length > 3 ? ` · +${events.data.events.length - 3} more` : ""}
              </span>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sla">SLA</TabsTrigger>
            <TabsTrigger value="expiry">Expiry</TabsTrigger>
            <TabsTrigger value="refill">Refill</TabsTrigger>
            <TabsTrigger value="sync">Sync / Compliance</TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Row 1: Order pipeline */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Pipeline</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <MiniCard
                  title="Live Orders"
                  value={loading ? "…" : fmt(d?.liveOrders?.total)}
                  sub="active pipeline"
                  severity={(d?.liveOrders?.total ?? 0) > 50 ? "warn" : "ok"}
                  icon={<ShoppingCart className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="SLA At Risk"
                  value={loading ? "…" : fmt(d?.slaRisk?.atRiskCount)}
                  sub={`${fmt(d?.slaRisk?.breachedCount)} breached`}
                  severity={(d?.slaRisk?.breachedCount ?? 0) > 0 ? "critical" : (d?.slaRisk?.atRiskCount ?? 0) > 0 ? "warn" : "ok"}
                  icon={<Clock className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Pharmacist Queue"
                  value={loading ? "…" : fmt(d?.pharmacistQueue?.pending)}
                  sub="pending review"
                  severity={(d?.pharmacistQueue?.pending ?? 0) > 10 ? "warn" : "ok"}
                  icon={<Shield className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="App Queue"
                  value={loading ? "…" : fmt(d?.appQueue?.pending)}
                  sub="awaiting action"
                  severity={(d?.appQueue?.pending ?? 0) > 20 ? "warn" : "ok"}
                  icon={<Zap className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="WA Handoffs"
                  value={loading ? "…" : fmt(d?.whatsappQueue?.pendingHandoffs)}
                  sub="open / assigned"
                  severity={(d?.whatsappQueue?.pendingHandoffs ?? 0) > 5 ? "warn" : "ok"}
                  icon={<MessageSquare className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Counter Sales"
                  value={loading ? "…" : fmt(d?.counterSync?.todayCount)}
                  sub={fmtCurrency(d?.counterSync?.todayRevenue)}
                  severity="ok"
                  icon={<BarChart3 className="h-5 w-5" />}
                  loading={loading}
                />
              </div>
            </section>

            {/* Row 2: Rider & Inventory */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Riders & Inventory</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <MiniCard
                  title="Riders Available"
                  value={loading ? "…" : fmt(d?.riderBoard?.available)}
                  sub={`${fmt(d?.riderBoard?.onDelivery)} on delivery`}
                  severity={d?.riderBoard?.available === 0 && d?.liveOrders?.total > 0 ? "critical" : "ok"}
                  icon={<Truck className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Stockouts"
                  value={loading ? "…" : fmt(d?.stockouts?.count)}
                  sub="active SKUs at 0"
                  severity={(d?.stockouts?.count ?? 0) > 0 ? "warn" : "ok"}
                  icon={<Package className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Near Expiry"
                  value={loading ? "…" : fmt(d?.nearExpiry?.count)}
                  sub="batches ≤90 days"
                  severity={(d?.nearExpiry?.count ?? 0) > 20 ? "warn" : "ok"}
                  icon={<Thermometer className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Refill Pipeline"
                  value={loading ? "…" : fmt(d?.refillPipeline?.active)}
                  sub={`${fmt(d?.refillPipeline?.dueThisWeek)} due this week`}
                  severity={(d?.refillPipeline?.missed ?? 0) > 10 ? "warn" : "ok"}
                  icon={<Pill className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Missed Refills"
                  value={loading ? "…" : fmt(d?.refillPipeline?.missed)}
                  sub="overdue plans"
                  severity={(d?.refillPipeline?.missed ?? 0) > 5 ? "warn" : "ok"}
                  icon={<AlertCircle className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Needs Fresh Rx"
                  value={loading ? "…" : fmt(d?.refillPipeline?.needsFreshRx)}
                  sub="expired prescription"
                  severity={(d?.refillPipeline?.needsFreshRx ?? 0) > 0 ? "warn" : "ok"}
                  icon={<FileText className="h-5 w-5" />}
                  loading={loading}
                />
              </div>
            </section>

            {/* Row 3: Ops & Compliance */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ops & Compliance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <MiniCard
                  title="OCR Queue"
                  value={loading ? "…" : fmt((d?.ocrQueue?.queued ?? 0) + (d?.ocrQueue?.processing ?? 0))}
                  sub={`${fmt(d?.ocrQueue?.failed)} failed`}
                  severity={(d?.ocrQueue?.failed ?? 0) > 0 ? "warn" : "ok"}
                  icon={<Eye className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Import Pending"
                  value={loading ? "…" : fmt(d?.importHealth?.pendingReview)}
                  sub="under review"
                  severity={(d?.importHealth?.pendingReview ?? 0) > 10 ? "warn" : "ok"}
                  icon={<RefreshCw className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Sync Health"
                  value={loading ? "…" : (d?.syncHealth?.lastSync ? "OK" : "—")}
                  sub={timeAgo(d?.syncHealth?.lastSync)}
                  severity={!d?.syncHealth?.lastSync ? "warn" : "ok"}
                  icon={<Wifi className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Manual Overrides"
                  value={loading ? "…" : fmt(d?.manualOverrides?.count)}
                  sub="last 24h"
                  severity={(d?.manualOverrides?.count ?? 0) > 5 ? "warn" : "ok"}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Audit Actions"
                  value={loading ? "…" : fmt(d?.unauditedActions?.count)}
                  sub="last 24h"
                  severity="ok"
                  icon={<Shield className="h-5 w-5" />}
                  loading={loading}
                />
                <MiniCard
                  title="Label Compliance"
                  value={loading ? "…" : fmtPct(d?.labelScan?.compliancePct)}
                  sub={`${fmt(d?.labelScan?.total)} batches`}
                  severity={(d?.labelScan?.compliancePct ?? 100) < 90 ? "warn" : "ok"}
                  icon={<CheckCircle className="h-5 w-5" />}
                  loading={loading}
                />
              </div>
            </section>

            {/* Row 4: Expiry Exposure */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Expiry Exposure</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniCard title="Value ≤90 Days" value={fmtCurrency(d?.expiryExposure?.value90)} sub="warning zone" severity={(d?.expiryExposure?.value90 ?? 0) > 100000 ? "warn" : "ok"} icon={<Thermometer className="h-5 w-5" />} loading={loading} />
                <MiniCard title="Value ≤60 Days" value={fmtCurrency(d?.expiryExposure?.value60)} sub="critical zone" severity={(d?.expiryExposure?.value60 ?? 0) > 50000 ? "critical" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} loading={loading} />
                <MiniCard title="Quarantined" value={fmtCurrency(d?.expiryExposure?.quarantinedValue)} sub="blocked stock" severity={(d?.expiryExposure?.quarantinedValue ?? 0) > 0 ? "warn" : "ok"} icon={<Shield className="h-5 w-5" />} loading={loading} />
                <MiniCard title="Disposal Value" value={fmtCurrency(d?.expiryExposure?.disposalValue)} sub="expired batches" severity={(d?.expiryExposure?.disposalValue ?? 0) > 0 ? "critical" : "ok"} icon={<Package className="h-5 w-5" />} loading={loading} />
              </div>
            </section>

            {/* Row 5: Live order status breakdown */}
            {d?.liveOrders?.byStatus && d.liveOrders.byStatus.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Status Breakdown</h2>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {d.liveOrders.byStatus.map((s: any) => (
                        <div key={s.status} className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusBadge[s.status] ?? "bg-muted text-muted-foreground"}`}>
                          {s.status.replace(/_/g, " ")} · {s.count}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Row 6: Building demand + Store performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Building demand */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Building-wise Demand (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {loading ? (
                    <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}</div>
                  ) : d?.buildingDemand?.topBuildings?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(d?.buildingDemand?.topBuildings ?? []).slice(0, 8).map((b: any) => (
                        <div key={b.buildingId} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground truncate max-w-[60%]">{b.buildingName ?? `Building #${b.buildingId}`}</span>
                          <Badge variant="secondary">{b.orderCount} orders</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Store performance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Store Performance (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {loading ? (
                    <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}</div>
                  ) : d?.storePerformance?.stores?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(d?.storePerformance?.stores ?? []).slice(0, 6).map((s: any) => (
                        <div key={s.storeId} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground truncate max-w-[50%]">Store #{s.storeId}</span>
                          <div className="flex gap-2">
                            <Badge variant="secondary">{s.count} orders</Badge>
                            <Badge variant="outline">{fmtCurrency(s.revenue)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Node capacity */}
            {d?.nodeCapacity?.nodes && d.nodeCapacity.nodes.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Node Capacity</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {d.nodeCapacity.nodes.map((n: any) => (
                    <Card key={n.storeId} className="border">
                      <CardContent className="p-3">
                        <p className="text-xs font-medium truncate">{n.storeName ?? `Store #${n.storeId}`}</p>
                        <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span><span className="text-foreground font-semibold">{n.activeOrders ?? "—"}</span> active</span>
                          <span><span className="text-emerald-400 font-semibold">{n.availableRiders ?? "—"}</span> riders</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </TabsContent>

          {/* ─── SLA TAB ───────────────────────────────────────────────────── */}
          <TabsContent value="sla" className="space-y-6 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">SLA Dashboard — Last 30 Days</h2>
            {slaDash.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <MiniCard title="Order-to-Door (avg)" value={slaDash.data?.orderToDoor != null ? `${slaDash.data.orderToDoor}m` : "—"} sub="minutes" severity={slaDash.data?.orderToDoor != null && slaDash.data.orderToDoor > 45 ? "warn" : "ok"} icon={<Clock className="h-5 w-5" />} />
                <MiniCard title="Within Promise %" value={fmtPct(slaDash.data?.withinPromisePct)} sub="on-time deliveries" severity={(slaDash.data?.withinPromisePct ?? 100) < 80 ? "critical" : (slaDash.data?.withinPromisePct ?? 100) < 90 ? "warn" : "ok"} icon={<CheckCircle className="h-5 w-5" />} />
                <MiniCard title="SLA Breaches" value={fmt(slaDash.data?.breachCount)} sub="total breaches" severity={(slaDash.data?.breachCount ?? 0) > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} />
                <MiniCard title="Riders Available" value={fmt(slaDash.data?.riderRatio?.idle)} sub={`${fmt(slaDash.data?.riderRatio?.loaded)} on delivery`} severity={slaDash.data?.riderRatio?.idle === 0 ? "warn" : "ok"} icon={<Truck className="h-5 w-5" />} />
              </div>
            )}
            {slaDash.data?.breachReasons && slaDash.data.breachReasons.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Breach Reason Mix</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {slaDash.data.breachReasons.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{r.breachReason ?? "Unknown"}</span>
                        <Badge variant="destructive">{r.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── EXPIRY TAB ───────────────────────────────────────────────── */}
          <TabsContent value="expiry" className="space-y-6 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Expiry Dashboard</h2>
            {expiryDash.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <MiniCard title="Value ≤90 Days" value={fmtCurrency(expiryDash.data?.value90)} sub="warning zone" severity={(expiryDash.data?.value90 ?? 0) > 100000 ? "warn" : "ok"} icon={<Thermometer className="h-5 w-5" />} />
                  <MiniCard title="Value ≤60 Days" value={fmtCurrency(expiryDash.data?.value60)} sub="critical zone" severity={(expiryDash.data?.value60 ?? 0) > 50000 ? "critical" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} />
                  <MiniCard title="Quarantined" value={fmtCurrency(expiryDash.data?.quarantinedValue)} sub="blocked stock" severity={(expiryDash.data?.quarantinedValue ?? 0) > 0 ? "warn" : "ok"} icon={<Shield className="h-5 w-5" />} />
                  <MiniCard title="Disposal Value" value={fmtCurrency(expiryDash.data?.disposalValue)} sub="expired batches" severity={(expiryDash.data?.disposalValue ?? 0) > 0 ? "critical" : "ok"} icon={<Package className="h-5 w-5" />} />
                  <MiniCard title="FEFO Compliance" value={fmtPct(expiryDash.data?.fefoCompliance)} sub="first-expiry-first-out" severity={expiryDash.data?.fefoCompliance != null && expiryDash.data.fefoCompliance < 95 ? "warn" : "ok"} icon={<CheckCircle className="h-5 w-5" />} />
                </div>
                {expiryDash.data?.byBucket && expiryDash.data.byBucket.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Batch Expiry Buckets</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {expiryDash.data.byBucket.map((b: any) => (
                          <div key={b.expiryBucket} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize text-muted-foreground">{(b.expiryBucket ?? "unknown").replace(/_/g, " ")}</span>
                              <span className="font-medium">{b.count} batches · {fmtCurrency(b.value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ─── REFILL TAB ───────────────────────────────────────────────── */}
          <TabsContent value="refill" className="space-y-6 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Refill Dashboard — Last 30 Days</h2>
            {refillDash.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <MiniCard title="Active Plans" value={fmt(refillDash.data?.active)} sub="total refill plans" severity="ok" icon={<Calendar className="h-5 w-5" />} />
                <MiniCard title="Due Next 7 Days" value={fmt(refillDash.data?.dueNext7)} sub="upcoming refills" severity={(refillDash.data?.dueNext7 ?? 0) > 20 ? "warn" : "ok"} icon={<Clock className="h-5 w-5" />} />
                <MiniCard title="Reminders Sent" value={fmt(refillDash.data?.reminderSendRate)} sub="this period" severity="ok" icon={<MessageSquare className="h-5 w-5" />} />
                <MiniCard title="Reorder Conversion" value={fmtPct(refillDash.data?.reorderConversionPct)} sub="reminder → order" severity={(refillDash.data?.reorderConversionPct ?? 100) < 30 ? "warn" : "ok"} icon={<TrendingUp className="h-5 w-5" />} />
                <MiniCard title="Missed Refills" value={fmt(refillDash.data?.missed)} sub="overdue plans" severity={(refillDash.data?.missed ?? 0) > 5 ? "warn" : "ok"} icon={<AlertCircle className="h-5 w-5" />} />
              </div>
            )}
          </TabsContent>

          {/* ─── SYNC / COMPLIANCE TAB ────────────────────────────────────── */}
          <TabsContent value="sync" className="space-y-6 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Sync & Compliance Dashboard — Last 30 Days</h2>
            {syncDash.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <MiniCard title="Last Sync" value={syncDash.data?.syncFreshness ? timeAgo(syncDash.data.syncFreshness) : "Never"} sub="Medivision" severity={!syncDash.data?.syncFreshness ? "warn" : "ok"} icon={<Wifi className="h-5 w-5" />} />
                <MiniCard title="Stale Feed Incidents" value={fmt(syncDash.data?.staleIncidents)} sub="sync_stale events" severity={(syncDash.data?.staleIncidents ?? 0) > 0 ? "warn" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} />
                <MiniCard title="H1 Review Completion" value={fmtPct(syncDash.data?.h1ReviewCompletion)} sub="import jobs reviewed" severity={(syncDash.data?.h1ReviewCompletion ?? 100) < 80 ? "warn" : "ok"} icon={<CheckCircle className="h-5 w-5" />} />
                <MiniCard title="Override Count" value={fmt(syncDash.data?.overrideCount)} sub="manual overrides" severity={(syncDash.data?.overrideCount ?? 0) > 10 ? "warn" : "ok"} icon={<AlertCircle className="h-5 w-5" />} />
                <MiniCard title="Audit Actions" value={fmt(syncDash.data?.unauditedActions)} sub="total logged actions" severity="ok" icon={<Shield className="h-5 w-5" />} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
