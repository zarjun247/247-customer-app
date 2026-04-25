/**
 * SlaBoard.tsx
 * SLA breach monitoring board for store managers.
 * Shows open orders vs SLA deadlines, breach rate, and on-time rate.
 * Access: store_manager | admin
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Clock, AlertTriangle, CheckCircle2, RefreshCw,
  ShieldCheck, Timer, TrendingDown, TrendingUp, Zap,
} from "lucide-react";

function MinutesBar({ minutesRemaining, promisedMins }: { minutesRemaining: number; promisedMins: number }) {
  const pct = Math.max(0, Math.min(100, (minutesRemaining / promisedMins) * 100));
  const color = minutesRemaining < 0 ? "bg-red-500" : minutesRemaining < 10 ? "bg-orange-500" : pct < 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-full h-1.5 bg-border/40 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SlaBoard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [days, setDays] = useState(7);

  const { data, isLoading, refetch } = trpc.payment.slaBoard.useQuery(
    { days },
    { enabled: !!user && (user.role === "store_manager" || user.role === "admin"), refetchInterval: 60000 }
  );

  const detectBreaches = trpc.payment.detectBreaches.useMutation({
    onSuccess: (result) => {
      toast.success(`Detected ${result.breachesDetected} new breach${result.breachesDetected !== 1 ? "es" : ""}.`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
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

  const summary = data?.summary;
  const openEvents = data?.openEvents ?? [];
  const breachedOpen = openEvents.filter(e => e.isBreached);
  const atRiskOpen = openEvents.filter(e => !e.isBreached && e.minutesRemaining < 15);

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
              <Timer className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold text-sm">SLA Breach Board</h1>
                <p className="text-xs text-muted-foreground">Live delivery SLA monitoring</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detectBreaches.mutate()}
              disabled={detectBreaches.isPending}
              className="h-8 text-xs gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Scan
            </Button>
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
            {/* Period selector */}
            <div className="flex gap-2">
              {[7, 14, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${days === d ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:text-foreground border border-border/40"}`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Summary KPIs */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total orders</p>
                    <p className="text-2xl font-bold mt-1">{summary.total}</p>
                    <p className="text-xs text-muted-foreground">last {days} days</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">On-time rate</p>
                    <p className={`text-2xl font-bold mt-1 ${summary.onTimeRate >= 0.9 ? "text-emerald-400" : summary.onTimeRate >= 0.75 ? "text-amber-400" : "text-red-400"}`}>
                      {(summary.onTimeRate * 100).toFixed(1)}%
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {summary.onTimeRate >= 0.9 ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      )}
                      <span className="text-xs text-muted-foreground">{summary.onTime}/{summary.delivered} delivered</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Breaches</p>
                    <p className={`text-2xl font-bold mt-1 ${summary.breached > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {summary.breached}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(summary.breachRate * 100).toFixed(1)}% breach rate
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border/40">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Open orders</p>
                    <p className={`text-2xl font-bold mt-1 ${breachedOpen.length > 0 ? "text-red-400" : atRiskOpen.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {openEvents.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {breachedOpen.length > 0 ? `${breachedOpen.length} breached` : atRiskOpen.length > 0 ? `${atRiskOpen.length} at risk` : "all on track"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Open SLA events */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Live Open Orders
                {openEvents.length > 0 && (
                  <Badge variant="outline" className="text-xs">{openEvents.length}</Badge>
                )}
              </h2>

              {openEvents.length === 0 ? (
                <Card className="bg-card/60 border-border/40">
                  <CardContent className="p-8 flex flex-col items-center gap-3">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                    <p className="text-sm text-emerald-400 font-medium">No open orders</p>
                    <p className="text-xs text-muted-foreground">All orders have been delivered.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {openEvents
                    .sort((a, b) => a.minutesRemaining - b.minutesRemaining)
                    .map((event) => {
                      const isBreached = event.isBreached;
                      const isAtRisk = !isBreached && event.minutesRemaining < 15;
                      return (
                        <Card
                          key={event.id}
                          className={`border ${isBreached ? "border-red-500/40 bg-red-500/5" : isAtRisk ? "border-orange-500/30 bg-orange-500/5" : "border-border/40 bg-card/60"}`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {isBreached ? (
                                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                                ) : isAtRisk ? (
                                  <Clock className="h-4 w-4 text-orange-400 flex-shrink-0" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                                )}
                                <span className="text-sm font-medium">
                                  Order #{event.orderId}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-xs ${isBreached ? "text-red-400 border-red-500/40" : isAtRisk ? "text-orange-400 border-orange-500/40" : "text-emerald-400 border-emerald-500/40"}`}
                              >
                                {isBreached
                                  ? `${Math.abs(event.minutesRemaining)}m overdue`
                                  : `${event.minutesRemaining}m left`}
                              </Badge>
                            </div>
                            <MinutesBar
                              minutesRemaining={event.minutesRemaining}
                              promisedMins={event.promisedSlaMins}
                            />
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs text-muted-foreground">
                                SLA: {event.promisedSlaMins}min · Started {new Date(event.slaStartedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Deadline: {new Date(event.slaDeadline).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
