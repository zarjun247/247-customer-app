/**
 * Onboarding.tsx — Location-aware onboarding flow
 *
 * Steps:
 *   1. name       — Enter your name
 *   2. address    — Search address via Google Places Autocomplete
 *                   OR pick a known building from the list
 *   3. flat       — Enter flat / unit number
 *   4. service    — Serviceability check result (pharmacy + ETA)
 *   5. confirm    — Review and submit
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2, MapPin, ChevronRight, CheckCircle2, User,
  Search, Clock, AlertTriangle, X, Loader2,
} from "lucide-react";

const LOGO_URL = "/manus-storage/247-logo-transparent_ef3d59e3.png";

type Step = "name" | "address" | "flat" | "service" | "confirm";

type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

type ServiceResult = {
  serviceable: boolean;
  storeId: number | null;
  storeName: string | null;
  storeAddress: string | null;
  etaMins: number | null;
  etaText: string | null;       // customer-safe: "Arriving in ~X min"
  openNow: boolean;
  openingHoursText: string | null;
  distanceMetres: number | null;
  reason: string;
};

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("name");

  // Step 1: Name
  const [name, setName] = useState("");

  // Step 2: Address
  const [addressQuery, setAddressQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [resolvedLat, setResolvedLat] = useState<number | null>(null);
  const [resolvedLng, setResolvedLng] = useState<number | null>(null);
  const [resolvedPincode, setResolvedPincode] = useState<string | null>(null);
  const [addressMode, setAddressMode] = useState<"search" | "building">("search");
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [buildingPrimaryStoreId, setBuildingPrimaryStoreId] = useState<number | null>(null);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Flat
  const [flatNumber, setFlatNumber] = useState("");

  // Step 4: Service check
  const [serviceResult, setServiceResult] = useState<ServiceResult | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);

  const { data: buildings, isLoading: buildingsLoading } = trpc.user.buildings.useQuery();
  const utils = trpc.useUtils();

  // Autocomplete debounce
  const fetchPredictions = useCallback(async (q: string) => {
    if (q.length < 2) { setPredictions([]); return; }
    setAutocompleteLoading(true);
    try {
      const results = await utils.location.autocomplete.fetch({ query: q });
      setPredictions((results as PlacePrediction[]) ?? []);
    } catch {
      setPredictions([]);
    } finally {
      setAutocompleteLoading(false);
    }
  }, [utils]);

  useEffect(() => {
    if (addressMode !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(addressQuery), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [addressQuery, addressMode, fetchPredictions]);

  // Select a prediction and geocode it
  const selectPrediction = async (pred: PlacePrediction) => {
    setAddressQuery(pred.description);
    setPredictions([]);
    setSelectedPlaceId(pred.placeId);
    setSelectedAddress(pred.description);
    try {
      const geo = await utils.location.geocode.fetch({ placeId: pred.placeId });
      if (geo) {
        setResolvedLat(geo.lat);
        setResolvedLng(geo.lng);
        setResolvedPincode((geo as any).pincode ?? null);
      }
    } catch {
      toast.error("Could not resolve address coordinates. Please try again.");
    }
  };

  // Select a known building
  const selectBuilding = (buildingId: number) => {
    const b = buildings?.find(bd => bd.id === buildingId);
    if (!b) return;
    setSelectedBuilding(buildingId);
    setBuildingPrimaryStoreId((b as any).primaryStoreId ?? null);
    setSelectedAddress((b as any).address ?? b.name);
    setAddressQuery(b.name);
    if ((b as any).lat && (b as any).lng) {
      setResolvedLat(Number((b as any).lat));
      setResolvedLng(Number((b as any).lng));
    }
  };

  // Run serviceability check
  const runServiceabilityCheck = async () => {
    if (!resolvedLat || !resolvedLng) {
      toast.error("Address coordinates not resolved. Please re-select your address.");
      return;
    }
    setServiceLoading(true);
    try {
      const result = await utils.location.checkServiceability.fetch({
        lat: resolvedLat,
        lng: resolvedLng,
        buildingPrimaryStoreId: buildingPrimaryStoreId ?? undefined,
        pincode: resolvedPincode ?? undefined,
      });
      setServiceResult(result as ServiceResult);
      setStep("service");
    } catch {
      toast.error("Serviceability check failed. Please try again.");
    } finally {
      setServiceLoading(false);
    }
  };

  const completeOnboarding = trpc.user.completeOnboarding.useMutation({
    onSuccess: async () => {
      await utils.user.profile.invalidate();
      navigate("/catalog");
    },
    onError: (e) => toast.error(e.message),
  });

  const goNext = async () => {
    if (step === "name") {
      if (!name.trim()) { toast.error("Please enter your name"); return; }
      setStep("address");
    } else if (step === "address") {
      if (!selectedAddress || !resolvedLat || !resolvedLng) {
        toast.error("Please search and select a valid address");
        return;
      }
      setStep("flat");
    } else if (step === "flat") {
      if (!flatNumber.trim()) { toast.error("Please enter your flat / unit number"); return; }
      await runServiceabilityCheck();
    } else if (step === "service") {
      if (!serviceResult?.serviceable) {
        toast.error("This address is not serviceable. Please try a different address.");
        return;
      }
      setStep("confirm");
    } else if (step === "confirm") {
      if (!serviceResult?.storeId) { toast.error("No pharmacy assigned"); return; }
      completeOnboarding.mutate({
        name: name.trim(),
        buildingId: selectedBuilding ?? undefined,
        flatNumber: flatNumber.trim(),
        userAddress: selectedAddress ?? undefined,
        userLat: resolvedLat ?? undefined,
        userLng: resolvedLng ?? undefined,
        assignedStoreId: serviceResult.storeId,
      });
    }
  };

  const goBack = () => {
    if (step === "address") setStep("name");
    else if (step === "flat") setStep("address");
    else if (step === "service") setStep("flat");
    else if (step === "confirm") setStep("service");
  };

  const steps: Step[] = ["name", "address", "flat", "service", "confirm"];
  const stepIndex = steps.indexOf(step);

  const canProceedAddress =
    addressMode === "search"
      ? !!selectedPlaceId && !!resolvedLat
      : !!selectedBuilding && !!resolvedLat;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#0A0A0B",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex-1 flex flex-col px-6 py-8 max-w-sm mx-auto w-full">
        {/* Logo + progress */}
        <div className="flex items-center justify-between mb-10">
          <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-10 w-auto object-contain" />
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <div
                key={s}
                className="rounded-full transition-all"
                style={{
                  width: i === stepIndex ? 20 : 6,
                  height: 6,
                  background: i <= stepIndex ? "#2B7FFF" : "#2A2A2E",
                }}
              />
            ))}
          </div>
        </div>

        {/* Step: Name */}
        {step === "name" && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(43,127,255,0.12)" }}>
                <User size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>What should we call you?</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>Your name appears on prescriptions and delivery receipts.</p>
            </div>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && goNext()} placeholder="Full name" autoFocus
              className="w-full h-12 rounded-xl px-4 text-sm outline-none border transition-colors"
              style={{ background: "#141416", borderColor: name ? "#2B7FFF" : "#2A2A2E", color: "#F0F0F2" }}
            />
            <div className="flex-1" />
            <button onClick={goNext} disabled={!name.trim()}
              className="w-full h-12 rounded-xl text-sm font-semibold mt-6 flex items-center justify-center gap-2 transition-all"
              style={{ background: name.trim() ? "#2B7FFF" : "#1A2A3A", color: name.trim() ? "#FFFFFF" : "#6B6B75" }}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step: Address */}
        {step === "address" && (
          <div className="flex-1 flex flex-col">
            <button onClick={goBack} className="text-sm mb-6 text-left transition-colors" style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")} onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}>
              ← Back
            </button>
            <div className="mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(43,127,255,0.12)" }}>
                <MapPin size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>Where do you live?</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>We'll assign your nearest 24/7 pharmacy and calculate delivery time.</p>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-xl p-1 mb-5" style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
              {(["search", "building"] as const).map(mode => (
                <button key={mode} onClick={() => {
                  setAddressMode(mode); setSelectedAddress(null); setSelectedPlaceId(null);
                  setSelectedBuilding(null); setResolvedLat(null); setResolvedLng(null);
                  setAddressQuery(""); setPredictions([]);
                }} className="flex-1 h-8 rounded-lg text-xs font-medium transition-all"
                  style={{ background: addressMode === mode ? "#2B7FFF" : "transparent", color: addressMode === mode ? "#FFFFFF" : "#6B6B75" }}>
                  {mode === "search" ? "Search address" : "Known buildings"}
                </button>
              ))}
            </div>

            {/* Address search */}
            {addressMode === "search" && (
              <div className="relative">
                <div className="flex items-center gap-3 h-12 rounded-xl px-4 border"
                  style={{ background: "#141416", borderColor: addressQuery ? "#2B7FFF" : "#2A2A2E" }}>
                  <Search size={15} style={{ color: "#6B6B75", flexShrink: 0 }} />
                  <input type="text" value={addressQuery} onChange={e => {
                    setAddressQuery(e.target.value); setSelectedPlaceId(null);
                    setSelectedAddress(null); setResolvedLat(null); setResolvedLng(null);
                  }} placeholder="Search building, street, or area…" autoFocus
                    className="flex-1 bg-transparent text-sm outline-none" style={{ color: "#F0F0F2" }} />
                  {autocompleteLoading && <Loader2 size={14} className="animate-spin" style={{ color: "#6B6B75" }} />}
                  {addressQuery && !autocompleteLoading && (
                    <button onClick={() => { setAddressQuery(""); setPredictions([]); setSelectedPlaceId(null); setSelectedAddress(null); setResolvedLat(null); setResolvedLng(null); }}>
                      <X size={14} style={{ color: "#6B6B75" }} />
                    </button>
                  )}
                </div>

                {predictions.length > 0 && (
                  <div className="absolute top-14 left-0 right-0 rounded-xl border overflow-hidden z-10"
                    style={{ background: "#141416", borderColor: "#2A2A2E" }}>
                    {predictions.map((pred, i) => (
                      <button key={pred.placeId} onClick={() => selectPrediction(pred)}
                        className="w-full text-left px-4 py-3 transition-colors"
                        style={{ borderBottom: i < predictions.length - 1 ? "1px solid #2A2A2E" : "none" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#1A1A1E")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <div className="flex items-start gap-3">
                          <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: "#6B6B75" }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{pred.mainText}</p>
                            {pred.secondaryText && <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{pred.secondaryText}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedAddress && resolvedLat && (
                  <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl border"
                    style={{ background: "rgba(43,127,255,0.06)", borderColor: "rgba(43,127,255,0.2)" }}>
                    <CheckCircle2 size={14} style={{ color: "#2B7FFF" }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#2B7FFF" }}>Address confirmed</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#6B6B75" }}>
                        {selectedAddress}{resolvedPincode && ` · ${resolvedPincode}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Known buildings list */}
            {addressMode === "building" && (
              <div className="flex-1 overflow-y-auto space-y-2 max-h-64">
                {buildingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin" style={{ color: "#6B6B75" }} />
                  </div>
                ) : (
                  (buildings ?? []).map(b => (
                    <button key={b.id} onClick={() => selectBuilding(b.id)}
                      className="w-full text-left px-4 py-3.5 rounded-xl border transition-all"
                      style={{ background: selectedBuilding === b.id ? "rgba(43,127,255,0.08)" : "#141416", borderColor: selectedBuilding === b.id ? "#2B7FFF" : "#2A2A2E" }}>
                      <div className="flex items-center gap-3">
                        <Building2 size={14} style={{ color: selectedBuilding === b.id ? "#2B7FFF" : "#6B6B75" }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{b.name}</p>
                          {(b as any).address && <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{(b as any).address}</p>}
                        </div>
                        {selectedBuilding === b.id && <CheckCircle2 size={14} className="ml-auto" style={{ color: "#2B7FFF" }} />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex-1" />
            <button onClick={goNext} disabled={!canProceedAddress}
              className="w-full h-12 rounded-xl text-sm font-semibold mt-6 flex items-center justify-center gap-2 transition-all"
              style={{ background: canProceedAddress ? "#2B7FFF" : "#1A2A3A", color: canProceedAddress ? "#FFFFFF" : "#6B6B75" }}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step: Flat */}
        {step === "flat" && (
          <div className="flex-1 flex flex-col">
            <button onClick={goBack} className="text-sm mb-6 text-left transition-colors" style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")} onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}>
              ← Back
            </button>
            <div className="mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(43,127,255,0.12)" }}>
                <Building2 size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>Your flat or unit</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>This appears on your delivery receipts and prescription records.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-5" style={{ background: "#141416", borderColor: "#2A2A2E" }}>
              <MapPin size={13} style={{ color: "#6B6B75" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>{selectedAddress}</p>
            </div>
            <input type="text" value={flatNumber} onChange={e => setFlatNumber(e.target.value)}
              onKeyDown={e => e.key === "Enter" && goNext()} placeholder="e.g. 12B, 4th Floor" autoFocus
              className="w-full h-12 rounded-xl px-4 text-sm outline-none border transition-colors"
              style={{ background: "#141416", borderColor: flatNumber ? "#2B7FFF" : "#2A2A2E", color: "#F0F0F2" }} />
            <div className="flex-1" />
            <button onClick={goNext} disabled={!flatNumber.trim() || serviceLoading}
              className="w-full h-12 rounded-xl text-sm font-semibold mt-6 flex items-center justify-center gap-2 transition-all"
              style={{ background: flatNumber.trim() && !serviceLoading ? "#2B7FFF" : "#1A2A3A", color: flatNumber.trim() && !serviceLoading ? "#FFFFFF" : "#6B6B75" }}>
              {serviceLoading ? (<><Loader2 size={15} className="animate-spin" />Checking serviceability…</>) : (<>Continue <ChevronRight size={16} /></>)}
            </button>
          </div>
        )}

        {/* Step: Serviceability result */}
        {step === "service" && (
          <div className="flex-1 flex flex-col">
            <button onClick={goBack} className="text-sm mb-6 text-left transition-colors" style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")} onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}>
              ← Back
            </button>
            {serviceResult?.serviceable ? (
              <>
                <div className="mb-8">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(0,200,150,0.12)" }}>
                    <CheckCircle2 size={18} style={{ color: "#00C896" }} />
                  </div>
                  <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>Great news — we serve your area</h1>
                  <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>Your assigned pharmacy is ready to handle all your orders.</p>
                </div>
                <div className="rounded-xl border p-5 space-y-4 mb-5" style={{ background: "#141416", borderColor: "#2A2A2E" }}>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "#6B6B75" }}>Your pharmacy</p>
                    <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>{serviceResult.storeName}</p>
                    {serviceResult.storeAddress && <p className="text-xs mt-1 leading-relaxed" style={{ color: "#6B6B75" }}>{serviceResult.storeAddress}</p>}
                  </div>
                  <div className="h-px" style={{ background: "#2A2A2E" }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: serviceResult.openNow ? "#00C896" : "#FF6B6B" }} />
                      <span className="text-sm font-medium" style={{ color: serviceResult.openNow ? "#00C896" : "#FF6B6B" }}>
                        {serviceResult.openNow ? "Open now" : "Currently closed"}
                      </span>
                    </div>
                    {serviceResult.openingHoursText && <span className="text-xs" style={{ color: "#6B6B75" }}>{serviceResult.openingHoursText}</span>}
                  </div>
                  {(serviceResult.etaText || serviceResult.etaMins) && (
                    <>
                      <div className="h-px" style={{ background: "#2A2A2E" }} />
                      <div className="flex items-center gap-2">
                        <Clock size={13} style={{ color: "#6B6B75" }} />
                        <span className="text-sm" style={{ color: "#F0F0F2" }}>
                          {serviceResult.etaText ?? `~${serviceResult.etaMins} min delivery`}
                        </span>
                        {serviceResult.distanceMetres && (
                          <span className="text-xs ml-auto" style={{ color: "#6B6B75" }}>
                            {serviceResult.distanceMetres >= 1000
                              ? `${(serviceResult.distanceMetres / 1000).toFixed(1)} km`
                              : `${serviceResult.distanceMetres} m`} away
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex-1" />
                <button onClick={goNext} className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ background: "#2B7FFF", color: "#FFFFFF" }}>
                  Continue <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(255,107,107,0.12)" }}>
                    <AlertTriangle size={18} style={{ color: "#FF6B6B" }} />
                  </div>
                  <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>Not serviceable yet</h1>
                  <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                    We don't currently have a pharmacy that covers your address. We're expanding — please check back soon or try a nearby address.
                  </p>
                </div>
                <div className="rounded-xl border p-4 mb-6" style={{ background: "rgba(255,107,107,0.06)", borderColor: "rgba(255,107,107,0.2)" }}>
                  <p className="text-xs" style={{ color: "#FF6B6B" }}>
                    Your address is outside all current service zones. If you believe this is an error, please contact support.
                  </p>
                </div>
                <div className="flex-1" />
                <button onClick={goBack} className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ background: "#1A2A3A", color: "#F0F0F2" }}>
                  ← Try a different address
                </button>
              </>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div className="flex-1 flex flex-col">
            <button onClick={goBack} className="text-sm mb-6 text-left transition-colors" style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")} onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}>
              ← Back
            </button>
            <div className="mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: "rgba(0,200,150,0.12)" }}>
                <CheckCircle2 size={18} style={{ color: "#00C896" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>Confirm your details</h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>Your serving pharmacy and delivery address are set based on these details.</p>
            </div>
            <div className="rounded-xl border p-5 space-y-4 mb-5" style={{ background: "#141416", borderColor: "#2A2A2E" }}>
              {[
                { label: "Name", value: name },
                { label: "Address", value: selectedAddress },
                { label: "Flat / Unit", value: flatNumber },
                { label: "Pharmacy", value: serviceResult?.storeName },
              ].map(({ label, value }, i, arr) => (
                <div key={label}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-medium uppercase tracking-wider flex-shrink-0" style={{ color: "#6B6B75" }}>{label}</span>
                    <span className="text-sm font-medium text-right" style={{ color: "#F0F0F2" }}>{value ?? "—"}</span>
                  </div>
                  {i < arr.length - 1 && <div className="h-px mt-4" style={{ background: "#2A2A2E" }} />}
                </div>
              ))}
            </div>
            {(serviceResult?.etaText || serviceResult?.etaMins) && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border mb-5"
                style={{ background: "rgba(0,200,150,0.06)", borderColor: "rgba(0,200,150,0.2)" }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#00C896" }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: "#00C896" }}>
                    {serviceResult.etaText ?? `~${serviceResult.etaMins} min`} · {serviceResult.openNow ? "Open now" : "Closed"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{serviceResult.openingHoursText}</p>
                </div>
              </div>
            )}
            <div className="flex-1" />
            <button onClick={goNext} disabled={completeOnboarding.isPending}
              className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{ background: completeOnboarding.isPending ? "#1A4FAA" : "#2B7FFF", color: "#FFFFFF", opacity: completeOnboarding.isPending ? 0.7 : 1 }}>
              {completeOnboarding.isPending ? (<><Loader2 size={15} className="animate-spin" />Setting up your pharmacy…</>) : (<><CheckCircle2 size={16} />Confirm and enter</>)}
            </button>
            <p className="text-xs text-center mt-4" style={{ color: "#6B6B75" }}>
              Your address is used only for delivery routing and prescription records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
