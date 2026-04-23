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
    { icon: Package,  label: "Order History",   sub: `${totalOrders} orders · ${deliveredOrders} delivered`, href: "/orders" },
    { icon: FileText, label: "Prescriptions",    sub: pendingRx > 0 ? `${pendingRx} awaiting review` : "All reviewed", href: "/rx-upload" },
    { icon: Bell,     label: "Refill Schedule",  sub: "Chronic medications", href: "/refills" },
  ];

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "oklch(0.175 0.012 255)" }}>
            Account
          </h1>
          <p className="text-sm" style={{ color: "oklch(0.520 0.018 255)" }}>
            Your profile and pharmacy assignment
          </p>
        </div>

        {/* ── Identity card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl p-4 mb-4 card-shadow"
          style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "oklch(0.965 0.020 255)" }}>
              <User size={18} strokeWidth={1.75} style={{ color: "oklch(0.545 0.195 255)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                {profile?.name ?? "—"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>
                {profile?.email ?? profile?.phone ?? "No contact on record"}
              </p>
            </div>
          </div>

          <div className="h-px mb-4" style={{ background: "oklch(0.910 0.008 255)" }} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="section-label mb-1">Building</p>
              <div className="flex items-center gap-1.5">
                <Building2 size={12} strokeWidth={1.75} style={{ color: "oklch(0.520 0.018 255)" }} />
                <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {profile?.buildingName ?? (profile?.buildingId ? `Building ${profile.buildingId}` : "Not set")}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-1">Flat</p>
              <div className="flex items-center gap-1.5">
                <Home size={12} strokeWidth={1.75} style={{ color: "oklch(0.520 0.018 255)" }} />
                <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {profile?.flatNumber ? `Flat ${profile.flatNumber}` : "Not set"}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-1">Assigned Pharmacy</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: profile?.assignedStoreId ? "oklch(0.600 0.160 145)" : "oklch(0.650 0.012 255)" }} />
                <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {profile?.assignedStoreId ? "Active" : "Unassigned"}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-1">Phone</p>
              <div className="flex items-center gap-1.5">
                <Phone size={12} strokeWidth={1.75} style={{ color: "oklch(0.520 0.018 255)" }} />
                <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {profile?.phone ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Orders",    value: totalOrders },
            { label: "Delivered", value: deliveredOrders },
            { label: "Rx Pending",value: pendingRx },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl px-3 py-3 text-center card-shadow"
              style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
              <p className="text-lg font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>{value}</p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "oklch(0.520 0.018 255)" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Navigation links ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl overflow-hidden mb-4 card-shadow"
          style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
          {navLinks.map(({ icon: Icon, label, sub, href }, idx) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="w-full flex items-center gap-3 px-4 py-4 transition-opacity hover:opacity-70 text-left"
              style={{ borderBottom: idx < navLinks.length - 1 ? "1px solid oklch(0.910 0.008 255)" : "none" }}
            >
              <Icon size={15} strokeWidth={1.75} style={{ color: "oklch(0.520 0.018 255)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>{sub}</p>
              </div>
              <ChevronRight size={14} style={{ color: "oklch(0.650 0.012 255)" }} />
            </button>
          ))}
        </div>

        {/* ── Compliance note ───────────────────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 rounded-xl mb-4"
          style={{ background: "oklch(0.965 0.004 255)" }}>
          <Shield size={13} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
            style={{ color: "oklch(0.520 0.018 255)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "oklch(0.520 0.018 255)" }}>
            Your data is stored in compliance with the IT Act 2000 and applicable pharmacy regulations. Prescription records are retained for a minimum of 5 years as required by the Drugs and Cosmetics Act.
          </p>
        </div>

        {/* ── Sign out ──────────────────────────────────────────────────── */}
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-70 mb-6"
          style={{ border: "1px solid oklch(0.910 0.008 255)", color: "oklch(0.520 0.018 255)", background: "white" }}
        >
          <LogOut size={14} />
          Sign out
        </button>

        <p className="text-xs text-center" style={{ color: "oklch(0.650 0.012 255)" }}>
          24/7 Pharmacy Infrastructure · Reg. No. MH/PH/2024/001
        </p>
      </div>
    </AppLayout>
  );
}
