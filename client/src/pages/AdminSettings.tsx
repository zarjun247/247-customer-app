import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Settings, Store, Bell, Shield, Key, Globe, AlertCircle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ENV_VARS = [
  { key: "RAZORPAY_KEY_ID", label: "Razorpay Key ID", set: false, section: "Payments" },
  { key: "RAZORPAY_KEY_SECRET", label: "Razorpay Key Secret", set: false, section: "Payments" },
  { key: "MSG91_API_KEY", label: "MSG91 API Key", set: false, section: "SMS" },
  { key: "MSG91_TEMPLATE_ID", label: "MSG91 Template ID", set: false, section: "SMS" },
  { key: "WHATSAPP_VERIFY_TOKEN", label: "WhatsApp Verify Token", set: false, section: "WhatsApp" },
  { key: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp Access Token", set: false, section: "WhatsApp" },
  { key: "WHATSAPP_PHONE_NUMBER_ID", label: "WhatsApp Phone Number ID", set: false, section: "WhatsApp" },
  { key: "DATABASE_URL", label: "Database URL", set: true, section: "Infrastructure" },
  { key: "JWT_SECRET", label: "JWT Secret", set: true, section: "Infrastructure" },
  { key: "BUILT_IN_FORGE_API_KEY", label: "Forge API Key (LLM)", set: true, section: "Infrastructure" },
];

const sections = Array.from(new Set(ENV_VARS.map(v => v.section)));

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Environment configuration, credentials, and system settings
          </p>
        </div>

        {/* Credential status */}
        {sections.map(section => (
          <Card key={section} className="bg-zinc-900 border-white/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                {section === "Payments" && <Key className="w-4 h-4 text-emerald-400" />}
                {section === "SMS" && <Bell className="w-4 h-4 text-blue-400" />}
                {section === "WhatsApp" && <Globe className="w-4 h-4 text-green-400" />}
                {section === "Infrastructure" && <Shield className="w-4 h-4 text-purple-400" />}
                {section}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ENV_VARS.filter(v => v.section === section).map(v => (
                  <div key={v.key} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50">
                    <div>
                      <p className="text-xs font-mono text-zinc-300">{v.key}</p>
                      <p className="text-xs text-zinc-500">{v.label}</p>
                    </div>
                    {v.set ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                        <CheckCircle className="w-2.5 h-2.5 mr-1" />Set
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                        <AlertCircle className="w-2.5 h-2.5 mr-1" />Not set
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              {section !== "Infrastructure" && (
                <p className="text-xs text-zinc-600 mt-3">
                  Add credentials via the Management UI → Settings → Secrets panel.
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Store info */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Store className="w-4 h-4 text-zinc-400" />
              Store Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500">
              Store details (name, address, GSTIN, drug licence number, contact) are managed via{" "}
              <strong className="text-zinc-400">Master Data → Stores</strong>.
              Each store has its own GSTIN, drug licence, and operating hours.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
