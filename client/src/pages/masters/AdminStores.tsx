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
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, PowerOff, Power, Download, MapPin } from "lucide-react";

type StoreForm = {
  name: string; type: "in_building" | "cluster_hub"; address: string; pincode: string; phone: string;
  slaMins: string; lat: string; lng: string; serviceRadius: string; openingHours: string; priority: string; isPrimary: boolean;
};
const EMPTY: StoreForm = { name: "", type: "in_building", address: "", pincode: "", phone: "", slaMins: "20", lat: "", lng: "", serviceRadius: "3000", openingHours: "", priority: "10", isPrimary: false };

export default function AdminStores() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<StoreForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.stores.list.useQuery({ search: search || undefined, activeOnly: !showInactive, limit: 100 });
  const rows = (data as any)?.rows ?? [];

  const createMut = trpc.masterData.stores.create.useMutation({ onSuccess: () => { toast.success("Store created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.stores.update.useMutation({ onSuccess: () => { toast.success("Store updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.stores.deactivate.useMutation({ onSuccess: () => { toast.success("Store deactivated"); setDeactivateId(null); setReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reactivateMut = trpc.masterData.stores.reactivate.useMutation({ onSuccess: () => { toast.success("Store reactivated"); refetch(); }, onError: (e) => toast.error(e.message) });
  const exportMut = trpc.masterData.stores.exportCsv.useMutation({
    onSuccess: (csv: string) => { const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "stores.csv"; a.click(); URL.revokeObjectURL(u); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({ name: d.name ?? "", type: d.type ?? "in_building", address: d.address ?? "", pincode: d.pincode ?? "", phone: d.phone ?? "", slaMins: String(d.slaMins ?? 20), lat: d.lat ? String(d.lat) : "", lng: d.lng ? String(d.lng) : "", serviceRadius: String(d.serviceRadius ?? 3000), openingHours: d.openingHours ?? "", priority: String(d.priority ?? 10), isPrimary: d.isPrimary ?? false });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Store name is required"); return; }
    const payload = { ...form, slaMins: parseInt(form.slaMins) || 20, serviceRadius: parseInt(form.serviceRadius) || 3000, priority: parseInt(form.priority) || 10, lat: form.lat || undefined, lng: form.lng || undefined };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Store / Location Master</h1>
            <p className="text-sm text-white/50">Pharmacy nodes, service radius, and SLA configuration</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({})} className="text-white/70 border-white/20 bg-transparent hover:bg-white/10"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Store</Button>
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
          <div className="text-white/40 text-sm py-16 text-center">No stores found.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Store Name", "Type", "Pincode", "SLA (min)", "Radius (m)", "Priority", "Primary", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        {d.name}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">{d.type === "in_building" ? "In-Building" : "Cluster Hub"}</Badge></td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{d.pincode || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.slaMins}</td>
                    <td className="px-4 py-3 text-white/60">{d.serviceRadius}</td>
                    <td className="px-4 py-3 text-white/60">{d.priority}</td>
                    <td className="px-4 py-3">{d.isPrimary ? <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Primary</Badge> : <span className="text-white/30">—</span>}</td>
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
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-2xl">
            <DialogHeader><DialogTitle>{editId ? "Edit Store" : "Add Store"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2">
                <Label className="text-white/70 text-xs mb-1 block">Store Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Powai Plaza Pharmacy" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    <SelectItem value="in_building" className="text-white">In-Building</SelectItem>
                    <SelectItem value="cluster_hub" className="text-white">Cluster Hub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 22 1234 5678" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="col-span-2">
                <Label className="text-white/70 text-xs mb-1 block">Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Building, Street, City" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Pincode</Label>
                <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="400076" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">SLA (minutes)</Label>
                <Input value={form.slaMins} onChange={(e) => setForm({ ...form, slaMins: e.target.value })} type="number" placeholder="20" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Service Radius (metres)</Label>
                <Input value={form.serviceRadius} onChange={(e) => setForm({ ...form, serviceRadius: e.target.value })} type="number" placeholder="3000" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Priority</Label>
                <Input value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} type="number" placeholder="10" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Latitude</Label>
                <Input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="19.1234" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Longitude</Label>
                <Input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="72.9123" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="col-span-2">
                <Label className="text-white/70 text-xs mb-1 block">Opening Hours</Label>
                <Input value={form.openingHours} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} placeholder='{"mon-fri":"8:00-22:00","sat-sun":"9:00-21:00"}' className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: v })} />
                <Label className="text-white/70 text-sm">Primary Store</Label>
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

        {/* Deactivate Dialog */}
        <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Store</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This store will stop receiving new orders.</p>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Temporary closure" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
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
