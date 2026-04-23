import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle, Shield, Clock, RefreshCw, ChevronRight, Search } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

// ─── Status label helpers ─────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  created:              { label: "Received",       color: "oklch(0.545 0.195 255)", bg: "oklch(0.965 0.020 255)" },
  pharmacist_reviewing: { label: "Being verified", color: "oklch(0.620 0.150 55)",  bg: "oklch(0.97 0.040 55)" },
  picking:              { label: "Preparing",      color: "oklch(0.545 0.195 255)", bg: "oklch(0.965 0.020 255)" },
  out_for_delivery:     { label: "On the way",     color: "oklch(0.545 0.195 255)", bg: "oklch(0.965 0.020 255)" },
  delivered:            { label: "Delivered",      color: "oklch(0.500 0.150 145)", bg: "oklch(0.970 0.025 145)" },
  cancelled:            { label: "Cancelled",      color: "oklch(0.550 0.180 25)",  bg: "oklch(0.97 0.015 25)" },
};

// ─── Authenticated home ───────────────────────────────────────────────────────
function AuthenticatedHome() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading: ordersLoading } = trpc.orders.list.useQuery();
  const { data: refills } = trpc.refills.list.useQuery();
  const { data: store } = trpc.catalog.store.useQuery();

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
            style={{ color: "oklch(0.545 0.195 255)" }}>
            Your pharmacy
          </p>
          <h1 className="text-xl font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
            {store?.name ?? "24/7 Pharmacy"}
          </h1>
          {store && (
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>
              {(store as any).displayLabel ?? "Serving your building"}{(store as any).etaMins ? ` · ~${(store as any).etaMins} min` : ""}
            </p>
          )}
        </div>

        {/* ── Active medications (in-progress orders) ──────────────────── */}
        {(ordersLoading || activeOrders.length > 0) && (
          <section>
            <p className="section-label mb-3">Active medications</p>
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
                      className="w-full flex items-center justify-between p-4 bg-white rounded-xl card-shadow text-left transition-opacity hover:opacity-80"
                      style={{ border: "1px solid oklch(0.910 0.008 255)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: s.bg, color: s.color }}>
                            {s.label}
                          </span>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                          Order #{order.id}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>
                          ₹{Number(order.total).toFixed(0)} · {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <ChevronRight size={16} strokeWidth={1.5} style={{ color: "oklch(0.650 0.012 255)" }} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Running low ──────────────────────────────────────────────── */}
        {runningLow.length > 0 && (
          <section>
            <p className="section-label mb-3">Running low</p>
            <div className="space-y-2">
              {runningLow.slice(0, 3).map(r => (
                <div key={r.id}
                  className="flex items-center justify-between p-4 bg-white rounded-xl card-shadow"
                  style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                      {r.name}
                    </p>
                    {(r.strength || r.form) && (
                      <p className="text-xs mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>
                        {[r.strength, r.form].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/catalog?search=${encodeURIComponent(r.name)}`)}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
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
              background: "oklch(0.965 0.004 255)",
              border: "1px solid oklch(0.910 0.008 255)",
              color: "oklch(0.520 0.018 255)",
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
              <p className="section-label">Recently ordered</p>
              <button
                onClick={() => navigate("/orders")}
                className="text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: "oklch(0.545 0.195 255)" }}
              >
                View all
              </button>
            </div>
            <div className="space-y-2">
              {recentDelivered.map(order => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-xl card-shadow text-left transition-opacity hover:opacity-80"
                  style={{ border: "1px solid oklch(0.910 0.008 255)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                      Order #{order.id}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "oklch(0.520 0.018 255)" }}>
                      ₹{Number(order.total).toFixed(0)} · {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "oklch(0.970 0.025 145)", color: "oklch(0.500 0.150 145)" }}>
                      Delivered
                    </span>
                    <ChevronRight size={14} strokeWidth={1.5} style={{ color: "oklch(0.650 0.012 255)" }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state when no history ──────────────────────────────── */}
        {!ordersLoading && activeOrders.length === 0 && recentDelivered.length === 0 && runningLow.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "oklch(0.965 0.004 255)" }}>
              <RefreshCw size={22} strokeWidth={1.5} style={{ color: "oklch(0.520 0.018 255)" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "oklch(0.175 0.012 255)" }}>
              No active medications
            </p>
            <p className="text-sm leading-relaxed mb-6"
              style={{ color: "oklch(0.520 0.018 255)", maxWidth: "20rem" }}>
              Search for your medications or upload a prescription to get started.
            </p>
            <button
              onClick={() => navigate("/catalog")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
            >
              Browse medications
              <ArrowRight size={14} />
            </button>
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
            style={{ color: "oklch(0.545 0.195 255)" }}>
            Medication Continuity
          </p>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight mb-4"
            style={{ color: "oklch(0.175 0.012 255)" }}>
            Your medication is handled<br />
            by a system you can trust.
          </h1>
          <p className="text-base leading-relaxed"
            style={{ color: "oklch(0.520 0.018 255)", maxWidth: "28rem" }}>
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
                style={{ background: "oklch(0.965 0.020 255)" }}>
                <Icon size={16} strokeWidth={1.75} style={{ color: "oklch(0.545 0.195 255)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "oklch(0.175 0.012 255)" }}>
                  {title}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "oklch(0.520 0.018 255)" }}>
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
            style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
          >
            <span>Access your pharmacy</span>
            <ArrowRight size={16} />
          </a>
          <p className="text-center text-xs" style={{ color: "oklch(0.520 0.018 255)" }}>
            Available to residents of registered partner buildings.
          </p>
        </div>
      </main>

      <footer className="px-6 py-6 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "oklch(0.650 0.012 255)" }}>
            Licensed · Maharashtra Pharmacy Act
          </p>
          <p className="text-xs" style={{ color: "oklch(0.650 0.012 255)" }}>
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

  // Redirect to catalog on first login is no longer needed — we show the patient home
  useEffect(() => {
    // intentionally empty — we render the authenticated home directly
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: "oklch(0.545 0.195 255)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!isAuthenticated) return <LandingHome />;
  return <AuthenticatedHome />;
}
