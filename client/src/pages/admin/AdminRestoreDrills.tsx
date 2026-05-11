import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const OUTCOME_COLORS: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  fail: "bg-red-500/10 text-red-600 border-red-500/30",
  partial: "bg-amber-500/10 text-amber-600 border-amber-500/30",
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

export default function AdminRestoreDrills() {
  const [showCmd, setShowCmd] = useState(false);

  const { data: last, isLoading: lastLoading } = trpc.restoreDrill.lastDrill.useQuery();
  const { data: age } = trpc.restoreDrill.drillAge.useQuery();
  const { data: history, isLoading: historyLoading, refetch } = trpc.restoreDrill.history.useQuery({ limit: 50 });

  const slaOk = age?.withinSla ?? null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Restore Drills</h1>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Last Drill Status</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowCmd(true)}>Show command</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : last ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${OUTCOME_COLORS[last.outcome] ?? ""}`}>
                    {last.outcome}
                  </span>
                  {age != null && (
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${slaOk ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-red-500/10 text-red-600 border-red-500/30"}`}>
                      {slaOk ? "Within SLA (7 days)" : "SLA BREACHED"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Last drill: {timeAgo(last.ts)} by {last.actor}</div>
                  <div>Backup ref: <span className="font-mono">{last.backupFileRef}</span></div>
                  <div>Duration: {last.durationMs}ms</div>
                  {last.notes && <div>Notes: {last.notes}</div>}
                  {age != null && <div>Age: {age.ageHours.toFixed(1)}h / 168h SLA</div>}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-amber-600 font-medium">No restore drill recorded.</p>
                <p className="text-xs text-muted-foreground">A measured staging restore drill is required before production go-live. Run the restore drill runner from your operator terminal and record the outcome.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drill History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Backup Ref</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                  </TableRow>
                )}
                {!historyLoading && (!history || history.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No drill records yet. Run the restore drill runner to populate.
                    </TableCell>
                  </TableRow>
                )}
                {history?.map(rec => (
                  <TableRow key={rec.id}>
                    <TableCell className="text-sm text-muted-foreground">{timeAgo(rec.ts)}</TableCell>
                    <TableCell className="text-sm">{rec.actor}</TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{rec.backupFileRef}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${OUTCOME_COLORS[rec.outcome] ?? ""}`}>
                        {rec.outcome}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rec.durationMs}ms</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{rec.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCmd} onOpenChange={setShowCmd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Restore Drill</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Run this command from your operator terminal against a staging environment only.
            Never run restore drills against production databases.
          </p>
          <pre className="bg-slate-100 dark:bg-slate-800 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {`node scripts/restore-drill-runner.mjs`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            The runner wraps <code>scripts/restore-db-drill.mjs</code> and records the outcome to the audit log automatically.
            Set <code>RESTORE_DATABASE_URL</code> and <code>RESTORE_BACKUP_FILE</code> before running.
          </p>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
