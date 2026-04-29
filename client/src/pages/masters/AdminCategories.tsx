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

type CatForm = { categoryName: string; parentCategoryId: string; marginPolicy: string; description: string };
const EMPTY: CatForm = { categoryName: "", parentCategoryId: "", marginPolicy: "", description: "" };

export default function AdminCategories() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);

  const { data, refetch, isLoading } = trpc.masterData.categories.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    limit: 200,
  });
  const rows = (data as any)?.rows ?? [];

  const createMutation = trpc.masterData.categories.create.useMutation({
    onSuccess: () => { toast.success("Category created"); setShowDialog(false); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.masterData.categories.update.useMutation({
    onSuccess: () => { toast.success("Category updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.categories.deactivate.useMutation({
    onSuccess: () => { toast.success("Category deactivated"); setShowDeactivate(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.categories.reactivate.useMutation({
    onSuccess: () => { toast.success("Category reactivated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const exportMutation = trpc.masterData.categories.exportCsv.useMutation({
    onSuccess: (csv: string) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "drug_categories.csv"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      categoryName: c.categoryName ?? "",
      parentCategoryId: c.parentCategoryId ? String(c.parentCategoryId) : "",
      marginPolicy: c.marginPolicy ?? "",
      description: c.description ?? "",
    });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.categoryName.trim()) { toast.error("Category name is required"); return; }
    const payload = {
      categoryName: form.categoryName,
      parentCategoryId: form.parentCategoryId ? parseInt(form.parentCategoryId) : undefined,
      marginPolicy: form.marginPolicy || undefined,
      description: form.description || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Build parent name lookup
  const parentMap: Record<number, string> = {};
  rows.forEach((r: any) => { parentMap[r.id] = r.categoryName; });

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Drug Category Master</h1>
            <p className="text-white/50 text-sm">{rows.length} categories</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate({})} disabled={exportMutation.isPending} className="text-white/60 hover:text-white gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Category
          </Button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search categories..." className="bg-white/5 border-white/10 text-white pl-9" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(v => !v)} className={`text-sm ${showInactive ? "text-white bg-white/10" : "text-white/50"}`}>
            {showInactive ? "Showing all" : "Active only"}
          </Button>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Category Name</TableHead>
                <TableHead className="text-white/50">Parent</TableHead>
                <TableHead className="text-white/50">Margin Policy</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-white/40 py-10">No categories found</TableCell></TableRow>}
              {rows.map((c: any) => (
                <TableRow key={c.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{c.categoryName}</TableCell>
                  <TableCell className="text-white/50 text-sm">{c.parentCategoryId ? (parentMap[c.parentCategoryId] ?? `#${c.parentCategoryId}`) : "—"}</TableCell>
                  <TableCell className="text-white/50 text-sm">{c.marginPolicy ? `${c.marginPolicy}%` : "—"}</TableCell>
                  <TableCell>
                    <Badge className={c.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="w-7 h-7 text-white/50 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                      {c.isActive
                        ? <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(c.id)} className="w-7 h-7 text-white/50 hover:text-red-400"><Archive className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: c.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-white/70 text-xs">Category Name *</Label>
                <Input value={form.categoryName} onChange={e => setForm(p => ({ ...p, categoryName: e.target.value }))} placeholder="e.g. Analgesics" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Parent Category ID (optional)</Label>
                <Input type="number" value={form.parentCategoryId} onChange={e => setForm(p => ({ ...p, parentCategoryId: e.target.value }))} placeholder="Leave blank for top-level" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Margin Policy (%)</Label>
                <Input type="number" value={form.marginPolicy} onChange={e => setForm(p => ({ ...p, marginPolicy: e.target.value }))} placeholder="0.00" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">Description</Label>
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" className="bg-white/10 border-white/20 text-white mt-1" />
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
            <DialogHeader><DialogTitle>Deactivate Category</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This category will be archived and hidden from product assignments.</p>
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
