import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Users, Search, Phone, Mail, ShoppingBag, ClipboardList, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AdminCustomers() {
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = trpc.masterData.customers.list.useQuery(
    { search: search || undefined },
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Customers & Patients</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {customers.length} registered customers
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search by name, phone, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-white/10 text-zinc-200"
          />
        </div>

        {/* Customer list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <Card className="bg-zinc-900 border-white/5">
            <CardContent className="p-10 text-center space-y-3">
              <Users className="w-10 h-10 text-zinc-600 mx-auto" />
              <p className="text-zinc-400">No customers found</p>
              {search && (
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {customers.map((c: any) => (
              <Card key={c.id} className="bg-zinc-900 border-white/5 hover:border-white/10 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-zinc-300">
                        {(c.name ?? c.email ?? "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-200 truncate">{c.name ?? "—"}</p>
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                          #{c.id}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Phone className="w-3 h-3" />
                            {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Mail className="w-3 h-3" />
                            {c.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 gap-1">
                        <ShoppingBag className="w-2.5 h-2.5" />
                        Orders
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 gap-1">
                        <ClipboardList className="w-2.5 h-2.5" />
                        Rx
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />
                        Refills
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
