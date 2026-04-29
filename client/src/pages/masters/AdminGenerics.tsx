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

type GenForm = { genericName: string; aliases: string; therapeuticClass: string };
const EMPTY: GenForm = { genericName: "", aliases: "", therapeuticClass: "" };

export default function AdminGenerics() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<GenForm>(EMPTY);
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);

  const { data, refetch, isLoading } = trpc.masterData.generics.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    limit: 200,
  });
  const rows = (data as any)?.rows ?? [];

  const createMutation = trpc.masterData.generics.create.useMutation({
    onSuccess: () => { toast.success("Generic created"); setShowDialog(false); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.masterData.generics.update.useMutation({
    onSuccess: () => { toast.success("Generic updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.generics.deactivate.useMutation({
    onSuccess: () => { toast.success("Generic deactivated"); setShowDeactivate(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.generics.reactivate.useMutation({
    onSuccess: () => { toast.success("Generic reactivated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const exportMutation = trpc.masterData.generics.exportCsv.useMutation({
    onSuccess: (csv: string) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "generics.csv"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (g: any) => {
    setEditId(g.id);
    setForm({ genericName: g.genericName ?? "", aliases: g.aliases ?? "", therapeuticClass: g.therapeuticClass ?? "" });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.genericName.trim()) { toast.error("Generic name is required"); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, genericName: form.genericName, aliases: form.aliases || undefined, therapeuticClass: form.therapeuticClass || undefined });
    } else {
      createMutation.mutate({ genericName: form.genericName, aliases: form.aliases || undefined, therapeuticClass: form.therapeuticClass || undefined });
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
            <h1 className="text-xl font-semibold text-white">Generic / Salt Master</h1>
            <p className="text-white/50 text-sm">{rows.length} generics</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate({})} disabled={exportMutation.isPending} className="text-white/60 hover:text-white gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Generic
          </Button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search generics..." className="bg-white/5 border-white/10 text-white pl-9" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(v => !v)} className={`text-sm ${showInactive ? "text-white bg-white/10" : "text-white/50"}`}>
            {showInactive ? "Showing all" : "Active only"}
          </Button>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Generic Name</TableHead>
                <TableHead className="text-white/50">Aliases / Salts</TableHead>
                <TableHead className="text-white/50">Therapeutic Class</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">No generics found</TableCell></TableRow>}
              {rows.map((g: any) => (
                <TableRow key={g.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{g.genericName}</TableCell>
                  <TableCell className="text-white/50 text-sm max-w-xs truncate">{g.aliases ?? "—"}</TableCell>
                  <TableCell className="text-white/50 text-sm">{g.therapeuticClass ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={g.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {g.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)} className="w-7 h-7 text-white/50 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                      {g.isActive
                        ? <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(g.id)} className="w-7 h-7 text-white/50 hover:text-red-400"><Archive className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: g.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Generic" : "Add Generic"}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-white/70 text-xs">Generic Name *</Label>
                <Input value={form.genericName} onChange={e => setForm(p => ({ ...p, genericName: e.target.value }))} placeholder="e.g. Paracetamol" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Aliases / Salts</Label>
                <Input value={form.aliases} onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))} placeholder="e.g. Acetaminophen, APAP" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Therapeutic Class</Label>
                <Input value={form.therapeuticClass} onChange={e => setForm(p => ({ ...p, therapeuticClass: e.target.value }))} placeholder="e.g. Analgesic / Antipyretic" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
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
        <Dialog open={showDeactivate !== null} onOpenChange={open => { if (!open) setShowDeactivate(null); }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Generic</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This generic will be archived and hidden from new product assignments.</p>
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
