/**
 * GstExport.tsx
 * GST/Tally-compatible CSV export for order lines.
 * Includes HSN codes, GST rates, taxable values, and GST amounts.
 * Access: store_manager | admin
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Download, FileSpreadsheet, Calendar, ShieldCheck,
  CheckCircle2, AlertCircle,
} from "lucide-react";

function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GstExport() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [fromDate, setFromDate] = useState(formatDateForInput(firstOfMonth));
  const [toDate, setToDate] = useState(formatDateForInput(today));
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, refetch } = trpc.payment.exportGst.useQuery(
    { fromDate, toDate },
    { enabled: enabled && !!user && (user.role === "store_manager" || user.role === "admin") }
  );

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

  const handleGenerate = () => {
    if (!fromDate || !toDate) { toast.error("Please select a date range."); return; }
    if (new Date(fromDate) > new Date(toDate)) { toast.error("From date must be before to date."); return; }
    setEnabled(true);
    refetch();
  };

  const handleDownload = () => {
    if (!data?.csv) { toast.error("No data to download. Generate the report first."); return; }
    const filename = `gst-export-${fromDate}-to-${toDate}.csv`;
    downloadCsv(data.csv, filename);
    toast.success(`Downloaded ${data.rowCount} rows.`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/pharmacy-os")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              <div>
                <h1 className="font-semibold text-sm">GST / Tally Export</h1>
                <p className="text-xs text-muted-foreground">Order lines with HSN codes and GST breakdown</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Date range selector */}
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Select Date Range
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">From date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={e => { setFromDate(e.target.value); setEnabled(false); }}
                  className="mt-1 h-9 text-sm bg-background/60"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={e => { setToDate(e.target.value); setEnabled(false); }}
                  className="mt-1 h-9 text-sm bg-background/60"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleGenerate} disabled={isLoading} className="flex-1 h-9 text-sm gap-2">
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                ) : (
                  <><FileSpreadsheet className="h-4 w-4" />Generate report</>
                )}
              </Button>
              {data && (
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="h-9 text-sm gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {data && (
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Report Ready
                </CardTitle>
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40">
                  {data.rowCount} line items
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Period: <strong className="text-foreground">{data.fromDate}</strong> to <strong className="text-foreground">{data.toDate}</strong>
              </p>
              <div className="rounded-lg bg-background/60 border border-border/30 p-3 overflow-x-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre font-mono leading-relaxed max-h-48 overflow-y-auto">
                  {data.csv.split("\n").slice(0, 8).join("\n")}
                  {data.csv.split("\n").length > 8 ? `\n… and ${data.csv.split("\n").length - 8} more rows` : ""}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                Columns: Order ID, Date, Product, HSN Code, GST Rate, Qty, Unit Price, Line Total, GST Amount, Taxable Value
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">About this export</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>• <strong className="text-foreground">HSN codes</strong> are pulled from the product master (default: 30049099 for medicines)</li>
              <li>• <strong className="text-foreground">GST amounts</strong> are back-calculated from the inclusive MRP using the product GST rate</li>
              <li>• Compatible with <strong className="text-foreground">Tally Prime</strong> CSV import and <strong className="text-foreground">GSTN offline tool</strong></li>
              <li>• All amounts in INR; dates in DD/MM/YY format</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
