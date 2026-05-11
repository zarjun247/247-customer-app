import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OutcomeKind = "accepted" | "rejected" | "ignored" | "modified" | "outcome_realized";

const OUTCOME_COLORS: Record<OutcomeKind | "none", string> = {
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  ignored: "bg-gray-100 text-gray-600 border-gray-300",
  modified: "bg-blue-100 text-blue-700 border-blue-300",
  outcome_realized: "bg-purple-100 text-purple-700 border-purple-300",
  none: "bg-gray-50 text-gray-400 border-gray-200",
};

function ChainStatusCard() {
  const { data, isLoading, refetch } = trpc.aiEval.verify.useQuery({});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Hash Chain Integrity</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            Verify
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Verifying…</p>
        ) : data ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className={`border ${data.verified ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-red-100 text-red-700 border-red-300"}`}>
                {data.verified ? "INTACT" : "BROKEN"}
              </Badge>
              <span className="text-sm text-muted-foreground">{data.rowsChecked} rows checked</span>
            </div>
            {!data.verified && data.firstBreakAt !== undefined && (
              <p className="text-sm text-destructive">
                Break at sequence {data.firstBreakAt}: {data.firstBreakReason}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Last sequence: {data.lastSequenceNumber}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatsCard() {
  const { data } = trpc.aiEval.stats.useQuery();

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ledger Stats (30-day window)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{data.totalSuggestions}</p>
            <p className="text-xs text-muted-foreground">Total Suggestions</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{data.totalOutcomes}</p>
            <p className="text-xs text-muted-foreground">Outcomes Recorded</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{(data.acceptanceRate * 100).toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Acceptance Rate</p>
          </div>
        </div>
        {data.byKind.length > 0 && (
          <div className="mt-4 space-y-1">
            {data.byKind.map((k) => (
              <div key={k.kind} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-muted-foreground">{k.kind}</span>
                <span>{k.count} ({k.acceptedCount}✓ / {k.rejectedCount}✗ / {k.ignoredCount}–)</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionsList() {
  const [kind, setKind] = useState<string>("");
  const [scopeType, setScopeType] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isLoading } = trpc.aiEval.list.useQuery({
    suggestionKind: kind || undefined,
    scopeType: scopeType || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const recordOutcome = trpc.aiEval.recordOutcome.useMutation();

  const utils = trpc.useUtils();
  const handleOutcome = async (ledgerId: number, outcomeKind: OutcomeKind) => {
    await recordOutcome.mutateAsync({ evalLedgerId: ledgerId, outcomeKind });
    utils.aiEval.list.invalidate();
    utils.aiEval.stats.invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Select value={kind || "all"} onValueChange={(v) => { setKind(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="refill_risk">refill_risk</SelectItem>
              <SelectItem value="stockout_forecast">stockout_forecast</SelectItem>
              <SelectItem value="continuity_critical">continuity_critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={scopeType || "all"} onValueChange={(v) => { setScopeType(v === "all" ? "" : v); setPage(0); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="customer">customer</SelectItem>
              <SelectItem value="product">product</SelectItem>
              <SelectItem value="store">store</SelectItem>
              <SelectItem value="global">global</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suggestions recorded yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seq</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.sequenceNumber}</TableCell>
                    <TableCell className="text-xs">{row.suggestionKind}</TableCell>
                    <TableCell className="text-xs">
                      {row.scopeType}{row.scopeId ? `/${row.scopeId.slice(0, 8)}` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.modelVersion}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.generatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={`border text-xs ${OUTCOME_COLORS[(row.latestOutcome as OutcomeKind) ?? "none"]}`}>
                        {row.latestOutcome ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!row.latestOutcome && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => handleOutcome(row.id, "accepted")}
                            disabled={recordOutcome.isPending}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => handleOutcome(row.id, "rejected")}
                            disabled={recordOutcome.isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span>Page {page + 1} · {data.total} total</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= data.total}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAiEvalLedger() {
  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Eval Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Append-only tamper-evident log of all AI suggestions and their outcomes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChainStatusCard />
          <StatsCard />
        </div>

        <SuggestionsList />
      </div>
    </AdminLayout>
  );
}
