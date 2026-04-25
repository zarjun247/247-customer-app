import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Shield, CheckCircle, XCircle, AlertCircle, Loader2,
  ChevronDown, ChevronUp, ExternalLink, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// ─── Consent Type Metadata ────────────────────────────────────────────────────

interface ConsentMeta {
  key: string;
  label: string;
  description: string;
  required: boolean;
  learnMoreUrl?: string;
}

const CONSENT_META: ConsentMeta[] = [
  {
    key: "terms_of_service",
    label: "Terms of Service",
    description:
      "You agree to the 24/7 Pharmacy Terms of Service, which govern your use of the platform, ordering process, and dispute resolution.",
    required: true,
    learnMoreUrl: "/terms",
  },
  {
    key: "privacy_policy",
    label: "Privacy Policy",
    description:
      "You acknowledge our Privacy Policy, which describes how we collect, use, and protect your personal data in compliance with applicable law.",
    required: true,
    learnMoreUrl: "/privacy",
  },
  {
    key: "rx_data_processing",
    label: "Prescription Data Processing",
    description:
      "You consent to our licensed pharmacists reviewing and processing your prescription images and medication history to fulfil your orders safely.",
    required: false,
  },
  {
    key: "marketing",
    label: "Marketing Communications",
    description:
      "You agree to receive personalised offers, health tips, and refill reminders via SMS and in-app notifications. You can opt out at any time.",
    required: false,
  },
  {
    key: "location",
    label: "Location Data",
    description:
      "You consent to us using your location to assign the nearest pharmacy, estimate delivery times, and improve serviceability in your area.",
    required: false,
  },
];

// ─── Consent Row ──────────────────────────────────────────────────────────────

interface ConsentStatus {
  type: string;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
  isCurrentVersion: boolean;
  currentVersion: string;
  recordVersion: string | null;
}

function ConsentRow({
  meta,
  status,
  onGrant,
  onRevoke,
  loading,
}: {
  meta: ConsentMeta;
  status: ConsentStatus | undefined;
  onGrant: (type: string) => void;
  onRevoke: (type: string) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isGranted = status?.granted ?? false;
  const canToggle = !meta.required;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0E0E10] overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5">
              {isGranted ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-zinc-600 shrink-0" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-zinc-200">{meta.label}</p>
                {meta.required && (
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                )}
                {status && !status.isCurrentVersion && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Update available
                  </span>
                )}
              </div>
              {status?.grantedAt && (
                <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isGranted ? "Granted" : "Revoked"}{" "}
                  {new Date(status.grantedAt).toLocaleDateString("en-IN")}
                  {status.recordVersion && ` · v${status.recordVersion}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {canToggle && (
              <Switch
                checked={isGranted}
                onCheckedChange={(checked) => {
                  if (checked) onGrant(meta.key);
                  else onRevoke(meta.key);
                }}
                disabled={loading}
                className="data-[state=checked]:bg-teal-500"
              />
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 bg-[#0A0A0B]">
          <p className="text-sm text-zinc-400 leading-relaxed">{meta.description}</p>
          {meta.learnMoreUrl && (
            <a
              href={meta.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              Read full document <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {meta.required && (
            <p className="mt-2 text-xs text-zinc-500">
              This consent is required to use the platform. Revoking it would disable your account.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Consent() {
  const utils = trpc.useUtils();
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: consentStatus, isLoading } = trpc.consent.getStatus.useQuery();

  const grantMutation = trpc.consent.grant.useMutation({
    onSuccess: () => {
      utils.consent.getStatus.invalidate();
      setActionLoading(false);
      setSuccessMsg("Consent updated.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: () => setActionLoading(false),
  });

  const revokeMutation = trpc.consent.revoke.useMutation({
    onSuccess: () => {
      utils.consent.getStatus.invalidate();
      setActionLoading(false);
      setSuccessMsg("Consent revoked.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: () => setActionLoading(false),
  });

  function handleGrant(type: string) {
    setActionLoading(true);
    grantMutation.mutate({
      types: [type as any],
      userAgent: navigator.userAgent,
    });
  }

  function handleRevoke(type: string) {
    setActionLoading(true);
    revokeMutation.mutate({ type: type as any });
  }

  // Check if any consents need updating
  const needsUpdate = consentStatus?.some((s) => s.granted && !s.isCurrentVersion);
  const allRequiredGranted = consentStatus
    ?.filter((s) => CONSENT_META.find((m) => m.key === s.type)?.required)
    .every((s) => s.granted);

  function handleAcceptAll() {
    setActionLoading(true);
    grantMutation.mutate({
      types: ["terms_of_service", "privacy_policy", "rx_data_processing", "marketing", "location"],
      userAgent: navigator.userAgent,
    });
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      <div className="max-w-xl mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-teal-400" />
            <h1 className="text-xl font-bold text-zinc-100">Privacy & Consent</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Manage your data preferences and consent settings. Your choices are recorded
            and auditable in compliance with DPDP Act 2023.
          </p>
        </div>

        {/* Update banner */}
        {needsUpdate && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">Updated documents available</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Some consent documents have been updated. Please review and re-accept.
                </p>
                <Button
                  size="sm"
                  className="mt-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                  onClick={handleAcceptAll}
                  disabled={actionLoading}
                >
                  Accept all updates
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {successMsg}
            </p>
          </div>
        )}

        {/* Consent items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {CONSENT_META.map((meta) => {
              const status = consentStatus?.find((s) => s.type === meta.key);
              return (
                <ConsentRow
                  key={meta.key}
                  meta={meta}
                  status={status}
                  onGrant={handleGrant}
                  onRevoke={handleRevoke}
                  loading={actionLoading}
                />
              );
            })}
          </div>
        )}

        {/* Accept all (for new users) */}
        {!isLoading && consentStatus && !allRequiredGranted && (
          <div className="mt-6 rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
            <p className="text-sm text-zinc-300 mb-3">
              Accept the required consents to continue using the platform.
            </p>
            <Button
              className="w-full bg-teal-500 hover:bg-teal-400 text-black font-semibold"
              onClick={handleAcceptAll}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                "Accept all & continue"
              )}
            </Button>
          </div>
        )}

        {/* Footer note */}
        <div className="mt-8 text-xs text-zinc-600 leading-relaxed">
          <p>
            All consent records are timestamped, versioned, and stored securely. You may
            request a full export of your consent history by contacting our support team.
          </p>
          <p className="mt-2">
            Compliant with India's Digital Personal Data Protection Act 2023 (DPDP) and
            applicable healthcare data regulations.
          </p>
        </div>
      </div>
    </div>
  );
}
