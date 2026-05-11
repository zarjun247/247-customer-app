import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RiskLevel = "low" | "medium" | "high" | "critical";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "bg-gray-100 text-gray-700 border-gray-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  critical: "bg-red-100 text-red-700 border-red-300",
};

function RiskBadge({ level }: { level: string }) {
  const cls = RISK_COLORS[level as RiskLevel] ?? "bg-gray-100 text-gray-600";
  return <Badge className={`border text-xs font-semibold uppercase ${cls}`}>{level}</Badge>;
}

function StockoutTab({ storeId }: { storeId: string }) {
  const { data, isLoading, error } = trpc.intelligence.stockoutForecast.useQuery(
    { storeId, minRiskLevel: "medium", limit: 50 },
    { enabled: storeId.length > 0 },
  );

  if (!storeId) return <p className="text-sm text-muted-foreground">Enter a store ID above to load forecasts.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Error: {error.message}</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No stockout risks detected for this store.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product ID</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead className="text-right">Sellable</TableHead>
          <TableHead className="text-right">Daily Demand</TableHead>
          <TableHead className="text-right">Days to Stockout</TableHead>
          <TableHead>Forecast Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.productId}>
            <TableCell className="font-mono text-xs">{row.productId}</TableCell>
            <TableCell><RiskBadge level={row.riskLevel} /></TableCell>
            <TableCell className="text-right">{row.currentSellable}</TableCell>
            <TableCell className="text-right">{row.averageDailyDemand.toFixed(2)}/day</TableCell>
            <TableCell className="text-right">
              {row.daysToStockout < 0 ? "∞" : `${row.daysToStockout.toFixed(1)}d`}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.forecastedStockoutDate
                ? new Date(row.forecastedStockoutDate).toLocaleDateString()
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RefillAlertsTab({ storeId }: { storeId: string }) {
  const { data, isLoading, error } = trpc.intelligence.storeRefillAlerts.useQuery(
    { storeId, minRiskLevel: "medium", limit: 50 },
    { enabled: storeId.length > 0 },
  );

  if (!storeId) return <p className="text-sm text-muted-foreground">Enter a store ID above to load alerts.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Error: {error.message}</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No refill alerts for this store.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead className="text-right">Avg Interval</TableHead>
          <TableHead className="text-right">Days Since Last</TableHead>
          <TableHead className="text-right">Due In</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={`${row.customerId}-${row.productId}-${i}`}>
            <TableCell className="font-mono text-xs">{row.customerId}</TableCell>
            <TableCell className="font-mono text-xs">{row.productId}</TableCell>
            <TableCell><RiskBadge level={row.riskLevel} /></TableCell>
            <TableCell className="text-right">{row.averageIntervalDays.toFixed(0)}d</TableCell>
            <TableCell className="text-right">{row.lastPurchaseDaysAgo.toFixed(0)}d ago</TableCell>
            <TableCell className="text-right">
              {row.daysUntilRefillDue < 0
                ? <span className="text-destructive font-semibold">{Math.abs(row.daysUntilRefillDue)}d overdue</span>
                : `${row.daysUntilRefillDue}d`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CriticalSkusTab({ storeId }: { storeId: string }) {
  const { data, isLoading, error } = trpc.intelligence.continuityCriticalSkus.useQuery(
    { storeId, minCustomersAffected: 2 },
    { enabled: storeId.length > 0 },
  );

  if (!storeId) return <p className="text-sm text-muted-foreground">Enter a store ID above to load data.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Error: {error.message}</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No continuity-critical SKUs found.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product ID</TableHead>
          <TableHead className="text-right">Customers Affected</TableHead>
          <TableHead className="text-right">Aggregate Continuity Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.productId}>
            <TableCell className="font-mono text-xs">{row.productId}</TableCell>
            <TableCell className="text-right font-semibold">{row.customersAffected}</TableCell>
            <TableCell className="text-right">{(row.aggregateContinuityScore * 100).toFixed(1)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type Tab = "stockout" | "refill" | "critical";

export default function AdminIntelligence() {
  const [storeId, setStoreId] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [tab, setTab] = useState<Tab>("stockout");

  const TAB_LABELS: Record<Tab, string> = {
    stockout: "Stockout Forecast",
    refill: "Refill Alerts",
    critical: "Critical SKUs",
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Intelligence Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Advisory-only — all outputs are suggestions. No actions are taken automatically.
          </p>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Store ID (varchar)"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={() => setStoreId(inputVal.trim())} disabled={!inputVal.trim()}>
                Load
              </Button>
              {storeId && (
                <Button variant="outline" onClick={() => { setStoreId(""); setInputVal(""); }}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 border-b">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{TAB_LABELS[tab]}</CardTitle>
          </CardHeader>
          <CardContent>
            {tab === "stockout" && <StockoutTab storeId={storeId} />}
            {tab === "refill" && <RefillAlertsTab storeId={storeId} />}
            {tab === "critical" && <CriticalSkusTab storeId={storeId} />}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
