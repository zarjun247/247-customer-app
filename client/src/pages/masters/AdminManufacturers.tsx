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
import { ChevronLeft, Plus, Download, Search, Edit2, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type MfgForm = { companyName: string; aliases: string; gstin: string };
const EMPTY: MfgForm = { companyName: "", aliases: "", gstin: "" };

export default function AdminManufacturers() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MfgForm>(EMPTY);
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.manufacturers.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    limit: 200,
  });
  const rows = (data as any)?.rows ?? [];

  const createMutation = trpc.masterData.manufacturers.create.useMutation({
    onSuccess: () => { toast.success("Manufacturer created"); setShowDialog(false); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.masterData.manufacturers.update.useMutation({
    onSuccess: () => { toast.success("Manufacturer updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.manufacturers.deactivate.useMutation({
    onSuccess: () => { toast.success("Manufacturer deactivated"); setShowDeactivate(null); setDeactivateReason(""); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.manufacturers.reactivate.useMutation({
    onSuccess: () => { toast.success("Manufacturer reactivated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const exportMutation = trpc.masterData.manufacturers.exportCsv.useMutation({
    onSuccess: (csv: string) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "manufacturers.csv"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({ companyName: m.companyName ?? "", aliases: m.aliases ?? "", gstin: m.gstin ?? "" });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.companyName.trim()) { toast.error("Company name is required"); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, companyName: form.companyName, aliases: form.aliases || undefined, gstin: form.gstin || undefined });
    } else {
      createMutation.mutate({ companyName: form.companyName, aliases: form.aliases || undefined, gstin: form.gstin || undefined });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Manufacturer Master</h1>
            <p className="text-white/50 text-sm">{rows.length} manufacturers</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate({})} disabled={exportMutation.isPending} className="text-white/60 hover:text-white gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Manufacturer
          </Button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search manufacturers..." className="bg-white/5 border-white/10 text-white pl-9" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(v => !v)} className={`text-sm ${showInactive ? "text-white bg-white/10" : "text-white/50"}`}>
            {showInactive ? "Showing all" : "Active only"}
          </Button>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Company Name</TableHead>
                <TableHead className="text-white/50">Aliases</TableHead>
                <TableHead className="text-white/50">GSTIN</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">No manufacturers found</TableCell></TableRow>}
              {rows.map((m: any) => (
                <TableRow key={m.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{m.companyName}</TableCell>
                  <TableCell className="text-white/50 text-sm">{m.aliases ?? "—"}</TableCell>
                  <TableCell className="text-white/50 font-mono text-xs">{m.gstin ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={m.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {m.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(m)} className="w-7 h-7 text-white/50 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                      {m.isActive
                        ? <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(m.id)} className="w-7 h-7 text-white/50 hover:text-red-400"><Archive className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: m.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Manufacturer" : "Add Manufacturer"}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              {[
                { key: "companyName" as const, label: "Company Name *", placeholder: "e.g. Sun Pharma Ltd" },
                { key: "aliases" as const, label: "Aliases", placeholder: "Comma-separated alternate names" },
                { key: "gstin" as const, label: "GSTIN", placeholder: "27AAAAA0000A1Z5" },
              ].map(f => (
                <div key={f.key}>
                  <Label className="text-white/70 text-xs">{f.label}</Label>
                  <Input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="bg-white/10 border-white/20 text-white mt-1" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowDialog(false); setEditId(null); setForm(EMPTY); }} className="text-white/60">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deactivate Dialog */}
        <Dialog open={showDeactivate !== null} onOpenChange={open => { if (!open) { setShowDeactivate(null); setDeactivateReason(""); } }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Manufacturer</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This manufacturer will be archived.</p>
            <div className="mt-3">
              <Label className="text-white/70 text-xs">Reason (optional)</Label>
              <Input value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} placeholder="e.g. Merged with another company" className="bg-white/10 border-white/20 text-white mt-1" />
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => deactivateMutation.mutate({ id: showDeactivate!, reason: deactivateReason || undefined })} disabled={deactivateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowDeactivate(null); setDeactivateReason(""); }} className="text-white/60">Cancel</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
