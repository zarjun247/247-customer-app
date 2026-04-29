import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Plus, ClipboardList, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function AdminStockAudit() {
  const [storeFilter, setStoreFilter] = useState<number | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<number | null>(null);
  const [completeModal, setCompleteModal] = useState<{ id: number; varianceCount?: number } | null>(null);
  const [applyCorrections, setApplyCorrections] = useState(false);

  // Create form
  const [form, setForm] = useState({ storeId: "", auditType: "full" as "full" | "spot_check" | "expiry_sweep" | "scheduled", note: "" });

  // Count form
  const [countValues, setCountValues] = useState<Record<number, number>>({});

  const { data: audits, isLoading: auditsLoading, refetch: refetchAudits } = trpc.inventoryLedger.audit.list.useQuery({
    storeId: storeFilter,
  });
  const { data: storeList } = trpc.masterData.stores.list.useQuery({ limit: 100 });
  const { data: lines, refetch: refetchLines } = trpc.inventoryLedger.audit.getLines.useQuery(
    { auditId: selectedAudit! },
    { enabled: !!selectedAudit }
  );

  const createMut = trpc.inventoryLedger.audit.create.useMutation({
    onSuccess: (r) => { toast.success(`Audit created with ${r.lineCount} lines`); setShowCreate(false); refetchAudits(); },
    onError: (e) => toast.error(e.message),
  });
  const countMut = trpc.inventoryLedger.audit.submitCount.useMutation({
    onSuccess: () => refetchLines(),
    onError: (e) => toast.error(e.message),
  });
  const completeMut = trpc.inventoryLedger.audit.complete.useMutation({
    onSuccess: (r) => { toast.success(`Audit completed. ${r.varianceCount} variances.`); setCompleteModal(null); refetchAudits(); setSelectedAudit(null); },
    onError: (e) => toast.error(e.message),
  });

  const selectedAuditData = audits?.find((a: any) => a.id === selectedAudit);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Audit</h1>
            <p className="text-muted-foreground text-sm">Create audit sessions, count stock, and apply corrections</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchAudits()}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> New Audit</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audit Sessions List */}
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Audit Sessions</h2>
            {auditsLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !audits?.length ? (
              <p className="text-muted-foreground text-sm">No audit sessions yet</p>
            ) : audits.map((audit: any) => (
              <Card key={audit.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedAudit === audit.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedAudit(audit.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Audit #{audit.id}</span>
                    <Badge className={STATUS_COLORS[audit.status] ?? ""}>{audit.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{audit.auditType.replace("_", " ")} · Store #{audit.storeId}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(audit.startedAt).toLocaleDateString()}</p>
                  {audit.totalVariances != null && (
                    <p className="text-xs text-amber-600 mt-1">{audit.totalVariances} variances</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Audit Lines */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedAudit ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
                <p>Select an audit session to view lines</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Audit #{selectedAudit} — {selectedAuditData?.auditType?.replace("_", " ")}</h2>
                  {selectedAuditData?.status !== "completed" && (
                    <Button size="sm" onClick={() => setCompleteModal({ id: selectedAudit })}>
                      <CheckCircle className="h-4 w-4 mr-2" /> Complete Audit
                    </Button>
                  )}
                </div>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Batch No</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead className="text-right">System Qty</TableHead>
                          <TableHead className="text-right">Counted Qty</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead>Status</TableHead>
                          {selectedAuditData?.status !== "completed" && <TableHead>Count</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!lines?.length ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No lines in this audit</TableCell></TableRow>
                        ) : lines.map((row: any) => {
                          const l = row.line;
                          return (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium text-sm">{row.productName ?? `#${l.productId}`}</TableCell>
                              <TableCell className="font-mono text-xs">{row.batchNo ?? "—"}</TableCell>
                              <TableCell className="text-xs">{row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : "—"}</TableCell>
                              <TableCell className="text-right">{l.systemQty}</TableCell>
                              <TableCell className="text-right">{l.countedQty ?? "—"}</TableCell>
                              <TableCell className="text-right">
                                {l.variance != null ? (
                                  <span className={l.variance > 0 ? "text-green-600" : l.variance < 0 ? "text-red-600" : "text-muted-foreground"}>
                                    {l.variance > 0 ? "+" : ""}{l.variance}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={l.status === "counted" ? "default" : l.status === "adjusted" ? "secondary" : "outline"} className="text-xs">
                                  {l.status}
                                </Badge>
                              </TableCell>
                              {selectedAuditData?.status !== "completed" && (
                                <TableCell>
                                  <div className="flex gap-1 items-center">
                                    <Input
                                      type="number" min={0} className="w-16 h-7 text-xs"
                                      value={countValues[l.id] ?? ""}
                                      onChange={e => setCountValues(v => ({ ...v, [l.id]: Number(e.target.value) }))}
                                    />
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                                      disabled={countValues[l.id] === undefined || countMut.isPending}
                                      onClick={() => countMut.mutate({ lineId: l.id, countedQty: countValues[l.id] })}>
                                      Save
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Audit Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Stock Audit</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">A new audit session will be created with all active batches for the selected store.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Store ID</Label>
                <Input type="number" placeholder="e.g. 1" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Audit Type</Label>
                <Select value={form.auditType} onValueChange={v => setForm(f => ({ ...f, auditType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Audit</SelectItem>
                    <SelectItem value="spot_check">Spot Check</SelectItem>
                    <SelectItem value="expiry_sweep">Expiry Sweep</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Monthly cycle count..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!form.storeId || createMut.isPending}
              onClick={() => createMut.mutate({ storeId: Number(form.storeId), auditType: form.auditType, note: form.note || undefined })}>
              {createMut.isPending ? "Creating..." : "Create Audit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Audit Modal */}
      <Dialog open={!!completeModal} onOpenChange={() => setCompleteModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete Audit #{completeModal?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Completing the audit will finalize all counted lines. Optionally apply corrections to update actual stock quantities.</p>
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-md border border-amber-200">
              <input type="checkbox" id="applyCorr" checked={applyCorrections} onChange={e => setApplyCorrections(e.target.checked)} className="h-4 w-4" />
              <label htmlFor="applyCorr" className="text-sm font-medium text-amber-800">
                Apply variance corrections to live stock quantities
              </label>
            </div>
            {applyCorrections && (
              <p className="text-xs text-amber-700">⚠ This will write stock_adjustment movements for all variances. This action cannot be undone.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteModal(null)}>Cancel</Button>
            <Button disabled={completeMut.isPending}
              onClick={() => completeModal && completeMut.mutate({ auditId: completeModal.id, applyCorrections })}>
              {completeMut.isPending ? "Completing..." : "Complete Audit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
