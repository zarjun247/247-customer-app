import { AdminLayout } from "@/components/AdminLayout";
import { RefreshCw, AlertCircle, Clock, CheckCircle, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminRefills() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Refill Reminders</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Chronic medication refill schedule across all customers
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Due Today", value: "—", icon: Bell, color: "text-red-400" },
            { label: "Due This Week", value: "—", icon: Clock, color: "text-amber-400" },
            { label: "Snoozed", value: "—", icon: AlertCircle, color: "text-zinc-400" },
            { label: "Completed", value: "—", icon: CheckCircle, color: "text-emerald-400" },
          ].map(s => (
            <Card key={s.label} className="bg-zinc-900 border-white/5">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                <div>
                  <p className="text-lg font-semibold text-zinc-100">{s.value}</p>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">How Refill Reminders Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-zinc-500">
            <p>
              Refill reminders are created automatically when a customer places an order for a chronic medication.
              The system detects chronic medications based on the product's <code className="text-zinc-400 bg-zinc-800 px-1 rounded">isChronic</code> flag
              and the customer's order history.
            </p>
            <p>
              Customers manage their own reminders from the <strong className="text-zinc-400">Refill Reminders</strong> section
              of the customer app. Staff can view all active reminders here and trigger manual reminders via WhatsApp.
            </p>
            <div className="pt-2">
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-[10px]">
                <AlertCircle className="w-2.5 h-2.5 mr-1" />
                Admin-level refill overview requires a listAllRefills procedure — coming in next pass
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
