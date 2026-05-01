import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Search, RefreshCw, Calendar, Pill, Heart, FileText,
  ShieldCheck, Eye, AlertCircle, Clock, User, Phone, Mail,
  ChevronLeft, ChevronRight, Activity
} from "lucide-react";
import { toast } from "sonner";

// ─── Customer List ────────────────────────────────────────────────────────────

function CustomerList({ onSelectCustomer }: { onSelectCustomer: (id: number, name: string) => void }) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.customerMedicine.admin.list.useQuery({
    search: search || undefined,
    page,
    limit,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch}>Search</Button>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading customers…
                  </TableCell>
                </TableRow>
              ) : !data?.rows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No customers found
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map(c => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {c.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium">{c.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectCustomer(c.id, c.name ?? `Customer #${c.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View Profile
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} ({data?.total ?? 0} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Refill Dashboard ─────────────────────────────────────────────────────────

function RefillDashboard() {
  const [view, setView] = useState<"due_this_week" | "missed" | "needs_fresh_rx">("due_this_week");

  const { data, isLoading } = trpc.customerMedicine.admin.refillDashboard.useQuery({ view });

  const viewLabels = {
    due_this_week: "Due This Week",
    missed: "Missed / Overdue",
    needs_fresh_rx: "Needs Fresh Rx",
  };

  const viewColors = {
    due_this_week: "text-amber-400",
    missed: "text-red-400",
    needs_fresh_rx: "text-purple-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["due_this_week", "missed", "needs_fresh_rx"] as const).map(v => (
          <Button
            key={v}
            variant={view === v ? "default" : "outline"}
            size="sm"
            onClick={() => setView(v)}
          >
            {viewLabels[v]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className={`text-base flex items-center gap-2 ${viewColors[view]}`}>
            <Calendar className="h-4 w-4" />
            {viewLabels[view]}
            {data && (
              <Badge variant="secondary" className="ml-auto">
                {data.rows.length} patients
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Qty</TableHead>
                {view === "needs_fresh_rx" && <TableHead>Rx Expiry</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !data?.rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map(r => (
                  <TableRow key={r.planId}>
                    <TableCell className="font-medium">{r.customerName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerPhone ?? "—"}</TableCell>
                    <TableCell>{r.productName ?? `Product #${r.productId}`}</TableCell>
                    <TableCell>
                      <span className={view === "missed" ? "text-red-400 font-medium" : ""}>
                        {r.nextDueDate ? new Date(r.nextDueDate).toLocaleDateString() : "—"}
                      </span>
                    </TableCell>
                    <TableCell>{r.qty}</TableCell>
                    {view === "needs_fresh_rx" && (
                      <TableCell className="text-amber-400 text-sm">
                        {r.prescriptionExpiryDate ? new Date(r.prescriptionExpiryDate).toLocaleDateString() : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Customer Profile Dialog ──────────────────────────────────────────────────

function CustomerProfileDialog({
  userId,
  customerName,
  open,
  onClose,
}: {
  userId: number;
  customerName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.customerMedicine.admin.getProfile.useQuery(
    { userId },
    { enabled: open }
  );

  const { data: accessLogData } = trpc.customerMedicine.admin.accessLog.useQuery(
    { targetUserId: userId },
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {customerName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading profile…</div>
        ) : !data ? (
          <div className="py-12 text-center text-muted-foreground">Customer not found</div>
        ) : (
          <Tabs defaultValue="medicines" className="mt-2">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="medicines">
                <Pill className="h-3.5 w-3.5 mr-1" />
                Medicines
              </TabsTrigger>
              <TabsTrigger value="refills">
                <Calendar className="h-3.5 w-3.5 mr-1" />
                Refill Plans
              </TabsTrigger>
              <TabsTrigger value="family">
                <Heart className="h-3.5 w-3.5 mr-1" />
                Family
              </TabsTrigger>
              <TabsTrigger value="consents">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Consents
              </TabsTrigger>
              <TabsTrigger value="audit">
                <Activity className="h-3.5 w-3.5 mr-1" />
                Access Log
              </TabsTrigger>
            </TabsList>

            {/* Medicine History */}
            <TabsContent value="medicines" className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-xs">
                  {data.medicineHistory.length} records
                </Badge>
                <span className="text-xs text-muted-foreground">Rx medicines are pharmacist-reviewed</span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Chronic</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.medicineHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No medicine records
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.medicineHistory.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.productName ?? `Product #${m.productId}`}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {m.purchaseType?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.qty}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.purchaseDate ? new Date(m.purchaseDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          {m.isChronicFlag ? (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Chronic</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {m.discontinued ? (
                            <Badge variant="destructive" className="text-xs">Discontinued</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {/* Refill Plans */}
            <TabsContent value="refills" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fresh Rx?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.activePlans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No active refill plans
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.activePlans.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.productName ?? `Product #${p.productId}`}</TableCell>
                        <TableCell>Every {p.frequencyDays}d</TableCell>
                        <TableCell>{p.qty}</TableCell>
                        <TableCell>
                          {p.nextDueDate ? (
                            <span className={new Date(p.nextDueDate) < new Date() ? "text-red-400 font-medium" : ""}>
                              {new Date(p.nextDueDate).toLocaleDateString()}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              p.status === "active"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs"
                                : "bg-muted text-muted-foreground text-xs"
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.needsFreshRx ? (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Required
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {/* Family Members */}
            <TabsContent value="family" className="mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.family.length === 0 ? (
                  <p className="text-muted-foreground text-sm col-span-2 py-6 text-center">
                    No family members added
                  </p>
                ) : (
                  data.family.map(f => (
                    <Card key={f.id} className="border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                            {f.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{f.relation ?? "—"}</p>
                            {f.dateOfBirth && (
                              <p className="text-xs text-muted-foreground">
                                DOB: {new Date(f.dateOfBirth).toLocaleDateString()}
                              </p>
                            )}
                            {f.bloodGroup && (
                              <Badge variant="outline" className="text-xs mt-1">{f.bloodGroup}</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Consents */}
            <TabsContent value="consents" className="mt-4">
              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <p className="text-xs text-muted-foreground">
                  Customer consents are required before storing medicine records (HIPAA-style data governance).
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Consent Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Granted At</TableHead>
                    <TableHead>Revoked At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.consents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No consent records
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.consents.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-sm capitalize">
                          {c.consentType?.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          {c.granted ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Granted</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Revoked</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.grantedAt ? new Date(c.grantedAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.revokedAt ? new Date(c.revokedAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {/* Access Log */}
            <TabsContent value="audit" className="mt-4">
              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <Activity className="h-4 w-4 text-blue-400" />
                <p className="text-xs text-muted-foreground">
                  Every access to this customer's medicine records is logged for audit compliance.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Accessed By</TableHead>
                    <TableHead>Access Type</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!accessLogData?.rows.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No access log entries
                      </TableCell>
                    </TableRow>
                  ) : (
                    accessLogData.rows.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.accessorName ?? `User #${log.accessedBy}`}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {log.accessType?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.purpose ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCustomers() {
  const [activeTab, setActiveTab] = useState<"list" | "refills">("list");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Customer Medicine Records
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              HIPAA-style medicine history, refill plans, family profiles, and consent management
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "list" | "refills")}>
          <TabsList>
            <TabsTrigger value="list">
              <Users className="h-4 w-4 mr-1.5" />
              Customer List
            </TabsTrigger>
            <TabsTrigger value="refills">
              <Calendar className="h-4 w-4 mr-1.5" />
              Refill Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <CustomerList onSelectCustomer={(id, name) => setSelectedCustomer({ id, name })} />
          </TabsContent>

          <TabsContent value="refills" className="mt-4">
            <RefillDashboard />
          </TabsContent>
        </Tabs>
      </div>

      {/* Customer Profile Dialog */}
      {selectedCustomer && (
        <CustomerProfileDialog
          userId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          open={!!selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </AdminLayout>
  );
}
