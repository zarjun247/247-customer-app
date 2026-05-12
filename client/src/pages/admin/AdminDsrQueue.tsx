import { useState } from "react";
import { trpc } from "@/lib/trpc";

type DsrStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "rejected";
type DsrKind =
  | "access"
  | "export"
  | "rectification"
  | "erasure"
  | "consent_log"
  | "grievance";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}

function RejectModal({
  requestId,
  onClose,
  onDone,
}: {
  requestId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const reject = trpc.dsrAdmin.rejectRequest.useMutation({ onSuccess: onDone });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Reject DSR Request</h3>
        <textarea
          className="w-full border rounded p-2 text-sm mb-4 h-28 resize-none"
          placeholder="Rejection reason (required, min 5 chars)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {reject.error && (
          <p className="text-red-600 text-sm mb-2">{reject.error.message}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border text-sm"
          >
            Cancel
          </button>
          <button
            disabled={reason.length < 5 || reject.isPending}
            onClick={() => reject.mutate({ requestId, reason })}
            className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-50"
          >
            {reject.isPending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const list = trpc.dsrAdmin.list.useQuery({
    status: statusFilter || undefined,
    kind: kindFilter || undefined,
    limit: 200,
  });
  const detail = trpc.dsrAdmin.get.useQuery(
    { requestId: selectedId! },
    { enabled: !!selectedId }
  );
  const approve = trpc.dsrAdmin.approveRectification.useMutation({
    onSuccess: () => list.refetch(),
  });

  const rows = list.data ?? [];

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {(
            [
              "pending",
              "confirmed",
              "processing",
              "completed",
              "rejected",
            ] as DsrStatus[]
          ).map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={kindFilter}
          onChange={e => setKindFilter(e.target.value)}
        >
          <option value="">All kinds</option>
          {(
            [
              "access",
              "export",
              "rectification",
              "erasure",
              "consent_log",
              "grievance",
            ] as DsrKind[]
          ).map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
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
        <p className="text-gray-500 text-sm">No DSR requests found.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border mb-6">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["ID", "Kind", "Customer", "Status", "Created", "Actions"].map(
                  h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 capitalize">{row.requestKind}</td>
                  <td className="px-4 py-3">{row.customerId}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.requestStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedId(row.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View
                      </button>
                      {row.requestKind === "rectification" &&
                        row.requestStatus === "pending" && (
                          <button
                            onClick={() =>
                              approve.mutate({ requestId: row.id })
                            }
                            disabled={approve.isPending}
                            className="text-green-600 hover:underline text-xs disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                      {row.requestStatus === "pending" && (
                        <button
                          onClick={() => setRejectTarget(row.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <div className="border rounded p-4 bg-gray-50">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-semibold">Request Detail</h3>
            <button
              onClick={() => setSelectedId(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕ Close
            </button>
          </div>
          {detail.isLoading && (
            <p className="text-gray-500 text-sm">Loading…</p>
          )}
          {detail.data && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">ID:</span>{" "}
                <span className="font-mono">{detail.data.id}</span>
              </p>
              <p>
                <span className="font-medium">Kind:</span>{" "}
                {detail.data.requestKind}
              </p>
              <p>
                <span className="font-medium">Status:</span>{" "}
                <StatusBadge status={detail.data.requestStatus} />
              </p>
              <p>
                <span className="font-medium">Customer ID:</span>{" "}
                {detail.data.customerId}
              </p>
              {detail.data.rejectionReason && (
                <p>
                  <span className="font-medium">Rejection reason:</span>{" "}
                  {detail.data.rejectionReason}
                </p>
              )}
              {detail.data.requestPayload != null && (
                <div>
                  <p className="font-medium mb-1">Request payload:</p>
                  <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(detail.data.requestPayload, null, 2)}
                  </pre>
                </div>
              )}
              {detail.data.responsePayload != null && (
                <div>
                  <p className="font-medium mb-1">Response payload:</p>
                  <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(detail.data.responsePayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {rejectTarget && (
        <RejectModal
          requestId={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => {
            setRejectTarget(null);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

export default function AdminDsrQueue() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">DPDP — DSR Queue</h1>
      <p className="text-sm text-gray-500 mb-6">
        Data Subject Requests — review, approve, and reject under India DPDP Act
        2023 (30-day SLA).
      </p>
      <QueueTab />
    </div>
  );
}
