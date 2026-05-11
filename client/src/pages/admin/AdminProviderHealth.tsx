import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type ProviderStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

const STATUS_COLORS: Record<ProviderStatus, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  degraded: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  unhealthy: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-slate-500/10 text-slate-500 border-slate-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status as ProviderStatus] ?? STATUS_COLORS.unknown;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${color}`}>
      {status}
    </span>
  );
}

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type DrilldownTarget = { providerType: string; providerId: string; name: string };

function DrilldownDialog({ target, onClose }: { target: DrilldownTarget; onClose: () => void }) {
  const { data, isLoading } = trpc.providerHealth.drilldown.useQuery({
    providerType: target.providerType,
    providerId: target.providerId,
  });

  const sloEmit = trpc.providerHealth.sloEmit.useMutation({
    onSuccess: (r) => {
      if (r.emitted) toast.success("SLO event emitted");
      else toast.error(`SLO not emitted: ${r.reason}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{target.name} — Drilldown</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={sloEmit.isPending}
              onClick={() => sloEmit.mutate({ providerType: target.providerType, providerId: target.providerId })}
            >
              Emit SLO
            </Button>
          </div>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground py-4">Loading…</p>}

        {data && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">Recent Events (24h)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.events ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-sm">
                        No events
                      </TableCell>
                    </TableRow>
                  )}
                  {(data.events ?? []).map((ev: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{ev.processingStatus}</TableCell>
                      <TableCell className="text-sm">{ev.attemptCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(ev.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Recent Dead Letters</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Failure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.deadLetters ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                        No dead letters
                      </TableCell>
                    </TableRow>
                  )}
                  {(data.deadLetters ?? []).map((dl: any) => (
                    <TableRow key={dl.id}>
                      <TableCell className="text-sm">{dl.eventType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{dl.failureReason ?? "—"}</TableCell>
                      <TableCell className="text-sm">{dl.reviewStatus}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(dl.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminProviderHealth() {
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);

  const { data: snapshots, isLoading, refetch } = trpc.providerHealth.snapshots.useQuery();

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Provider Health</h1>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading snapshots…</p>
        )}

        {!isLoading && (!snapshots || snapshots.length === 0) && (
          <p className="text-sm text-muted-foreground">No provider data in last 24h.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(snapshots ?? []).map((s) => (
            <Card key={`${s.providerType}:${s.providerId}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold font-mono">{s.providerType}</CardTitle>
                  <StatusBadge status={s.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success rate (24h)</span>
                  <span className="font-medium">{fmt(s.successRate24h != null ? s.successRate24h * 100 : null)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total events</span>
                  <span>{s.totalEvents24h ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dead letters</span>
                  <span className={s.deadLetterCount > 0 ? "text-red-600 font-medium" : ""}>{s.deadLetterCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oldest unresolved</span>
                  <span>{fmtAge(s.oldestUnresolvedDeadLetterAge)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last success</span>
                  <span>{timeAgo(s.lastSuccessAt)}</span>
                </div>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setDrilldown({ providerType: s.providerType, providerId: s.providerId, name: s.providerType })}
                  >
                    Drill down
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {drilldown && (
        <DrilldownDialog target={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </AdminLayout>
  );
}
