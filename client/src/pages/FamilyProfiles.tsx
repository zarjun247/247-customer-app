import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Heart, Plus, Edit2, Trash2, User, ChevronLeft, AlertCircle, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

interface FamilyMemberForm {
  name: string;
  relation: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | "";
  phone: string;
  bloodGroup: string;
  chronicConditions: string;
  allergies: string;
}

const defaultForm: FamilyMemberForm = {
  name: "",
  relation: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  bloodGroup: "",
  chronicConditions: "",
  allergies: "",
};

export default function FamilyProfiles() {
  const { user, loading: authLoading } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FamilyMemberForm>(defaultForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.customerMedicine.family.list.useQuery(undefined, {
    enabled: !!user,
  });

  const createMutation = trpc.customerMedicine.family.create.useMutation({
    onSuccess: () => {
      toast.success("Family member added");
      utils.customerMedicine.family.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.customerMedicine.family.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.customerMedicine.family.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(defaultForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const deactivateMutation = trpc.customerMedicine.family.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Family member removed");
      utils.customerMedicine.family.list.invalidate();
      setDeleteConfirm(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (member: any) => {
    setEditingId(member.id);
    setForm({
      name: member.name ?? "",
      relation: member.relation ?? "",
      dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth).toISOString().split("T")[0] : "",
      gender: member.gender ?? "",
      phone: member.phone ?? "",
      bloodGroup: member.bloodGroup ?? "",
      chronicConditions: member.chronicConditions
        ? (typeof member.chronicConditions === "string"
            ? JSON.parse(member.chronicConditions)
            : member.chronicConditions
          ).join(", ")
        : "",
      allergies: member.allergies
        ? (typeof member.allergies === "string"
            ? JSON.parse(member.allergies)
            : member.allergies
          ).join(", ")
        : "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      relation: form.relation || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: (form.gender || undefined) as "male" | "female" | "other" | undefined,
      phone: form.phone || undefined,
      bloodGroup: form.bloodGroup || undefined,
      chronicConditions: form.chronicConditions
        ? form.chronicConditions.split(",").map(s => s.trim()).filter(Boolean)
        : undefined,
      allergies: form.allergies
        ? form.allergies.split(",").map(s => s.trim()).filter(Boolean)
        : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
            <p className="font-medium mb-4">Please sign in to manage family profiles</p>
            <Link href="/">
              <Button variant="outline" className="w-full">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-400" />
              Family Profiles
            </h1>
            <p className="text-xs text-muted-foreground">Manage medicine profiles for your family</p>
          </div>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Trust note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Family health data is stored securely and only accessible to your pharmacist team.
            Rx medicines are always pharmacist-reviewed before dispensing.
          </p>
        </div>

        {/* Family members */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : !data?.rows.length ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="p-8 text-center">
              <Heart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">No family members yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
                Add family members to manage their medicine records and refill reminders
              </p>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Add First Member
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {data.rows.map(member => {
              const conditions = member.chronicConditions
                ? (typeof member.chronicConditions === "string"
                    ? JSON.parse(member.chronicConditions)
                    : member.chronicConditions)
                : [];
              const allergies = member.allergies
                ? (typeof member.allergies === "string"
                    ? JSON.parse(member.allergies)
                    : member.allergies)
                : [];

              return (
                <Card key={member.id} className="border-border/50 hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                        {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{member.name}</p>
                          {member.relation && (
                            <Badge variant="outline" className="text-xs capitalize">{member.relation}</Badge>
                          )}
                          {member.bloodGroup && (
                            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                              {member.bloodGroup}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {member.gender && (
                            <span className="text-xs text-muted-foreground capitalize">{member.gender}</span>
                          )}
                          {member.dateOfBirth && (
                            <span className="text-xs text-muted-foreground">
                              DOB: {new Date(member.dateOfBirth).toLocaleDateString()}
                            </span>
                          )}
                          {member.phone && (
                            <span className="text-xs text-muted-foreground">{member.phone}</span>
                          )}
                        </div>
                        {conditions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {conditions.map((c: string) => (
                              <Badge key={c} className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {allergies.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {allergies.map((a: string) => (
                              <Badge key={a} className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                                ⚠ {a}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(member)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingId(null); setForm(defaultForm); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Family Member" : "Add Family Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Full Name *</Label>
                <Input
                  placeholder="e.g. Priya Sharma"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Relation</Label>
                <Input
                  placeholder="e.g. Spouse, Child, Parent"
                  value={form.relation}
                  onChange={e => setForm(f => ({ ...f, relation: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v as any }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Blood Group</Label>
                <Select value={form.bloodGroup} onValueChange={v => setForm(f => ({ ...f, bloodGroup: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Phone</Label>
                <Input
                  placeholder="Optional contact number"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Chronic Conditions</Label>
                <Input
                  placeholder="e.g. Diabetes, Hypertension (comma-separated)"
                  value={form.chronicConditions}
                  onChange={e => setForm(f => ({ ...f, chronicConditions: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Known Allergies</Label>
                <Input
                  placeholder="e.g. Penicillin, Sulfa drugs (comma-separated)"
                  value={form.allergies}
                  onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(defaultForm); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Family Member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the family member from your profile. Their medicine history will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deactivateMutation.mutate({ id: deleteConfirm })}
              disabled={deactivateMutation.isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
