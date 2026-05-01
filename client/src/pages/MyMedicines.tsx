import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Pill, ChevronLeft, Search, Package, AlertCircle, ShieldCheck,
  Calendar, RefreshCw, ChevronRight, Activity, X
} from "lucide-react";
import { Link } from "wouter";

// ─── Monthly Medicine Pack ────────────────────────────────────────────────────

function MonthlyMedicinePack({ medicines }: { medicines: any[] }) {
  const chronicMeds = medicines.filter(m => m.isChronicFlag && !m.discontinued);

  if (chronicMeds.length === 0) {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="p-8 text-center">
          <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium text-muted-foreground">No chronic medicines yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Chronic medicines will appear here for easy monthly ordering
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <Package className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-400">Monthly Medicine Pack</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your chronic medicines bundled for convenient monthly ordering. Rx medicines require pharmacist review.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {chronicMeds.map(m => (
          <Card key={m.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Pill className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{m.productName ?? `Product #${m.productId}`}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">Last bought: {m.qty} units</span>
                    {m.purchaseDate && (
                      <span className="text-xs text-muted-foreground">
                        · {new Date(m.purchaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs shrink-0">
                  Chronic
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Rx medicines in your pack are pharmacist-reviewed before dispensing. Contact your pharmacist to place a monthly order.
        </p>
      </div>
    </div>
  );
}

// ─── Medicine History ─────────────────────────────────────────────────────────

function MedicineHistory() {
  const [page, setPage] = useState(1);
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const limit = 15;

  const { data, isLoading } = trpc.customerMedicine.medicineRecord.list.useQuery({
    discontinued: showDiscontinued ? true : false,
    page,
    limit,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const purchaseTypeColors: Record<string, string> = {
    prescribed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    otc: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    chronic_refill: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    counter: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    whatsapp: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={!showDiscontinued ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowDiscontinued(false); setPage(1); }}
        >
          Active
        </Button>
        <Button
          variant={showDiscontinued ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowDiscontinued(true); setPage(1); }}
        >
          Discontinued
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {data?.total ?? 0} records
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : !data?.rows.length ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="p-8 text-center">
            <Pill className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No medicine records</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Your medicine purchase history will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.rows.map(m => (
            <Card key={m.id} className={`border-border/50 ${m.discontinued ? "opacity-60" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Pill className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">
                        {m.productName ?? `Product #${m.productId}`}
                      </p>
                      {m.isChronicFlag && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs shrink-0">
                          Chronic
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        className={`text-xs ${purchaseTypeColors[m.purchaseType ?? "otc"] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {m.purchaseType?.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Qty: {m.qty}</span>
                      {m.doctorName && (
                        <span className="text-xs text-muted-foreground">Dr. {m.doctorName}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {m.purchaseDate ? new Date(m.purchaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                    </p>
                    {m.discontinued && (
                      <Badge variant="destructive" className="text-xs mt-0.5">Stopped</Badge>
                    )}
                  </div>
                </div>
                {m.discontinuedReason && (
                  <p className="text-xs text-muted-foreground mt-2 pl-12">
                    Reason: {m.discontinuedReason}
                  </p>
                )}
                {m.pharmacistNote && (
                  <div className="mt-2 pl-12 flex items-start gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">{m.pharmacistNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyMedicines() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"history" | "monthly_pack">("history");

  const { data: allMeds } = trpc.customerMedicine.medicineRecord.list.useQuery(
    { limit: 100 },
    { enabled: !!user && activeTab === "monthly_pack" }
  );

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
            <p className="font-medium mb-4">Please sign in to view your medicines</p>
            <Link href="/"><Button variant="outline" className="w-full">Go to Home</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              <Pill className="h-5 w-5 text-primary" />
              My Medicines
            </h1>
            <p className="text-xs text-muted-foreground">Medicine history and monthly pack</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1">
              <Activity className="h-3.5 w-3.5 mr-1" />
              History
            </TabsTrigger>
            <TabsTrigger value="monthly_pack" className="flex-1">
              <Package className="h-3.5 w-3.5 mr-1" />
              Monthly Pack
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-4">
            <MedicineHistory />
          </TabsContent>

          <TabsContent value="monthly_pack" className="mt-4">
            <MonthlyMedicinePack medicines={allMeds?.rows ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
