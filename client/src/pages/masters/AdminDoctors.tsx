import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, PowerOff, Power, Download } from "lucide-react";

type DoctorForm = { doctorName: string; registrationNo: string; clinicHospital: string; phone: string; address: string; specialization: string; };
const EMPTY: DoctorForm = { doctorName: "", registrationNo: "", clinicHospital: "", phone: "", address: "", specialization: "" };

export default function AdminDoctors() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DoctorForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.doctorMaster.list.useQuery({ search: search || undefined, activeOnly: !showInactive, limit: 200 });
  const rows = (data as any)?.rows ?? [];

  const createMut = trpc.masterData.doctorMaster.create.useMutation({ onSuccess: () => { toast.success("Doctor created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.doctorMaster.update.useMutation({ onSuccess: () => { toast.success("Doctor updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.doctorMaster.deactivate.useMutation({ onSuccess: () => { toast.success("Doctor deactivated"); setDeactivateId(null); setReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reactivateMut = trpc.masterData.doctorMaster.reactivate.useMutation({ onSuccess: () => { toast.success("Doctor reactivated"); refetch(); }, onError: (e) => toast.error(e.message) });
  const exportMut = trpc.masterData.doctorMaster.exportCsv.useMutation({
    onSuccess: (csv: string) => { const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "doctors.csv"; a.click(); URL.revokeObjectURL(u); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => { setEditId(d.id); setForm({ doctorName: d.doctorName ?? "", registrationNo: d.registrationNo ?? "", clinicHospital: d.clinicHospital ?? "", phone: d.phone ?? "", address: d.address ?? "", specialization: d.specialization ?? "" }); setShowDialog(true); };
  const handleSubmit = () => {
    if (!form.doctorName.trim()) { toast.error("Doctor name is required"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  const FIELDS: { key: keyof DoctorForm; label: string; placeholder?: string }[] = [
    { key: "doctorName", label: "Doctor Name *", placeholder: "Dr. Anil Sharma" },
    { key: "registrationNo", label: "Registration No.", placeholder: "MCI-12345" },
    { key: "clinicHospital", label: "Clinic / Hospital", placeholder: "Lilavati Hospital" },
    { key: "specialization", label: "Specialization", placeholder: "Cardiology" },
    { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
    { key: "address", label: "Address", placeholder: "Street, City" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Doctor Master</h1>
            <p className="text-sm text-white/50">Prescribing doctors linked to prescriptions and compliance</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({})} className="text-white/70 border-white/20 bg-transparent hover:bg-white/10"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Doctor</Button>
        </div>

        <div className="flex gap-3 mb-4">
          <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)} className={`border-white/20 bg-transparent text-white/70 hover:bg-white/10 ${showInactive ? "border-blue-500 text-blue-400" : ""}`}>
            {showInactive ? "Showing All" : "Active Only"}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-white/40 text-sm py-8 text-center">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">No doctors found. Add the first one.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Doctor Name", "Reg. No.", "Clinic / Hospital", "Specialization", "Phone", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{d.doctorName}</td>
                    <td className="px-4 py-3 text-white/60">{d.registrationNo || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.clinicHospital || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.specialization || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={d.isActive ? "default" : "secondary"} className={d.isActive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-white/10 text-white/40"}>
                        {d.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                        {d.isActive
                          ? <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400/60 hover:text-red-400" onClick={() => { setDeactivateId(d.id); setReason(""); }}><PowerOff className="w-3.5 h-3.5" /></Button>
                          : <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400/60 hover:text-green-400" onClick={() => reactivateMut.mutate({ id: d.id })}><Power className="w-3.5 h-3.5" /></Button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-lg">
            <DialogHeader><DialogTitle>{editId ? "Edit Doctor" : "Add Doctor"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              {FIELDS.map(f => (
                <div key={f.key} className={f.key === "address" ? "col-span-2" : ""}>
                  <Label className="text-white/70 text-xs mb-1 block">{f.label}</Label>
                  <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-white/60">Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMut.isPending || updateMut.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivate Dialog */}
        <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Doctor</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This doctor will no longer appear in prescription lookups.</p>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No longer prescribing" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeactivateId(null)} className="text-white/60">Cancel</Button>
              <Button variant="destructive" onClick={() => deactivateMut.mutate({ id: deactivateId!, reason: reason || undefined })} disabled={deactivateMut.isPending}>
                {deactivateMut.isPending ? "Deactivating..." : "Deactivate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
