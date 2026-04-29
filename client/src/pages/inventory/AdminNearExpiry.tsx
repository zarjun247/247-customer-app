import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCw, Clock } from "lucide-react";

const BUCKET_COLORS: Record<string, string> = {
  normal: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  critical: "bg-orange-100 text-orange-800",
  quarantine_candidate: "bg-red-100 text-red-800",
  expired: "bg-gray-200 text-gray-700",
};

export default function AdminNearExpiry() {
  const [storeId, setStoreId] = useState<number | undefined>();
  const [days, setDays] = useState(90);
  const [activeBucket, setActiveBucket] = useState<string>("all");

  const { data, isLoading, refetch } = trpc.inventoryLedger.stock.nearExpiry.useQuery({ storeId, days });
  const { data: storeList } = trpc.masterData.stores.list.useQuery({ limit: 100 });

  const buckets = data?.buckets ?? {};
  const displayRows = activeBucket === "all" ? (data?.rows ?? []) : (buckets[activeBucket] ?? []);

  const bucketSummary = [
    { key: "expired", label: "Expired", color: "bg-gray-100 border-gray-300 text-gray-700" },
    { key: "quarantine_candidate", label: "≤30 days", color: "bg-red-50 border-red-300 text-red-700" },
    { key: "critical", label: "31–60 days", color: "bg-orange-50 border-orange-300 text-orange-700" },
    { key: "warning", label: "61–90 days", color: "bg-yellow-50 border-yellow-300 text-yellow-700" },
    { key: "normal", label: ">90 days", color: "bg-green-50 border-green-300 text-green-700" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Near Expiry</h1>
            <p className="text-muted-foreground text-sm">Batches expiring within the selected horizon</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Select value={storeId ? String(storeId) : "all"} onValueChange={v => setStoreId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Stores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {storeList?.rows?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="60">Next 60 days</SelectItem>
              <SelectItem value="90">Next 90 days</SelectItem>
              <SelectItem value="180">Next 180 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bucket summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {bucketSummary.map(b => (
            <button key={b.key}
              className={`rounded-lg border p-3 text-left transition-all ${b.color} ${activeBucket === b.key ? "ring-2 ring-offset-1 ring-current" : "hover:opacity-80"}`}
              onClick={() => setActiveBucket(activeBucket === b.key ? "all" : b.key)}>
              <div className="text-2xl font-bold">{(buckets[b.key] ?? []).length}</div>
              <div className="text-xs font-medium mt-0.5">{b.label}</div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {activeBucket === "all" ? `All Batches (${data?.total ?? 0})` : `${bucketSummary.find(b => b.key === activeBucket)?.label} (${displayRows.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Batch No</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead>MRP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !displayRows.length ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No batches in this range</TableCell></TableRow>
                ) : displayRows.map((row: any) => {
                  const b = row.batch;
                  const expiry = new Date(b.expiryDate);
                  const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86400000);
                  return (
                    <TableRow key={b.id} className={daysLeft <= 0 ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{row.productName ?? `#${b.productId}`}</TableCell>
                      <TableCell>{row.storeName ?? `#${b.storeId}`}</TableCell>
                      <TableCell className="font-mono text-sm">{b.batchNo}</TableCell>
                      <TableCell>{expiry.toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className={daysLeft <= 0 ? "text-gray-500" : daysLeft <= 30 ? "text-red-600 font-bold" : daysLeft <= 60 ? "text-orange-600 font-medium" : daysLeft <= 90 ? "text-amber-600" : "text-green-600"}>
                          {daysLeft <= 0 ? "Expired" : `${daysLeft}d`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={BUCKET_COLORS[b.expiryBucket] ?? ""}>{b.expiryBucket.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{b.qtyOnHand}</TableCell>
                      <TableCell>₹{b.mrp}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
