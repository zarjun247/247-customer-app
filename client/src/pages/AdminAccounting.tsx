import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BookOpen, Download, IndianRupee, TrendingUp, TrendingDown, FileText, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminAccounting() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const { data: gst, isLoading: gstLoading } = trpc.payment.exportGst.useQuery(
    { fromDate: from, toDate: to },
    { enabled: true },
  );

  const handleDownloadGst = () => {
    if (!gst?.csv) return;
    const blob = new Blob([gst.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst_export_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Accounting</h1>
          <p className="text-sm text-zinc-500 mt-1">
            GST export, Tally integration, ledger entries
          </p>
        </div>

        {/* GST Export */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              GST / Tally Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">From date</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="bg-zinc-800 border-white/10 text-zinc-200 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">To date</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="bg-zinc-800 border-white/10 text-zinc-200 text-sm"
                />
              </div>
            </div>

            {gst && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-zinc-800/50 text-center">
                  <p className="text-lg font-semibold text-zinc-100">{gst.rowCount}</p>
                  <p className="text-xs text-zinc-500">Line Items</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 text-center">
                  <p className="text-lg font-semibold text-zinc-100">{gst.fromDate} – {gst.toDate}</p>
                  <p className="text-xs text-zinc-500">Date Range</p>
                </div>
              </div>
            )}

            <Button
              onClick={handleDownloadGst}
              disabled={gstLoading || !gst?.csv}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              {gstLoading ? "Generating…" : "Download GST CSV"}
            </Button>
          </CardContent>
        </Card>

        {/* Tally placeholder */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              Tally Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">
              Tally XML voucher export (sales, purchase, receipt/payment) is planned for the next pass.
              The GST CSV above is compatible with Tally Prime's manual import flow.
            </p>
            <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-[10px]">
              <AlertCircle className="w-2.5 h-2.5 mr-1" />
              Tally XML export — coming in next pass
            </Badge>
          </CardContent>
        </Card>

        {/* Ledger placeholder */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-400" />
              Ledger & Journal Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500">
              The <code className="text-zinc-400 bg-zinc-800 px-1 rounded">ledgers</code> and{" "}
              <code className="text-zinc-400 bg-zinc-800 px-1 rounded">ledger_entries</code> tables are in the schema.
              The ledger CRUD UI will be added in the next pass alongside shift closing reconciliation.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
