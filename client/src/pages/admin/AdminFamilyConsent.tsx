import { useState } from "react";
import { trpc } from "@/lib/trpc";

function RevokeModal({
  consentId,
  onClose,
  onDone,
}: {
  consentId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const revoke = trpc.dsrAdmin.revokeFamilyConsent.useMutation({
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">
          Revoke Family Consent #{consentId}
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          Revoking consent will prevent future Schedule H/H1/X sales to this
          minor until a new consent is recorded.
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm mb-4 h-24 resize-none"
          placeholder="Reason for revocation (required, min 5 chars)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {revoke.error && (
          <p className="text-red-600 text-sm mb-2">{revoke.error.message}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border text-sm"
          >
            Cancel
          </button>
          <button
            disabled={reason.length < 5 || revoke.isPending}
            onClick={() => revoke.mutate({ consentId, reason })}
            className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-50"
          >
            {revoke.isPending ? "Revoking…" : "Revoke Consent"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFamilyConsent() {
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
  const list = trpc.dsrAdmin.listFamilyConsents.useQuery({ limit: 200 });
  const rows = list.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Family Consent Records</h1>
      <p className="text-sm text-gray-500 mb-6">
        Guardian consent for Schedule H/H1/X dispensing to minor customers under
        DPDP Act 2023 and Drugs &amp; Cosmetics Rules.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => list.refetch()}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {list.isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {list.error && (
        <p className="text-red-600 text-sm">Error: {list.error.message}</p>
      )}
      {!list.isLoading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">
          No family consent records found.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "ID",
                  "Minor Customer",
                  "Guardian Name",
                  "Relationship",
                  "Scope",
                  "Signed",
                  "Status",
                  "Action",
                ].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map(row => {
                const isActive = !row.consentRevokedAt;
                const scope = Array.isArray(row.consentScopeJson)
                  ? (row.consentScopeJson as string[]).join(", ")
                  : String(row.consentScopeJson ?? "");
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-4 py-3">{row.minorCustomerId}</td>
                    <td className="px-4 py-3">{row.guardianName}</td>
                    <td className="px-4 py-3 capitalize">
                      {row.guardianRelationship}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{scope}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.consentSignedAt
                        ? new Date(row.consentSignedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600 font-semibold">
                          REVOKED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isActive && (
                        <button
                          onClick={() => setRevokeTarget(row.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {revokeTarget !== null && (
        <RevokeModal
          consentId={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onDone={() => {
            setRevokeTarget(null);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}
