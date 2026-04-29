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
import { ChevronLeft, Plus, Download, Search, Edit2, Archive, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";

type DiscForm = {
  categoryName: string;
  maxDiscount: string;
  minMargin: string;
  roleOverrideRequired: boolean;
};
const EMPTY: DiscForm = { categoryName: "", maxDiscount: "0.00", minMargin: "0.00", roleOverrideRequired: false };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
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

export default function AdminDiscountCategories() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DiscForm>(EMPTY);
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);

  const { data: rows = [], refetch, isLoading } = trpc.masterData.discountCategories.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
  });

  const upsertMutation = trpc.masterData.discountCategories.upsert.useMutation({
    onSuccess: () => { toast.success(editId ? "Discount category updated" : "Discount category created"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.discountCategories.deactivate.useMutation({
    onSuccess: () => { toast.success("Discount category deactivated"); setShowDeactivate(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.discountCategories.reactivate.useMutation({
    onSuccess: () => { toast.success("Discount category reactivated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const exportMutation = trpc.masterData.discountCategories.exportCsv.useMutation({
    onSuccess: (csv: string) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "discount_categories.csv"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({
      categoryName: d.categoryName ?? "",
      maxDiscount: d.maxDiscount ?? "0.00",
      minMargin: d.minMargin ?? "0.00",
      roleOverrideRequired: !!d.roleOverrideRequired,
    });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.categoryName.trim()) { toast.error("Category name is required"); return; }
    upsertMutation.mutate({
      id: editId ?? undefined,
      categoryName: form.categoryName,
      maxDiscount: form.maxDiscount || "0.00",
      minMargin: form.minMargin || "0.00",
      roleOverrideRequired: form.roleOverrideRequired,
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
            <h1 className="text-xl font-semibold text-white">Discount Category Master</h1>
            <p className="text-white/50 text-sm">Define discount slabs and margin floors per product category</p>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search discount categories..." className="bg-white/5 border-white/10 text-white pl-9" />
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
                <TableHead className="text-white/50">Max Discount</TableHead>
                <TableHead className="text-white/50">Min Margin</TableHead>
                <TableHead className="text-white/50 text-center">Role Override</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>}
              {!isLoading && (rows as any[]).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-white/40 py-10">No discount categories found</TableCell></TableRow>}
              {(rows as any[]).map((d: any) => (
                <TableRow key={d.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{d.categoryName}</TableCell>
                  <TableCell className="text-white/60 text-sm">{d.maxDiscount ?? "0.00"}%</TableCell>
                  <TableCell className="text-white/60 text-sm">{d.minMargin ?? "0.00"}%</TableCell>
                  <TableCell className="text-center">
                    {d.roleOverrideRequired
                      ? <Check className="w-4 h-4 text-amber-400 mx-auto" />
                      : <X className="w-4 h-4 text-white/20 mx-auto" />
                    }
                  </TableCell>
                  <TableCell>
                    <Badge className={d.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {d.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="w-7 h-7 text-white/50 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                      {d.isActive
                        ? <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(d.id)} className="w-7 h-7 text-white/50 hover:text-red-400"><Archive className="w-3.5 h-3.5" /></Button>
                        : <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: d.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Discount Category" : "Add Discount Category"}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-white/70 text-xs">Category Name *</Label>
                <Input value={form.categoryName} onChange={e => setForm(p => ({ ...p, categoryName: e.target.value }))} placeholder="e.g. Generic Medicines" className="bg-white/10 border-white/20 text-white mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Max Discount (%)</Label>
                  <Input type="number" step="0.01" value={form.maxDiscount} onChange={e => setForm(p => ({ ...p, maxDiscount: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Min Margin (%)</Label>
                  <Input type="number" step="0.01" value={form.minMargin} onChange={e => setForm(p => ({ ...p, minMargin: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" />
                </div>
              </div>
              <Toggle label="Role Override Required (manager approval needed to exceed max discount)" checked={form.roleOverrideRequired} onChange={v => setForm(p => ({ ...p, roleOverrideRequired: v }))} />
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
            <DialogHeader><DialogTitle>Deactivate Discount Category</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This discount category will be archived. Products using it will retain the assignment but no discount rules will apply.</p>
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
