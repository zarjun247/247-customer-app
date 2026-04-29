import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Bike, CheckCircle, Clock, MapPin, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminRiders() {
  const { data: riders = [], isLoading } = trpc.rider.available.useQuery();

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Riders & Delivery</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {riders.length} available rider{riders.length !== 1 ? "s" : ""}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : riders.length === 0 ? (
          <Card className="bg-zinc-900 border-white/5">
            <CardContent className="p-10 text-center space-y-3">
              <Bike className="w-10 h-10 text-zinc-600 mx-auto" />
              <p className="text-zinc-400">No riders available right now</p>
              <p className="text-xs text-zinc-600">Riders are added via Staff Management → Assign Role</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {riders.map((r: any) => (
              <Card key={r.id} className="bg-zinc-900 border-white/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                        <Bike className="w-4 h-4 text-zinc-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{r.name ?? `Rider #${r.id}`}</p>
                        <p className="text-xs text-zinc-500">{r.phone ?? "No phone"}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    >
                      <CheckCircle className="w-2.5 h-2.5 mr-1" />
                      Available
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {r.activeDeliveries ?? 0} active
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {r.avgDeliveryMins ?? "—"} min avg
                    </span>
                    {r.lastLocation && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {r.lastLocation}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Assign Riders section */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">Rider Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500">
              Riders are assigned to orders from the <strong className="text-zinc-400">Orders</strong> page or the{" "}
              <strong className="text-zinc-400">Command Center</strong>. Use{" "}
              <strong className="text-zinc-400">Staff Management</strong> to add new riders and assign the{" "}
              <code className="text-zinc-400 bg-zinc-800 px-1 rounded">rider</code> role.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
