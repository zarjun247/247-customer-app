import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, Edit2, Archive, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";

type SchedForm = {
  scheduleCode: string;
  prescriptionRequired: boolean;
  pharmacistReviewRequired: boolean;
  h1RegisterRequired: boolean;
  repeatDispenseAllowed: boolean;
  retentionPolicyDays: string;
};
const EMPTY: SchedForm = {
  scheduleCode: "",
  prescriptionRequired: false,
  pharmacistReviewRequired: false,
  h1RegisterRequired: false,
  repeatDispenseAllowed: true,
  retentionPolicyDays: "365",
};

const SCHEDULE_CODES = ["OTC", "Rx", "H", "H1", "X", "NRX"];

function BoolCell({ value }: { value: boolean }) {
  return value
    ? <Check className="w-4 h-4 text-emerald-400" />
    : <X className="w-4 h-4 text-white/20" />;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-white/70 text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative ${checked ? "bg-blue-600" : "bg-white/20"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export default function AdminSchedules() {
  const [, setLocation] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SchedForm>(EMPTY);
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);

  const { data: rows = [], refetch, isLoading } = trpc.masterData.schedules.list.useQuery();

  const upsertMutation = trpc.masterData.schedules.upsert.useMutation({
    onSuccess: () => { toast.success(editId ? "Schedule updated" : "Schedule created"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.schedules.deactivate.useMutation({
    onSuccess: () => { toast.success("Schedule deactivated"); setShowDeactivate(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.schedules.reactivate.useMutation({
    onSuccess: () => { toast.success("Schedule reactivated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      scheduleCode: s.scheduleCode ?? "",
      prescriptionRequired: !!s.prescriptionRequired,
      pharmacistReviewRequired: !!s.pharmacistReviewRequired,
      h1RegisterRequired: !!s.h1RegisterRequired,
      repeatDispenseAllowed: s.repeatDispenseAllowed !== false,
      retentionPolicyDays: String(s.retentionPolicyDays ?? 365),
    });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.scheduleCode.trim()) { toast.error("Schedule code is required"); return; }
    upsertMutation.mutate({
      id: editId ?? undefined,
      scheduleCode: form.scheduleCode,
      prescriptionRequired: form.prescriptionRequired,
      pharmacistReviewRequired: form.pharmacistReviewRequired,
      h1RegisterRequired: form.h1RegisterRequired,
      repeatDispenseAllowed: form.repeatDispenseAllowed,
      retentionPolicyDays: parseInt(form.retentionPolicyDays) || 365,
    });
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Schedule Master</h1>
            <p className="text-white/50 text-sm">Drug schedule compliance rules (OTC / Rx / H / H1 / X / NRX)</p>
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Schedule
          </Button>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Code</TableHead>
                <TableHead className="text-white/50 text-center">Rx Required</TableHead>
                <TableHead className="text-white/50 text-center">Pharmacist Review</TableHead>
                <TableHead className="text-white/50 text-center">H1 Register</TableHead>
                <TableHead className="text-white/50 text-center">Repeat Dispense</TableHead>
                <TableHead className="text-white/50">Retention (days)</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>}
              {!isLoading && (rows as any[]).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-white/40 py-10">No schedules yet. Add OTC, Rx, H, H1, X, NRX.</TableCell></TableRow>}
              {(rows as any[]).map((s: any) => (
                <TableRow key={s.id} className="border-white/10 hover:bg-white/5">
                  <TableCell>
                    <Badge className="bg-blue-500/20 text-blue-300 border-0 font-mono">{s.scheduleCode}</Badge>
                  </TableCell>
                  <TableCell className="text-center"><BoolCell value={!!s.prescriptionRequired} /></TableCell>
                  <TableCell className="text-center"><BoolCell value={!!s.pharmacistReviewRequired} /></TableCell>
                  <TableCell className="text-center"><BoolCell value={!!s.h1RegisterRequired} /></TableCell>
                  <TableCell className="text-center"><BoolCell value={s.repeatDispenseAllowed !== false} /></TableCell>
                  <TableCell className="text-white/60 text-sm">{s.retentionPolicyDays ?? 365}</TableCell>
                  <TableCell>
                    <Badge className={s.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} className="w-7 h-7 text-white/50 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                      {s.isActive
                        ? <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(s.id)} className="w-7 h-7 text-white/50 hover:text-red-400"><Archive className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: s.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
                      }
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={open => { if (!open) { setShowDialog(false); setEditId(null); setForm(EMPTY); } }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit Schedule" : "Add Schedule"}</DialogTitle></DialogHeader>
            <div className="mt-2">
              <Label className="text-white/70 text-xs">Schedule Code *</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {SCHEDULE_CODES.map(code => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, scheduleCode: code }))}
                    className={`px-3 py-1 rounded text-sm font-mono transition-colors ${form.scheduleCode === code ? "bg-blue-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
                  >
                    {code}
                  </button>
                ))}
                <Input
                  value={form.scheduleCode}
                  onChange={e => setForm(p => ({ ...p, scheduleCode: e.target.value }))}
                  placeholder="Custom..."
                  className="bg-white/10 border-white/20 text-white w-24 h-7 text-sm"
                />
              </div>
              <div className="mt-4 space-y-0">
                <Toggle label="Prescription Required" checked={form.prescriptionRequired} onChange={v => setForm(p => ({ ...p, prescriptionRequired: v }))} />
                <Toggle label="Pharmacist Review Required" checked={form.pharmacistReviewRequired} onChange={v => setForm(p => ({ ...p, pharmacistReviewRequired: v }))} />
                <Toggle label="H1 Register Required" checked={form.h1RegisterRequired} onChange={v => setForm(p => ({ ...p, h1RegisterRequired: v }))} />
                <Toggle label="Repeat Dispense Allowed" checked={form.repeatDispenseAllowed} onChange={v => setForm(p => ({ ...p, repeatDispenseAllowed: v }))} />
              </div>
              <div className="mt-3">
                <Label className="text-white/70 text-xs">Prescription Retention (days)</Label>
                <Input type="number" value={form.retentionPolicyDays} onChange={e => setForm(p => ({ ...p, retentionPolicyDays: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1 w-32" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleSubmit} disabled={upsertMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {upsertMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowDialog(false); setEditId(null); setForm(EMPTY); }} className="text-white/60">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deactivate Dialog */}
        <Dialog open={showDeactivate !== null} onOpenChange={open => { if (!open) setShowDeactivate(null); }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Schedule</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This schedule will be deactivated. Products linked to it will retain the code but compliance checks will be skipped.</p>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => deactivateMutation.mutate({ id: showDeactivate! })} disabled={deactivateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
              </Button>
              <Button variant="ghost" onClick={() => setShowDeactivate(null)} className="text-white/60">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
