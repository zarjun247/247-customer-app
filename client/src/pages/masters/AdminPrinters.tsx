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
import { toast } from "sonner";
import { ChevronLeft, Plus, Pencil, PowerOff, Power, Printer } from "lucide-react";

const PRINTER_TYPES = ["bill", "barcode", "a4", "thermal"] as const;
type PrinterType = typeof PRINTER_TYPES[number];
const TYPE_LABELS: Record<PrinterType, string> = { bill: "Bill Printer", barcode: "Barcode Printer", a4: "A4 Printer", thermal: "Thermal Printer" };
const TYPE_COLORS: Record<PrinterType, string> = { bill: "bg-blue-500/20 text-blue-300 border-blue-500/30", barcode: "bg-purple-500/20 text-purple-300 border-purple-500/30", a4: "bg-amber-500/20 text-amber-300 border-amber-500/30", thermal: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };

type PrinterForm = { printerName: string; printerType: PrinterType; assignedTerminal: string; assignedStoreId: string; };
const EMPTY: PrinterForm = { printerName: "", printerType: "thermal", assignedTerminal: "", assignedStoreId: "" };

export default function AdminPrinters() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PrinterForm>(EMPTY);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch, isLoading } = trpc.masterData.printerMaster.list.useQuery({ search: search || undefined, activeOnly: !showInactive });
  const rows = (data as any)?.rows ?? [];

  const upsertMut = trpc.masterData.printerMaster.upsert.useMutation({ onSuccess: () => { toast.success(editId ? "Printer updated" : "Printer created"); setShowDialog(false); setEditId(null); setForm(EMPTY); refetch(); }, onError: (e) => toast.error(e.message) });
  const deactivateMut = trpc.masterData.printerMaster.deactivate.useMutation({ onSuccess: () => { toast.success("Printer deactivated"); setDeactivateId(null); setReason(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reactivateMut = trpc.masterData.printerMaster.reactivate.useMutation({ onSuccess: () => { toast.success("Printer reactivated"); refetch(); }, onError: (e) => toast.error(e.message) });

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowDialog(true); };
  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({ printerName: d.printerName ?? "", printerType: d.printerType ?? "thermal", assignedTerminal: d.assignedTerminal ?? "", assignedStoreId: d.assignedStoreId ? String(d.assignedStoreId) : "" });
    setShowDialog(true);
  };
  const handleSubmit = () => {
    if (!form.printerName.trim()) { toast.error("Printer name is required"); return; }
    const payload = { ...(editId ? { id: editId } : {}), printerName: form.printerName, printerType: form.printerType, assignedTerminal: form.assignedTerminal || undefined, assignedStoreId: form.assignedStoreId ? parseInt(form.assignedStoreId) : undefined };
    upsertMut.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/masters")} className="text-white/60 hover:text-white"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">Printer Master</h1>
            <p className="text-sm text-white/50">Bill, barcode, A4, and thermal printers assigned to terminals</p>
          </div>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Printer</Button>
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
          <div className="text-white/40 text-sm py-16 text-center">No printers configured.</div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  {["Printer Name", "Type", "Terminal", "Store ID", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        <Printer className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                        {d.printerName}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${TYPE_COLORS[d.printerType as PrinterType] ?? "bg-white/10 text-white/60"}`}>
                        {TYPE_LABELS[d.printerType as PrinterType] ?? d.printerType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{d.assignedTerminal || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{d.assignedStoreId ? `Store #${d.assignedStoreId}` : "—"}</td>
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
            <DialogHeader><DialogTitle>{editId ? "Edit Printer" : "Add Printer"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Printer Name *</Label>
                <Input value={form.printerName} onChange={(e) => setForm({ ...form, printerName: e.target.value })} placeholder="e.g. Counter-1 Bill Printer" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Printer Type</Label>
                <Select value={form.printerType} onValueChange={(v) => setForm({ ...form, printerType: v as PrinterType })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    {PRINTER_TYPES.map(t => <SelectItem key={t} value={t} className="text-white">{TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Assigned Terminal</Label>
                <Input value={form.assignedTerminal} onChange={(e) => setForm({ ...form, assignedTerminal: e.target.value })} placeholder="e.g. POS-01" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label className="text-white/70 text-xs mb-1 block">Assigned Store ID</Label>
                <Input value={form.assignedStoreId} onChange={(e) => setForm({ ...form, assignedStoreId: e.target.value })} placeholder="1" type="number" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-white/60">Cancel</Button>
              <Button onClick={handleSubmit} disabled={upsertMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {upsertMut.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle>Deactivate Printer</DialogTitle></DialogHeader>
            <div>
              <Label className="text-white/70 text-xs mb-1 block">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hardware failure" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
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
