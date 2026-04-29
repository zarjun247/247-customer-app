import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, PowerOff, Download, Search, Package, AlertTriangle } from "lucide-react";

const SCHEDULES = ["OTC", "H", "H1", "X"] as const;
type Schedule = typeof SCHEDULES[number];
const CATEGORIES = ["medicine", "devices", "baby", "nutrition", "fmcg", "wellness"] as const;
type Category = typeof CATEGORIES[number];

const SCHEDULE_COLORS: Record<Schedule, string> = {
  OTC: "bg-green-500/20 text-green-400 border-green-500/30",
  H: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  H1: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  X: "bg-red-500/20 text-red-400 border-red-500/30",
};

type ProductForm = {
  name: string; brand: string; genericName: string; form: string; strength: string; packSize: string;
  schedule: Schedule; requiresPrescription: boolean; isChronicMedication: boolean;
  category: Category; companyName: string; companyCode: string; hsnCode: string; barcode: string;
  gstRate: string; canonicalName: string;
};
const EMPTY: ProductForm = {
  name: "", brand: "", genericName: "", form: "", strength: "", packSize: "",
  schedule: "OTC", requiresPrescription: false, isChronicMedication: false,
  category: "medicine", companyName: "", companyCode: "", hsnCode: "", barcode: "",
  gstRate: "12.00", canonicalName: "",
};

