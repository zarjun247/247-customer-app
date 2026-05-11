import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function AdminAvailability() {
  const [productId, setProductId] = useState<number>(0);
  const [storeId, setStoreId] = useState<number>(1);
  const [queried, setQueried] = useState(false);

  const query = trpc.availability.query.useQuery(
    { productId, storeId },
    { enabled: queried && productId > 0 && storeId > 0 },
  );

  function handleQuery() {
    setQueried(true);
  }

  const avail = query.data;

  function expiryClass(expiryDate: string | Date) {
    const d = new Date(expiryDate);
    const daysLeft = Math.floor((d.getTime() - Date.now()) / 86_400_000);
    if (daysLeft <= 30) return "text-red-600 font-semibold";
    if (daysLeft <= 90) return "text-yellow-600";
    return "text-green-700";
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Canonical Availability (FEFO)</h1>

      <div className="flex gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product ID
          </label>
          <input
            type="number"
            min={1}
            value={productId || ""}
            onChange={(e) => {
              setQueried(false);
              setProductId(Number(e.target.value));
            }}
            placeholder="e.g. 42"
            className="border rounded px-3 py-2 w-32"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Store ID
          </label>
          <input
            type="number"
            min={1}
            value={storeId}
            onChange={(e) => {
              setQueried(false);
              setStoreId(Number(e.target.value));
            }}
            className="border rounded px-3 py-2 w-24"
          />
        </div>
        <button
          onClick={handleQuery}
          disabled={productId <= 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Query
        </button>
      </div>

      {query.isLoading && queried && <p className="text-gray-500">Loading...</p>}
      {query.error && (
        <p className="text-red-600">Error: {query.error.message}</p>
      )}

      {avail && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded p-4 text-center">
              <div className="text-3xl font-bold text-gray-800">{avail.totalOnHand}</div>
              <div className="text-sm text-gray-500 mt-1">On Hand</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{avail.totalReserved}</div>
              <div className="text-sm text-gray-500 mt-1">Reserved</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className={`text-3xl font-bold ${avail.totalSellable > 0 ? "text-green-600" : "text-red-600"}`}>
                {avail.totalSellable}
              </div>
              <div className="text-sm text-gray-500 mt-1">Sellable</div>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-3">
            Batch Breakdown <span className="text-sm font-normal text-gray-500">(FEFO order)</span>
          </h2>

          {avail.batches.length === 0 && (
            <p className="text-gray-500">No active batches.</p>
          )}

          {avail.batches.length > 0 && (
            <div className="overflow-x-auto rounded border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">On Hand</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reserved</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sellable</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {avail.batches.map((b: {
                    batchId: number;
                    batchNo: string;
                    expiryDate: string | Date;
                    onHand: number;
                    reserved: number;
                    sellable: number;
                  }) => (
                    <tr key={b.batchId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">{b.batchId}</td>
                      <td className="px-4 py-3 text-sm">{b.batchNo}</td>
                      <td className={`px-4 py-3 text-sm ${expiryClass(b.expiryDate)}`}>
                        {new Date(b.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{b.onHand}</td>
                      <td className="px-4 py-3 text-sm text-right text-yellow-600">{b.reserved}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${b.sellable > 0 ? "text-green-700" : "text-red-600"}`}>
                        {b.sellable}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Computed at: {new Date(avail.computedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
