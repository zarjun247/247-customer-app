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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ReviewStatus = "pending_review" | "resolved" | "replayed";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_review: "Pending",
  resolved: "Resolved",
  replayed: "Replayed",
};

const STATUS_COLORS: Record<ReviewStatus, string> = {
  pending_review: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  replayed: "bg-blue-500/10 text-blue-600 border-blue-500/30",
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

export default function AdminDeadLetters() {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [resolveDialog, setResolveDialog] = useState<{ id: number } | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [escalateDialog, setEscalateDialog] = useState<{ id: number } | null>(null);
  const [escalateSeverity, setEscalateSeverity] = useState<"P0" | "P1" | "P2">("P1");

  const { data, isLoading, refetch } = trpc.deadLetters.list.useQuery({
    providerType: providerFilter === "all" ? undefined : providerFilter,
    reviewStatus:
      statusFilter === "all"
        ? undefined
        : (statusFilter as ReviewStatus),
    limit: LIMIT,
    offset,
  });

  const retryMutation = trpc.deadLetters.retry.useMutation({
    onSuccess: () => { toast.success("Dead letter marked for retry"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resolveMutation = trpc.deadLetters.resolve.useMutation({
    onSuccess: () => { toast.success("Dead letter resolved"); setResolveDialog(null); setResolveNotes(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const escalateMutation = trpc.deadLetters.escalate.useMutation({
    onSuccess: () => { toast.success("Escalated to on-call"); setEscalateDialog(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dead Letter Remediation</h1>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="razorpay">Razorpay</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="storage">Storage</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending_review">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="replayed">Replayed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Dead Letters ({total})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Actions</TableHead>
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
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No dead letters found
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.provider}</TableCell>
                    <TableCell className="text-sm">{row.eventType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{timeAgo(row.createdAt)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${STATUS_COLORS[row.reviewStatus as ReviewStatus] ?? ""}`}>
                        {STATUS_LABELS[row.reviewStatus as ReviewStatus] ?? row.reviewStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {row.failureReason ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.attemptCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {row.reviewStatus === "pending_review" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate({ deadLetterId: row.id })}
                            >
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setResolveDialog({ id: row.id })}
                            >
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setEscalateDialog({ id: row.id })}
                            >
                              Escalate
                            </Button>
                          </>
                        )}
                        {row.reviewStatus !== "pending_review" && (
                          <span className="text-xs text-muted-foreground">{row.reviewNote ?? "—"}</span>
                        )}
                      </div>
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
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
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

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={open => { if (!open) { setResolveDialog(null); setResolveNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dead Letter</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Resolution notes (required)</label>
            <textarea
              className="w-full rounded border p-2 text-sm min-h-[80px]"
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
              placeholder="Describe the resolution action taken…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveDialog(null); setResolveNotes(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!resolveNotes.trim() || resolveMutation.isPending}
              onClick={() => {
                if (resolveDialog) {
                  resolveMutation.mutate({ deadLetterId: resolveDialog.id, resolutionNotes: resolveNotes.trim() });
                }
              }}
            >
              Confirm Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={!!escalateDialog} onOpenChange={open => { if (!open) setEscalateDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Dead Letter</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Severity</label>
            <Select value={escalateSeverity} onValueChange={v => setEscalateSeverity(v as "P0" | "P1" | "P2")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="P0">P0 — Stop the line</SelectItem>
                <SelectItem value="P1">P1 — Launch blocker</SelectItem>
                <SelectItem value="P2">P2 — Scale blocker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={escalateMutation.isPending}
              onClick={() => {
                if (escalateDialog) {
                  escalateMutation.mutate({ deadLetterId: escalateDialog.id, severity: escalateSeverity });
                }
              }}
            >
              Escalate to On-Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
