import { useMemo } from "react";

export type PrinterStatus = "configured" | "not_configured" | "warning" | "error";

export interface BarcodeLabelItem {
  id: string | number;
  productName: string;
  batchNo?: string | null;
  expiryDate?: string | null;
  mrp?: string | number | null;
  barcode: string;
  quantity?: number | null;
}

export interface BarcodeLabelPreviewProps {
  labels: BarcodeLabelItem[];
  printerStatus?: PrinterStatus;
  printerName?: string | null;
  printerWarning?: string | null;
  onReprint?: (label: BarcodeLabelItem) => void | Promise<void>;
  onBrowserPrint?: () => void;
}

export function getPrinterStatusText(status: PrinterStatus, printerName?: string | null): string {
  if (status === "configured" && printerName) return `Printer configured: ${printerName}`;
  if (status === "configured") return "Printer configured";
  if (status === "warning") return "Printer warning";
  if (status === "error") return "Printer error";
  return "Printer not configured";
}

export function canClaimSdkPrinted(status: PrinterStatus): boolean {
  return status === "configured";
}

export function BarcodeLabelPreview({
  labels,
  printerStatus = "not_configured",
  printerName,
  printerWarning,
  onReprint,
  onBrowserPrint,
}: BarcodeLabelPreviewProps) {
  const labelCount = useMemo(() => labels.reduce((sum, item) => sum + (item.quantity ?? 1), 0), [labels]);
  const printerText = getPrinterStatusText(printerStatus, printerName);
  const browserPrint = () => {
    if (onBrowserPrint) onBrowserPrint();
    else if (typeof window !== "undefined") window.print();
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4" data-barcode-ux="label-preview">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Barcode label preview</h2>
          <p className="text-xs text-white/60">Batch label preview · {labelCount} label{labelCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <p className="font-semibold">{printerText}</p>
          {printerStatus !== "configured" && <p>Preview/browser print only</p>}
          {printerWarning && <p>{printerWarning}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {labels.map((label) => (
          <article key={label.id} className="rounded-lg border border-white/10 bg-black/30 p-3 text-white">
            <p className="text-sm font-semibold">{label.productName}</p>
            <p className="mt-1 text-xs text-white/60">Batch: {label.batchNo || "—"} · Exp: {label.expiryDate || "—"} · MRP: {label.mrp ?? "—"}</p>
            <div className="mt-3 rounded border border-white/20 bg-white px-3 py-2 text-center text-black">
              <div className="mx-auto mb-1 h-8 w-full max-w-48 bg-[repeating-linear-gradient(90deg,#000_0_2px,#fff_2px_4px,#000_4px_5px,#fff_5px_8px)]" aria-hidden="true" />
              <code className="text-xs font-bold tracking-widest">{label.barcode}</code>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-white/50">Qty: {label.quantity ?? 1}</span>
              {onReprint && (
                <button type="button" className="rounded-md border border-white/10 px-2 py-1 text-xs text-white hover:bg-white/10" onClick={() => void onReprint(label)}>
                  Reprint
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {labels.length === 0 && <p className="mt-4 rounded-lg border border-white/10 p-4 text-sm text-white/60">No labels queued for preview.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90" onClick={browserPrint}>
          Browser print fallback
        </button>
        <p className="text-xs text-white/50">No SDK printed success is shown unless a configured provider confirms it.</p>
      </div>
    </section>
  );
}
