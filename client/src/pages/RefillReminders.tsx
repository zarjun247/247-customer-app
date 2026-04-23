import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Bell, X, Clock, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function getDaysUntil(date: Date | string) {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function UrgencyLabel({ days }: { days: number }) {
  if (days <= 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded">
      Overdue by {Math.abs(days)}d
    </span>
  );
  if (days <= 3) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
      Due in {days}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
      Due in {days}d
    </span>
  );
}

export default function RefillReminders() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: reminders, isLoading } = trpc.refills.list.useQuery(undefined, { enabled: isAuthenticated });

  const dismiss = trpc.refills.dismiss.useMutation({
    onSuccess: () => utils.refills.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-5 pt-5 space-y-2">
          {[1, 2].map(i => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>
      </AppLayout>
    );
  }

  const overdueReminders = reminders?.filter(r => getDaysUntil(r.nextReminderAt) <= 0) ?? [];
  const upcomingReminders = reminders?.filter(r => getDaysUntil(r.nextReminderAt) > 0) ?? [];

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        <div className="mb-5">
          <h1 className="text-base font-semibold text-foreground">Refill Schedule</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chronic medications · Computed from your order history
          </p>
        </div>

        {!reminders || reminders.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-5">
              <Bell size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No refill schedule yet</p>
            <p className="text-xs text-muted-foreground mb-6 max-w-[240px] leading-relaxed">
              Refill reminders are generated automatically once you have a history of ordering chronic medications. No manual setup required.
            </p>
            <button
              onClick={() => navigate("/catalog")}
              className="text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              Browse medicines →
            </button>
          </div>
        ) : (
          <>
            {/* ── Overdue ───────────────────────────────────────────────── */}
            {overdueReminders.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-3">Overdue</p>
                <div className="space-y-2">
                  {overdueReminders.map((reminder) => {
                    const days = getDaysUntil(reminder.nextReminderAt);
                    return (
                      <div key={reminder.id} className="px-4 py-3.5 rounded-lg bg-card border border-destructive/20">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug">{reminder.name}</p>
                            {reminder.strength && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {reminder.form} · {reminder.strength}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => dismiss.mutate({ id: reminder.id })}
                            className="text-muted-foreground hover:text-foreground transition-colors ml-3 flex-shrink-0 mt-0.5"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UrgencyLabel days={days} />
                            <span className="text-[10px] text-muted-foreground">
                              Every {reminder.avgIntervalDays}d avg
                            </span>
                          </div>
                          <button
                            onClick={() => navigate("/catalog")}
                            className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                          >
                            Order now <ArrowRight size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Upcoming ──────────────────────────────────────────────── */}
            {upcomingReminders.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-3">Upcoming</p>
                <div className="space-y-2">
                  {upcomingReminders.map((reminder) => {
                    const days = getDaysUntil(reminder.nextReminderAt);
                    const isDueSoon = days <= 3;
                    return (
                      <div
                        key={reminder.id}
                        className={`px-4 py-3.5 rounded-lg bg-card border ${isDueSoon ? "border-amber-500/20" : "border-border"}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug">{reminder.name}</p>
                            {reminder.strength && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {reminder.form} · {reminder.strength}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => dismiss.mutate({ id: reminder.id })}
                            className="text-muted-foreground hover:text-foreground transition-colors ml-3 flex-shrink-0 mt-0.5"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UrgencyLabel days={days} />
                            <span className="text-[10px] text-muted-foreground">
                              Every {reminder.avgIntervalDays}d avg
                            </span>
                          </div>
                          {isDueSoon && (
                            <button
                              onClick={() => navigate("/catalog")}
                              className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                            >
                              Order now <ArrowRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Disclaimer ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-lg bg-card border border-border mt-2 mb-6">
          <Info size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Refill intervals are computed from your actual dispensation history for chronic medications only. These are operational estimates and do not constitute clinical advice. Consult your physician for any changes to your medication regimen.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
