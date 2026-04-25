import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, LOGO_URL } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, RefreshCw, ChevronRight, Search, FileText, ShieldCheck, Stethoscope } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
// Status label helpers
const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  created:              { label: "Received",       color: "#2B7FFF", dot: "#2B7FFF" },
  pharmacist_reviewing: { label: "Being verified", color: "#F59E0B", dot: "#F59E0B" },
  picking:              { label: "Preparing",      color: "#2B7FFF", dot: "#2B7FFF" },
  out_for_delivery:     { label: "On the way",     color: "#2B7FFF", dot: "#2B7FFF" },
  delivered:            { label: "Delivered",      color: "#00C896", dot: "#00C896" },
  cancelled:            { label: "Cancelled",      color: "#DC2626", dot: "#DC2626" },
};

// ─── Authenticated home ───────────────────────────────────────────────────────
function AuthenticatedHome() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading: ordersLoading } = trpc.orders.list.useQuery();
  const { data: refills } = trpc.refills.list.useQuery();
  const { data: prescriptions } = trpc.prescriptions.list.useQuery();
  const { data: consults } = trpc.consult.list.useQuery();

  const pendingRx = prescriptions?.filter(
    p => p.status === "pending_ocr" || p.status === "pending_pharmacist"
  ) ?? [];

  const activeOrders = orders?.filter(
    o => !["delivered", "cancelled"].includes(o.status)
  ) ?? [];

  const recentDelivered = orders?.filter(o => o.status === "delivered").slice(0, 3) ?? [];

  const runningLow = refills?.filter(r => {
    if (!r.nextReminderAt) return false;
    const d = new Date(r.nextReminderAt);
    return d.getTime() - Date.now() <= 5 * 24 * 60 * 60 * 1000;
  }) ?? [];

  const hasActivity = activeOrders.length > 0 || recentDelivered.length > 0 || runningLow.length > 0;
  const activeConsults = (consults ?? []).filter(
    c => !["completed", "cancelled", "no_show"].includes((c as any).status)
  );

  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10 space-y-7">

        {/* ── Active doctor consult banner ──────────────────────────────── */}
        {activeConsults.length > 0 && (
          <button
            onClick={() => navigate("/doctor-consult")}
            className="w-full rounded-xl p-4 flex items-start gap-3 text-left transition-opacity hover:opacity-80"
            style={{ background: "rgba(43,127,255,0.08)", border: "1px solid rgba(43,127,255,0.20)" }}
          >
            <Stethoscope size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" style={{ color: "#2B7FFF" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#2B7FFF" }}>
                {activeConsults.length === 1 ? "Doctor consult in progress" : `${activeConsults.length} doctor consults in progress`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                A physician is reviewing your request. Tap for details.
              </p>
            </div>
            <ChevronRight size={14} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
          </button>
        )}

        {/* ── Prescription under review ────────────────────────────────── */}
        {pendingRx.length > 0 && (
          <div className="rounded-xl p-4 flex items-start gap-3"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#F59E0B" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#F59E0B" }}>
                {pendingRx.length === 1 ? "Prescription under review" : `${pendingRx.length} prescriptions under review`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                Being reviewed by a verified pharmacist
              </p>
            </div>
          </div>
        )}

        {/* ── Active medications ───────────────────────────────────────── */}
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
                      className="w-full flex items-center justify-between p-4 rounded-xl text-left transition-opacity hover:opacity-80"
                      style={{ background: "#141416", border: "1px solid #2A2A2E" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#F0F0F2" }}>
                          Order #{String(order.id).padStart(6, '0')}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: s.dot }} />
                          <span className="text-xs" style={{ color: s.color }}>
                            {s.label}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Running low ─────────────────────────────────────────────── */}
        {runningLow.length > 0 && (
          <section>
            <p className="section-label mb-3">Running low</p>
            <div className="space-y-2">
              {runningLow.slice(0, 3).map(r => (
                <div key={r.id}
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: "#141416", border: "1px solid rgba(245,158,11,0.20)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#F0F0F2" }}>
                      {r.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#F59E0B" }}>
                      Due for refill soon
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/catalog?q=${encodeURIComponent(r.name)}`)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(43,127,255,0.12)", color: "#2B7FFF" }}
                  >
                    Refill
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Search bar ──────────────────────────────────────────────── */}
        <button
          onClick={() => navigate("/catalog")}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-opacity hover:opacity-80"
          style={{ background: "#141416", border: "1px solid #2A2A2E" }}
        >
          <Search size={16} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
          <span className="text-sm" style={{ color: "#6B6B75" }}>
            Search by name, dosage, or generic...
          </span>
        </button>

        {/* ── Recently ordered ────────────────────────────────────────── */}
        {recentDelivered.length > 0 && (
          <section>
            <p className="section-label mb-3">Recently ordered</p>
            <div className="space-y-2">
              {recentDelivered.map(order => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="w-full flex items-center justify-between p-4 rounded-xl text-left transition-opacity hover:opacity-80"
                  style={{ background: "#141416", border: "1px solid #2A2A2E" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#F0F0F2" }}>
                      Order #{String(order.id).padStart(6, '0')}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                      Delivered · Tap to reorder
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RefreshCw size={12} strokeWidth={1.75} style={{ color: "#2B7FFF" }} />
                    <span className="text-xs font-medium" style={{ color: "#2B7FFF" }}>Reorder</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!ordersLoading && !hasActivity && (
          <div className="pt-4 pb-2 flex flex-col items-center text-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
              <RefreshCw size={22} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
            </div>
            <div>
              <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>
                No active medications
              </p>
              <p className="text-sm mt-1.5 max-w-xs mx-auto" style={{ color: "#6B6B75" }}>
                Search for a medication or upload a prescription to get started.
              </p>
            </div>
            <div className="w-full space-y-2.5">
              <button
                onClick={() => navigate("/catalog")}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#2B7FFF", color: "white" }}
              >
                <Search size={15} strokeWidth={1.75} />
                Search medications
              </button>
              <button
                onClick={() => navigate("/rx-upload")}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#141416", border: "1px solid #2A2A2E", color: "#A0A0A8" }}
              >
                <FileText size={15} strokeWidth={1.75} />
                Upload a prescription
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
  const [, navigate] = useLocation();
  const loginUrl = "/login"; // app-owned login page
  useEffect(() => {
    document.title = "24/7 Pharmacy — Medicines Delivered 24/7";
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: "#0A0A0B" }}>
      <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-12 w-auto mb-8 object-contain" />

      <h1 className="text-2xl font-semibold mb-3" style={{ color: "#F0F0F2" }}>
        Your medication, always on.
      </h1>
      <h2 className="text-sm font-medium mb-8 max-w-xs mx-auto" style={{ color: "#6B6B75", lineHeight: 1.6, fontWeight: 400 }}>
        Prescription management, refill reminders, and 24/7 delivery — all in one place.
      </h2>

      <a
        href={loginUrl}
        className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold no-underline transition-opacity hover:opacity-80"
        style={{ background: "#2B7FFF", color: "white" }}
      >
        Get started <ArrowRight size={15} strokeWidth={1.75} />
      </a>

      {/* Trust signals */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center mt-10">
        {["Verified pharmacist", "Licensed dispensing", "Secure records"].map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <ShieldCheck size={11} strokeWidth={1.75} style={{ color: "#00C896" }} />
            <span className="text-[11px]" style={{ color: "#6B6B75" }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { isAuthenticated, loading: isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/catalog");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedHome /> : <LandingHome />;
}
