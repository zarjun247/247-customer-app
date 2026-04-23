import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import AppLayout from "@/components/AppLayout";
import { RefreshCw, Clock, CheckCircle2, Search, Bell } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function RefillReminders() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useOnboardingGuard();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: reminders, isLoading } = trpc.refills.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const dismiss = trpc.refills.dismiss.useMutation({
    onSuccess: () => utils.refills.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const getDaysUntil = (dateVal: Date | string | null) => {
    if (!dateVal) return null;
    const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getUrgencyLabel = (days: number | null) => {
    if (days === null) return { label: "Due soon", color: "#6B6B75" };
    if (days <= 0) return { label: "Due now", color: "#F43F5E" };
    if (days <= 2) return { label: `Due in ${days}d`, color: "#F59E0B" };
    return { label: `Due in ${days}d`, color: "#6B6B75" };
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  if (!isReady) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="px-5 pt-6 pb-10" style={{ background: "#0A0A0B", minHeight: "100%" }}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "#F0F0F2" }}>
            Refill Schedule
          </h1>
          <p className="text-sm" style={{ color: "#6B6B75" }}>
            Medications due for refill based on your order history
          </p>
        </div>

        {!reminders || reminders.length === 0 ? (
          /* ── Reassurance empty state ─────────────────────────────────── */
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(0,200,150,0.10)", border: "1px solid #BBF7D0" }}>
              <Bell size={22} strokeWidth={1.5} style={{ color: "#00C896" }} />
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
              We'll remind you before you run out
            </p>
            <p className="text-sm leading-relaxed mb-3"
              style={{ color: "#6B6B75", maxWidth: "22rem" }}>
              Refill reminders appear here automatically — 5 days before your estimated next dose runs out, based on your order history.
            </p>
            <p className="text-xs leading-relaxed mb-8"
              style={{ color: "#4B4B55", maxWidth: "20rem" }}>
              Start ordering your regular medications and this schedule will build itself over time.
            </p>
            <button
              onClick={() => navigate("/catalog")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              <Search size={14} />
              Find your medications
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => {
              const days = getDaysUntil(r.nextReminderAt);
              const urgency = getUrgencyLabel(days);
              return (
                <div key={r.id} className="rounded-xl p-4" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug" style={{ color: "#F0F0F2" }}>
                        {r.name}
                      </p>
                      {(r.strength || r.form) && (
                        <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                          {[r.strength, r.form].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Clock size={11} strokeWidth={1.75} style={{ color: urgency.color }} />
                      <span className="text-xs font-semibold" style={{ color: urgency.color }}>
                        {urgency.label}
                      </span>
                    </div>
                  </div>

                  {r.avgIntervalDays && (
                    <p className="text-xs mb-3" style={{ color: "#4B4B55" }}>
                      Typically ordered every {r.avgIntervalDays} days
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/catalog?search=${encodeURIComponent(r.name)}`)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ background: "#2B7FFF", color: "white" }}
                    >
                      <Search size={12} />
                      Find &amp; add
                    </button>
                    <button
                      onClick={() => dismiss.mutate({ id: r.id })}
                      disabled={dismiss.isPending}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ border: "1px solid #2A2A2E", color: "#6B6B75", background: "#141416" }}
                    >
                      <CheckCircle2 size={12} />
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Info note ─────────────────────────────────────────────────── */}
        {reminders && reminders.length > 0 && (
          <div className="mt-6 p-4 rounded-xl" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
            <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
              Refill reminders are calculated from your order history. They appear 5 days before your estimated next dose runs out.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
