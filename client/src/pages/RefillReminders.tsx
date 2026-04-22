import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Bell, Plus, X, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function RefillReminders() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: reminders, isLoading } = trpc.refills.list.useQuery(undefined, { enabled: isAuthenticated });

  const dismiss = trpc.refills.dismiss.useMutation({
    onSuccess: () => utils.refills.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const upsertCart = trpc.cart.upsert.useMutation({
    onSuccess: () => {
      utils.cart.get.invalidate();
      toast.success("Added to cart");
      navigate("/cart");
    },
    onError: (e) => toast.error(e.message),
  });

  const getDaysUntil = (date: Date | string) => {
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-foreground">Refill Reminders</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Chronic medications due for refill</p>
        </div>

        {!reminders || reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
              <Bell className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-foreground font-medium mb-1">No reminders</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Refill reminders are generated automatically from your order history for chronic medications.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => {
              const daysUntil = getDaysUntil(reminder.nextReminderAt);
              const isOverdue = daysUntil <= 0;
              const isDueSoon = daysUntil <= 3;

              return (
                <div key={reminder.id} className={`p-4 rounded-xl bg-card border transition-colors ${
                  isOverdue ? "border-destructive/30" : isDueSoon ? "border-amber-500/30" : "border-border"
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{reminder.name}</p>
                      {reminder.brand && <p className="text-xs text-muted-foreground">{reminder.brand}</p>}
                      {reminder.strength && <p className="text-xs text-muted-foreground">{reminder.form} · {reminder.strength}</p>}
                    </div>
                    <button
                      onClick={() => dismiss.mutate({ id: reminder.id })}
                      className="text-muted-foreground hover:text-foreground transition-colors ml-2 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <Clock className={`h-3.5 w-3.5 flex-shrink-0 ${isOverdue ? "text-destructive" : isDueSoon ? "text-amber-400" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${isOverdue ? "text-destructive" : isDueSoon ? "text-amber-400" : "text-muted-foreground"}`}>
                      {isOverdue
                        ? `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""}`
                        : daysUntil === 0
                        ? "Due today"
                        : `Due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`
                      }
                    </span>
                    <span className="text-xs text-muted-foreground">· Every {reminder.avgIntervalDays} days</span>
                  </div>

                  <Button
                    size="sm"
                    className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
                    onClick={() => navigate("/catalog")}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Order Refill
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 px-4 py-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Reminders are generated from your past order history for chronic medications only. They are estimates based on your average refill interval and do not constitute medical advice.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
