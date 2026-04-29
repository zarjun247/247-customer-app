import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const MOVEMENT_TYPES = [
  "purchase_inward", "sale_reserve", "sale_fulfil", "cancellation_release",
  "sale_return", "purchase_return", "stock_adjustment", "stock_transfer",
  "batch_transfer", "quarantine", "disposal", "audit_correction",
];

const MOVEMENT_COLORS: Record<string, string> = {
  purchase_inward: "bg-green-100 text-green-800",
  sale_fulfil: "bg-blue-100 text-blue-800",
  sale_reserve: "bg-sky-100 text-sky-800",
  cancellation_release: "bg-teal-100 text-teal-800",
  sale_return: "bg-purple-100 text-purple-800",
  purchase_return: "bg-orange-100 text-orange-800",
  stock_adjustment: "bg-yellow-100 text-yellow-800",
  stock_transfer: "bg-indigo-100 text-indigo-800",
  batch_transfer: "bg-violet-100 text-violet-800",
  quarantine: "bg-red-100 text-red-800",
  disposal: "bg-gray-100 text-gray-800",
  audit_correction: "bg-pink-100 text-pink-800",
};

export default function AdminStockMovements() {
  const [page, setPage] = useState(1);
  const [storeId, setStoreId] = useState<number | undefined>();
  const [movementType, setMovementType] = useState<string | undefined>();

  const { data, isLoading, refetch } = trpc.inventoryLedger.stock.movements.useQuery(
    { page, pageSize: 100, storeId, movementType },
    { placeholderData: (prev: any) => prev }
  );
  const { data: storeList } = trpc.masterData.stores.list.useQuery({ limit: 100 });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Movements</h1>
            <p className="text-muted-foreground text-sm">Immutable ledger of all stock changes</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Select value={storeId ? String(storeId) : "all"} onValueChange={v => { setStoreId(v === "all" ? undefined : Number(v)); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Stores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {storeList?.rows?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={movementType ?? "all"} onValueChange={v => { setMovementType(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MOVEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Batch No</TableHead>
                  <TableHead className="text-right">Qty Change</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !data?.rows?.length ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No movements found</TableCell></TableRow>
                ) : data.rows.map((row: any) => {
                  const m = row.movement;
                  const isIncrease = m.qty > 0;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground text-xs">#{m.id}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${MOVEMENT_COLORS[m.movementType] ?? "bg-gray-100 text-gray-800"}`}>
                          {m.movementType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.productName ?? `#${m.batchId}`}</TableCell>
                      <TableCell>{row.storeName ?? `#${m.storeId}`}</TableCell>
                      <TableCell className="font-mono text-xs">{row.batchNo ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${isIncrease ? "text-green-600" : "text-red-600"}`}>
                          {isIncrease ? "+" : ""}{m.qty}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{m.qtyBefore}</TableCell>
                      <TableCell className="text-right font-medium">{m.qtyAfter}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.referenceType ? `${m.referenceType} #${m.referenceId}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate" title={m.reason}>{m.reason ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} · {data?.total ?? 0} total movements</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 100} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
