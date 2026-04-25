/**
 * FounderDashboard.tsx
 * Metrics dashboard for store_manager | admin
 * Shows: daily sales, AOV, SLA performance, pharmacist queue latency, stockouts, expiry exposure
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  TrendingUp, ShoppingBag, Clock, AlertTriangle, Package, RefreshCw,
  ShieldCheck, BarChart3, Zap,
} from "lucide-react";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
type DayRange = typeof DAY_OPTIONS[number];

function StatCard({ title, value, sub, icon: Icon, accent }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2 rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesChart({ data }: { data: { date: string; revenue: number; orders: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-8">No sales data yet.</p>;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.slice(-14).map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-primary/60 rounded-t-sm hover:bg-primary transition-colors"
              style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, 2)}%` }}
              title={`₹${d.revenue.toLocaleString()} · ${d.orders} orders`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground px-0.5">
        <span>{data.slice(-14)[0]?.date}</span>
        <span>{data.slice(-14).at(-1)?.date}</span>
      </div>
    </div>
  );
}

export default function FounderDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [days, setDays] = useState<DayRange>(30);

  const { data, isLoading, refetch } = trpc.metrics.dashboard.useQuery({ days }, {
    enabled: !!user && (user.role === "store_manager" || user.role === "admin"),
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "store_manager" && user.role !== "admin")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Store manager access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  const totalRevenue = data?.sales?.reduce((sum: number, d: { revenue: number }) => sum + d.revenue, 0) ?? 0;
  const totalOrders = data?.sales?.reduce((sum: number, d: { orderCount: number }) => sum + d.orderCount, 0) ?? 0;
  const aovValue = (data?.aov as { aov?: number } | null)?.aov ?? 0;
  const slaRate = (data?.sla as { onTimePct?: number } | null)?.onTimePct ?? 0;
  const avgQueueMins = (data?.queue as { avgLatencyMins?: number } | null)?.avgLatencyMins ?? 0;
  const stockoutCount = data?.stockouts?.length ?? 0;
  const expiryExposure = data?.expiry as { expiringCount?: number; expiringValue?: number } | null;
  const expiryCount = expiryExposure?.expiringCount ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Founder Dashboard</h1>
              <p className="text-xs text-muted-foreground">Operations Metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border/40 overflow-hidden">
              {DAY_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 text-xs transition-colors ${days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                title={`Revenue (${days}d)`}
                value={`₹${totalRevenue.toLocaleString()}`}
                sub={`${totalOrders} orders`}
                icon={TrendingUp}
              />
              <StatCard
                title="Avg Order Value"
                value={`₹${aovValue.toFixed(0)}`}
                sub="per order"
                icon={ShoppingBag}
              />
              <StatCard
                title="SLA On-Time Rate"
                value={`${(slaRate * 100).toFixed(1)}%`}
                sub="orders delivered on time"
                icon={Zap}
                accent={slaRate >= 0.9 ? "text-emerald-400" : slaRate >= 0.75 ? "text-amber-400" : "text-red-400"}
              />
              <StatCard
                title="Pharmacist Queue"
                value={`${avgQueueMins.toFixed(0)} min`}
                sub="avg Rx review time"
                icon={Clock}
                accent={avgQueueMins <= 10 ? "text-emerald-400" : avgQueueMins <= 20 ? "text-amber-400" : "text-red-400"}
              />
              <StatCard
                title="Stockouts"
                value={stockoutCount}
                sub="active SKUs at zero stock"
                icon={Package}
                accent={stockoutCount === 0 ? "text-emerald-400" : "text-red-400"}
              />
              <StatCard
                title="Expiry Alerts"
                value={expiryCount}
                sub="batches expiring ≤90d"
                icon={AlertTriangle}
                accent={expiryCount === 0 ? "text-emerald-400" : expiryCount <= 5 ? "text-amber-400" : "text-red-400"}
              />
            </div>

            {/* Sales Chart */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Daily Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <SalesChart data={(data?.sales ?? []).map((d: { date: string; revenue: number; orderCount: number }) => ({ date: d.date, revenue: d.revenue, orders: d.orderCount }))} />
              </CardContent>
            </Card>

            {/* Stockout List */}
            {stockoutCount > 0 && (
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-red-400">Stockouts ({stockoutCount})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(data?.stockouts ?? []).map((s: { skuId: number; productName: string; stockQty: number }) => (
                    <div key={s.skuId} className="flex items-center justify-between">
                      <p className="text-sm">{s.productName}</p>
                      <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">Out of stock</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Expiry Exposure */}
            {expiryCount > 0 && (
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-amber-400">Expiry Exposure</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Batches expiring within 90 days</p>
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">{expiryCount} batches</Badge>
                  </div>
                  {expiryExposure?.expiringValue != null && (
                    <p className="text-xs text-muted-foreground">Estimated value at risk: ₹{Number(expiryExposure.expiringValue).toLocaleString()}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
