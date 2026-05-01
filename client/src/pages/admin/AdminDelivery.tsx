import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Truck, User, MapPin, Clock, AlertTriangle, CheckCircle,
  Package, DollarSign, RefreshCw, Plus, Activity, Route
} from "lucide-react";

// ─── Status badge helpers ─────────────────────────────────────────────────────

function taskStatusBadge(status: string) {
  const map: Record<string, string> = {
    assigned: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    pickup_confirmed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    out_for_delivery: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    delivered: "bg-green-500/20 text-green-400 border-green-500/30",
    failed_attempt: "bg-red-500/20 text-red-400 border-red-500/30",
    returned: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  return map[status] ?? "bg-zinc-500/20 text-zinc-400";
}

function riderStatusBadge(status: string) {
  const map: Record<string, string> = {
    available: "bg-green-500/20 text-green-400",
    on_delivery: "bg-yellow-500/20 text-yellow-400",
    offline: "bg-zinc-500/20 text-zinc-400",
  };
  return map[status] ?? "bg-zinc-500/20 text-zinc-400";
}

function resolutionBadge(path: string) {
  const map: Record<string, string> = {
    primary_assignment: "bg-green-500/20 text-green-400",
    geo_nearest: "bg-blue-500/20 text-blue-400",
    geo_nearest_with_stock: "bg-blue-500/20 text-blue-400",
    pincode_fallback: "bg-yellow-500/20 text-yellow-400",
    manual_override: "bg-purple-500/20 text-purple-400",
    no_store_found: "bg-red-500/20 text-red-400",
  };
  return map[path] ?? "bg-zinc-500/20 text-zinc-400";
}

function fmt(ts: any) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

// ─── Overview stats ───────────────────────────────────────────────────────────

function DeliveryOverview() {
  const { data: stats } = trpc.delivery.task.stats.useQuery({ days: 7 });
  const { data: slaBreaches } = trpc.delivery.sla.list.useQuery({ breached: true, limit: 5 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats?.total ?? 0}</p>
                <p className="text-xs text-zinc-400">Total Tasks (7d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats?.delivered ?? 0}</p>
                <p className="text-xs text-zinc-400">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats?.failed ?? 0}</p>
                <p className="text-xs text-zinc-400">Failed Attempts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats?.codPending ?? 0}</p>
                <p className="text-xs text-zinc-400">COD Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent SLA Breaches */}
      {(slaBreaches?.length ?? 0) > 0 && (
        <Card className="bg-zinc-900 border-red-900/40">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4" /> Recent SLA Breaches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slaBreaches?.map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm border-b border-zinc-800 pb-2">
                  <span className="text-zinc-300">Order #{e.orderId}</span>
                  <span className="text-zinc-500">Deadline: {fmt(e.slaDeadline)}</span>
                  <span className="text-red-400">Breached</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Delivery Tasks tab ───────────────────────────────────────────────────────

function DeliveryTasksTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [codPending, setCodPending] = useState(false);
  

  const { data: tasks, refetch } = trpc.delivery.task.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter as any,
    codPending: codPending || undefined,
    limit: 100,
  });

  const confirmPickup = trpc.delivery.task.confirmPickup.useMutation({
    onSuccess: () => { toast("Pickup confirmed"); refetch(); },
  });
  const outForDelivery = trpc.delivery.task.outForDelivery.useMutation({
    onSuccess: () => { toast("Marked out for delivery"); refetch(); },
  });
  const reconcileCod = trpc.delivery.task.reconcileCod.useMutation({
    onSuccess: () => { toast("COD reconciled"); refetch(); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="pickup_confirmed">Pickup Confirmed</SelectItem>
            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed_attempt">Failed Attempt</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={codPending} onChange={e => setCodPending(e.target.checked)} className="rounded" />
          COD Pending Only
        </label>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {tasks?.length === 0 && (
          <div className="text-center py-12 text-zinc-500">No delivery tasks found</div>
        )}
        {tasks?.map(task => (
          <Card key={task.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">Order #{task.orderId}</span>
                    <Badge className={`text-xs border ${taskStatusBadge(task.status)}`}>
                      {task.status.replace(/_/g, " ")}
                    </Badge>
                    {task.isCod && (
                      <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        COD ₹{task.codAmount}
                      </Badge>
                    )}
                    {task.slaBreached && (
                      <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
                        SLA Breached
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-4">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Rider #{task.riderId}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Assigned {fmt(task.assignedAt)}</span>
                    {task.deliveredAt && <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-3 h-3" /> {fmt(task.deliveredAt)}</span>}
                  </div>
                  {task.failedReason && (
                    <div className="text-xs text-red-400">Failed: {task.failedReason.replace(/_/g, " ")} — {task.failedNote}</div>
                  )}
                  {task.isCod && task.codCollectedAmount && !task.codReconciled && (
                    <div className="text-xs text-yellow-400">COD collected: ₹{task.codCollectedAmount} — pending reconciliation</div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {task.status === "assigned" && (
                    <Button size="sm" variant="outline" onClick={() => confirmPickup.mutate({ taskId: task.id })}>
                      Confirm Pickup
                    </Button>
                  )}
                  {task.status === "pickup_confirmed" && (
                    <Button size="sm" variant="outline" onClick={() => outForDelivery.mutate({ taskId: task.id })}>
                      Out for Delivery
                    </Button>
                  )}
                  {task.isCod && task.codCollectedAmount && !task.codReconciled && (
                    <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-400"
                      onClick={() => reconcileCod.mutate({ taskId: task.id })}>
                      Reconcile COD
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Riders tab ───────────────────────────────────────────────────────────────

function RidersTab() {
  
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: riderList, refetch } = trpc.delivery.rider.list.useQuery({});

  const createRider = trpc.delivery.rider.create.useMutation({
    onSuccess: () => {
      toast("Rider added");
      setAddOpen(false);
      setName(""); setPhone("");
      refetch();
    },
  });

  const updateRider = trpc.delivery.rider.update.useMutation({
    onSuccess: () => { toast("Rider updated"); refetch(); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-zinc-400">{riderList?.length ?? 0} riders registered</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Rider</Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-700">
            <DialogHeader>
              <DialogTitle>Add New Rider</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-zinc-800 border-zinc-700" />
              </div>
              <Button onClick={() => createRider.mutate({ name, phone })} disabled={!name || !phone || createRider.isPending}>
                {createRider.isPending ? "Adding..." : "Add Rider"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {riderList?.map(rider => (
          <Card key={rider.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span className="text-white font-medium">{rider.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{rider.phone}</p>
                  {rider.lastLocationAt && (
                    <p className="text-xs text-zinc-600 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Last seen {fmt(rider.lastLocationAt)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={`text-xs ${riderStatusBadge(rider.status)}`}>
                    {rider.status.replace(/_/g, " ")}
                  </Badge>
                  <Select
                    value={rider.status}
                    onValueChange={val => updateRider.mutate({ id: rider.id, status: val as any })}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="on_delivery">On Delivery</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Routing Decisions tab ────────────────────────────────────────────────────

function RoutingDecisionsTab() {
  const { data: decisions } = trpc.delivery.routing.decisions.useQuery({ limit: 50 });

  return (
    <div className="space-y-2">
      {decisions?.length === 0 && (
        <div className="text-center py-12 text-zinc-500">No routing decisions logged yet</div>
      )}
      {decisions?.map(d => (
        <Card key={d.id} className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Route className="w-4 h-4 text-zinc-400" />
                  {d.orderId && <span className="text-white text-sm">Order #{d.orderId}</span>}
                  {d.buildingId && <span className="text-zinc-400 text-xs">Building #{d.buildingId}</span>}
                  <Badge className={`text-xs ${resolutionBadge(d.resolutionPath)}`}>
                    {d.resolutionPath.replace(/_/g, " ")}
                  </Badge>
                  {d.requiresColdChain && <Badge className="text-xs bg-cyan-500/20 text-cyan-400">Cold Chain</Badge>}
                  {d.requiresControlledDrug && <Badge className="text-xs bg-purple-500/20 text-purple-400">Controlled</Badge>}
                </div>
                <div className="text-xs text-zinc-500 flex items-center gap-4">
                  {d.resolvedStoreId && <span>→ Store #{d.resolvedStoreId}</span>}
                  {d.etaMins && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {d.etaMins} min ({d.etaSource})</span>}
                  <span>{fmt(d.createdAt)}</span>
                </div>
                {d.primaryStoreRejectedReason && (
                  <p className="text-xs text-red-400">Primary rejected: {d.primaryStoreRejectedReason}</p>
                )}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-zinc-400 text-xs">Steps</Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Routing Steps — Decision #{d.id}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {d.stepResults && JSON.parse(d.stepResults).map((step: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded ${step.passed ? "bg-green-500/10" : "bg-red-500/10"}`}>
                        {step.passed
                          ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                          : <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                        <div>
                          <span className="font-mono text-xs text-zinc-300">{step.step}</span>
                          {step.reason && <p className="text-xs text-zinc-500">{step.reason}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── SLA Events tab ───────────────────────────────────────────────────────────

function SlaEventsTab() {
  const [breachedOnly, setBreachedOnly] = useState(false);
  const { data: events, refetch } = trpc.delivery.sla.list.useQuery({ breached: breachedOnly || undefined, limit: 50 });
  const checkBreaches = trpc.delivery.sla.checkBreaches.useMutation({
    onSuccess: (d) => { refetch(); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={breachedOnly} onChange={e => setBreachedOnly(e.target.checked)} className="rounded" />
          Breached Only
        </label>
        <Button variant="outline" size="sm" onClick={() => checkBreaches.mutate()} disabled={checkBreaches.isPending}>
          <Activity className="w-4 h-4 mr-1" />
          {checkBreaches.isPending ? "Scanning..." : "Scan for Breaches"}
        </Button>
        {checkBreaches.data && (
          <span className="text-sm text-zinc-400">Found {checkBreaches.data.breachesFound} breach(es)</span>
        )}
      </div>

      <div className="space-y-2">
        {events?.length === 0 && (
          <div className="text-center py-12 text-zinc-500">No SLA events found</div>
        )}
        {events?.map(e => (
          <Card key={e.id} className={`border ${e.breached ? "bg-red-950/20 border-red-900/40" : "bg-zinc-900 border-zinc-800"}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm">Order #{e.orderId}</span>
                    {e.breached
                      ? <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">Breached</Badge>
                      : <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">On Track</Badge>}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-4">
                    <span>Promised: {e.promisedSlaMins} min</span>
                    <span>Deadline: {fmt(e.slaDeadline)}</span>
                    {e.deliveredAt && <span className="text-green-400">Delivered: {fmt(e.deliveredAt)}</span>}
                    {e.breachDetectedAt && <span className="text-red-400">Breach detected: {fmt(e.breachDetectedAt)}</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Store Capabilities tab ───────────────────────────────────────────────────

function StoreCapabilitiesTab() {
  
  const [storeId, setStoreId] = useState(1);
  const { data: cap, refetch } = trpc.delivery.routing.getStoreCapabilities.useQuery({ storeId });

  const upsert = trpc.delivery.routing.upsertStoreCapabilities.useMutation({
    onSuccess: () => { toast("Capabilities saved"); refetch(); },
  });

  const [form, setForm] = useState<any>({});
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Label>Store ID</Label>
        <Input
          type="number"
          value={storeId}
          onChange={e => setStoreId(Number(e.target.value))}
          className="bg-zinc-900 border-zinc-700 w-32"
        />
      </div>

      {cap && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-sm">Current Capabilities — Store #{storeId}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-zinc-400">Licence</div>
              <div className={cap.licenceActive ? "text-green-400" : "text-red-400"}>
                {cap.licenceActive ? "Active" : "Inactive"} {cap.licenceNumber ? `(${cap.licenceNumber})` : ""}
              </div>
              <div className="text-zinc-400">Service</div>
              <div className={cap.serviceActive ? "text-green-400" : "text-red-400"}>
                {cap.serviceActive ? "Active" : cap.serviceInactiveReason ?? "Inactive"}
              </div>
              <div className="text-zinc-400">Pharmacist</div>
              <div className={cap.pharmacistCoverage ? "text-green-400" : "text-red-400"}>
                {cap.pharmacistCoverage ? `On duty${cap.pharmacistName ? ` (${cap.pharmacistName})` : ""}` : "Not covered"}
              </div>
              <div className="text-zinc-400">Cold Chain</div>
              <div className={cap.coldChainCapable ? "text-cyan-400" : "text-zinc-500"}>
                {cap.coldChainCapable ? "Capable" : "Not capable"}
              </div>
              <div className="text-zinc-400">Controlled Drugs</div>
              <div className={cap.controlledDrugCapable ? "text-purple-400" : "text-zinc-500"}>
                {cap.controlledDrugCapable ? "Licensed" : "Not licensed"}
              </div>
              <div className="text-zinc-400">Rider Capacity</div>
              <div className="text-white">{cap.currentRiderCount}/{cap.maxRiderCapacity}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-sm">Update Capabilities</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.licenceActive ?? cap?.licenceActive ?? true}
                onChange={e => set("licenceActive", e.target.checked)} className="rounded" />
              Licence Active
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.serviceActive ?? cap?.serviceActive ?? true}
                onChange={e => set("serviceActive", e.target.checked)} className="rounded" />
              Service Active
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.pharmacistCoverage ?? cap?.pharmacistCoverage ?? true}
                onChange={e => set("pharmacistCoverage", e.target.checked)} className="rounded" />
              Pharmacist On Duty
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.coldChainCapable ?? cap?.coldChainCapable ?? false}
                onChange={e => set("coldChainCapable", e.target.checked)} className="rounded" />
              Cold Chain Capable
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={form.controlledDrugCapable ?? cap?.controlledDrugCapable ?? false}
                onChange={e => set("controlledDrugCapable", e.target.checked)} className="rounded" />
              Controlled Drug Licensed
            </label>
          </div>
          <div>
            <Label className="text-xs">Pharmacist Name</Label>
            <Input value={form.pharmacistName ?? cap?.pharmacistName ?? ""}
              onChange={e => set("pharmacistName", e.target.value)}
              className="bg-zinc-800 border-zinc-700 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Licence Number</Label>
            <Input value={form.licenceNumber ?? cap?.licenceNumber ?? ""}
              onChange={e => set("licenceNumber", e.target.value)}
              className="bg-zinc-800 border-zinc-700 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Max Rider Capacity</Label>
            <Input type="number" value={form.maxRiderCapacity ?? cap?.maxRiderCapacity ?? 5}
              onChange={e => set("maxRiderCapacity", Number(e.target.value))}
              className="bg-zinc-800 border-zinc-700 h-8 text-sm w-24" />
          </div>
          <Button size="sm" onClick={() => upsert.mutate({ storeId, ...form })} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save Capabilities"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDelivery() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Delivery & Routing</h1>
            <p className="text-sm text-zinc-400">Building-first node resolution, rider management, SLA tracking</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Delivery Tasks</TabsTrigger>
            <TabsTrigger value="riders">Riders</TabsTrigger>
            <TabsTrigger value="routing">Routing Decisions</TabsTrigger>
            <TabsTrigger value="sla">SLA Events</TabsTrigger>
            <TabsTrigger value="capabilities">Store Capabilities</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <DeliveryOverview />
          </TabsContent>
          <TabsContent value="tasks" className="mt-4">
            <DeliveryTasksTab />
          </TabsContent>
          <TabsContent value="riders" className="mt-4">
            <RidersTab />
          </TabsContent>
          <TabsContent value="routing" className="mt-4">
            <RoutingDecisionsTab />
          </TabsContent>
          <TabsContent value="sla" className="mt-4">
            <SlaEventsTab />
          </TabsContent>
          <TabsContent value="capabilities" className="mt-4">
            <StoreCapabilitiesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
