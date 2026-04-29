import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, Download, Search, Edit2, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type SupplierForm = {
  supplierName: string; gstin: string; address: string; state: string;
  contactPerson: string; phone: string; email: string;
  paymentTerms: string; defaultDiscount: string; cashDiscount: string; creditDays: string;
};

const EMPTY_FORM: SupplierForm = {
  supplierName: "", gstin: "", address: "", state: "",
  contactPerson: "", phone: "", email: "",
  paymentTerms: "30", defaultDiscount: "0", cashDiscount: "0", creditDays: "30",
};

export default function AdminSuppliers() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [showDeactivate, setShowDeactivate] = useState<number | null>(null);

  const { data, refetch, isLoading } = trpc.masterData.suppliers.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    limit: 200,
  });
  const rows = (data as any)?.rows ?? [];

  const createMutation = trpc.masterData.suppliers.create.useMutation({
    onSuccess: () => { toast.success("Supplier created"); setShowDialog(false); setForm(EMPTY_FORM); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.masterData.suppliers.update.useMutation({
    onSuccess: () => { toast.success("Supplier updated"); setShowDialog(false); setEditId(null); setForm(EMPTY_FORM); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deactivateMutation = trpc.masterData.suppliers.deactivate.useMutation({
    onSuccess: () => { toast.success("Supplier deactivated"); setShowDeactivate(null); setDeactivateReason(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMutation = trpc.masterData.suppliers.reactivate.useMutation({
    onSuccess: () => { toast.success("Supplier reactivated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const exportMutation = trpc.masterData.suppliers.exportCsv.useMutation({
    onSuccess: (csv: string) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "suppliers.csv"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setShowDialog(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      supplierName: s.supplierName ?? "", gstin: s.gstin ?? "", address: s.address ?? "", state: s.state ?? "",
      contactPerson: s.contactPerson ?? "", phone: s.phone ?? "", email: s.email ?? "",
      paymentTerms: s.paymentTerms ?? "30", defaultDiscount: String(s.defaultDiscount ?? "0"),
      cashDiscount: String(s.cashDiscount ?? "0"), creditDays: String(s.creditDays ?? "30"),
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!form.supplierName.trim()) { toast.error("Supplier name is required"); return; }
    const payload = {
      ...form,
      defaultDiscount: form.defaultDiscount || undefined,
      cashDiscount: form.cashDiscount || undefined,
      creditDays: form.creditDays ? parseInt(form.creditDays) : 30,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const FIELDS: { key: keyof SupplierForm; label: string; placeholder?: string; type?: string }[] = [
    { key: "supplierName", label: "Supplier Name *", placeholder: "e.g. Medivision Pharma Pvt Ltd" },
    { key: "gstin", label: "GSTIN", placeholder: "27AAAAA0000A1Z5" },
    { key: "contactPerson", label: "Contact Person", placeholder: "Full name" },
    { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
    { key: "email", label: "Email", placeholder: "contact@supplier.com", type: "email" },
    { key: "address", label: "Address", placeholder: "Street, City" },
    { key: "state", label: "State", placeholder: "Maharashtra" },
    { key: "paymentTerms", label: "Payment Terms (days)", placeholder: "30", type: "number" },
    { key: "defaultDiscount", label: "Default Discount (%)", placeholder: "0", type: "number" },
    { key: "cashDiscount", label: "Cash Discount (%)", placeholder: "0", type: "number" },
    { key: "creditDays", label: "Credit Days", placeholder: "30", type: "number" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Supplier Master</h1>
            <p className="text-white/50 text-sm">{rows.length} suppliers</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate({})} disabled={exportMutation.isPending} className="text-white/60 hover:text-white gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Supplier
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="bg-white/5 border-white/10 text-white pl-9"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInactive(v => !v)}
            className={`text-sm ${showInactive ? "text-white bg-white/10" : "text-white/50"}`}
          >
            {showInactive ? "Showing all" : "Active only"}
          </Button>
        </div>

        {/* Table */}
        <Card className="bg-white/5 border-white/10">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Supplier Name</TableHead>
                <TableHead className="text-white/50">GSTIN</TableHead>
                <TableHead className="text-white/50">Contact</TableHead>
                <TableHead className="text-white/50">State</TableHead>
                <TableHead className="text-white/50">Credit Days</TableHead>
                <TableHead className="text-white/50">Discount</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-white/40 py-10">Loading...</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-white/40 py-10">No suppliers found</TableCell></TableRow>
              )}
              {rows.map((s: any) => (
                <TableRow key={s.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{s.supplierName}</TableCell>
                  <TableCell className="text-white/60 font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                  <TableCell className="text-white/60 text-sm">
                    {s.contactPerson && <div>{s.contactPerson}</div>}
                    {s.phone && <div className="text-white/40 text-xs">{s.phone}</div>}
                  </TableCell>
                  <TableCell className="text-white/60 text-sm">{s.state ?? "—"}</TableCell>
                  <TableCell className="text-white/60 text-sm">{s.creditDays ?? 30}d</TableCell>
                  <TableCell className="text-white/60 text-sm">{s.defaultDiscount ?? 0}%</TableCell>
                  <TableCell>
                    <Badge className={s.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} className="w-7 h-7 text-white/50 hover:text-white">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      {s.isActive ? (
                        <Button variant="ghost" size="icon" onClick={() => setShowDeactivate(s.id)} className="w-7 h-7 text-white/50 hover:text-red-400">
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => reactivateMutation.mutate({ id: s.id })} className="w-7 h-7 text-white/50 hover:text-emerald-400">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={open => { if (!open) { setShowDialog(false); setEditId(null); setForm(EMPTY_FORM); } }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-2">
              {FIELDS.map(f => (
                <div key={f.key} className={f.key === "address" ? "col-span-2" : ""}>
                  <Label className="text-white/70 text-xs">{f.label}</Label>
                  <Input
                    type={f.type ?? "text"}
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="bg-white/10 border-white/20 text-white mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update Supplier" : "Create Supplier"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowDialog(false); setEditId(null); setForm(EMPTY_FORM); }} className="text-white/60">
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deactivate Confirm Dialog */}
        <Dialog open={showDeactivate !== null} onOpenChange={open => { if (!open) { setShowDeactivate(null); setDeactivateReason(""); } }}>
          <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Supplier</DialogTitle></DialogHeader>
            <p className="text-white/60 text-sm">This supplier will be archived and hidden from new purchase orders.</p>
            <div className="mt-3">
              <Label className="text-white/70 text-xs">Reason (optional)</Label>
              <Input
                value={deactivateReason}
                onChange={e => setDeactivateReason(e.target.value)}
                placeholder="e.g. Supplier no longer operational"
                className="bg-white/10 border-white/20 text-white mt-1"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => deactivateMutation.mutate({ id: showDeactivate!, reason: deactivateReason || undefined })}
                disabled={deactivateMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
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
