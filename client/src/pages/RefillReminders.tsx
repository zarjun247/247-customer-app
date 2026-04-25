import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import AppLayout from "@/components/AppLayout";
import { Clock, CheckCircle2, Search, Bell, ChevronDown, Repeat } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const SNOOZE_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
];

export default function RefillReminders() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useOnboardingGuard();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [snoozeOpen, setSnoozeOpen] = useState<number | null>(null);

  const { data: reminders, isLoading } = trpc.refills.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: snoozedData } = trpc.refills.listSnoozed.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const dismiss = trpc.refills.dismiss.useMutation({
    onSuccess: () => { utils.refills.list.invalidate(); utils.refills.listSnoozed.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const snooze = trpc.refills.snooze.useMutation({
    onSuccess: (_, vars) => {
      utils.refills.list.invalidate();
      utils.refills.listSnoozed.invalidate();
      setSnoozeOpen(null);
      toast.success(`Reminder snoozed for ${vars.days} day${vars.days > 1 ? "s" : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const getDaysUntil = (dateVal: Date | string | null) => {
    if (!dateVal) return null;
    const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getUrgencyConfig = (days: number | null) => {
    if (days === null) return { label: "Due soon", color: "#6B6B75", bg: "transparent" };
    if (days <= 0) return { label: "Due now", color: "#F43F5E", bg: "rgba(244,63,94,0.10)" };
    if (days <= 2) return { label: `Due in ${days}d`, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" };
    if (days <= 5) return { label: `Due in ${days}d`, color: "#2B7FFF", bg: "rgba(43,127,255,0.10)" };
    return { label: `Due in ${days}d`, color: "#6B6B75", bg: "transparent" };
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
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

  // Active reminders come from the server (already filtered to exclude currently-snoozed)
  const activeReminders = reminders ?? [];
  // Snoozed reminders come from the dedicated endpoint
  const snoozedReminders = snoozedData ?? [];

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

        {activeReminders.length === 0 && snoozedReminders.length === 0 ? (
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
          <>
            {/* ── Active reminders ────────────────────────────────────── */}
            {activeReminders.length > 0 && (
              <div className="space-y-3 mb-5">
                {activeReminders.map((r: any) => {
                  const days = getDaysUntil(r.nextReminderAt);
                  const urgency = getUrgencyConfig(days);
                  const isChronic = r.isChronicMedication;
                  return (
                    <div key={r.id} className="rounded-xl p-4"
                      style={{ background: "#141416", border: isChronic ? "1px solid rgba(0,200,150,0.20)" : "1px solid #2A2A2E" }}>

                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold leading-snug" style={{ color: "#F0F0F2" }}>
                              {r.name}
                            </p>
                            {/* Chronic badge — inline, more visible */}
                            {isChronic && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: "rgba(0,200,150,0.12)", border: "1px solid rgba(0,200,150,0.25)" }}>
                                <Repeat size={10} strokeWidth={2} style={{ color: "#00C896" }} />
                                <span className="text-[10px] font-semibold" style={{ color: "#00C896" }}>Chronic</span>
                              </div>
                            )}
                          </div>
                          {(r.strength || r.form) && (
                            <p className="text-xs" style={{ color: "#6B6B75" }}>
                              {[r.strength, r.form].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Urgency chip + interval */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                          style={{ background: urgency.bg || "rgba(43,127,255,0.08)" }}>
                          <Clock size={10} strokeWidth={1.75} style={{ color: urgency.color }} />
                          <span className="text-xs font-semibold" style={{ color: urgency.color }}>
                            {urgency.label}
                          </span>
                        </div>
                        {r.avgIntervalDays && (
                          <span className="text-xs" style={{ color: "#4B4B55" }}>
                            · every {r.avgIntervalDays} days
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/catalog?search=${encodeURIComponent(r.name)}`)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: "#2B7FFF", color: "white" }}
                        >
                          <Search size={12} />
                          Find &amp; add
                        </button>

                        {/* Snooze dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setSnoozeOpen(snoozeOpen === r.id ? null : r.id)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                            style={{ border: "1px solid #2A2A2E", color: "#6B6B75", background: "#141416" }}
                          >
                            <Clock size={11} />
                            Snooze
                            <ChevronDown size={10} />
                          </button>
                          {snoozeOpen === r.id && (
                            <div className="absolute bottom-full right-0 mb-1 rounded-xl overflow-hidden z-20"
                              style={{ background: "#1C1C1F", border: "1px solid #2A2A2E", minWidth: "8rem" }}>
                              {SNOOZE_OPTIONS.map(opt => (
                                <button
                                  key={opt.days}
                                  onClick={() => snooze.mutate({ id: r.id, days: opt.days as 1 | 3 | 7 })}
                                  disabled={snooze.isPending}
                                  className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[#2A2A2E] disabled:opacity-40"
                                  style={{ color: "#F0F0F2" }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => dismiss.mutate({ id: r.id })}
                          disabled={dismiss.isPending}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ border: "1px solid #2A2A2E", color: "#6B6B75", background: "#141416" }}
                        >
                          <CheckCircle2 size={12} />
                          Done
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Snoozed reminders ───────────────────────────────────── */}
            {snoozedReminders.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={11} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
                  <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#4B4B55" }}>
                    Snoozed
                  </p>
                </div>
                <div className="space-y-2">
                  {snoozedReminders.map((r: any) => (
                    <div key={r.id} className="rounded-xl p-3 flex items-center gap-3"
                      style={{ background: "#141416", border: "1px solid #2A2A2E", opacity: 0.6 }}>
                      <Clock size={13} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: "#6B6B75" }}>{r.name}</p>
                        <p className="text-[10px]" style={{ color: "#4B4B55" }}>
                          Snoozed until {new Date(r.snoozedUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Info note ─────────────────────────────────────────────────── */}
        {(activeReminders.length > 0 || snoozedReminders.length > 0) && (
          <div className="mt-2 p-4 rounded-xl" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
            <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
              Refill reminders are calculated from your order history and appear 5 days before your estimated next dose runs out. Chronic medications are tracked with higher priority.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
