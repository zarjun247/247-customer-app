import { AdminLayout } from "@/components/AdminLayout";
import { MessageSquare, CheckCircle, Clock, AlertCircle, RefreshCw, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const BOT_COMMANDS = [
  { cmd: "hi / hello", desc: "Start session, show main menu" },
  { cmd: "1 / order", desc: "Place a new order or search catalog" },
  { cmd: "2 / status", desc: "Check order status by order ID" },
  { cmd: "3 / rx", desc: "Upload prescription (image)" },
  { cmd: "4 / refill", desc: "Request refill for chronic medication" },
  { cmd: "5 / help", desc: "Show help menu" },
  { cmd: "cancel", desc: "Cancel active session" },
];

const WEBHOOK_EVENTS = [
  { label: "Incoming message", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { label: "Order status update", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { label: "Rx upload received", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { label: "Refill request", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { label: "Delivery OTP", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { label: "Outbound SMS fallback", status: "config_needed", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
];

export default function AdminWhatsApp() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">WhatsApp Bot</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Webhook status, bot commands, and session management
            </p>
          </div>
          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1.5">
            <CheckCircle className="w-3 h-3" />
            Webhook active
          </Badge>
        </div>

        {/* Webhook event status */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">Webhook Event Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {WEBHOOK_EVENTS.map(ev => (
                <div key={ev.label} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50">
                  <span className="text-xs text-zinc-400">{ev.label}</span>
                  <Badge variant="outline" className={`text-[10px] ${ev.color}`}>
                    {ev.status === "active" ? (
                      <><CheckCircle className="w-2.5 h-2.5 mr-1" />Active</>
                    ) : (
                      <><AlertCircle className="w-2.5 h-2.5 mr-1" />Config needed</>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bot command reference */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">Bot Command Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-white/5">
              {BOT_COMMANDS.map(c => (
                <div key={c.cmd} className="flex items-center gap-4 py-2.5">
                  <code className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded min-w-[100px]">
                    {c.cmd}
                  </code>
                  <span className="text-xs text-zinc-400">{c.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Setup instructions */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300">Webhook Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">
              The WhatsApp webhook is registered at{" "}
              <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">/api/whatsapp/webhook</code>.
              Point your WhatsApp Business API provider (Meta, Interakt, Wati, etc.) to this URL.
            </p>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-400">Required environment variables:</p>
              <div className="space-y-1">
                {["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"].map(v => (
                  <div key={v} className="flex items-center gap-2">
                    <code className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{v}</code>
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                      <AlertCircle className="w-2.5 h-2.5 mr-1" />
                      Not set
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
