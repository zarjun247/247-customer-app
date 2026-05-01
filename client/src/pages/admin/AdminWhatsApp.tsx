/**
 * PART 10: /admin/whatsapp
 * Tabs: Overview | Messages | Linked Customers | Handoffs | Templates
 */
import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  MessageSquare,
  Link2,
  Users,
  AlertTriangle,
  FileText,
  ShoppingCart,
  CheckCircle,
  Clock,
  RefreshCw,
  Plus,
  Search,
  Phone,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open: "bg-red-100 text-red-700",
    assigned: "bg-yellow-100 text-yellow-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-600",
    active: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-600",
    abandoned: "bg-gray-100 text-gray-600",
    received: "bg-blue-100 text-blue-700",
    sent: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    read: "bg-purple-100 text-purple-700",
    failed: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: stats } = trpc.whatsappFull.admin.stats.useQuery();
  const { data: recentOrders } = trpc.whatsappFull.admin.recentOrders.useQuery({ limit: 10 });

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Link2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.linkedCustomers ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Linked Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.openHandoffs ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Open Handoffs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalWaOrders ?? "—"}</p>
                <p className="text-sm text-muted-foreground">WA Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalMessages ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent WA orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent WhatsApp Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No WhatsApp orders yet
                  </TableCell>
                </TableRow>
              )}
              {recentOrders?.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono">#{o.id}</TableCell>
                  <TableCell>{o.customerName ?? "—"}</TableCell>
                  <TableCell>{o.customerPhone ?? "—"}</TableCell>
                  <TableCell>{statusBadge(o.status)}</TableCell>
                  <TableCell>₹{o.total}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

function MessagesTab() {
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound" | "all">("all");
  const [page, setPage] = useState(1);

  const { data, refetch } = trpc.whatsappFull.message.list.useQuery({
    phone: phone || undefined,
    direction,
    page,
    limit: 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by phone..."
            className="pl-9 w-48"
            value={phone}
            onChange={e => { setPhone(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={direction} onValueChange={v => { setDirection(v as any); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground self-center">
          {data?.total ?? 0} messages
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Body</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No messages found
                  </TableCell>
                </TableRow>
              )}
              {data?.rows?.map(m => (
                <TableRow key={m.id.toString()}>
                  <TableCell className="font-mono text-sm">{m.phone}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.direction === "inbound" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {m.direction}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{m.messageType}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.flow ?? "—"}</TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm truncate">{m.body ?? m.mediaUrl ?? "—"}</p>
                  </TableCell>
                  <TableCell>{statusBadge(m.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(m.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
          Previous
        </Button>
        <span className="text-sm self-center">Page {page}</span>
        <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── Linked Customers Tab ─────────────────────────────────────────────────────

function LinkedCustomersTab() {
  const [search, setSearch] = useState("");
  const [linkPhone, setLinkPhone] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const { data, refetch } = trpc.whatsappFull.link.list.useQuery({
    search: search || undefined,
    page: 1,
    limit: 50,
  });

  const createLink = trpc.whatsappFull.link.create.useMutation({
    onSuccess: () => {
      toast.success("Phone linked successfully");
      setLinkDialogOpen(false);
      setLinkPhone("");
      setLinkUserId("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeLink = trpc.whatsappFull.link.remove.useMutation({
    onSuccess: () => { toast.success("Link removed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search phone..."
            className="pl-9 w-48"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Link Phone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link WhatsApp Phone to Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>WhatsApp Phone</Label>
                <Input
                  placeholder="+91XXXXXXXXXX"
                  value={linkPhone}
                  onChange={e => setLinkPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Customer User ID</Label>
                <Input
                  placeholder="e.g. 42"
                  value={linkUserId}
                  onChange={e => setLinkUserId(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Staff override: links the phone to the given customer ID. The customer will be able to check their orders and place orders via WhatsApp.
              </p>
              <Button
                className="w-full"
                disabled={!linkPhone || !linkUserId || createLink.isPending}
                onClick={() => createLink.mutate({
                  phone: linkPhone,
                  userId: parseInt(linkUserId),
                  method: "staff_override",
                })}
              >
                {createLink.isPending ? "Linking..." : "Link Phone"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WhatsApp Phone</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>App Phone</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Verified At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No linked phones yet
                  </TableCell>
                </TableRow>
              )}
              {data?.rows?.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.phone}</TableCell>
                  <TableCell>{r.userName ?? `User #${r.userId}`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.userPhone ?? "—"}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                      {r.verificationMethod}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.verifiedAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeLink.mutate({ phone: r.phone })}
                    >
                      Unlink
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Handoffs Tab ─────────────────────────────────────────────────────────────

function HandoffsTab() {
  const [statusFilter, setStatusFilter] = useState<"open" | "assigned" | "resolved" | "closed" | "all">("open");
  const [resolveDialogId, setResolveDialogId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const { data, refetch } = trpc.whatsappFull.handoff.list.useQuery({
    status: statusFilter,
    page: 1,
    limit: 50,
  });

  const assignHandoff = trpc.whatsappFull.handoff.assign.useMutation({
    onSuccess: () => { toast.success("Handoff assigned"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resolveHandoff = trpc.whatsappFull.handoff.resolve.useMutation({
    onSuccess: () => {
      toast.success("Handoff resolved");
      setResolveDialogId(null);
      setResolveNote("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const priorityColor: Record<string, string> = {
    low: "bg-gray-100 text-gray-600",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} handoffs</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No handoffs in this status
                  </TableCell>
                </TableRow>
              )}
              {data?.rows?.map(h => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-sm">#{h.id}</TableCell>
                  <TableCell className="font-mono text-sm">{h.phone}</TableCell>
                  <TableCell>{h.customerName ?? (h.userId != null ? `User #${h.userId}` : "—")}</TableCell>
                  <TableCell>
                    <span className="text-sm">{h.reason.replace(/_/g, " ")}</span>
                    {h.reasonNote && (
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">{h.reasonNote}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[h.priority] ?? ""}`}>
                      {h.priority}
                    </span>
                  </TableCell>
                  <TableCell>{statusBadge(h.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(h.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(h.status === "open") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => assignHandoff.mutate({ id: h.id, staffId: 1 })}
                        >
                          Assign
                        </Button>
                      )}
                      {(h.status === "open" || h.status === "assigned") && (
                        <Dialog open={resolveDialogId === h.id} onOpenChange={open => { if (!open) setResolveDialogId(null); }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-700"
                              onClick={() => setResolveDialogId(h.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Resolve Handoff #{h.id}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 pt-2">
                              <Label>Resolution Note (optional)</Label>
                              <Textarea
                                placeholder="What was done to resolve this..."
                                value={resolveNote}
                                onChange={e => setResolveNote(e.target.value)}
                              />
                              <Button
                                className="w-full"
                                onClick={() => resolveHandoff.mutate({ id: h.id, resolutionNote: resolveNote || undefined })}
                                disabled={resolveHandoff.isPending}
                              >
                                {resolveHandoff.isPending ? "Resolving..." : "Mark Resolved"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "order_status" as any,
    body: "",
    headerText: "",
    footerText: "",
    paramCount: 0,
  });
  const { data: templates, refetch } = trpc.whatsappFull.template.list.useQuery({});

  const seedTemplates = trpc.whatsappFull.template.seed.useMutation({
    onSuccess: (r) => {
      toast.success(`Seeded ${r.created} default templates`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const createTemplate = trpc.whatsappFull.template.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      setCreateOpen(false);
      setForm({ name: "", category: "order_status", body: "", headerText: "", footerText: "", paramCount: 0 });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTemplate = trpc.whatsappFull.template.update.useMutation({
    onSuccess: () => { toast.success("Template updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const categories = [
    "order_status", "refill_reminder", "rx_received", "delivery_otp",
    "bill_share", "staff_handoff", "delivery_exception", "welcome", "supplier_bill", "custom",
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => seedTemplates.mutate()} disabled={seedTemplates.isPending}>
            {seedTemplates.isPending ? "Seeding..." : "Seed Default Templates"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create WABA Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g. order_confirmed_v2"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Header Text (optional)</Label>
                <Input
                  placeholder="Bold header line"
                  value={form.headerText}
                  onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))}
                />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea
                  placeholder="Template body. Use {{1}}, {{2}} for variables."
                  rows={4}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                />
              </div>
              <div>
                <Label>Footer Text (optional)</Label>
                <Input
                  placeholder="Small footer text"
                  value={form.footerText}
                  onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))}
                />
              </div>
              <div>
                <Label>Parameter Count</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={form.paramCount}
                  onChange={e => setForm(f => ({ ...f, paramCount: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <Button
                className="w-full"
                disabled={!form.name || !form.body || createTemplate.isPending}
                onClick={() => createTemplate.mutate({
                  name: form.name,
                  category: form.category,
                  body: form.body,
                  headerText: form.headerText || undefined,
                  footerText: form.footerText || undefined,
                  paramCount: form.paramCount,
                })}
              >
                {createTemplate.isPending ? "Creating..." : "Create Template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No templates yet. Click "Seed Default Templates" to add the standard set.</p>
            </CardContent>
          </Card>
        )}
        {templates?.map(t => (
          <Card key={t.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{t.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                      {t.category.replace(/_/g, " ")}
                    </span>
                    {statusBadge(t.wabaStatus)}
                    {!t.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">inactive</span>
                    )}
                  </div>
                  {t.headerText && (
                    <p className="text-sm font-semibold mt-2">{t.headerText}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{t.body}</p>
                  {t.footerText && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{t.footerText}</p>
                  )}
                  {t.paramCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{t.paramCount} variable(s)</p>
                  )}
                  {t.wabaTemplateId && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">WABA ID: {t.wabaTemplateId}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {t.wabaStatus === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateTemplate.mutate({ id: t.id, wabaStatus: "pending" })}
                    >
                      Submit
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateTemplate.mutate({ id: t.id, isActive: !t.isActive })}
                  >
                    {t.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab() {
  const { data: sessions, refetch } = trpc.whatsappFull.admin.sessions.useQuery({ limit: 50 });

  const flowColor: Record<string, string> = {
    menu: "bg-gray-100 text-gray-600",
    search: "bg-blue-100 text-blue-700",
    search_results: "bg-blue-100 text-blue-700",
    status: "bg-purple-100 text-purple-700",
    rx_upload: "bg-orange-100 text-orange-700",
    reorder: "bg-green-100 text-green-700",
    handoff: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Active bot sessions (last 50 by activity)</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Current Flow</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No active sessions
                  </TableCell>
                </TableRow>
              )}
              {sessions?.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.phone}</TableCell>
                  <TableCell>{s.customerName ?? (s.userId ? `User #${s.userId}` : "Unlinked")}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${flowColor[s.currentFlow ?? "menu"] ?? "bg-gray-100 text-gray-600"}`}>
                      {s.currentFlow ?? "menu"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(s.lastMessageAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminWhatsApp() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            WhatsApp Channel
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Full WhatsApp channel management — messages, linked customers, handoffs, and templates.
            All orders placed via WhatsApp use the same order engine as the app and counter.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="linked">Linked Customers</TabsTrigger>
            <TabsTrigger value="handoffs">Handoffs</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <MessagesTab />
          </TabsContent>
          <TabsContent value="linked" className="mt-4">
            <LinkedCustomersTab />
          </TabsContent>
          <TabsContent value="handoffs" className="mt-4">
            <HandoffsTab />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="sessions" className="mt-4">
            <SessionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
