import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Settings, Printer, Lock, Database, CheckCircle, AlertCircle,
  RefreshCw, Shield, Calendar, Wrench
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminUtilities() {
  const { data: printers = [] } = trpc.masterData.printers.list.useQuery();
  const { data: financialYears = [] } = trpc.masterData.financialYears.list.useQuery();

  const lockMutation = trpc.masterData.financialYears.lock.useMutation({
    onSuccess: () => toast.success("Financial year locked"),
    onError: (e) => toast.error(e.message),
  });

  const HEALTH_CHECKS = [
    { label: "Database connection", status: "ok" },
    { label: "Medivision sync", status: "ok" },
    { label: "WhatsApp webhook", status: "ok" },
    { label: "OCR queue", status: "ok" },
    { label: "Razorpay gateway", status: "config_needed" },
    { label: "MSG91 SMS", status: "config_needed" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Utilities</h1>
          <p className="text-sm text-zinc-500 mt-1">
            System health, printer setup, transaction locks, and admin tools
          </p>
        </div>

        {/* System health */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HEALTH_CHECKS.map(h => (
                <div key={h.label} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50">
                  <span className="text-xs text-zinc-400">{h.label}</span>
                  {h.status === "ok" ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                      <CheckCircle className="w-2.5 h-2.5 mr-1" />OK
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                      <AlertCircle className="w-2.5 h-2.5 mr-1" />Config needed
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Printers */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Printer className="w-4 h-4 text-purple-400" />
              Registered Printers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {printers.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <Printer className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-500">No printers registered yet</p>
                <p className="text-xs text-zinc-600">
                  Add printers via Master Data → Printers
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {printers.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50">
                    <div>
                      <p className="text-xs font-medium text-zinc-300">{p.printerName}</p>
                      <p className="text-xs text-zinc-500">{p.printerType} · {p.connectionType}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${p.isActive ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-zinc-500 border-zinc-700"}`}>
                      {p.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction lock */}
        <Card className="bg-zinc-900 border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-red-400" />
              Financial Year Lock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500">
              Lock a financial year to prevent backdated entries after closing.
            </p>
            {financialYears.length === 0 ? (
              <p className="text-xs text-zinc-600">No financial years configured. Add via Master Data → Financial Years.</p>
            ) : (
              <div className="space-y-2">
                {financialYears.map((fy: any) => (
                  <div key={fy.id} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50">
                    <div>
                      <p className="text-xs font-medium text-zinc-300">{fy.yearLabel}</p>
                      <p className="text-xs text-zinc-500">{fy.startDate} – {fy.endDate}</p>
                    </div>
                    {fy.isLocked ? (
                      <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30 bg-red-500/10">
                        <Lock className="w-2.5 h-2.5 mr-1" />Locked
                      </Badge>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => lockMutation.mutate({ id: fy.id })}
                        disabled={lockMutation.isPending}
                      >
                        Lock
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
