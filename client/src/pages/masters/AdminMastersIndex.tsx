import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Building2, Tag, Pill, Shield, Percent, ChevronRight } from "lucide-react";

const MASTERS = [
  {
    id: "suppliers",
    label: "Supplier Master",
    description: "Manage pharma distributors and suppliers with GSTIN, payment terms, and discount policies.",
    icon: Truck,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    path: "/admin/masters/suppliers",
  },
  {
    id: "manufacturers",
    label: "Manufacturer / Company Master",
    description: "Track drug manufacturers and companies with aliases for product matching.",
    icon: Building2,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    path: "/admin/masters/manufacturers",
  },
  {
    id: "categories",
    label: "Category Master",
    description: "Product categories with parent hierarchy and margin policies.",
    icon: Tag,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    path: "/admin/masters/categories",
  },
  {
    id: "generics",
    label: "Generic / Salt Master",
    description: "Generic drug names, therapeutic classes, and aliases for product linking.",
    icon: Pill,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    path: "/admin/masters/generics",
  },
  {
    id: "schedules",
    label: "Schedule Master",
    description: "Drug schedules (OTC, Rx, H, H1, X, NRX) with dispensing rules and register requirements.",
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-500/10",
    path: "/admin/masters/schedules",
  },
  {
    id: "discount-categories",
    label: "Discount Category Master",
    description: "Discount tiers with max discount, minimum margin, and role override rules.",
    icon: Percent,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    path: "/admin/masters/discount-categories",
  },
];

export default function AdminMastersIndex() {
  const [, setLocation] = useLocation();

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Master Data</h1>
          <p className="text-white/50 text-sm mt-1">Configure foundational reference data used across the pharmacy system.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MASTERS.map((m) => {
            const Icon = m.icon;
            return (
              <Card
                key={m.id}
                className="bg-white/5 border-white/10 cursor-pointer hover:bg-white/8 transition-colors group"
                onClick={() => setLocation(m.path)}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${m.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{m.label}</p>
                    <p className="text-white/50 text-xs mt-1 leading-relaxed">{m.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors shrink-0 mt-1" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
