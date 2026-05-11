/**
 * MP1 — Runtime Incident Command
 * Surfaces deployment readiness, multi-store isolation, and live system events
 * in a single operator-facing incident command view.
 * All data is backed by real endpoints — no synthetic metrics.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Shield, AlertTriangle, CheckCircle, XCircle,
  Activity, Server, Layers, Clock, AlertCircle, Wifi,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

type StatusLevel = "ok" | "warn" | "critical" | "unknown";

function statusFromString(s: string | undefined): StatusLevel {
  if (!s) return "unknown";
  if (s === "healthy" || s === "ready" || s === "ok") return "ok";
  if (s === "degraded" || s === "manual_required" || s === "not_ready") return "warn";
  if (s === "unhealthy" || s === "critical") return "critical";
  return "unknown";
}

function StatusDot({ level }: { level: StatusLevel }) {
  const cls =
    level === "ok" ? "bg-emerald-400" :
    level === "warn" ? "bg-amber-400" :
    level === "critical" ? "bg-red-400" :
    "bg-zinc-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls} shrink-0`} />;
}

function StatusBadge({ level, label }: { level: StatusLevel; label?: string }) {
  const variant =
    level === "ok" ? "success" :
    level === "warn" ? "warning" :
    level === "critical" ? "destructive" :
    "neutral";
  return <Badge variant={variant}>{label ?? level}</Badge>;
}

function StatusIcon({ level }: { level: StatusLevel }) {
  if (level === "ok") return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  if (level === "critical") return <XCircle className="h-4 w-4 text-red-400" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <AlertCircle className="h-4 w-4 text-zinc-400" />;
}

// ─── Deployment / Runtime section ────────────────────────────────────────────
function DeploymentPanel() {
  const summary = trpc.deploymentReadiness.summary.useQuery(undefined, { refetchInterval: 60000 });
  const providers = trpc.deploymentReadiness.providers.useQuery(undefined, { refetchInterval: 60000 });
  const workerQ = trpc.deploymentReadiness.workerQueue.useQuery(undefined, { refetchInterval: 30000 });
  const health = trpc.deploymentReadiness.health.useQuery(undefined, { refetchInterval: 30000 });

  const summaryLevel = statusFromString((summary.data as any)?.status);
  const workerLevel = statusFromString((workerQ.data as any)?.status);
  const providerLevel = statusFromString((providers.data as any)?.status);

  const criticalChecks = (summary.data as any)?.criticalChecks ?? {};
  const degradedMode = (summary.data as any)?.degradedMode;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          Deployment &amp; Runtime Health
          <span className="ml-auto">
            {summary.isLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : (
              <StatusBadge level={summaryLevel} label={(summary.data as any)?.status ?? "unknown"} />
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Critical checks grid */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Critical Checks</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(criticalChecks).map(([key, val]) => {
              const level = statusFromString(val as string);
              return (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <StatusDot level={level} />
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className={`ml-auto text-xs ${level === "ok" ? "text-emerald-400" : level === "warn" ? "text-amber-400" : "text-red-400"}`}>{val as string}</span>
                </div>
              );
            })}
            {Object.keys(criticalChecks).length === 0 && !summary.isLoading && (
              <p className="text-xs text-muted-foreground col-span-3">No data — endpoint may need a live database.</p>
            )}
          </div>
        </div>

        {/* Worker queue */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <div className="flex items-center gap-2">
            <StatusDot level={workerLevel} />
            <span className="text-muted-foreground">Worker Queue</span>
          </div>
          <StatusBadge level={workerLevel} label={(workerQ.data as any)?.workerQueue?.status ?? (workerQ.isLoading ? "…" : "unknown")} />
        </div>

        {/* Providers */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <div className="flex items-center gap-2">
            <StatusDot level={providerLevel} />
            <span className="text-muted-foreground">Provider Configuration</span>
          </div>
          <StatusBadge level={providerLevel} label={(providers.data as any)?.status ?? (providers.isLoading ? "…" : "unknown")} />
        </div>

        {/* Degraded mode safeguards */}
        {degradedMode && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Safe Behaviors</p>
            <ul className="space-y-1">
              {(degradedMode.safeBehaviors ?? []).map((b: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 border-t pt-2">
          Generated {timeAgo((summary.data as any)?.generatedAt)} · Proof claims require CI/CD logs, not this endpoint.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Multi-store isolation section ───────────────────────────────────────────
function MultiStorePanel() {
  const overview = trpc.multiStoreRuntime.overview.useQuery(undefined, { refetchInterval: 30000 });
  const isolation = trpc.multiStoreRuntime.isolationChecks.useQuery(undefined, { refetchInterval: 30000 });

  const level = statusFromString((overview.data as any)?.status);
  const inv = (overview.data as any)?.inventory ?? {};
  const checks = (overview.data as any)?.isolationChecks ?? {};
  const storeInfo = (overview.data as any)?.stores ?? {};

  const negativeStock = Number(inv.negativeStockRows ?? 0);
  const usersNoStore = Number(checks.onboardedUsersWithoutAssignedStore ?? 0);
  const ordersNoStore = Number(checks.ordersWithoutStoreId ?? 0);
  const isolated = negativeStock === 0 && usersNoStore === 0 && ordersNoStore === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Multi-Store Isolation
          <span className="ml-auto">
            {overview.isLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : (
              <StatusBadge level={level} label={(overview.data as any)?.status ?? "unknown"} />
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Stores</p>
            <p className="text-xl font-bold mt-0.5">{storeInfo.active ?? "—"}<span className="text-sm font-normal text-muted-foreground"> / {storeInfo.total ?? "—"} active</span></p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Active SKU Rows</p>
            <p className="text-xl font-bold mt-0.5">{inv.activeStoreSkuRows?.toLocaleString("en-IN") ?? "—"}</p>
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Isolation Checks</p>
          {[
            { label: "Negative stock rows", value: negativeStock, critical: negativeStock > 0 },
            { label: "Onboarded users without store", value: usersNoStore, critical: usersNoStore > 0 },
            { label: "Orders without storeId", value: ordersNoStore, critical: ordersNoStore > 0 },
          ].map(({ label, value, critical }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <StatusDot level={critical ? "critical" : "ok"} />
                <span className="text-muted-foreground">{label}</span>
              </div>
              <span className={critical ? "text-red-400 font-semibold" : "text-emerald-400"}>{overview.isLoading ? "…" : value}</span>
            </div>
          ))}
        </div>

        {!overview.isLoading && (
          <div className={`flex items-center gap-2 rounded-lg p-2 text-sm ${isolated ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <StatusIcon level={isolated ? "ok" : "critical"} />
            <span className={isolated ? "text-emerald-300" : "text-red-300"}>
              {isolated ? "Store isolation: clean" : "Store isolation: violations detected — review immediately"}
            </span>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 pt-1">Generated {timeAgo((overview.data as any)?.generatedAt)}</p>
      </CardContent>
    </Card>
  );
}

// ─── Live incident events section ─────────────────────────────────────────────
function IncidentEventsPanel() {
  const [severity, setSeverity] = useState<"critical" | "warning" | "info">("critical");

  const events = trpc.commandCenter.recentEvents.useQuery(
    { severity, limit: 30 },
    { refetchInterval: 15000 }
  );

  const SEVERITY_LABEL: Record<string, string> = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
  };

  const SEVERITY_BADGE: Record<string, "destructive" | "warning" | "info"> = {
    critical: "destructive",
    warning: "warning",
    info: "info",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Live Incident Events
          <span className="ml-auto flex gap-1">
            {(["critical", "warning", "info"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  severity === s
                    ? s === "critical" ? "bg-red-500/20 border-red-500/30 text-red-300" : s === "warning" ? "bg-amber-500/20 border-amber-500/30 text-amber-300" : "bg-blue-500/20 border-blue-500/30 text-blue-300"
                    : "bg-transparent border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                {SEVERITY_LABEL[s]}
              </button>
            ))}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
          </div>
        ) : events.data?.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
            <CheckCircle className="h-6 w-6 text-emerald-500" />
            <p className="text-sm">No {severity} events — system nominal</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {(events.data?.events ?? []).map((e: any) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="shrink-0 mt-0.5">
                  <StatusDot level={statusFromString(e.severity)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{(e.eventType ?? "").replace(/_/g, " ")}</span>
                    <Badge variant={SEVERITY_BADGE[e.severity] ?? "neutral"} >{e.severity}</Badge>
                    {e.channel && <Badge variant="outline">{e.channel}</Badge>}
                    {e.storeId && <span className="text-xs text-muted-foreground">Store #{e.storeId}</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{timeAgo(e.occurredAt)}</p>
                  {e.entityType && (
                    <p className="text-[11px] text-zinc-600">{e.entityType} #{e.entityId}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Failure exercise matrix ──────────────────────────────────────────────────
function FailureExercisePanel() {
  const matrix = trpc.deploymentReadiness.failureExercises.useQuery(undefined, { staleTime: 300000 });
  const exercises: any[] = (matrix.data as any)?.exercises ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Operational Failure Exercises
          <Badge variant="neutral" className="ml-auto">Plan only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matrix.isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
        ) : (
          <div className="space-y-3">
            {exercises.map((ex: any) => (
              <div key={ex.name} className="border border-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium capitalize text-foreground">{ex.name.replace(/_/g, " ")}</span>
                  <Badge variant={ex.failClosed ? "warning" : "info"}>{ex.failClosed ? "Fail-closed" : "Degrade"}</Badge>
                </div>
                <p className="text-[11px] text-zinc-400">Signal: <span className="text-zinc-300">{ex.degradedSignal}</span></p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{ex.manualFallback}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminRuntimeIncident() {
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey(k => k + 1);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Runtime Incident Command
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Deployment health · multi-store isolation · live system events · failure runbooks
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh all
          </Button>
        </div>

        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200">
            This page surfaces real operational signals only. Deployment proof requires CI/CD logs, runtime URL checks, and observability — not this endpoint alone.
          </p>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeploymentPanel key={`dep-${refreshKey}`} />
          <MultiStorePanel key={`ms-${refreshKey}`} />
        </div>

        {/* Events + exercises */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <IncidentEventsPanel key={`ev-${refreshKey}`} />
          <FailureExercisePanel key={`fe-${refreshKey}`} />
        </div>
      </div>
    </AdminLayout>
  );
}
