import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, PowerOff, Power } from "lucide-react";

type PCForm = { categoryName: string; description: string; };
const EMPTY: PCForm = { categoryName: "", description: "" };

export default function AdminPatientCategories() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PCForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.patientCategories.list.useQuery({ search: search || undefined, activeOnly: !showInactive });
  const rows = (data as any)?.rows ?? [];

  const createMut = trpc.masterData.patientCategories.create.useMutation({ onSuccess: () => { toast.success("Patient category created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.patientCategories.update.useMutation({ onSuccess: () => { toast.success("Patient category updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.patientCategories.deactivate.useMutation({ onSuccess: () => { toast.success("Deactivated"); setDeactivateId(null); setReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reactivateMut = trpc.masterData.patientCategories.reactivate.useMutation({ onSuccess: () => { toast.success("Reactivated"); refetch(); }, onError: (e) => toast.error(e.message) });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => { setEditId(d.id); setForm({ categoryName: d.categoryName ?? "", description: d.description ?? "" }); setShowDialog(true); };
  const handleSubmit = () => {
    if (!form.categoryName.trim()) { toast.error("Category name is required"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Patient Category Master</h1>
            <p className="text-sm text-white/50">Classify patients for discount and compliance rules</p>
          </div>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Category</Button>
        </div>

        <div className="flex gap-3 mb-4">
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)} className={`border-white/20 bg-transparent text-white/70 hover:bg-white/10 ${showInactive ? "border-blue-500 text-blue-400" : ""}`}>
            {showInactive ? "Showing All" : "Active Only"}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-white/40 text-sm py-8 text-center">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">No patient categories found.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Category Name", "Description", "Status", "Actions"].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{d.categoryName}</td>
                    <td className="px-4 py-3 text-white/60 max-w-xs truncate">{d.description || "—"}</td>
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

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit Patient Category" : "Add Patient Category"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Category Name *</Label>
                <Input value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} placeholder="e.g. Senior Citizen" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-white/60">Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMut.isPending || updateMut.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Category</DialogTitle></DialogHeader>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
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
