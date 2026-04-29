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
import { ChevronLeft, Plus, Pencil, PowerOff, Power, Download } from "lucide-react";

const ROLES = ["pharmacist", "salesman", "cashier", "store_manager", "purchase_manager", "delivery_rider", "admin", "other"] as const;
type StaffRole = typeof ROLES[number];

type StaffForm = { name: string; role: StaffRole; salesmanCode: string; pharmacistRegistrationNo: string; storeId: string; phone: string; email: string; loginEnabled: boolean; };
const EMPTY: StaffForm = { name: "", role: "salesman", salesmanCode: "", pharmacistRegistrationNo: "", storeId: "", phone: "", email: "", loginEnabled: false };

const ROLE_LABELS: Record<StaffRole, string> = {
  pharmacist: "Pharmacist", salesman: "Salesman", cashier: "Cashier", store_manager: "Store Manager",
  purchase_manager: "Purchase Manager", delivery_rider: "Delivery Rider", admin: "Admin", other: "Other",
};

export default function AdminStaff() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.staff.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    role: roleFilter !== "all" ? roleFilter : undefined,
    limit: 200,
  });
  const rows = (data as any)?.rows ?? [];
  const total = (data as any)?.total ?? 0;

  const createMut = trpc.masterData.staff.create.useMutation({ onSuccess: () => { toast.success("Staff member created"); setShowDialog(false); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.masterData.staff.update.useMutation({ onSuccess: () => { toast.success("Staff updated"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.staff.deactivate.useMutation({ onSuccess: () => { toast.success("Staff deactivated"); setDeactivateId(null); setReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reactivateMut = trpc.masterData.staff.reactivate.useMutation({ onSuccess: () => { toast.success("Staff reactivated"); refetch(); }, onError: (e) => toast.error(e.message) });
  const exportMut = trpc.masterData.staff.exportCsv.useMutation({
    onSuccess: (csv: string) => { const b = new Blob([csv], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "staff.csv"; a.click(); URL.revokeObjectURL(u); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({ name: d.name ?? "", role: d.role ?? "salesman", salesmanCode: d.salesmanCode ?? "", pharmacistRegistrationNo: d.pharmacistRegistrationNo ?? "", storeId: d.storeId ? String(d.storeId) : "", phone: d.phone ?? "", email: d.email ?? "", loginEnabled: d.loginEnabled ?? false });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = { ...form, storeId: form.storeId ? parseInt(form.storeId) : undefined };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Staff Master</h1>
            <p className="text-sm text-white/50">{total} staff members across all stores</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({})} className="text-white/70 border-white/20 bg-transparent hover:bg-white/10"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Staff</Button>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              <SelectItem value="all" className="text-white">All Roles</SelectItem>
              {ROLES.map(r => <SelectItem key={r} value={r} className="text-white">{ROLE_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)} className={`border-white/20 bg-transparent text-white/70 hover:bg-white/10 ${showInactive ? "border-blue-500 text-blue-400" : ""}`}>
            {showInactive ? "Showing All" : "Active Only"}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-white/40 text-sm py-8 text-center">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">No staff members found.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Name", "Role", "Salesman Code", "Pharmacist Reg.", "Phone", "Login", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                    <td className="px-4 py-3"><Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">{ROLE_LABELS[d.role as StaffRole] ?? d.role}</Badge></td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{d.salesmanCode || "—"}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{d.pharmacistRegistrationNo || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={d.loginEnabled ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/10 text-white/40"}>
                        {d.loginEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2">
                <Label className="text-white/70 text-xs mb-1 block">Full Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ravi Kumar" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Role *</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    {ROLES.map(r => <SelectItem key={r} value={r} className="text-white">{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Salesman Code</Label>
                <Input value={form.salesmanCode} onChange={(e) => setForm({ ...form, salesmanCode: e.target.value })} placeholder="SM001" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Pharmacist Reg. No.</Label>
                <Input value={form.pharmacistRegistrationNo} onChange={(e) => setForm({ ...form, pharmacistRegistrationNo: e.target.value })} placeholder="MH-PH-12345" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@247pharmacy.in" type="email" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Store ID</Label>
                <Input value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} placeholder="1" type="number" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={form.loginEnabled} onCheckedChange={(v) => setForm({ ...form, loginEnabled: v })} />
                <Label className="text-white/70 text-sm">Login Enabled</Label>
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
            <DialogHeader><DialogTitle>Deactivate Staff Member</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This staff member will be marked inactive.</p>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resigned" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
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
