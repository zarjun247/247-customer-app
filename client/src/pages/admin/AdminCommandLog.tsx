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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CommandState = "in_flight" | "completed" | "failed" | "compensated";

const STATE_COLORS: Record<CommandState, string> = {
  in_flight: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  failed: "bg-red-500/10 text-red-600 border-red-500/30",
  compensated: "bg-gray-500/10 text-gray-600 border-gray-500/30",
};

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

export default function AdminCommandLog() {
  const [commandName, setCommandName] = useState("");
  const [state, setState] = useState<string>("all");
  const [actorUserId, setActorUserId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const LIMIT = 50;

  const { data, isLoading, refetch } = trpc.commandLog.list.useQuery({
    commandName: commandName || undefined,
    state: state === "all" ? undefined : (state as CommandState),
    actorUserId: actorUserId || undefined,
    storeId: storeId || undefined,
    limit: LIMIT,
    offset,
  });

  const { data: statsData } = trpc.commandLog.stats.useQuery({ windowHours });

  const { data: detailData } = trpc.commandLog.get.useQuery(
    { id: detailId! },
    { enabled: !!detailId },
  );

  const records = data?.records ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Command Log</h1>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        {/* Stats Card */}
        {statsData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total ({windowHours}h)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-2xl font-bold">{statsData.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                  Completed
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-2xl font-bold text-emerald-600">{statsData.completed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                  Failed
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-2xl font-bold text-red-600">{statsData.failed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                  In Flight
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-2xl font-bold text-blue-600">{statsData.inFlight}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stats window selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Stats window:</span>
          {[1, 6, 24, 72, 168].map((h) => (
            <Button
              key={h}
              size="sm"
              variant={windowHours === h ? "default" : "outline"}
              onClick={() => setWindowHours(h)}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </Button>
          ))}
        </div>

        {/* Failure rate by command */}
        {statsData && statsData.byCommandName.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">By Command</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Command</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Failure Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsData.byCommandName.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-mono text-sm">{r.name}</TableCell>
                      <TableCell className="text-right text-sm">{r.count}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={r.failureRate > 0.1 ? "text-red-600 font-medium" : ""}>
                          {(r.failureRate * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Command name"
            value={commandName}
            onChange={(e) => { setCommandName(e.target.value); setOffset(0); }}
            className="w-52"
          />
          <Select value={state} onValueChange={(v) => { setState(v); setOffset(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="in_flight">In flight</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="compensated">Compensated</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Actor user ID"
            value={actorUserId}
            onChange={(e) => { setActorUserId(e.target.value); setOffset(0); }}
            className="w-44"
          />
          <Input
            placeholder="Store ID"
            value={storeId}
            onChange={(e) => { setStoreId(e.target.value); setOffset(0); }}
            className="w-36"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commands ({total})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Command</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No commands found
                    </TableCell>
                  </TableRow>
                )}
                {records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm max-w-xs truncate">
                      {row.commandName}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${STATE_COLORS[row.state as CommandState] ?? ""}`}
                      >
                        {row.state}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.actorUserId ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.storeId ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(row.startedAt)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.durationMs != null ? `${row.durationMs}ms` : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetailId(row.id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center gap-4 justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + LIMIT, total)}`} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Command Detail</DialogTitle>
          </DialogHeader>
          {detailData && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">ID</p>
                  <p className="font-mono">{detailData.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">State</p>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${STATE_COLORS[detailData.state as CommandState] ?? ""}`}>
                    {detailData.state}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Command</p>
                  <p className="font-mono">{detailData.commandName} v{detailData.commandVersion}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Idempotency Key</p>
                  <p className="font-mono text-xs break-all">{detailData.idempotencyKey}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actor</p>
                  <p>{detailData.actorUserId ?? "—"} ({detailData.actorRole ?? "—"})</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Store</p>
                  <p>{detailData.storeId ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p>{detailData.startedAt ? new Date(detailData.startedAt).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p>{detailData.durationMs != null ? `${detailData.durationMs}ms` : "—"}</p>
                </div>
                {detailData.traceId && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Trace ID</p>
                    <p className="font-mono text-xs">{detailData.traceId}</p>
                  </div>
                )}
                {detailData.errorMessage && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Error</p>
                    <p className="text-red-600">{detailData.errorMessage}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Input Payload</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-40">
                  {JSON.stringify(detailData.inputPayload, null, 2)}
                </pre>
              </div>
              {detailData.outputPayload != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Output Payload</p>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(detailData.outputPayload as Record<string, unknown>, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          {!detailData && (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
