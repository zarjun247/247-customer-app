import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Package, AlertTriangle } from "lucide-react";

export default function AdminCurrentStock() {
  const [page, setPage] = useState(1);
  const [storeId, setStoreId] = useState<number | undefined>();

  const { data, isLoading, refetch } = trpc.inventoryLedger.stock.currentStock.useQuery(
    { page, pageSize: 50, storeId },
    { placeholderData: (prev: any) => prev }
  );
  const { data: storeList } = trpc.masterData.stores.list.useQuery({ limit: 100 });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Current Stock</h1>
            <p className="text-muted-foreground text-sm">Aggregated on-hand quantities by product × store</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex gap-3">
          <Select
            value={storeId ? String(storeId) : "all"}
            onValueChange={v => { setStoreId(v === "all" ? undefined : Number(v)); setPage(1); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {storeList?.rows?.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Quarantined</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Batches</TableHead>
                  <TableHead>Earliest Expiry</TableHead>
                  <TableHead>MRP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !data?.rows?.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No stock data found</TableCell></TableRow>
                ) : data.rows.map((row: any, i: number) => {
                  const available = Number(row.availableQty);
                  const expiry = row.earliestExpiry ? new Date(row.earliestExpiry) : null;
                  const daysToExpiry = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86400000) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.productName ?? `Product #${row.productId}`}</TableCell>
                      <TableCell>{row.storeName ?? `Store #${row.storeId}`}</TableCell>
                      <TableCell className="text-right">{row.totalOnHand}</TableCell>
                      <TableCell className="text-right text-amber-600">{row.totalReserved}</TableCell>
                      <TableCell className="text-right text-orange-600">{row.totalQuarantined}</TableCell>
                      <TableCell className="text-right font-semibold">
                        <span className={available <= 0 ? "text-red-600" : available < 10 ? "text-amber-600" : "text-green-600"}>
                          {available}
                        </span>
                      </TableCell>
                      <TableCell>{row.batchCount}</TableCell>
                      <TableCell>
                        {expiry ? (
                          <span className={daysToExpiry !== null && daysToExpiry <= 30 ? "text-red-600 font-medium" : daysToExpiry !== null && daysToExpiry <= 60 ? "text-orange-600" : daysToExpiry !== null && daysToExpiry <= 90 ? "text-amber-600" : ""}>
                            {expiry.toLocaleDateString()}
                            {daysToExpiry !== null && daysToExpiry <= 90 && <span className="ml-1 text-xs">({daysToExpiry}d)</span>}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>₹{row.latestMrp}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{data?.rows?.length ?? 0} products shown</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
