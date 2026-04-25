/**
 * ExpiryDashboard.tsx
 * Pharmacy expiry management board — 4 zones:
 *   Expired (red), Critical <30d (orange), Warning 30–60d (amber), Caution 60–90d (yellow)
 * Access: store_manager | admin
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
  AlertTriangle, AlertCircle, Clock, CheckCircle2, RefreshCw,
  ShieldCheck, Package, ArrowLeft, Flame,
} from "lucide-react";

type BatchRow = {
  id: number;
  productId: number;
  batchNumber: string | null;
  expiryDate: Date;
  quantity: number;
  unitCost: string | null;
  status: string | null;
};

type Zone = {
  count: number;
  value: number;
  items: BatchRow[];
};

function ZoneCard({
  title,
  subtitle,
  zone,
  color,
  icon: Icon,
  borderColor,
  bgColor,
}: {
  title: string;
  subtitle: string;
  zone: Zone | undefined;
  color: string;
  icon: React.ElementType;
  borderColor: string;
  bgColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = zone?.count ?? 0;
  const value = zone?.value ?? 0;

  return (
    <Card className={`border ${borderColor} ${bgColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${color}`} />
            <CardTitle className={`text-sm font-semibold ${color}`}>{title}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${color} border-current`}
          >
            {count} batch{count !== 1 ? "es" : ""}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">Inventory at risk</span>
          <span className={`text-sm font-semibold ${color}`}>
            ₹{value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
        {count > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {expanded ? "Hide batches" : `Show ${count} batch${count !== 1 ? "es" : ""}`}
          </button>
        )}
        {expanded && zone?.items && (
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {zone.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-card/60 border border-border/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    Product #{item.productId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Batch: {item.batchNumber ?? "—"} · Qty: {item.quantity}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className={`text-xs font-semibold ${color}`}>
                    {new Date(item.expiryDate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ₹{parseFloat(String(item.unitCost ?? 0)).toFixed(0)}/unit
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {count === 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400">All clear</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExpiryDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = trpc.payment.expiryZones.useQuery(undefined, {
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

  const totalAtRisk = (data?.expired?.count ?? 0) + (data?.critical?.count ?? 0) + (data?.warning?.count ?? 0) + (data?.caution?.count ?? 0);
  const totalValue = (data?.expired?.value ?? 0) + (data?.critical?.value ?? 0) + (data?.warning?.value ?? 0) + (data?.caution?.value ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/pharmacy-os")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div>
                <h1 className="font-semibold text-sm">Expiry Dashboard</h1>
                <p className="text-xs text-muted-foreground">FEFO compliance board</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-card/60 border-border/40">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total batches at risk</p>
                  <p className={`text-2xl font-bold mt-1 ${totalAtRisk > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {totalAtRisk}
                  </p>
                  <p className="text-xs text-muted-foreground">within 90 days</p>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/40">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Inventory value at risk</p>
                  <p className={`text-2xl font-bold mt-1 ${totalValue > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    ₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">cost value</p>
                </CardContent>
              </Card>
            </div>

            {/* Zone cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ZoneCard
                title="Expired"
                subtitle="Past expiry date — quarantine immediately"
                zone={data?.expired}
                color="text-red-400"
                icon={Flame}
                borderColor="border-red-500/30"
                bgColor="bg-red-500/5"
              />
              <ZoneCard
                title="Critical — <30 days"
                subtitle="Prioritise for dispensing or return"
                zone={data?.critical}
                color="text-orange-400"
                icon={AlertCircle}
                borderColor="border-orange-500/30"
                bgColor="bg-orange-500/5"
              />
              <ZoneCard
                title="Warning — 30–60 days"
                subtitle="Monitor and plan for clearance"
                zone={data?.warning}
                color="text-amber-400"
                icon={AlertTriangle}
                borderColor="border-amber-500/30"
                bgColor="bg-amber-500/5"
              />
              <ZoneCard
                title="Caution — 60–90 days"
                subtitle="Upcoming — review reorder quantities"
                zone={data?.caution}
                color="text-yellow-400"
                icon={Clock}
                borderColor="border-yellow-500/30"
                bgColor="bg-yellow-500/5"
              />
            </div>

            {totalAtRisk === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                <p className="text-sm text-emerald-400 font-medium">No expiry alerts in the next 90 days</p>
                <p className="text-xs text-muted-foreground">Your inventory is fully FEFO-compliant.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
