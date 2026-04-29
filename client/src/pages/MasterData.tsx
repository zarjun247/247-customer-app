import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, Plus, Building2, Pill, Stethoscope, Truck, Tag, MessageSquare, Calendar, Printer } from "lucide-react";
import { toast } from "sonner";

type Section = "suppliers" | "manufacturers" | "generics" | "doctors" | "schedules" | "discounts" | "templates" | "printers";

const SECTIONS: { id: Section; label: string; icon: typeof Building2 }[] = [
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "manufacturers", label: "Manufacturers", icon: Building2 },
  { id: "generics", label: "Generics", icon: Pill },
  { id: "doctors", label: "Doctors", icon: Stethoscope },
  { id: "schedules", label: "Schedules", icon: Tag },
  { id: "discounts", label: "Discount Categories", icon: Tag },
  { id: "templates", label: "Message Templates", icon: MessageSquare },
  { id: "printers", label: "Printers", icon: Printer },
];

export default function MasterData() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("suppliers");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Supplier form
  const [supplierForm, setSupplierForm] = useState({ supplierName: "", gstin: "", contactPerson: "", phone: "", email: "" });
  // Manufacturer form
  const [mfgForm, setMfgForm] = useState({ companyName: "", aliases: "" });
  // Generic form
  const [genericForm, setGenericForm] = useState({ genericName: "", therapeuticClass: "" });
  // Doctor form
  const [doctorForm, setDoctorForm] = useState({ doctorName: "", registrationNo: "", clinicHospital: "", phone: "", specialization: "" });

  const suppliers = trpc.masterData.suppliers.list.useQuery({ search: search || undefined, limit: 100 });
  const manufacturers = trpc.masterData.manufacturers.list.useQuery({ search: search || undefined, limit: 100 });
  const generics = trpc.masterData.generics.list.useQuery({ search: search || undefined, limit: 100 });
  const doctors = trpc.masterData.doctors.list.useQuery({ search: search || undefined, limit: 100 });
  const schedules = trpc.masterData.schedules.list.useQuery();
  const discounts = trpc.masterData.discountCategories.list.useQuery();
  const templates = trpc.masterData.messageTemplates.list.useQuery({});
  const printers = trpc.masterData.printers.list.useQuery();

  const createSupplier = trpc.masterData.suppliers.create.useMutation({ onSuccess: () => { toast.success("Supplier created"); setShowCreate(false); suppliers.refetch(); }, onError: e => toast.error(e.message) });
  const createMfg = trpc.masterData.manufacturers.create.useMutation({ onSuccess: () => { toast.success("Manufacturer created"); setShowCreate(false); manufacturers.refetch(); }, onError: e => toast.error(e.message) });
  const createGeneric = trpc.masterData.generics.create.useMutation({ onSuccess: () => { toast.success("Generic created"); setShowCreate(false); generics.refetch(); }, onError: e => toast.error(e.message) });
  const createDoctor = trpc.masterData.doctors.create.useMutation({ onSuccess: () => { toast.success("Doctor created"); setShowCreate(false); doctors.refetch(); }, onError: e => toast.error(e.message) });

  const renderList = () => {
    switch (section) {
      case "suppliers": return (
        <div className="space-y-2">
          {suppliers.data?.map(s => (
            <Card key={s.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{s.supplierName}</p>
                  <p className="text-xs text-white/50">{s.gstin ?? "No GSTIN"} · {s.phone ?? "No phone"}</p>
                </div>
                <Badge className={s.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>{s.isActive ? "Active" : "Inactive"}</Badge>
              </CardContent>
            </Card>
          ))}
          {!suppliers.data?.length && <p className="text-center py-10 text-white/40">No suppliers yet</p>}
        </div>
      );
      case "manufacturers": return (
        <div className="space-y-2">
          {manufacturers.data?.map(m => (
            <Card key={m.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{m.companyName}</p>
                  {m.aliases && <p className="text-xs text-white/50">Aliases: {m.aliases}</p>}
                </div>
                <Badge className={m.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>{m.isActive ? "Active" : "Inactive"}</Badge>
              </CardContent>
            </Card>
          ))}
          {!manufacturers.data?.length && <p className="text-center py-10 text-white/40">No manufacturers yet</p>}
        </div>
      );
      case "generics": return (
        <div className="space-y-2">
          {generics.data?.map(g => (
            <Card key={g.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3">
                <p className="font-medium text-sm">{g.genericName}</p>
                {g.therapeuticClass && <p className="text-xs text-white/50">{g.therapeuticClass}</p>}
              </CardContent>
            </Card>
          ))}
          {!generics.data?.length && <p className="text-center py-10 text-white/40">No generics yet</p>}
        </div>
      );
      case "doctors": return (
        <div className="space-y-2">
          {doctors.data?.map(d => (
            <Card key={d.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{d.doctorName}</p>
                  <p className="text-xs text-white/50">{d.specialization ?? "General"} · {d.clinicHospital ?? "—"}</p>
                </div>
                {d.registrationNo && <span className="text-xs text-white/40 font-mono">{d.registrationNo}</span>}
              </CardContent>
            </Card>
          ))}
          {!doctors.data?.length && <p className="text-center py-10 text-white/40">No doctors yet</p>}
        </div>
      );
      case "schedules": return (
        <div className="space-y-2">
          {schedules.data?.map(s => (
            <Card key={s.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <p className="font-semibold">{s.scheduleCode}</p>
                <div className="flex gap-2">
                  {s.prescriptionRequired && <Badge className="bg-red-500/20 text-red-400 border-0 text-xs">Rx Required</Badge>}
                  {s.h1RegisterRequired && <Badge className="bg-purple-500/20 text-purple-400 border-0 text-xs">H1 Register</Badge>}
                  {s.pharmacistReviewRequired && <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">Pharmacist Review</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
          {!schedules.data?.length && <p className="text-center py-10 text-white/40">No schedules configured</p>}
        </div>
      );
      case "discounts": return (
        <div className="space-y-2">
          {discounts.data?.map(d => (
            <Card key={d.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <p className="font-medium text-sm">{d.categoryName}</p>
                <div className="text-right">
                  <p className="text-xs text-white/50">Max discount: {d.maxDiscount}%</p>
                  <p className="text-xs text-white/50">Min margin: {d.minMargin}%</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!discounts.data?.length && <p className="text-center py-10 text-white/40">No discount categories yet</p>}
        </div>
      );
      case "templates": return (
        <div className="space-y-2">
          {templates.data?.map(t => (
            <Card key={t.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{t.templateName}</p>
                  <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs capitalize">{t.channel}</Badge>
                </div>
                <p className="text-xs text-white/50 line-clamp-2">{t.messageBody}</p>
              </CardContent>
            </Card>
          ))}
          {!templates.data?.length && <p className="text-center py-10 text-white/40">No templates yet</p>}
        </div>
      );
      case "printers": return (
        <div className="space-y-2">
          {printers.data?.map(p => (
            <Card key={p.id} className="bg-white/5 border-white/10">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{p.printerName}</p>
                  <p className="text-xs text-white/50 capitalize">{p.printerType} printer · {p.assignedTerminal ?? "All terminals"}</p>
                </div>
                <Badge className={p.isActive ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-white/10 text-white/40 border-0"}>{p.isActive ? "Active" : "Inactive"}</Badge>
              </CardContent>
            </Card>
          ))}
          {!printers.data?.length && <p className="text-center py-10 text-white/40">No printers configured</p>}
        </div>
      );
    }
  };

  const renderCreateForm = () => {
    switch (section) {
      case "suppliers": return (
        <div className="space-y-3">
          {[
            { key: "supplierName", label: "Supplier Name *", placeholder: "e.g. Medivision Pharma" },
            { key: "gstin", label: "GSTIN", placeholder: "27AAAAA0000A1Z5" },
            { key: "contactPerson", label: "Contact Person", placeholder: "Name" },
            { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
            { key: "email", label: "Email", placeholder: "contact@supplier.com" },
          ].map(f => (
            <div key={f.key}>
              <Label className="text-white/70 text-xs">{f.label}</Label>
              <Input value={(supplierForm as Record<string, string>)[f.key]} onChange={e => setSupplierForm(s => ({ ...s, [f.key]: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder={f.placeholder} />
            </div>
          ))}
          <Button onClick={() => createSupplier.mutate(supplierForm)} disabled={createSupplier.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {createSupplier.isPending ? "Creating..." : "Create Supplier"}
          </Button>
        </div>
      );
      case "manufacturers": return (
        <div className="space-y-3">
          <div><Label className="text-white/70 text-xs">Company Name *</Label><Input value={mfgForm.companyName} onChange={e => setMfgForm(f => ({ ...f, companyName: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" /></div>
          <div><Label className="text-white/70 text-xs">Aliases (comma-separated)</Label><Input value={mfgForm.aliases} onChange={e => setMfgForm(f => ({ ...f, aliases: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" /></div>
          <Button onClick={() => createMfg.mutate(mfgForm)} disabled={createMfg.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white">{createMfg.isPending ? "Creating..." : "Create Manufacturer"}</Button>
        </div>
      );
      case "generics": return (
        <div className="space-y-3">
          <div><Label className="text-white/70 text-xs">Generic Name *</Label><Input value={genericForm.genericName} onChange={e => setGenericForm(f => ({ ...f, genericName: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" /></div>
          <div><Label className="text-white/70 text-xs">Therapeutic Class</Label><Input value={genericForm.therapeuticClass} onChange={e => setGenericForm(f => ({ ...f, therapeuticClass: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" /></div>
          <Button onClick={() => createGeneric.mutate(genericForm)} disabled={createGeneric.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white">{createGeneric.isPending ? "Creating..." : "Create Generic"}</Button>
        </div>
      );
      case "doctors": return (
        <div className="space-y-3">
          {[
            { key: "doctorName", label: "Doctor Name *" },
            { key: "registrationNo", label: "Registration No" },
            { key: "clinicHospital", label: "Clinic / Hospital" },
            { key: "phone", label: "Phone" },
            { key: "specialization", label: "Specialization" },
          ].map(f => (
            <div key={f.key}>
              <Label className="text-white/70 text-xs">{f.label}</Label>
              <Input value={(doctorForm as Record<string, string>)[f.key]} onChange={e => setDoctorForm(d => ({ ...d, [f.key]: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" />
            </div>
          ))}
          <Button onClick={() => createDoctor.mutate(doctorForm)} disabled={createDoctor.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white">{createDoctor.isPending ? "Creating..." : "Create Doctor"}</Button>
        </div>
      );
      default: return <p className="text-white/50 text-sm">Use the table to manage this master data.</p>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/pharmacy")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Master Data</h1>
            <p className="text-sm text-white/50">Manage suppliers, manufacturers, generics, doctors, and more</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => { setSection(s.id); setSearch(""); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${section === s.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white hover:bg-white/8"}`}>
                <Icon className="w-3.5 h-3.5" /> {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 mb-4">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${section}...`} className="bg-white/10 border-white/20 text-white flex-1" />
          {["suppliers", "manufacturers", "generics", "doctors"].includes(section) && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1 shrink-0">
                  <Plus className="w-4 h-4" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                <DialogHeader><DialogTitle className="capitalize">Add {section.slice(0, -1)}</DialogTitle></DialogHeader>
                <div className="mt-2">{renderCreateForm()}</div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {renderList()}
      </div>
    </div>
  );
}
