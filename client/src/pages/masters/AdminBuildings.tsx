import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, Download, Building2 } from "lucide-react";

type BuildingForm = { name: string; address: string; addressLine1: string; landmark: string; pincode: string; city: string; lat: string; lng: string; primaryStoreId: string; fallbackStoreId: string; };
const EMPTY: BuildingForm = { name: "", address: "", addressLine1: "", landmark: "", pincode: "", city: "", lat: "", lng: "", primaryStoreId: "", fallbackStoreId: "" };

export default function AdminBuildings() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<BuildingForm>(EMPTY);

  const { data, refetch, isLoading } = trpc.masterData.buildings.list.useQuery({ search: search || undefined, limit: 200 });
  const rows = (data as any)?.rows ?? [];
  const total = (data as any)?.total ?? 0;

  const createMut = trpc.masterData.buildings.create.useMutation({ onSuccess: () => { toast.success("Building created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.buildings.update.useMutation({ onSuccess: () => { toast.success("Building updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const exportMut = trpc.masterData.buildings.exportCsv.useMutation({
    onSuccess: (csv: string) => { const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "buildings.csv"; a.click(); URL.revokeObjectURL(u); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({ name: d.name ?? "", address: d.address ?? "", addressLine1: d.addressLine1 ?? "", landmark: d.landmark ?? "", pincode: d.pincode ?? "", city: d.city ?? "", lat: d.lat ? String(d.lat) : "", lng: d.lng ? String(d.lng) : "", primaryStoreId: d.primaryStoreId ? String(d.primaryStoreId) : "", fallbackStoreId: d.fallbackStoreId ? String(d.fallbackStoreId) : "" });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Building name is required"); return; }
    const payload = { ...form, lat: form.lat || undefined, lng: form.lng || undefined, primaryStoreId: form.primaryStoreId ? parseInt(form.primaryStoreId) : undefined, fallbackStoreId: form.fallbackStoreId ? parseInt(form.fallbackStoreId) : undefined };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  const FIELDS: { key: keyof BuildingForm; label: string; placeholder?: string; span?: boolean }[] = [
    { key: "name", label: "Building / Society Name *", placeholder: "e.g. Hiranandani Gardens", span: true },
    { key: "addressLine1", label: "Address Line 1", placeholder: "Street / Road" },
    { key: "landmark", label: "Landmark", placeholder: "Near XYZ" },
    { key: "pincode", label: "Pincode", placeholder: "400076" },
    { key: "city", label: "City", placeholder: "Mumbai" },
    { key: "lat", label: "Latitude", placeholder: "19.1234" },
    { key: "lng", label: "Longitude", placeholder: "72.9123" },
    { key: "primaryStoreId", label: "Primary Store ID", placeholder: "1" },
    { key: "fallbackStoreId", label: "Fallback Store ID", placeholder: "2" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Building / Society Master</h1>
            <p className="text-sm text-white/50">{total} buildings mapped to delivery zones</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({})} className="text-white/70 border-white/20 bg-transparent hover:bg-white/10"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Building</Button>
        </div>

        <div className="flex gap-3 mb-4">
          <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        </div>

        {isLoading ? (
          <div className="text-white/40 text-sm py-8 text-center">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">No buildings found. Add the first one.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Building Name", "City", "Pincode", "Primary Store", "Fallback Store", "Coordinates", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        {d.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/60">{d.city || "—"}</td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{d.pincode || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.primaryStoreId ? `Store #${d.primaryStoreId}` : "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.fallbackStoreId ? `Store #${d.fallbackStoreId}` : "—"}</td>
                    <td className="px-4 py-3 text-white/40 font-mono text-xs">{d.lat && d.lng ? `${d.lat}, ${d.lng}` : "—"}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-2xl">
            <DialogHeader><DialogTitle>{editId ? "Edit Building" : "Add Building"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              {FIELDS.map(f => (
                <div key={f.key} className={f.span ? "col-span-2" : ""}>
                  <Label className="text-white/70 text-xs mb-1 block">{f.label}</Label>
                  <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              ))}
              <div className="col-span-2">
                <Label className="text-white/70 text-xs mb-1 block">Full Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address for display" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
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
      </div>
    </AdminLayout>
  );
}