export default function AdminProducts() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.products.list.useQuery({
    search: debouncedSearch || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    activeOnly: true,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const rows = (data as any)?.rows ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const createMut = trpc.masterData.products.create.useMutation({ onSuccess: () => { toast.success("Product created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.products.update.useMutation({ onSuccess: () => { toast.success("Product updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.products.deactivate.useMutation({ onSuccess: () => { toast.success("Product deactivated (audit logged)"); setDeactivateId(null); setDeactivateReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const exportMut = trpc.masterData.products.exportCsv.useMutation({
    onSuccess: (csv: string) => { const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `products-${categoryFilter}.csv`; a.click(); URL.revokeObjectURL(u); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSearch = (v: string) => { setSearch(v); clearTimeout((window as any).__searchTimer); (window as any).__searchTimer = setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 350); };
  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({ name: d.name ?? "", brand: d.brand ?? "", genericName: d.genericName ?? "", form: d.form ?? "", strength: d.strength ?? "", packSize: d.packSize ?? "", schedule: d.schedule ?? "OTC", requiresPrescription: d.requiresPrescription ?? false, isChronicMedication: d.isChronicMedication ?? false, category: d.category ?? "medicine", companyName: d.companyName ?? "", companyCode: d.companyCode ?? "", hsnCode: d.hsnCode ?? "", barcode: d.barcode ?? "", gstRate: d.gstRate ? String(d.gstRate) : "12.00", canonicalName: d.canonicalName ?? "" });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form, gstRate: form.gstRate || undefined });
    else createMut.mutate({ ...form, gstRate: form.gstRate || undefined });
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Product / Item Master</h1>
            <p className="text-sm text-white/50">{total.toLocaleString()} products in catalog</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({ category: categoryFilter !== "all" ? categoryFilter : undefined })} className="text-white/70 border-white/20 bg-transparent hover:bg-white/10"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Product</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input placeholder="Search name, brand, generic, company..." value={search} onChange={(e) => handleSearch(e.target.value)} className="pl-9 w-80 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              <SelectItem value="all" className="text-white">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-white/40 text-sm ml-auto">{total.toLocaleString()} results</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-white/40 text-sm py-8 text-center">Loading catalog...</div>
        ) : rows.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
            No products found. {search ? "Try a different search." : "Add the first product."}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Product Name", "Brand", "Generic", "Form / Strength", "Pack", "Schedule", "Category", "Company", "GST%", "Actions"].map(h => (
                    <th key={h} className="px-3 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5 text-white font-medium max-w-[200px]">
                      <div className="truncate" title={d.name}>{d.name}</div>
                      {d.requiresPrescription && <span className="text-xs text-amber-400/80">Rx required</span>}
                    </td>
                    <td className="px-3 py-2.5 text-white/60 max-w-[120px]"><div className="truncate">{d.brand || "—"}</div></td>
                    <td className="px-3 py-2.5 text-white/60 max-w-[140px]"><div className="truncate text-xs">{d.genericName || "—"}</div></td>
                    <td className="px-3 py-2.5 text-white/60 text-xs whitespace-nowrap">{[d.form, d.strength].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2.5 text-white/60 text-xs whitespace-nowrap">{d.packSize || "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={`text-xs ${SCHEDULE_COLORS[d.schedule as Schedule] ?? "bg-white/10 text-white/60"}`}>{d.schedule}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-white/60 text-xs capitalize">{d.category}</td>
                    <td className="px-3 py-2.5 text-white/60 max-w-[120px]"><div className="truncate text-xs">{d.companyName || "—"}</div></td>
                    <td className="px-3 py-2.5 text-white/60 text-xs">{d.gstRate ? `${d.gstRate}%` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400/60 hover:text-red-400" onClick={() => { setDeactivateId(d.id); setDeactivateReason(""); }}><PowerOff className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-white/40 text-sm">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="border-white/20 bg-transparent text-white/70 hover:bg-white/10 disabled:opacity-30">Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="border-white/20 bg-transparent text-white/70 hover:bg-white/10 disabled:opacity-30">Next</Button>
            </div>
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="bg-white/5 border border-white/10 mb-4">
                <TabsTrigger value="basic" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">Basic Info</TabsTrigger>
                <TabsTrigger value="compliance" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">Compliance</TabsTrigger>
                <TabsTrigger value="catalog" className="data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white">Catalog</TabsTrigger>
              </TabsList>

              <TabsContent value="basic">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className="text-white/70 text-xs mb-1 block">Product Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Crocin 500mg Tablet" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Brand</Label>
                    <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Crocin" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Generic Name / Salt</Label>
                    <Input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} placeholder="e.g. Paracetamol" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Dosage Form</Label>
                    <Input value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })} placeholder="Tablet / Syrup / Capsule" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Strength</Label>
                    <Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="500mg / 10ml" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Pack Size</Label>
                    <Input value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} placeholder="15 TAB / 100ml" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Company / Manufacturer</Label>
                    <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="GSK Consumer Healthcare" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="compliance">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Schedule</Label>
                    <Select value={form.schedule} onValueChange={(v) => setForm({ ...form, schedule: v as Schedule })}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10">
                        {SCHEDULES.map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10">
                        {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-white capitalize">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-3">
                    <div className="flex items-center gap-3">
                      <Switch checked={form.requiresPrescription} onCheckedChange={(v) => setForm({ ...form, requiresPrescription: v })} />
                      <Label className="text-white/70 text-sm">Prescription Required</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={form.isChronicMedication} onCheckedChange={(v) => setForm({ ...form, isChronicMedication: v })} />
                      <Label className="text-white/70 text-sm">Chronic Medication (Refill eligible)</Label>
                    </div>
                  </div>
                  {form.schedule === "H1" && (
                    <div className="col-span-2 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-red-300 text-xs">Schedule H1 requires H1 register entry and pharmacist review at dispensing.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="catalog">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">HSN Code</Label>
                    <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="30049099" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">GST Rate (%)</Label>
                    <Input value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} placeholder="12.00" type="number" step="0.01" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Primary Barcode</Label>
                    <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="8901234567890" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-xs mb-1 block">Company Code</Label>
                    <Input value={form.companyCode} onChange={(e) => setForm({ ...form, companyCode: e.target.value })} placeholder="GSK001" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-white/70 text-xs mb-1 block">Canonical Name (for deduplication)</Label>
                    <Input value={form.canonicalName} onChange={(e) => setForm({ ...form, canonicalName: e.target.value })} placeholder="paracetamol 500mg tablet gsk" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-white/60">Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMut.isPending || updateMut.isPending ? "Saving..." : editId ? "Update Product" : "Create Product"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivate Dialog */}
        <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Product</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This action will be audit-logged. The product will no longer appear in search or billing.</p>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} placeholder="e.g. Discontinued by manufacturer" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeactivateId(null)} className="text-white/60">Cancel</Button>
              <Button variant="destructive" onClick={() => deactivateMut.mutate({ id: deactivateId!, reason: deactivateReason || undefined })} disabled={deactivateMut.isPending}>
                {deactivateMut.isPending ? "Processing..." : "Deactivate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
