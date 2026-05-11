import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Tab = "pii" | "audit" | "capabilities" | "ratelimit" | "csp";

export default function AdminSecurity() {
  const [tab, setTab] = useState<Tab>("pii");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Security Console</h1>

      <div className="flex gap-2 mb-6 border-b pb-2 flex-wrap">
        {(["pii", "audit", "capabilities", "ratelimit", "csp"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t text-sm font-medium capitalize ${tab === t ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {t === "pii" ? "PII Keys" : t === "audit" ? "Audit Chain" : t === "ratelimit" ? "Rate Limits" : t === "csp" ? "CSP" : "Capabilities"}
          </button>
        ))}
      </div>

      {tab === "pii" && <PiiKeyPanel />}
      {tab === "audit" && <AuditChainPanel />}
      {tab === "capabilities" && <CapabilityPanel />}
      {tab === "ratelimit" && <RateLimitPanel />}
      {tab === "csp" && <CspPanel />}
    </div>
  );
}

// ─── PII Key Panel ────────────────────────────────────────────────────────────

function PiiKeyPanel() {
  const keyStatus = trpc.security.piiKeyStatus.useQuery();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">PII Encryption Keys</h2>
      {keyStatus.isLoading && <p className="text-gray-500">Loading...</p>}
      {keyStatus.error && <p className="text-red-600">Error: {keyStatus.error.message}</p>}
      {keyStatus.data && (
        keyStatus.data.length === 0
          ? <p className="text-gray-500">No key records found. Master key may not be configured.</p>
          : (
            <div className="overflow-x-auto rounded border">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Scope", "Active Version", "Total Keys", "Retired Keys", "Oldest Key"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {keyStatus.data.map((row) => (
                    <tr key={row.scope} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{row.scope}</td>
                      <td className="px-4 py-3">{row.activeKeyVersion ?? "—"}</td>
                      <td className="px-4 py-3">{row.totalKeys}</td>
                      <td className="px-4 py-3 text-yellow-600">{row.retiredKeys}</td>
                      <td className="px-4 py-3 text-gray-500">{row.oldestKey ? new Date(row.oldestKey).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  );
}

// ─── Audit Chain Panel ────────────────────────────────────────────────────────

function AuditChainPanel() {
  const stats = trpc.security.auditChainStats.useQuery();
  const [verified, setVerified] = useState<{ verified: boolean; rowsChecked: number; firstBreakAt?: number; firstBreakReason?: string } | null>(null);
  const verifyMutation = trpc.security.auditChainVerify.useQuery(undefined, { enabled: false });

  async function handleVerify() {
    const result = await verifyMutation.refetch();
    if (result.data) setVerified(result.data);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Audit Hash Chain</h2>
      {stats.isLoading && <p className="text-gray-500">Loading stats...</p>}
      {stats.data && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border rounded p-4">
            <div className="text-2xl font-bold">{stats.data.totalRows.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">Total Rows</div>
          </div>
          <div className="border rounded p-4">
            <div className="text-2xl font-bold">{stats.data.newestRow?.sequenceNumber ?? "—"}</div>
            <div className="text-sm text-gray-500 mt-1">Latest Sequence</div>
          </div>
        </div>
      )}
      <button
        onClick={handleVerify}
        disabled={verifyMutation.isFetching}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
      >
        {verifyMutation.isFetching ? "Verifying..." : "Run Chain Verification"}
      </button>
      {verified && (
        <div className={`mt-4 p-4 rounded border ${verified.verified ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
          <p className={`font-semibold ${verified.verified ? "text-green-700" : "text-red-700"}`}>
            {verified.verified ? "Chain intact" : "Chain violation detected"}
          </p>
          <p className="text-sm text-gray-600 mt-1">Rows checked: {verified.rowsChecked}</p>
          {!verified.verified && (
            <p className="text-sm text-red-600 mt-1">
              Break at seq {verified.firstBreakAt}: {verified.firstBreakReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Capability Panel ─────────────────────────────────────────────────────────

function CapabilityPanel() {
  const defs = trpc.security.capabilityDefinitions.useQuery();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Capability Definitions</h2>
      {defs.isLoading && <p className="text-gray-500">Loading...</p>}
      {defs.data && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Capability", "Description", "Risk Level"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {defs.data.map((d) => (
                <tr key={d.capabilityName} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{d.capabilityName}</td>
                  <td className="px-4 py-3 text-gray-600">{d.description}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      d.riskLevel === "critical" ? "bg-red-100 text-red-700" :
                      d.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {d.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Rate Limit Panel ─────────────────────────────────────────────────────────

function RateLimitPanel() {
  const config = trpc.security.rateLimitConfig.useQuery();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Procedure Rate Limits</h2>
      {config.isLoading && <p className="text-gray-500">Loading...</p>}
      {config.data && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Procedure", "Window", "Max Requests", "Block Duration"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {config.data.map((row) => (
                <tr key={row.procedure} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{row.procedure}</td>
                  <td className="px-4 py-3">{row.windowMs / 1000}s</td>
                  <td className="px-4 py-3">{row.max}</td>
                  <td className="px-4 py-3 text-gray-500">{row.blockMs ? `${row.blockMs / 1000}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CSP Panel ────────────────────────────────────────────────────────────────

function CspPanel() {
  const status = trpc.security.cspStatus.useQuery();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Content Security Policy</h2>
      {status.isLoading && <p className="text-gray-500">Loading...</p>}
      {status.data && (
        <div className="space-y-4">
          <div className="border rounded p-4 flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 w-28">Mode:</span>
            <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
              status.data.mode === "enforce" ? "bg-green-100 text-green-700" :
              status.data.mode === "report_only" ? "bg-yellow-100 text-yellow-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {status.data.mode}
            </span>
          </div>
          <div className="border rounded p-4 flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 w-28">Report URI:</span>
            <span className="text-sm text-gray-600 font-mono">{status.data.reportUri ?? "not configured"}</span>
          </div>
          {status.data.mode === "off" && (
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
              CSP is disabled. Set CSP_MODE=report_only to begin collecting violations without blocking traffic.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
