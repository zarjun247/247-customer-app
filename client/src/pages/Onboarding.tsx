import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Building2, Home } from "lucide-react";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [flatNumber, setFlatNumber] = useState("");

  const { data: buildings, isLoading: buildingsLoading } = trpc.user.buildings.useQuery();

  const completeOnboarding = trpc.user.completeOnboarding.useMutation({
    onSuccess: () => {
      toast.success("Welcome to 24/7 Pharmacy!");
      navigate("/catalog");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Please enter your name"); return; }
    if (!selectedBuilding) { toast.error("Please select your building"); return; }
    if (!flatNumber.trim()) { toast.error("Please enter your flat number"); return; }
    completeOnboarding.mutate({ name: name.trim(), buildingId: selectedBuilding, flatNumber: flatNumber.trim() });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col px-6 py-10 max-w-sm mx-auto w-full">
        <img src={LOGO_URL} alt="24/7" className="h-10 w-10 object-contain rounded-xl mb-10" />

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Set up your profile</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your building and flat number determine your assigned pharmacy node and delivery SLA.
          </p>
        </div>

        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your name</label>
            <Input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Building Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Select your building
            </label>
            {buildingsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-card animate-pulse" />
                ))}
              </div>
            ) : buildings && buildings.length > 0 ? (
              <div className="space-y-2">
                {buildings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBuilding(b.id)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                      selectedBuilding === b.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{b.name}</div>
                    {b.address && <div className="text-xs text-muted-foreground mt-0.5">{b.address}</div>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                No buildings configured yet.
              </div>
            )}
          </div>

          {/* Flat Number */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              Flat / Unit number
            </label>
            <Input
              placeholder="e.g. A-402, 12B, Tower 3 - 801"
              value={flatNumber}
              onChange={(e) => setFlatNumber(e.target.value)}
              className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Button
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium mt-2"
            onClick={handleSubmit}
            disabled={completeOnboarding.isPending}
          >
            {completeOnboarding.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Setting up...
              </span>
            ) : "Continue to Pharmacy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
