import { useState } from "react";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Building2, Home, MapPin } from "lucide-react";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [flatNumber, setFlatNumber] = useState("");

  const { data: buildings, isLoading: buildingsLoading } = trpc.user.buildings.useQuery();

  const completeOnboarding = trpc.user.completeOnboarding.useMutation({
    onSuccess: () => navigate("/catalog"),
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim())        { toast.error("Name is required."); return; }
    if (!selectedBuilding)   { toast.error("Select your building."); return; }
    if (!flatNumber.trim())  { toast.error("Flat number is required."); return; }
    completeOnboarding.mutate({ name: name.trim(), buildingId: selectedBuilding, flatNumber: flatNumber.trim() });
  };

  const selectedBuildingData = buildings?.find(b => b.id === selectedBuilding);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col px-6 py-10 max-w-sm mx-auto w-full">

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <img src={LOGO_URL} alt="24/7" className="h-9 w-9 object-contain rounded-lg mb-10" />

        {/* ── Heading ───────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-foreground mb-2 leading-snug">
            Establish your delivery address
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your building and flat determine your serving pharmacy and committed delivery window. This cannot be changed after onboarding without contacting support.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Name ────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="section-label">Full name</label>
            <Input
              placeholder="As it appears on your ID"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>

          {/* ── Building ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="section-label flex items-center gap-1.5">
              <Building2 size={11} />
              Residential building
            </label>
            {buildingsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}
              </div>
            ) : buildings && buildings.length > 0 ? (
              <div className="space-y-1.5">
                {buildings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBuilding(b.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                      selectedBuilding === b.id
                        ? "border-primary bg-primary/8 text-foreground"
                        : "border-border bg-card text-foreground hover:border-border/80"
                    }`}
                  >
                    <div className="text-sm font-medium">{b.name}</div>
                    {b.address && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin size={10} />
                        {b.address}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                No buildings configured yet.
              </div>
            )}
          </div>

          {/* ── Flat ────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="section-label flex items-center gap-1.5">
              <Home size={11} />
              Flat / unit number
            </label>
            <Input
              placeholder="e.g. A-402, Tower 3 – 801"
              value={flatNumber}
              onChange={(e) => setFlatNumber(e.target.value)}
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>

          {/* ── Node assignment preview ──────────────────────────────────── */}
          {selectedBuildingData && (
            <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-primary/8 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              <p className="text-xs text-foreground">
                Served by <span className="font-medium">{selectedBuildingData.name}</span> local pharmacy.
                {flatNumber && ` Delivery to Flat ${flatNumber}.`}
              </p>
            </div>
          )}

          {/* ── Submit ──────────────────────────────────────────────────── */}
          <button
            onClick={handleSubmit}
            disabled={completeOnboarding.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {completeOnboarding.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Confirming…
              </>
            ) : "Confirm and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
