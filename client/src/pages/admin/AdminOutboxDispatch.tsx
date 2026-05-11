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
import { toast } from "sonner";

const LIMIT = 50;

type Tab = "pending" | "dispatched" | "failed";

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

export default function AdminOutboxDispatch() {
  const [tab, setTab] = useState<Tab>("pending");
  const [offsets, setOffsets] = useState<Record<Tab, number>>({
    pending: 0,
    dispatched: 0,
    failed: 0,
  });

  const offset = offsets[tab];
  const setOffset = (n: number) => setOffsets((prev) => ({ ...prev, [tab]: n }));

  const pendingQ = trpc.outbox.pending.useQuery(
    { limit: LIMIT, offset: offsets.pending },
    { enabled: tab === "pending" },
  );
  const dispatchedQ = trpc.outbox.dispatched.useQuery(
    { limit: LIMIT, offset: offsets.dispatched },
    { enabled: tab === "dispatched" },
  );
  const failedQ = trpc.outbox.failed.useQuery(
    { limit: LIMIT, offset: offsets.failed },
    { enabled: tab === "failed" },
  );
  const kindsQ = trpc.outbox.kinds.useQuery();

  const retryMutation = trpc.outbox.retry.useMutation({
    onSuccess: () => {
      toast.success("Row reset to pending");
      failedQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const activeQ = tab === "pending" ? pendingQ : tab === "dispatched" ? dispatchedQ : failedQ;
  const rows = activeQ.data?.records ?? [];
  const isLoading = activeQ.isLoading;

  function refetchAll() {
    pendingQ.refetch();
    dispatchedQ.refetch();
    failedQ.refetch();
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Outbox Dispatch</h1>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            Refresh
          </Button>
        </div>

        {/* Registered kinds */}
        {kindsQ.data && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Registered Handler Kinds</CardTitle>
            </CardHeader>
            <CardContent>
              {kindsQ.data.kinds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No handlers registered</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {kindsQ.data.kinds.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/30 font-mono"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab selector */}
        <div className="flex gap-1 border-b">
          {(["pending", "dispatched", "failed"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Command Log</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Next Attempt</TableHead>
                  <TableHead>Created</TableHead>
                  {tab === "dispatched" && <TableHead>Dispatched</TableHead>}
                  {tab === "failed" && <TableHead>Failed</TableHead>}
                  {tab === "failed" && <TableHead>Last Error</TableHead>}
                  {tab === "failed" && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={tab === "failed" ? 8 : tab === "dispatched" ? 7 : 6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={tab === "failed" ? 8 : tab === "dispatched" ? 7 : 6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No {tab} rows
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-sm">{row.sideEffectKind}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.commandLogId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.attempts}/{row.maxAttempts}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tab === "pending" ? timeAgo(row.nextAttemptAt) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(row.createdAt)}
                    </TableCell>
                    {tab === "dispatched" && (
                      <TableCell className="text-sm text-muted-foreground">
                        {timeAgo(row.dispatchedAt)}
                      </TableCell>
                    )}
                    {tab === "failed" && (
                      <TableCell className="text-sm text-muted-foreground">
                        {timeAgo(row.failedAt)}
                      </TableCell>
                    )}
                    {tab === "failed" && (
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {row.lastErrorMessage ?? "—"}
                      </TableCell>
                    )}
                    {tab === "failed" && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate({ id: row.id })}
                        >
                          Retry
                        </Button>
                      </TableCell>
                    )}
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
          <span className="text-sm text-muted-foreground">Page {Math.floor(offset / LIMIT) + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length < LIMIT}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
