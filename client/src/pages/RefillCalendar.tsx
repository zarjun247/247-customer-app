import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Calendar, ChevronLeft, Clock, AlertCircle, CheckCircle2,
  Bell, BellOff, Pause, Play, Plus, RefreshCw, ShieldCheck
} from "lucide-react";
import { Link } from "wouter";

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DueBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
      Overdue by {Math.abs(days)}d
    </Badge>
  );
  if (days === 0) return (
    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Due Today</Badge>
  );
  if (days <= 3) return (
    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Due in {days}d</Badge>
  );
  if (days <= 7) return (
    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">Due in {days}d</Badge>
  );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">Due in {days}d</Badge>
  );
}

interface NewPlanForm {
  productId: string;
  frequencyDays: string;
  qty: string;
  startDate: string;
  whatsappReminder: boolean;
  appReminder: boolean;
}

export default function RefillCalendar() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"upcoming" | "all" | "missed">("upcoming");
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [form, setForm] = useState<NewPlanForm>({
    productId: "",
    frequencyDays: "30",
    qty: "1",
    startDate: new Date().toISOString().split("T")[0],
    whatsappReminder: true,
    appReminder: true,
  });

  const utils = trpc.useUtils();

  const { data: dashboardData, isLoading: dashLoading } = trpc.customerMedicine.refillPlan.dashboard.useQuery(
    {},
    { enabled: !!user }
  );

  const { data: allPlansData, isLoading: allLoading } = trpc.customerMedicine.refillPlan.list.useQuery(
    {},
    { enabled: !!user }
  );

  const updateMutation = trpc.customerMedicine.refillPlan.update.useMutation({
    onSuccess: () => {
      utils.customerMedicine.refillPlan.list.invalidate();
      utils.customerMedicine.refillPlan.dashboard.invalidate();
      toast.success("Refill plan updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.customerMedicine.refillPlan.create.useMutation({
    onSuccess: () => {
      utils.customerMedicine.refillPlan.list.invalidate();
      utils.customerMedicine.refillPlan.dashboard.invalidate();
      setNewPlanOpen(false);
      toast.success("Refill plan created");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTogglePause = (plan: any) => {
    updateMutation.mutate({
      id: plan.id,
      status: plan.status === "active" ? "paused" : "active",
    });
  };

  const handleCreatePlan = () => {
    if (!form.productId || !form.frequencyDays || !form.qty) {
      toast.error("Please fill all required fields");
      return;
    }
    createMutation.mutate({
      productId: parseInt(form.productId),
      frequencyDays: parseInt(form.frequencyDays),
      qty: parseInt(form.qty),
      startDate: form.startDate,
      whatsappReminder: form.whatsappReminder,
      appReminder: form.appReminder,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
            <p className="font-medium mb-4">Please sign in to view your refill calendar</p>
            <Link href="/"><Button variant="outline" className="w-full">Go to Home</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dueThisWeek = dashboardData?.dueThisWeek ?? [];
  const missed = dashboardData?.missed ?? [];
  const allPlans = allPlansData?.rows ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              Refill Calendar
            </h1>
            <p className="text-xs text-muted-foreground">Track and manage your medicine refills</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Due This Week</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{dueThisWeek.length}</p>
            </CardContent>
          </Card>
          <Card className={missed.length > 0 ? "border-red-500/20 bg-red-500/5" : "border-border/50"}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className={`h-4 w-4 ${missed.length > 0 ? "text-red-400" : "text-muted-foreground"}`} />
                <span className="text-xs text-muted-foreground">Missed / Overdue</span>
              </div>
              <p className={`text-2xl font-bold ${missed.length > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {missed.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Trust note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Rx medicines are pharmacist-reviewed before every refill. Reminders are a courtesy — your pharmacist will confirm before dispensing.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="upcoming" className="flex-1">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Due Soon
              {dueThisWeek.length > 0 && (
                <Badge className="ml-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-1.5 py-0">
                  {dueThisWeek.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="missed" className="flex-1">
              <AlertCircle className="h-3.5 w-3.5 mr-1" />
              Missed
              {missed.length > 0 && (
                <Badge className="ml-1.5 bg-red-500/20 text-red-400 border-red-500/30 text-xs px-1.5 py-0">
                  {missed.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1">
              <Calendar className="h-3.5 w-3.5 mr-1" />
              All Plans
            </TabsTrigger>
          </TabsList>

          {/* Due Soon */}
          <TabsContent value="upcoming" className="mt-4 space-y-3">
            {dashLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : dueThisWeek.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">All caught up!</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">No refills due in the next 7 days</p>
                </CardContent>
              </Card>
            ) : (
              dueThisWeek.map(plan => {
                const days = daysUntil(plan.nextDueDate);
                return (
                  <Card key={plan.id} className="border-border/50 hover:border-amber-500/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{plan.productName ?? `Product #${plan.productId}`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Qty: {plan.qty}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <DueBadge days={days} />
                            {plan.needsFreshRx && (
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Needs Fresh Rx
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Due</p>
                          <p className="text-sm font-medium">
                            {plan.nextDueDate ? new Date(plan.nextDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Missed */}
          <TabsContent value="missed" className="mt-4 space-y-3">
            {dashLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : missed.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">No missed refills</p>
                </CardContent>
              </Card>
            ) : (
              missed.map(plan => {
                const days = daysUntil(plan.nextDueDate);
                return (
                  <Card key={plan.id} className="border-red-500/20 bg-red-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{plan.productName ?? `Product #${plan.productId}`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Qty: {plan.qty}</p>
                          <div className="mt-2">
                            <DueBadge days={days} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Was due</p>
                          <p className="text-sm font-medium text-red-400">
                            {plan.nextDueDate ? new Date(plan.nextDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* All Plans */}
          <TabsContent value="all" className="mt-4 space-y-3">
            {allLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : allPlans.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="p-8 text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">No refill plans yet</p>
                  <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
                    Your pharmacist will set up refill plans for your chronic medicines
                  </p>
                </CardContent>
              </Card>
            ) : (
              allPlans.map(plan => {
                const days = daysUntil(plan.nextDueDate);
                return (
                  <Card key={plan.id} className={`border-border/50 ${plan.status === "paused" ? "opacity-60" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{plan.productName ?? `Product #${plan.productId}`}</p>
                            <Badge
                              className={
                                plan.status === "active"
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs"
                                  : "bg-muted text-muted-foreground text-xs"
                              }
                            >
                              {plan.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                            <span>Every {plan.frequencyDays} days</span>
                            <span>·</span>
                            <span>Qty: {plan.qty}</span>
                            {plan.whatsappReminder && (
                              <span className="flex items-center gap-0.5 text-emerald-400">
                                <Bell className="h-3 w-3" /> WhatsApp
                              </span>
                            )}
                          </div>
                          <div className="mt-2">
                            <DueBadge days={days} />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleTogglePause(plan)}
                          disabled={updateMutation.isPending}
                          title={plan.status === "active" ? "Pause plan" : "Resume plan"}
                        >
                          {plan.status === "active" ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Plan Dialog (simplified — pharmacist typically creates these) */}
      <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Refill Plan</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Your pharmacist will review and activate this refill plan after verifying your prescription.
          </p>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Product ID</Label>
              <Input
                placeholder="Enter product ID"
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequency (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.frequencyDays}
                  onChange={e => setForm(f => ({ ...f, frequencyDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Qty per refill</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">WhatsApp Reminders</Label>
              <Switch
                checked={form.whatsappReminder}
                onCheckedChange={v => setForm(f => ({ ...f, whatsappReminder: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">App Reminders</Label>
              <Switch
                checked={form.appReminder}
                onCheckedChange={v => setForm(f => ({ ...f, appReminder: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPlanOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePlan} disabled={createMutation.isPending}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
