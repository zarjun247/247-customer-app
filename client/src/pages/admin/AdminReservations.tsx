import { useState } from "react";
import { trpc } from "@/lib/trpc";

type ReservationState = "active" | "pending_confirmation" | "confirmed" | "released" | "expired";

const STATE_BADGE: Record<ReservationState, string> = {
  active: "bg-green-100 text-green-800",
  pending_confirmation: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  released: "bg-gray-100 text-gray-800",
  expired: "bg-red-100 text-red-800",
};

export default function AdminReservations() {
  const [storeId, setStoreId] = useState<number>(1);
  const [limit, setLimit] = useState<number>(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [releaseKey, setReleaseKey] = useState(0);

  const listQuery = trpc.reservation.listByStore.useQuery({ storeId, limit });
  const releaseMutation = trpc.reservation.release.useMutation({
    onSuccess: () => {
      void listQuery.refetch();
      setSelectedId(null);
    },
  });

  const reservations = listQuery.data ?? [];
  const selected = selectedId ? reservations.find((r: { id: string }) => r.id === selectedId) : null;

  function handleAdminRelease(reservationId: string) {
    const nextKey = releaseKey + 1;
    setReleaseKey(nextKey);
    releaseMutation.mutate({
      reservationId,
      reason: "admin_override",
      idempotencyKey: `admin-release:${reservationId}:${nextKey}`,
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Active Reservations</h1>

      <div className="flex gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Store ID
          </label>
          <input
            type="number"
            min={1}
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="border rounded px-3 py-2 w-24"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Limit
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border rounded px-3 py-2"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void listQuery.refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {listQuery.isLoading && <p className="text-gray-500">Loading...</p>}
      {listQuery.error && (
        <p className="text-red-600">Error: {listQuery.error.message}</p>
      )}

      {!listQuery.isLoading && reservations.length === 0 && (
        <p className="text-gray-500">No active reservations for store {storeId}.</p>
      )}

      {reservations.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reservations.map((res: {
                id: string;
                customerId: number | null;
                state: ReservationState;
                createdAt: string | Date;
                expiresAt: string | Date;
              }) => (
                <tr key={res.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{res.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm">{res.customerId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${STATE_BADGE[res.state] ?? "bg-gray-100"}`}
                    >
                      {res.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(res.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(res.expiresAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => setSelectedId(res.id === selectedId ? null : res.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Details
                    </button>
                    {res.state === "active" && (
                      <button
                        onClick={() => handleAdminRelease(res.id)}
                        disabled={releaseMutation.isPending}
                        className="text-red-600 hover:underline text-sm disabled:opacity-50"
                      >
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">
            Reservation Details: <span className="font-mono">{(selected as { id: string }).id}</span>
          </h2>
          <pre className="text-xs overflow-auto bg-white p-3 rounded border">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
