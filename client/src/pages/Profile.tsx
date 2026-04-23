import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { User, Building2, Home, LogOut, ChevronRight, Package, FileText, Bell, Shield, Phone } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();

  const { data: profile } = trpc.user.profile.useQuery(undefined, { enabled: isAuthenticated });
  const { data: orders } = trpc.orders.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: prescriptions } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });

  const totalOrders = orders?.length ?? 0;
  const deliveredOrders = orders?.filter(o => o.status === "delivered").length ?? 0;
  const pendingRx = prescriptions?.filter(p => p.status === "pending_ocr" || p.status === "pending_pharmacist").length ?? 0;

  const navLinks = [
    { icon: Package,  label: "Order History",     sub: `${totalOrders} orders · ${deliveredOrders} delivered`, href: "/orders" },
    { icon: FileText, label: "Prescriptions",      sub: pendingRx > 0 ? `${pendingRx} pending review` : "All reviewed", href: "/rx-upload" },
    { icon: Bell,     label: "Refill Schedule",    sub: "Chronic medications", href: "/refills" },
  ];

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        <h1 className="text-base font-semibold text-foreground mb-5">Account</h1>

        {/* ── Identity card ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-4 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{profile?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profile?.email ?? profile?.phone ?? "No contact on record"}
              </p>
            </div>
          </div>

          <div className="h-px bg-border mb-3" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="section-label mb-0.5">Building</p>
              <div className="flex items-center gap-1.5">
                <Building2 size={12} className="text-muted-foreground" />
                <p className="text-sm text-foreground font-medium">
                  {profile?.buildingName ?? (profile?.buildingId ? `Building ${profile.buildingId}` : "Not set")}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-0.5">Flat</p>
              <div className="flex items-center gap-1.5">
                <Home size={12} className="text-muted-foreground" />
                <p className="text-sm text-foreground font-medium">
                  {profile?.flatNumber ? `Flat ${profile.flatNumber}` : "Not set"}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-0.5">Pharmacy Node</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <p className="text-sm text-foreground font-medium">
                  {profile?.assignedStoreId ? `Node #${profile.assignedStoreId}` : "Unassigned"}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-0.5">Phone</p>
              <div className="flex items-center gap-1.5">
                <Phone size={12} className="text-muted-foreground" />
                <p className="text-sm text-foreground font-medium">
                  {profile?.phone ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Total Orders", value: totalOrders },
            { label: "Delivered",    value: deliveredOrders },
            { label: "Rx Pending",   value: pendingRx },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-lg px-3 py-3 text-center">
              <p className="text-lg font-semibold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Navigation links ──────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
          {navLinks.map(({ icon: Icon, label, sub, href }, idx) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary transition-colors text-left ${
                idx < navLinks.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Icon size={15} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* ── Compliance note ───────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 px-4 py-3.5 bg-card border border-border rounded-lg mb-4">
          <Shield size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your data is stored in compliance with the IT Act 2000 and applicable pharmacy regulations. Prescription records are retained for a minimum of 5 years as required by the Drugs and Cosmetics Act.
          </p>
        </div>

        {/* ── Sign out ──────────────────────────────────────────────────── */}
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors mb-6"
        >
          <LogOut size={14} />
          Sign out
        </button>

        <p className="text-[11px] text-muted-foreground text-center mb-6">
          24/7 Pharmacy Infrastructure · Reg. No. MH/PH/2024/001
        </p>
      </div>
    </AppLayout>
  );
}
