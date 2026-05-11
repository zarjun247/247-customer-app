import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Env = "staging" | "production";
type ReadinessStatus = "ready" | "stale" | "failed" | "unknown";

const STATUS_COLORS: Record<ReadinessStatus, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  stale: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  failed: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-slate-500/10 text-slate-600 border-slate-500/30",
};

const OVERALL_COLORS: Record<string, string> = {
  pass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  fail: "bg-red-500/10 text-red-600 border-red-500/30",
};

const CHECK_COLORS: Record<string, string> = {
  pass: "text-emerald-600",
  fail: "text-red-600",
  warn: "text-amber-600",
  skipped: "text-slate-500",
};

function timeAgo(d: string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ReadinessCard({ env }: { env: Env }) {
  const [showCmd, setShowCmd] = useState(false);
  const { data, isLoading, refetch } = trpc.deployment.readiness.useQuery({ env });

  const status = data?.status ?? "unknown";
  const rec = data?.lastRecord;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="capitalize text-base">{env}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setShowCmd(true)}>Run check</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${STATUS_COLORS[status]}`}>
                {status}
              </span>
              {rec && (
                <span className="text-xs text-muted-foreground">
                  Last check: {timeAgo(rec.ts)} by {rec.actor}
                </span>
              )}
            </div>
            {rec && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Commit: <span className="font-mono">{rec.commitSha.slice(0, 8)}</span></div>
                {data?.ageHours != null && (
                  <div>Age: {data.ageHours.toFixed(1)}h</div>
                )}
              </div>
            )}
            {!rec && (
              <p className="text-sm text-muted-foreground">No validation records for {env}.</p>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={showCmd} onOpenChange={setShowCmd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Deployment Readiness Check — {env}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Run this command from your operator terminal. It will record the outcome automatically.
          </p>
          <pre className="bg-slate-100 dark:bg-slate-800 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {`node scripts/deployment-readiness-check.mjs --env ${env} --record`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            The <code>--record</code> flag appends a signed validation record to the audit log.
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AdminDeploymentReadiness() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: history, isLoading } = trpc.deployment.history.useQuery({ limit: 50 });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Deployment Readiness</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadinessCard env="staging" />
          <ReadinessCard env="production" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Env</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                  </TableRow>
                )}
                {!isLoading && (!history || history.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No validation records yet. Run the readiness check to populate.</TableCell>
                  </TableRow>
                )}
                {history?.map(rec => (
                  <>
                    <TableRow key={rec.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}>
                      <TableCell className="font-mono text-xs">{rec.env}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(rec.ts)}</TableCell>
                      <TableCell className="text-sm">{rec.actor}</TableCell>
                      <TableCell className="font-mono text-xs">{rec.commitSha.slice(0, 8)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${OVERALL_COLORS[rec.overall] ?? ""}`}>
                          {rec.overall}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {expandedId === rec.id ? "▲ collapse" : "▼ expand"} ({rec.checks.length} checks)
                      </TableCell>
                    </TableRow>
                    {expandedId === rec.id && (
                      <TableRow key={`${rec.id}-expand`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-1">
                            {rec.checks.map((c, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={`font-medium w-14 ${CHECK_COLORS[c.status] ?? ""}`}>{c.status.toUpperCase()}</span>
                                <span className="font-mono">{c.name}</span>
                                {c.message && <span className="text-muted-foreground">{c.message}</span>}
                                {c.durationMs != null && <span className="text-muted-foreground ml-auto">{c.durationMs}ms</span>}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
