/**
 * AdminPrescriptionGov.tsx — PART 8: Prescription Governance
 * Tabs: Queue | Viewer | H1 Register | Archive | Access Log
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ClipboardList, Eye, BookOpen, Archive, Activity,
  CheckCircle, XCircle, AlertCircle, Clock, FileText,
  Plus, Search, RefreshCw,
} from "lucide-react";

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "neutral" }> = {
    pending_ocr: { label: "Pending OCR", variant: "neutral" },
    pending_pharmacist: { label: "Pharmacist Review", variant: "warning" },
    quick_verify: { label: "Quick Verify", variant: "info" },
    approved: { label: "Approved", variant: "success" },
    rejected: { label: "Rejected", variant: "destructive" },
    additional_verification: { label: "Clarification", variant: "warning" },
    on_file: { label: "On File", variant: "outline" },
  };
  const s = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ── Schedule badge ──────────────────────────────────────────────────────────
function ScheduleBadge({ code }: { code?: string | null }) {
  if (!code) return null;
  const color: Record<string, string> = {
    OTC: "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
    Rx: "border-blue-400/25 bg-blue-500/12 text-blue-200",
    H: "border-amber-400/35 bg-amber-500/15 text-amber-100",
    H1: "border-red-400/35 bg-red-500/15 text-red-100",
    X: "border-purple-400/35 bg-purple-500/15 text-purple-100",
    NRX: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${color[code] ?? "border-zinc-500/25 bg-zinc-500/12 text-zinc-200"}`}>
      Schedule {code}
    </span>
  );
}

// ── Prescription Queue Tab ───────────────────────────────────────────────────
function QueueTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("pending_pharmacist");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.prescriptionGov.queue.useQuery({
    status: status as "pending_pharmacist" | "pending_ocr" | "quick_verify" | "additional_verification" | "all" | undefined,
    search: search || undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patient, doctor, phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_pharmacist">Pending Review</SelectItem>
            <SelectItem value="pending_ocr">Pending OCR</SelectItem>
            <SelectItem value="quick_verify">Quick Verify</SelectItem>
            <SelectItem value="additional_verification">Clarification</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      ) : !data?.rows.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No prescriptions in this queue</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.rows.map((rx) => (
            <Card key={rx.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => onSelect(rx.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">Rx #{rx.id}</span>
                      <StatusBadge status={rx.status} />
                      <Badge variant="outline" className="text-xs">{rx.lane}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <div>Patient: <span className="text-foreground">{rx.patientName ?? rx.userName ?? "Unknown"}</span>
                        {rx.patientPhone && <span className="ml-2 text-xs">📞 {rx.patientPhone}</span>}
                      </div>
                      {rx.doctorName && <div>Doctor: {rx.doctorName} {rx.doctorReg && `(${rx.doctorReg})`}</div>}
                      {rx.prescribedDate && <div>Prescribed: {format(new Date(rx.prescribedDate), "dd MMM yyyy")}</div>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{format(new Date(rx.createdAt), "dd MMM HH:mm")}</div>
                    {rx.clarificationNote && (
                      <div className="mt-1 text-orange-600 flex items-center gap-1 justify-end">
                        <AlertCircle className="h-3 w-3" />
                        Clarification needed
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>{data.total} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Prescription Viewer / Review Tab ────────────────────────────────────────
function ViewerTab({ rxId, onClose }: { rxId: number | null; onClose: () => void }) {
  const [showClarificationDialog, setShowClarificationDialog] = useState(false);
  const [showAddLineDialog, setShowAddLineDialog] = useState(false);
  const [clarificationNote, setClarificationNote] = useState("");
  const [newLine, setNewLine] = useState({
    drugName: "", genericName: "", strength: "", dosageForm: "",
    qty: "", duration: "", frequency: "", scheduleCode: "Rx" as const,
  });

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.prescriptionGov.get.useQuery(
    { id: rxId! },
    { enabled: !!rxId }
  );

  const reviewMut = trpc.prescriptionGov.review.useMutation({
    onSuccess: () => { toast.success("Prescription reviewed"); utils.prescriptionGov.queue.invalidate(); utils.prescriptionGov.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const clarifyMut = trpc.prescriptionGov.requestClarification.useMutation({
    onSuccess: () => { toast.success("Clarification requested"); setShowClarificationDialog(false); utils.prescriptionGov.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const approveLineMut = trpc.prescriptionGov.approveLine.useMutation({
    onSuccess: () => { toast.success("Line approved"); utils.prescriptionGov.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectLineMut = trpc.prescriptionGov.rejectLine.useMutation({
    onSuccess: () => { toast.success("Line rejected"); utils.prescriptionGov.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const upsertLineMut = trpc.prescriptionGov.upsertLine.useMutation({
    onSuccess: () => { toast.success("Line added"); setShowAddLineDialog(false); utils.prescriptionGov.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!rxId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Eye className="h-12 w-12 mb-3 opacity-30" />
        <p>Select a prescription from the queue to review</p>
      </div>
    );
  }

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!data) return <div className="text-center py-8 text-muted-foreground">Not found</div>;

  const rx = data.prescription.prescriptions;
  const user = data.prescription.users;
  const lines = data.lines;
  const isPending = rx.status === "pending_pharmacist" || rx.status === "quick_verify";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Rx Image */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Prescription Image</span>
              <StatusBadge status={rx.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rx.imageUrl ? (
              <img
                src={rx.imageUrl}
                alt="Prescription"
                className="w-full rounded-lg border object-contain max-h-[500px]"
              />
            ) : (
              <div className="h-48 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                <FileText className="h-12 w-12 opacity-30" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patient / Doctor Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Patient & Doctor Details</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Patient:</span>
                <div className="font-medium">{rx.patientName ?? user?.name ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>
                <div className="font-medium">{rx.patientPhone ?? user?.phone ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Doctor:</span>
                <div className="font-medium">{rx.doctorName ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Reg No:</span>
                <div className="font-medium">{rx.doctorReg ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Prescribed:</span>
                <div className="font-medium">{rx.prescribedDate ? format(new Date(rx.prescribedDate), "dd MMM yyyy") : "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Expires:</span>
                <div className="font-medium">{rx.expiryDate ? format(new Date(rx.expiryDate), "dd MMM yyyy") : "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Repeat:</span>
                <div className="font-medium">{rx.repeatDispenseCount ?? 0} / {rx.repeatDispenseMax ?? 1}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Lane:</span>
                <div className="font-medium capitalize">{rx.lane}</div>
              </div>
            </div>
            {rx.clarificationNote && (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-orange-800 text-xs">
                <strong>Clarification needed:</strong> {rx.clarificationNote}
              </div>
            )}
            {rx.pharmacistNote && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
                <strong>Pharmacist note:</strong> {rx.pharmacistNote}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: Medicine Lines + Actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Medicine Lines ({lines.length})</span>
              {isPending && (
                <Button size="sm" variant="outline" onClick={() => setShowAddLineDialog(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Line
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No medicine lines extracted yet. Add them manually.
              </div>
            ) : (
              <div className="space-y-3">
                {lines.map((line) => (
                  <div key={line.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{line.drugName}</span>
                          <ScheduleBadge code={line.scheduleCode} />
                          {line.requiresH1 ? <Badge variant="destructive" className="text-xs">H1 Register</Badge> : null}
                        </div>
                        {(line.genericName || line.strength || line.dosageForm) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[line.genericName, line.strength, line.dosageForm].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {(line.qty || line.duration || line.frequency) && (
                          <div className="text-xs text-muted-foreground">
                            {[line.qty && `Qty: ${line.qty}`, line.duration, line.frequency].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {line.pharmacistNote && (
                          <div className="text-xs text-blue-600 mt-1">{line.pharmacistNote}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={line.status === "approved" ? "default" : line.status === "rejected" ? "destructive" : "secondary"} className="text-xs">
                          {line.status}
                        </Badge>
                        {isPending && line.status === "pending" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => approveLineMut.mutate({ lineId: line.id })}
                              disabled={approveLineMut.isPending}
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => {
                                const reason = prompt("Rejection reason:");
                                if (reason) rejectLineMut.mutate({ lineId: line.id, pharmacistNote: reason });
                              }}
                              disabled={rejectLineMut.isPending}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {isPending && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pharmacist Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => reviewMut.mutate({ id: rx.id, decision: "approved" })}
                disabled={reviewMut.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Prescription
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  const note = prompt("Rejection reason (required):");
                  if (note) reviewMut.mutate({ id: rx.id, decision: "rejected", pharmacistNote: note });
                }}
                disabled={reviewMut.isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject Prescription
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowClarificationDialog(true)}
                disabled={clarifyMut.isPending}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Request Clarification
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Clarification Dialog */}
      <Dialog open={showClarificationDialog} onOpenChange={setShowClarificationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Clarification</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Note for patient / prescriber</Label>
            <Textarea
              value={clarificationNote}
              onChange={(e) => setClarificationNote(e.target.value)}
              placeholder="Describe what needs clarification..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClarificationDialog(false)}>Cancel</Button>
            <Button
              onClick={() => clarifyMut.mutate({ id: rx.id, clarificationNote })}
              disabled={!clarificationNote.trim() || clarifyMut.isPending}
            >
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Line Dialog */}
      <Dialog open={showAddLineDialog} onOpenChange={setShowAddLineDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Medicine Line</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Drug Name *</Label>
              <Input value={newLine.drugName} onChange={(e) => setNewLine(p => ({ ...p, drugName: e.target.value }))} />
            </div>
            <div>
              <Label>Generic Name</Label>
              <Input value={newLine.genericName} onChange={(e) => setNewLine(p => ({ ...p, genericName: e.target.value }))} />
            </div>
            <div>
              <Label>Strength</Label>
              <Input value={newLine.strength} onChange={(e) => setNewLine(p => ({ ...p, strength: e.target.value }))} />
            </div>
            <div>
              <Label>Dosage Form</Label>
              <Input value={newLine.dosageForm} onChange={(e) => setNewLine(p => ({ ...p, dosageForm: e.target.value }))} />
            </div>
            <div>
              <Label>Qty</Label>
              <Input type="number" value={newLine.qty} onChange={(e) => setNewLine(p => ({ ...p, qty: e.target.value }))} />
            </div>
            <div>
              <Label>Duration</Label>
              <Input value={newLine.duration} onChange={(e) => setNewLine(p => ({ ...p, duration: e.target.value }))} placeholder="e.g. 7 days" />
            </div>
            <div>
              <Label>Frequency</Label>
              <Input value={newLine.frequency} onChange={(e) => setNewLine(p => ({ ...p, frequency: e.target.value }))} placeholder="e.g. TDS" />
            </div>
            <div>
              <Label>Schedule</Label>
              <Select value={newLine.scheduleCode} onValueChange={(v) => setNewLine(p => ({ ...p, scheduleCode: v as typeof newLine.scheduleCode }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["OTC", "Rx", "H", "H1", "X", "NRX"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLineDialog(false)}>Cancel</Button>
            <Button
              onClick={() => upsertLineMut.mutate({
                prescriptionId: rx.id,
                lineNo: lines.length + 1,
                drugName: newLine.drugName,
                genericName: newLine.genericName || undefined,
                strength: newLine.strength || undefined,
                dosageForm: newLine.dosageForm || undefined,
                qty: newLine.qty ? parseInt(newLine.qty) : undefined,
                duration: newLine.duration || undefined,
                frequency: newLine.frequency || undefined,
                scheduleCode: newLine.scheduleCode,
              })}
              disabled={!newLine.drugName.trim() || upsertLineMut.isPending}
            >
              Add Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── H1 Register Tab ──────────────────────────────────────────────────────────
function H1RegisterTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState({
    prescriptionId: "", storeId: "1", patientName: "", patientPhone: "",
    prescribingDoctor: "", drugName: "", batchNo: "", qty: "1", billNo: "",
  });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.prescriptionGov.h1.list.useQuery({ search: search || undefined, page, pageSize: 20 });

  const createMut = trpc.prescriptionGov.h1.create.useMutation({
    onSuccess: () => { toast.success("H1 entry created"); setShowCreateDialog(false); utils.prescriptionGov.h1.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search patient, drug, bill no..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> New H1 Entry
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !data?.rows.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No H1 register entries</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Patient</th>
                <th className="text-left p-2">Drug</th>
                <th className="text-left p-2">Batch</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-left p-2">Bill No</th>
                <th className="text-left p-2">Pharmacist</th>
                <th className="text-left p-2">Dispensed</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-mono text-xs">{row.id}</td>
                  <td className="p-2">
                    <div className="font-medium">{row.patientName}</div>
                    {row.patientPhone && <div className="text-xs text-muted-foreground">{row.patientPhone}</div>}
                  </td>
                  <td className="p-2 font-medium">{row.drugName}</td>
                  <td className="p-2 font-mono text-xs">{row.batchNo ?? "—"}</td>
                  <td className="p-2 text-right font-semibold">{row.qty}</td>
                  <td className="p-2 font-mono text-xs">{row.billNo ?? "—"}</td>
                  <td className="p-2 text-xs">{row.pharmacistName ?? `ID:${row.pharmacistId}`}</td>
                  <td className="p-2 text-xs text-muted-foreground">{format(new Date(row.dispensedAt), "dd MMM HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create H1 Entry Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New H1 Register Entry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>Prescription ID *</Label>
              <Input type="number" value={form.prescriptionId} onChange={(e) => setForm(p => ({ ...p, prescriptionId: e.target.value }))} />
            </div>
            <div>
              <Label>Store ID *</Label>
              <Input type="number" value={form.storeId} onChange={(e) => setForm(p => ({ ...p, storeId: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Patient Name *</Label>
              <Input value={form.patientName} onChange={(e) => setForm(p => ({ ...p, patientName: e.target.value }))} />
            </div>
            <div>
              <Label>Patient Phone</Label>
              <Input value={form.patientPhone} onChange={(e) => setForm(p => ({ ...p, patientPhone: e.target.value }))} />
            </div>
            <div>
              <Label>Prescribing Doctor</Label>
              <Input value={form.prescribingDoctor} onChange={(e) => setForm(p => ({ ...p, prescribingDoctor: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Drug Name *</Label>
              <Input value={form.drugName} onChange={(e) => setForm(p => ({ ...p, drugName: e.target.value }))} />
            </div>
            <div>
              <Label>Batch No</Label>
              <Input value={form.batchNo} onChange={(e) => setForm(p => ({ ...p, batchNo: e.target.value }))} />
            </div>
            <div>
              <Label>Qty *</Label>
              <Input type="number" value={form.qty} onChange={(e) => setForm(p => ({ ...p, qty: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Bill No</Label>
              <Input value={form.billNo} onChange={(e) => setForm(p => ({ ...p, billNo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate({
                prescriptionId: parseInt(form.prescriptionId),
                storeId: parseInt(form.storeId),
                patientName: form.patientName,
                patientPhone: form.patientPhone || undefined,
                prescribingDoctor: form.prescribingDoctor || undefined,
                drugName: form.drugName,
                batchNo: form.batchNo || undefined,
                qty: parseInt(form.qty),
                billNo: form.billNo || undefined,
              })}
              disabled={!form.prescriptionId || !form.patientName || !form.drugName || !form.qty || createMut.isPending}
            >
              Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Archive Tab ──────────────────────────────────────────────────────────────
function ArchiveTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("approved");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.prescriptionGov.archive.useQuery({
    status: status as "approved" | "rejected" | "on_file" | "all" | undefined,
    search: search || undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search patient, doctor..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="on_file">On File</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !data?.rows.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No archived prescriptions</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase">
                <th className="text-left p-2">Rx #</th>
                <th className="text-left p-2">Patient</th>
                <th className="text-left p-2">Doctor</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Reviewed</th>
                <th className="text-left p-2">Sale</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((rx) => (
                <tr key={rx.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-mono text-xs">{rx.id}</td>
                  <td className="p-2">{rx.patientName ?? rx.userName ?? "—"}</td>
                  <td className="p-2 text-xs">{rx.doctorName ?? "—"}</td>
                  <td className="p-2"><StatusBadge status={rx.status} /></td>
                  <td className="p-2 text-xs text-muted-foreground">{rx.reviewedAt ? format(new Date(rx.reviewedAt), "dd MMM yyyy") : "—"}</td>
                  <td className="p-2 text-xs">{rx.linkedSaleId ? `#${rx.linkedSaleId}` : "—"}</td>
                  <td className="p-2">
                    <Button size="sm" variant="ghost" onClick={() => onSelect(rx.id)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>{data.total} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Access Log Tab ───────────────────────────────────────────────────────────
function AccessLogTab() {
  const [rxId, setRxId] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.prescriptionGov.accessLog.useQuery(
    { prescriptionId: parseInt(rxId), page, pageSize: 30 },
    { enabled: !!rxId && !isNaN(parseInt(rxId)) }
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 max-w-xs">
          <Label>Prescription ID</Label>
          <Input
            type="number"
            placeholder="Enter Rx ID to view access log"
            value={rxId}
            onChange={(e) => { setRxId(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {!rxId ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Enter a Prescription ID to view its access log</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !data?.rows.length ? (
        <div className="text-center py-8 text-muted-foreground">No access log entries</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase">
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Accessor</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((log) => (
                <tr key={log.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs text-muted-foreground">{format(new Date(log.createdAt), "dd MMM HH:mm:ss")}</td>
                  <td className="p-2 text-xs">{log.accessorName ?? `ID:${log.accessedBy}`}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-xs">{log.accessType}</Badge>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{log.purpose ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPrescriptionGov() {
  const [activeTab, setActiveTab] = useState("queue");
  const [selectedRxId, setSelectedRxId] = useState<number | null>(null);

  function handleSelectRx(id: number) {
    setSelectedRxId(id);
    setActiveTab("viewer");
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="premium-card p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Prescription Governance</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Pharmacist review queue · Line-level approval · H1 register · Rx archive · Access log
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="regulated">H/H1 guarded</Badge>
              <Badge variant="info">OCR is assistive only</Badge>
              <Badge variant="success">Approval explicit</Badge>
            </div>
          </div>
          <div className="safety-callout mt-4 p-3 text-xs leading-relaxed">
            No prescription decision is automated here. Approvals, rejections, clarification requests, H1 entries, and line edits require a pharmacist action and audit trail.
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="queue" className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Queue
            </TabsTrigger>
            <TabsTrigger value="viewer" className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Viewer
            </TabsTrigger>
            <TabsTrigger value="h1" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> H1 Register
            </TabsTrigger>
            <TabsTrigger value="archive" className="flex items-center gap-1.5">
              <Archive className="h-3.5 w-3.5" /> Archive
            </TabsTrigger>
            <TabsTrigger value="access-log" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Access Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <QueueTab onSelect={handleSelectRx} />
          </TabsContent>

          <TabsContent value="viewer" className="mt-4">
            <ViewerTab rxId={selectedRxId} onClose={() => setSelectedRxId(null)} />
          </TabsContent>

          <TabsContent value="h1" className="mt-4">
            <H1RegisterTab />
          </TabsContent>

          <TabsContent value="archive" className="mt-4">
            <ArchiveTab onSelect={handleSelectRx} />
          </TabsContent>

          <TabsContent value="access-log" className="mt-4">
            <AccessLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
