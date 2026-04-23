import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { User, Building2, Home, LogOut, ChevronRight, Package, FileText, Bell, Shield, Phone, MapPin, Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const { data: profile }       = trpc.user.profile.useQuery(undefined, { enabled: isAuthenticated });
  const { data: store }         = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const { data: orders }        = trpc.orders.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: prescriptions } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });

  const totalOrders     = orders?.length ?? 0;
  const deliveredOrders = orders?.filter(o => o.status === "delivered").length ?? 0;
  const pendingRx       = prescriptions?.filter(
    p => p.status === "pending_ocr" || p.status === "pending_pharmacist"
  ).length ?? 0;

  const storeName    = store?.name ?? null;
  const storeAddress = (store as any)?.address as string | undefined;
  const eta          = (store as any)?.etaMins as number | undefined;

  const navLinks = [
    {
      icon: Package,
      label: "Order History",
      sub: totalOrders > 0
        ? `${totalOrders} order${totalOrders !== 1 ? "s" : ""} · ${deliveredOrders} delivered`
        : "No orders yet",
      href: "/orders",
    },
    {
      icon: FileText,
      label: "Prescriptions",
      sub: pendingRx > 0 ? `${pendingRx} awaiting pharmacist review` : "All prescriptions reviewed",
      href: "/rx-upload",
    },
    {
      icon: Bell,
      label: "Refill Schedule",
      sub: "Automatic reminders for regular medications",
      href: "/refills",
    },
  ];

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10" style={{ background: "#0A0A0B", minHeight: "100%" }}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "#F0F0F2" }}>
            Account
          </h1>
          <p className="text-sm" style={{ color: "#6B6B75" }}>
            Your identity and serving pharmacy
          </p>
        </div>

        {/* ── Identity card ─────────────────────────────────────────────── */}
        <div className="rounded-xl p-4 mb-4 card-shadow" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(43,127,255,0.10)" }}>
              <User size={18} strokeWidth={1.75} style={{ color: "#2B7FFF" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                {profile?.name ?? "—"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                {profile?.email ?? profile?.phone ?? "No contact on record"}
              </p>
            </div>
          </div>

          <div className="h-px mb-4" style={{ background: "#E5E7EB" }} />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="section-label mb-1">Building</p>
              <div className="flex items-center gap-1.5">
                <Building2 size={12} strokeWidth={1.75} style={{ color: "#6B6B75" }} />
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                  {profile?.buildingName ?? (profile?.buildingId ? `Building ${profile.buildingId}` : "Not set")}
                </p>
              </div>
            </div>
            <div>
              <p className="section-label mb-1">Flat</p>
              <div className="flex items-center gap-1.5">
                <Home size={12} strokeWidth={1.75} style={{ color: "#6B6B75" }} />
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                  {profile?.flatNumber ? `Flat ${profile.flatNumber}` : "Not set"}
                </p>
              </div>
            </div>
          </div>
          {profile?.phone && (
            <div>
              <p className="section-label mb-1">Phone</p>
              <div className="flex items-center gap-1.5">
                <Phone size={12} strokeWidth={1.75} style={{ color: "#6B6B75" }} />
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                  {profile.phone}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Serving pharmacy card ─────────────────────────────────────── */}
        <div className="rounded-xl p-4 mb-4" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
          <p className="section-label mb-3">Serving pharmacy</p>
          {storeName ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(0,200,150,0.10)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: "#00C896" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                  {storeName}
                </p>
                {storeAddress && (
                  <div className="flex items-start gap-1 mt-1">
                    <MapPin size={11} strokeWidth={1.5} style={{ color: "#4B4B55", flexShrink: 0, marginTop: 1 }} />
                    <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
                      {storeAddress}
                    </p>
                  </div>
                )}
                {eta && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Clock size={11} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
                    <p className="text-xs" style={{ color: "#6B6B75" }}>
                      Arriving in ~{eta} min
                    </p>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: "rgba(0,200,150,0.10)", color: "#00C896" }}>
                Open
              </span>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#4B4B55" }}>
              {profile?.buildingId
                ? "Locating your nearest pharmacy…"
                : "Complete your address setup to see your serving pharmacy."}
            </p>
          )}
        </div>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Orders",     value: totalOrders },
            { label: "Delivered",  value: deliveredOrders },
            { label: "Rx pending", value: pendingRx },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl px-3 py-3 text-center card-shadow" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
              <p className="text-lg font-semibold" style={{ color: "#F0F0F2" }}>{value}</p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "#6B6B75" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Navigation links ──────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden mb-4 card-shadow" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
          {navLinks.map(({ icon: Icon, label, sub, href }, idx) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="w-full flex items-center gap-3 px-4 py-4 transition-opacity hover:opacity-70 text-left"
              style={{ borderBottom: idx < navLinks.length - 1 ? "1px solid #E5E7EB" : "none" }}
            >
              <Icon size={15} strokeWidth={1.75} style={{ color: "#6B6B75" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{sub}</p>
              </div>
              <ChevronRight size={14} style={{ color: "#D1D5DB" }} />
            </button>
          ))}
        </div>

        {/* ── Compliance note ───────────────────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 rounded-xl mb-4"
          style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
          <Shield size={13} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
            style={{ color: "#4B4B55" }} />
          <p className="text-xs leading-relaxed" style={{ color: "#4B4B55" }}>
            Your data and prescription records are held securely under the IT Act 2000 and Drugs &amp; Cosmetics Act. Records are retained for 5 years as required.
          </p>
        </div>

        {/* ── Sign out ──────────────────────────────────────────────────── */}
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-70 mb-6"
          style={{ border: "1px solid #2A2A2E", color: "#6B6B75", background: "#141416" }}
        >
          <LogOut size={14} />
          Sign out
        </button>

        <p className="text-xs text-center" style={{ color: "#D1D5DB" }}>
          24/7 Pharmacy · Licensed Dispensing · MH/PH/2024/001
        </p>
      </div>
    </AppLayout>
  );
}
