import { useState } from "react";
import { trpc } from "@/lib/trpc";

type NoticeKind = "privacy_policy" | "terms" | "rx_data_use" | "marketing";

const KIND_LABELS: Record<NoticeKind, string> = {
  privacy_policy: "Privacy Policy",
  terms: "Terms of Service",
  rx_data_use: "Rx Data Use",
  marketing: "Marketing",
};

function NoticePanel({ kind }: { kind: NoticeKind }) {
  const [includeExpired, setIncludeExpired] = useState(false);
  const notices = trpc.dsrAdmin.listConsentNotices.useQuery({
    noticeKind: kind,
    includeExpired,
  });

  const rows = notices.data ?? [];

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={e => setIncludeExpired(e.target.checked)}
            className="rounded"
          />
          Show expired versions
        </label>
        <button
          onClick={() => notices.refetch()}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {notices.isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {notices.error && (
        <p className="text-red-600 text-sm">Error: {notices.error.message}</p>
      )}
      {!notices.isLoading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">
          No notice versions found for {KIND_LABELS[kind]}.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-4">
          {rows.map(notice => (
            <div key={notice.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm">
                    v{notice.version}
                  </span>
                  {!notice.effectiveUntil && (
                    <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">
                      ACTIVE
                    </span>
                  )}
                  {notice.effectiveUntil &&
                    new Date(notice.effectiveUntil) < new Date() && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600 font-semibold">
                        EXPIRED
                      </span>
                    )}
                </div>
                <span className="text-xs text-gray-400">
                  {notice.language.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                <p>
                  <span className="font-medium">Effective from:</span>{" "}
                  {new Date(notice.effectiveFrom).toLocaleDateString()}
                </p>
                <p>
                  <span className="font-medium">Effective until:</span>{" "}
                  {notice.effectiveUntil
                    ? new Date(notice.effectiveUntil).toLocaleDateString()
                    : "—"}
                </p>
                <p className="col-span-2 font-mono">
                  <span className="font-medium not-italic">SHA-256:</span>{" "}
                  {notice.contentHash}
                </p>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-blue-600 hover:underline text-xs">
                  View notice text
                </summary>
                <pre className="mt-2 bg-white border rounded p-2 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {notice.contentText}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminConsentRegistry() {
  const [tab, setTab] = useState<NoticeKind>("privacy_policy");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Consent Notice Registry</h1>
      <p className="text-sm text-gray-500 mb-6">
        Versioned consent notices required under DPDP Act 2023 Section 5. Each
        version is SHA-256 hashed for integrity.
      </p>

      <div className="flex gap-2 mb-6 border-b pb-2 flex-wrap">
        {(Object.keys(KIND_LABELS) as NoticeKind[]).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-t text-sm font-medium ${tab === k ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <NoticePanel key={tab} kind={tab} />
    </div>
  );
}
