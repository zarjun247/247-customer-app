import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle, Shield, Clock, RefreshCw, ChevronRight, Search, FileText } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

// ─── Status label helpers ─────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  created:              { label: "Received",       color: "#1F6FEB", bg: "#EFF6FF" },
  pharmacist_reviewing: { label: "Being verified", color: "#D97706", bg: "#FFFBEB" },
  picking:              { label: "Preparing",      color: "#1F6FEB", bg: "#EFF6FF" },
  out_for_delivery:     { label: "On the way",     color: "#1F6FEB", bg: "#EFF6FF" },
  delivered:            { label: "Delivered",      color: "#16A34A", bg: "#F0FDF4" },
  cancelled:            { label: "Cancelled",      color: "#DC2626", bg: "#FEF2F2" },
};

// ─── Authenticated home ───────────────────────────────────────────────────────
function AuthenticatedHome() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading: ordersLoading } = trpc.orders.list.useQuery();
  const { data: refills } = trpc.refills.list.useQuery();
  const { data: store } = trpc.catalog.store.useQuery();
  const { data: prescriptions } = trpc.prescriptions.list.useQuery();
  const pendingRx = prescriptions?.filter(p => p.status === 'pending_ocr' || p.status === 'pending_pharmacist') ?? [];

  const activeOrders = orders?.filter(o =>
    !["delivered", "cancelled"].includes(o.status)
  ) ?? [];
  const recentDelivered = orders?.filter(o => o.status === "delivered").slice(0, 3) ?? [];
  const runningLow = refills?.filter(r => {
    if (!r.nextReminderAt) return false;
    const d = new Date(r.nextReminderAt);
    return d.getTime() - Date.now() <= 5 * 24 * 60 * 60 * 1000;
  }) ?? [];

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10 space-y-8">

        {/* ── Greeting + pharmacy ──────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{ color: "#1F6FEB" }}>
            Your pharmacy
          </p>
          <h1 className="text-xl font-semibold" style={{ color: "#111827" }}>
            {store?.name ?? "24/7 Pharmacy"}
          </h1>
          {store && (
            <p className="text-sm mt-0.5" style={{ color: "#667085" }}>
              {(store as any).displayLabel ?? "Serving your building"}{(store as any).etaMins ? ` · ~${(store as any).etaMins} min` : ""}
            </p>
          )}
        </div>

        {/* ── Active medications (in-progress orders) ──────────────────── */}
        {(ordersLoading || activeOrders.length > 0) && (
          <section>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: "#9CA3AF" }}>Active medications</p>
            {ordersLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {activeOrders.map(order => {
                  const s = STATUS_LABEL[order.status] ?? STATUS_LABEL.created;
                  return (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="w-full flex items-center justify-between p-4 bg-white rounded-xl text-left transition-opacity hover:opacity-80"
                      style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: s.bg, color: s.color }}>
                            {s.label}
                          </span>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                          Order #{order.id}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          ₹{Number(order.total).toFixed(0)} · {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <ChevronRight size={16} strokeWidth={1.5} style={{ color: "#D1D5DB" }} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Prescription under review ─────────────────────────────── */}
        {pendingRx.length > 0 && (
          <section>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: "#9CA3AF" }}>Prescription under review</p>
            <div className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "#FEF3C7" }}>
                <Shield size={15} strokeWidth={1.75} style={{ color: "#D97706" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-0.5" style={{ color: "#92400E" }}>
                  {pendingRx.length === 1 ? "A prescription is" : `${pendingRx.length} prescriptions are`} being reviewed
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#B45309" }}>
                  A licensed pharmacist is reviewing {pendingRx.length === 1 ? "your prescription" : "your prescriptions"}. You will be notified once approved.
                </p>
                <button
                  onClick={() => navigate("/rx-upload")}
                  className="mt-2 text-xs font-semibold transition-opacity hover:opacity-70"
                  style={{ color: "#1F6FEB" }}
                >
                  View status →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Running low ──────────────────────────────────────────────── */}
        {runningLow.length > 0 && (
          <section>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: "#9CA3AF" }}>Running low</p>
            <div className="space-y-2">
              {runningLow.slice(0, 3).map(r => (
                <div key={r.id}
                  className="flex items-center justify-between p-4 bg-white rounded-xl"
                  style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                      {r.name}
                    </p>
                    {(r.strength || r.form) && (
                      <p className="text-xs mt-0.5" style={{ color: "#667085" }}>
                        {[r.strength, r.form].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/catalog?search=${encodeURIComponent(r.name)}`)}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "#1F6FEB", color: "white" }}
                  >
                    Refill now
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Search entry ─────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => navigate("/catalog")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-opacity hover:opacity-80"
            style={{
              background: "white",
              border: "1px solid #E5E7EB",
              color: "#9CA3AF",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <Search size={15} strokeWidth={1.75} />
            <span>Search by name, dosage, or generic…</span>
          </button>
        </section>

        {/* ── Recently ordered ─────────────────────────────────────────── */}
        {recentDelivered.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: "#9CA3AF" }}>Recently ordered</p>
              <button
                onClick={() => navigate("/orders")}
                className="text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: "#1F6FEB" }}
              >
                View all
              </button>
            </div>
            <div className="space-y-2">
              {recentDelivered.map(order => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-xl text-left transition-opacity hover:opacity-80"
                  style={{ border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                      Order #{order.id}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                      ₹{Number(order.total).toFixed(0)} · {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "#F0FDF4", color: "#16A34A" }}>
                      Delivered
                    </span>
                    <ChevronRight size={14} strokeWidth={1.5} style={{ color: "#D1D5DB" }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty / first-use state ──────────────────────────────────── */}
        {!ordersLoading && activeOrders.length === 0 && recentDelivered.length === 0 && runningLow.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "#F8FAFB", border: "1px solid #E5E7EB" }}>
              <RefreshCw size={22} strokeWidth={1.5} style={{ color: "#9CA3AF" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "#111827" }}>
              No active medications
            </p>
            <p className="text-sm leading-relaxed mb-8"
              style={{ color: "#667085", maxWidth: "20rem" }}>
              Search for your medications or upload a prescription to get started.
            </p>
            <div className="w-full space-y-2.5" style={{ maxWidth: "22rem" }}>
              <button
                onClick={() => navigate("/catalog")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#1F6FEB", color: "white" }}
              >
                <Search size={15} />
                <span>Search for a medication</span>
              </button>
              <button
                onClick={() => navigate("/rx-upload")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#F8FAFB", color: "#111827", border: "1px solid #E5E7EB" }}
              >
                <FileText size={15} style={{ color: "#667085" }} />
                <span>Upload a prescription</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

// ─── Unauthenticated landing ──────────────────────────────────────────────────
function LandingHome() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 pt-8 max-w-lg mx-auto w-full">
        <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-8 w-auto object-contain" />
      </header>

      <main className="flex-1 flex flex-col justify-center px-6 max-w-lg mx-auto w-full">
        <div className="mb-10 mt-8">
          <p className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: "#1F6FEB" }}>
            Medication Continuity
          </p>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight mb-4"
            style={{ color: "#111827" }}>
            Your medication is handled<br />
            by a system you can trust.
          </h1>
          <p className="text-base leading-relaxed"
            style={{ color: "#667085", maxWidth: "28rem" }}>
            A licensed local pharmacy, assigned to your building.
            Pharmacist-reviewed prescriptions. Medicines at your door.
          </p>
        </div>

        <div className="space-y-5 mb-10">
          {[
            {
              icon: CheckCircle,
              title: "Verified pharmacist on every order",
              body: "A licensed pharmacist reviews and approves every prescription before dispensing.",
            },
            {
              icon: Clock,
              title: "Arriving in under 30 minutes",
              body: "Dispensed from the pharmacy serving your building. No third-party logistics.",
            },
            {
              icon: Shield,
              title: "Compliant with Indian pharmacy law",
              body: "Schedule H and H1 medicines are dispensed only with a valid prescription.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "#EFF6FF" }}>
                <Icon size={16} strokeWidth={1.75} style={{ color: "#1F6FEB" }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "#111827" }}>
                  {title}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "#667085" }}>
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <a
            href={getLoginUrl()}
            className="flex items-center justify-between w-full px-5 py-4 rounded-xl font-semibold text-sm no-underline transition-opacity hover:opacity-90"
            style={{ background: "#1F6FEB", color: "white" }}
          >
            <span>Access your pharmacy</span>
            <ArrowRight size={16} />
          </a>
          <p className="text-center text-xs" style={{ color: "#9CA3AF" }}>
            Available to residents of registered partner buildings.
          </p>
        </div>
      </main>

      <footer className="px-6 py-6 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Licensed · Maharashtra Pharmacy Act
          </p>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Reg. MH/PH/2024/001
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    // intentionally empty — we render the authenticated home directly
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: "#1F6FEB", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!isAuthenticated) return <LandingHome />;
  return <AuthenticatedHome />;
}
