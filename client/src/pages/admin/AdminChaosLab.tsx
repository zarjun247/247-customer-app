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

const DANGER_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  high: "bg-red-500/10 text-red-600 border-red-500/30",
};

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

export default function AdminChaosLab() {
  const [cmdScenario, setCmdScenario] = useState<string | null>(null);

  const { data: scenarios, isLoading: scenariosLoading } = trpc.chaos.listScenarios.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.chaos.history.useQuery({ limit: 50 });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Chaos Lab</h1>
          <p className="text-sm text-muted-foreground">Drills run from operator terminal only — not from this UI.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Danger</TableHead>
                  <TableHead>Requires Flag</TableHead>
                  <TableHead>Command</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenariosLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                  </TableRow>
                )}
                {!scenariosLoading && scenarios?.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="font-mono text-sm">{s.name}</TableCell>
                    <TableCell className="text-sm max-w-xs">{s.description}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${DANGER_COLORS[s.dangerLevel] ?? ""}`}>
                        {s.dangerLevel}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.requiresEnvFlag ? (
                        <span className="text-amber-600 text-xs">CHAOS_DRILL_ENABLED=true</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setCmdScenario(s.name)}>
                        Show command
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                  <TableHead>Scenario</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Observations</TableHead>
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
                      No drill history yet. Run a scenario from your terminal.
                    </TableCell>
                  </TableRow>
                )}
                {history?.map(rec => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-mono text-sm">{rec.scenario}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{timeAgo(rec.ts)}</TableCell>
                    <TableCell className="text-sm">{rec.actor}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${OUTCOME_COLORS[rec.outcome] ?? ""}`}>
                        {rec.outcome}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rec.durationMs}ms</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{rec.observations}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!cmdScenario} onOpenChange={open => { if (!open) setCmdScenario(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Chaos Drill — {cmdScenario}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Run this command from your operator terminal against a staging environment only.
            The script enforces a hard gate against <code>NODE_ENV=production</code>.
          </p>
          <pre className="bg-slate-100 dark:bg-slate-800 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {`node scripts/chaos-drill.mjs ${cmdScenario} --target http://localhost:3000`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            The script records outcomes automatically. Use <code>--no-cleanup</code> to preserve injected data for inspection.
          </p>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
