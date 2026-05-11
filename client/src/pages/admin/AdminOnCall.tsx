import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type OnCallRole = "incident_commander" | "pharmacist_in_charge" | "platform_owner" | "provider_owner";

const ROLES: OnCallRole[] = [
  "incident_commander",
  "pharmacist_in_charge",
  "platform_owner",
  "provider_owner",
];

const ROLE_LABELS: Record<OnCallRole, string> = {
  incident_commander: "Incident Commander",
  pharmacist_in_charge: "Pharmacist in Charge",
  platform_owner: "Platform Owner",
  provider_owner: "Provider Owner",
};

function timeAgo(d: string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDatetime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function CurrentOnCallCard({ role }: { role: OnCallRole }) {
  const { data, isLoading } = trpc.onCall.current.useQuery({ role });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{ROLE_LABELS[role]}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {isLoading && <span className="text-muted-foreground">Loading…</span>}
        {!isLoading && !data && <span className="text-muted-foreground">No shift active</span>}
        {data && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Primary</span>
              <span className="font-mono font-medium">{data.primaryUserId}</span>
            </div>
            {data.secondaryUserId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Secondary</span>
                <span className="font-mono">{data.secondaryUserId}</span>
              </div>
            )}
            {data.escalationUserId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Escalation</span>
                <span className="font-mono">{data.escalationUserId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ends</span>
              <span>{timeAgo(data.endsAt)} ({data.timezone})</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY_SHIFT = {
  id: "",
  role: "platform_owner" as OnCallRole,
  primaryUserId: "",
  secondaryUserId: "",
  escalationUserId: "",
  startsAt: "",
  endsAt: "",
  timezone: "Asia/Kolkata",
};

function ManageRota() {
  const { data: shifts, isLoading, refetch } = trpc.onCall.listAll.useQuery();
  const [form, setForm] = useState({ ...EMPTY_SHIFT });
  const [saving, setSaving] = useState(false);

  const upsert = trpc.onCall.upsert.useMutation({
    onSuccess: () => {
      toast.success("Shift saved");
      setForm({ ...EMPTY_SHIFT });
      setSaving(false);
      refetch();
    },
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  function handleSave() {
    if (!form.id || !form.primaryUserId || !form.startsAt || !form.endsAt) {
      toast.error("ID, primary user, starts at, and ends at are required");
      return;
    }
    setSaving(true);
    upsert.mutate({
      id: form.id,
      role: form.role,
      primaryUserId: form.primaryUserId,
      secondaryUserId: form.secondaryUserId || undefined,
      escalationUserId: form.escalationUserId || undefined,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      timezone: form.timezone,
    });
  }

  function field(label: string, key: keyof typeof form, type = "text", options?: { value: string; label: string }[]) {
    if (options) {
      return (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          <select
            className="rounded border px-2 py-1.5 text-sm"
            value={form[key] as string}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          >
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type={type}
          className="rounded border px-2 py-1.5 text-sm"
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add / Update Shift</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {field("Shift ID", "id")}
            {field("Role", "role", "text", ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] })))}
            {field("Primary User ID", "primaryUserId")}
            {field("Secondary User ID (opt)", "secondaryUserId")}
            {field("Escalation User ID (opt)", "escalationUserId")}
            {field("Timezone", "timezone")}
            {field("Starts At", "startsAt", "datetime-local")}
            {field("Ends At", "endsAt", "datetime-local")}
          </div>
          <Button className="mt-4" size="sm" disabled={saving} onClick={handleSave}>
            Save Shift
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Shifts ({shifts?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Primary</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>TZ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && (shifts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">No shifts configured</TableCell>
                </TableRow>
              )}
              {(shifts ?? []).map(s => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setForm({
                    id: s.id,
                    role: s.role as OnCallRole,
                    primaryUserId: s.primaryUserId,
                    secondaryUserId: s.secondaryUserId ?? "",
                    escalationUserId: s.escalationUserId ?? "",
                    startsAt: s.startsAt.slice(0, 16),
                    endsAt: s.endsAt.slice(0, 16),
                    timezone: s.timezone,
                  })}
                >
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell className="text-sm">{ROLE_LABELS[s.role as OnCallRole] ?? s.role}</TableCell>
                  <TableCell className="font-mono text-sm">{s.primaryUserId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDatetime(s.startsAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDatetime(s.endsAt)}</TableCell>
                  <TableCell className="text-sm">{s.timezone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type Tab = "current" | "rota";

export default function AdminOnCall() {
  const [tab, setTab] = useState<Tab>("current");

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">On-Call Rota</h1>

        <div className="flex gap-2 border-b pb-2">
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${tab === "current" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("current")}
          >
            Current On-Call
          </button>
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${tab === "rota" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("rota")}
          >
            Manage Rota
          </button>
        </div>

        {tab === "current" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ROLES.map(role => <CurrentOnCallCard key={role} role={role} />)}
          </div>
        )}

        {tab === "rota" && <ManageRota />}
      </div>
    </AdminLayout>
  );
}
