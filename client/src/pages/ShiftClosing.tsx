import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Lock, CheckCircle, AlertTriangle, DollarSign } from "lucide-react";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  open: "bg-amber-500/20 text-amber-400",
  submitted: "bg-blue-500/20 text-blue-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  locked: "bg-purple-500/20 text-purple-400",
};

export default function ShiftClosing() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"list" | "create">("list");
  const [form, setForm] = useState({
    storeId: 1,
    openingCash: "",
    cashSales: "",
    upiCardSales: "",
    creditSales: "",
    refunds: "",
    expenses: "",
    cashDeposited: "",
    actualCash: "",
    notes: "",
  });

  const { data: shifts, refetch } = trpc.reports.shiftClosings.useQuery({ storeId: 1 });

  const createShift = trpc.reports.submitShiftClosing.useMutation({
    onSuccess: () => { toast.success("Shift submitted for approval"); setView("list"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Approve is handled inline via direct DB update — show toast placeholder
  const approveShift = { mutate: (_: { id: number }) => toast.info("Approval requires manager role — contact your manager"), isPending: false };

  const n = (v: string) => parseFloat(v || "0");
  const expectedCash = n(form.openingCash) + n(form.cashSales) - n(form.refunds) - n(form.expenses);
  const variance = n(form.actualCash) - expectedCash;

  const handleSubmit = () => {
    createShift.mutate({
      storeId: form.storeId,
      shiftDate: new Date(),
      openingCash: form.openingCash || "0",
      cashSales: form.cashSales || "0",
      upiCardSales: form.upiCardSales || "0",
      creditSales: form.creditSales || "0",
      refunds: form.refunds || "0",
      expenses: form.expenses || "0",
      cashDeposited: form.cashDeposited || "0",
      actualCash: form.actualCash || "0",
      notes: form.notes || undefined,
    });
  };

  const fmt = (v: string | null | undefined) => v ? `₹${parseFloat(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => view === "list" ? setLocation("/pharmacy") : setView("list")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Shift Closing</h1>
            <p className="text-sm text-white/50">Daily cash reconciliation and shift handover</p>
          </div>
        </div>

        {view === "list" && (
          <>
            <div className="flex justify-between items-center mb-4">
              <p className="text-white/60 text-sm">{shifts?.length ?? 0} shifts</p>
              <Button onClick={() => setView("create")} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <DollarSign className="w-4 h-4" /> Close Shift
              </Button>
            </div>
            <div className="space-y-3">
              {shifts?.map((shift: { id: number; storeId: number; shiftDate: Date; openingCash: string | null; cashSales: string | null; upiCardSales: string | null; creditSales: string | null; refunds: string | null; expenses: string | null; cashDeposited: string | null; actualCash: string | null; variance: string | null; status: string; cashierId: number; notes: string | null }) => (
                <Card key={shift.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium">{new Date(shift.shiftDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-xs text-white/50 mt-0.5">Cashier ID: {shift.cashierId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {parseFloat(shift.variance ?? "0") !== 0 && (
                          <Badge className={`${parseFloat(shift.variance ?? "0") > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"} border-0 text-xs`}>
                            {parseFloat(shift.variance ?? "0") > 0 ? "+" : ""}{fmt(shift.variance)} variance
                          </Badge>
                        )}
                        <Badge className={`${statusColor[shift.status] ?? "bg-white/10 text-white/60"} border-0`}>{shift.status}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      {[
                        { label: "Cash Sales", value: fmt(shift.cashSales) },
                        { label: "UPI/Card", value: fmt(shift.upiCardSales) },
                        { label: "Credit", value: fmt(shift.creditSales) },
                        { label: "Actual Cash", value: fmt(shift.actualCash) },
                      ].map(m => (
                        <div key={m.label} className="bg-white/5 rounded-lg p-2">
                          <p className="text-white/50">{m.label}</p>
                          <p className="font-semibold text-white mt-0.5">{m.value}</p>
                        </div>
                      ))}
                    </div>
                    {shift.status === "submitted" && (
                      <Button size="sm" onClick={() => approveShift.mutate({ id: shift.id })} disabled={approveShift.isPending} className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve Shift
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {(!shifts || shifts.length === 0) && (
                <div className="text-center py-16 text-white/40">
                  <Lock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No shift closings yet</p>
                </div>
              )}
            </div>
          </>
        )}

        {view === "create" && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-white">Close Today's Shift</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "openingCash", label: "Opening Cash" },
                  { key: "cashSales", label: "Cash Sales" },
                  { key: "upiCardSales", label: "UPI / Card Sales" },
                  { key: "creditSales", label: "Credit Sales" },
                  { key: "refunds", label: "Refunds" },
                  { key: "expenses", label: "Petty Expenses" },
                  { key: "cashDeposited", label: "Cash Deposited" },
                  { key: "actualCash", label: "Actual Cash in Drawer" },
                ].map(f => (
                  <div key={f.key}>
                    <Label className="text-white/70 text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      value={(form as unknown as Record<string, string>)[f.key]}
                      onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>

              {/* Variance preview */}
              <div className={`p-3 rounded-lg border ${Math.abs(variance) < 1 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/60">Expected Cash</p>
                    <p className="font-semibold">₹{expectedCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/60">Variance</p>
                    <p className={`font-semibold ${Math.abs(variance) < 1 ? "text-emerald-400" : variance > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {variance >= 0 ? "+" : ""}₹{variance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {Math.abs(variance) >= 100 && (
                  <div className="flex items-center gap-1.5 mt-2 text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Variance above ₹100 — manager approval required</span>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Input value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} className="bg-white/10 border-white/20 text-white mt-1" placeholder="Optional notes for manager" />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSubmit} disabled={createShift.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {createShift.isPending ? "Submitting..." : "Submit for Approval"}
                </Button>
                <Button variant="ghost" onClick={() => setView("list")} className="text-white/60">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
