/**
 * MedivisionSync.tsx
 * Medivision ERP CSV stock sync UI.
 * Paste or upload a Medivision CSV export to batch-upsert products + store_skus.
 * Access: store_manager | admin
 */

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, RefreshCw, CheckCircle2, AlertTriangle,
  ShieldCheck, Database, Clock, FileText, Wifi,
} from "lucide-react";

const SAMPLE_CSV = `ItemCode,ItemName,Pack,Manufacturer,MRP,PurchaseRate,Category,HSNCode,GSTRate,StockQty
PCM500,Paracetamol 500mg,10 Tabs,Cipla,12.50,8.00,medicine,30049099,12,250
AMOX250,Amoxicillin 250mg,10 Caps,Sun Pharma,45.00,30.00,medicine,30041090,12,100
VITC500,Vitamin C 500mg,30 Tabs,Himalaya,85.00,55.00,nutrition,30049099,12,80
CETZ10,Cetirizine 10mg,10 Tabs,Mankind,18.00,12.00,medicine,30049099,12,150`;

export default function MedivisionSync() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("medivision-import.csv");
  const [lastResult, setLastResult] = useState<{
    rowsProcessed: number; rowsInserted: number; rowsUpdated: number;
    rowsSkipped: number; errorCount: number; firstErrors: string[];
  } | null>(null);

  const { data: syncLogs = [], refetch: refetchLogs } = trpc.medivision.syncStatus.useQuery(
    { limit: 10 },
    { enabled: !!user && (user.role === "store_manager" || user.role === "admin") }
  );

  const { data: health } = trpc.medivision.healthCheck.useQuery(
    undefined,
    { enabled: !!user && (user.role === "store_manager" || user.role === "admin") }
  );

  const importCsv = trpc.medivision.importCsv.useMutation({
    onSuccess: (result) => {
      setLastResult(result);
      refetchLogs();
      toast.success(`Import complete: ${result.rowsInserted} inserted, ${result.rowsUpdated} updated, ${result.rowsSkipped} skipped.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const ALLOWED_ROLES = ["store_manager", "admin"];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Store manager access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!csvText.trim()) { toast.error("Please paste or upload a CSV first."); return; }
    importCsv.mutate({ csvText, filename });
  };

  const statusColor = (status: string) => {
    if (status === "completed") return "text-emerald-400 border-emerald-500/40";
    if (status === "failed") return "text-red-400 border-red-500/40";
    return "text-amber-400 border-amber-500/40";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/pharmacy-os")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold text-sm">Medivision Stock Sync</h1>
                <p className="text-xs text-muted-foreground">CSV import → product catalog + store inventory</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {health && (
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40 gap-1">
                <Wifi className="h-3 w-3" /> Adapter ready
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: import form */}
        <div className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Import CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* File upload */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-sm gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {filename !== "medivision-import.csv" ? filename : "Upload CSV file"}
                </Button>
              </div>

              <div className="text-center text-xs text-muted-foreground">or paste CSV below</div>

              {/* CSV textarea */}
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`Paste Medivision CSV here…\n\nExpected columns:\nItemCode, ItemName, Pack, Manufacturer, MRP, PurchaseRate, Category, HSNCode, GSTRate, StockQty`}
                className="w-full h-48 text-xs font-mono bg-background/60 border border-border/40 rounded-md p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleImport}
                  disabled={importCsv.isPending || !csvText.trim()}
                  className="flex-1 h-9 text-sm gap-2"
                >
                  {importCsv.isPending ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing…</>
                  ) : (
                    <><Database className="h-4 w-4" />Run import</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => { setCsvText(SAMPLE_CSV); setFilename("sample.csv"); }}
                >
                  Sample
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Last result */}
          {lastResult && (
            <Card className={`border ${lastResult.errorCount === lastResult.rowsProcessed ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {lastResult.errorCount === lastResult.rowsProcessed ? (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-sm font-medium">Import result</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{lastResult.rowsProcessed}</p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{lastResult.rowsInserted}</p>
                    <p className="text-xs text-muted-foreground">Inserted</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-400">{lastResult.rowsUpdated}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-400">{lastResult.rowsSkipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>
                {lastResult.firstErrors.length > 0 && (
                  <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2">
                    <p className="text-xs font-medium text-red-400 mb-1">First errors:</p>
                    {lastResult.firstErrors.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{e}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Format guide */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-medium text-foreground">Expected CSV format</p>
              <p className="text-xs text-muted-foreground">
                Columns (case-insensitive, comma or tab delimited):
              </p>
              <div className="font-mono text-xs text-primary/80 bg-background/60 rounded p-2 overflow-x-auto whitespace-nowrap">
                ItemCode, ItemName, Pack, Manufacturer, MRP, PurchaseRate, Category, HSNCode, GSTRate, StockQty
              </div>
              <p className="text-xs text-muted-foreground">
                Missing columns are skipped gracefully. Category maps to: medicine, devices, baby, nutrition, fmcg, wellness.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: sync history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sync History</h2>
            <button onClick={() => refetchLogs()} className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {syncLogs.length === 0 ? (
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <FileText className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground text-center">No sync runs yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {syncLogs.map((log) => (
                <Card key={log.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-[180px]">{log.filename}</span>
                      <Badge variant="outline" className={`text-xs ${statusColor(log.status)}`}>
                        {log.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(log.startedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {log.rowsProcessed !== null && (
                        <span>{log.rowsProcessed} rows · {log.rowsInserted ?? 0} new · {log.rowsUpdated ?? 0} updated</span>
                      )}
                    </div>
                    {log.errors && (
                      <p className="text-xs text-red-400 mt-1 truncate">{log.errors.split("\n")[0]}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
