import { useCallback, useMemo, useRef, useState } from "react";

export type BarcodeScanState =
  | "idle"
  | "scanning"
  | "found"
  | "not_found"
  | "ambiguous"
  | "incomplete_master"
  | "blocked_regulated"
  | "error";

export interface CanonicalAvailability {
  availableQty?: number | null;
  reservedQty?: number | null;
  onHandQty?: number | null;
  source?: string | null;
  asOf?: string | number | Date | null;
}

export interface BarcodeResolvedResult {
  status?: BarcodeScanState;
  rows?: unknown[];
  canonicalAvailability?: CanonicalAvailability | null;
  message?: string;
}

export interface BarcodeScannerInputProps {
  label?: string;
  placeholder?: string;
  minLength?: number;
  debounceMs?: number;
  disabled?: boolean;
  scanState?: BarcodeScanState;
  lastScannedValue?: string;
  result?: BarcodeResolvedResult | null;
  onScan?: (barcode: string) => BarcodeResolvedResult | void | Promise<BarcodeResolvedResult | void>;
  onResolved?: (result: BarcodeResolvedResult, barcode: string) => void;
  onError?: (error: Error, barcode: string) => void;
}

export function normalizeScannerValue(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function deriveScanState(result: BarcodeResolvedResult | null | undefined): BarcodeScanState {
  if (!result) return "idle";
  if (result.status) return result.status;
  if (Array.isArray(result.rows)) {
    if (result.rows.length === 0) return "not_found";
    if (result.rows.length > 1) return "ambiguous";
    return "found";
  }
  return "found";
}

export function getCanonicalAvailabilityText(result: BarcodeResolvedResult | null | undefined): string {
  const availability = result?.canonicalAvailability;
  if (!availability) return "Canonical availability unavailable";
  if (availability.availableQty === null || availability.availableQty === undefined) return "Canonical availability unavailable";
  return `Canonical available: ${availability.availableQty}`;
}

const stateText: Record<BarcodeScanState, string> = {
  idle: "Ready to scan",
  scanning: "Scanning…",
  found: "Barcode found",
  not_found: "Barcode not found",
  ambiguous: "Ambiguous barcode match",
  incomplete_master: "Incomplete product master",
  blocked_regulated: "Blocked: regulated item requires confirmed workflow",
  error: "Scan error",
};

export function BarcodeScannerInput({
  label = "Barcode scanner",
  placeholder = "Scan barcode or type manually, then press Enter",
  minLength = 1,
  debounceMs = 80,
  disabled = false,
  scanState,
  lastScannedValue,
  result,
  onScan,
  onResolved,
  onError,
}: BarcodeScannerInputProps) {
  const [value, setValue] = useState("");
  const [internalState, setInternalState] = useState<BarcodeScanState>("idle");
  const [internalLastScanned, setInternalLastScanned] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleState = scanState ?? internalState;
  const visibleLastScanned = lastScannedValue ?? internalLastScanned;
  const availabilityText = useMemo(() => getCanonicalAvailabilityText(result), [result]);

  const submit = useCallback(async () => {
    const barcode = normalizeScannerValue(value);
    if (barcode.length < minLength || disabled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInternalState("scanning");
    setInternalLastScanned(barcode);
    setMessage(null);

    try {
      const resolved = await onScan?.(barcode);
      if (resolved) {
        const nextState = deriveScanState(resolved);
        setInternalState(nextState);
        setMessage(resolved.message ?? null);
        onResolved?.(resolved, barcode);
      } else {
        setInternalState("found");
      }
      setValue("");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setInternalState("error");
      setMessage(error.message);
      onError?.(error, barcode);
    }
  }, [disabled, minLength, onError, onResolved, onScan, value]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4" data-barcode-ux="scanner-input">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-white" htmlFor="barcode-scanner-input">{label}</label>
        <input
          id="barcode-scanner-input"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          inputMode="text"
          className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
          onChange={(event) => {
            setValue(event.target.value);
            if (event.target.value) {
              setInternalState("scanning");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setInternalState("idle"), debounceMs);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-white/70 sm:grid-cols-3">
        <p><span className="font-semibold text-white/90">State:</span> {stateText[visibleState]}</p>
        <p><span className="font-semibold text-white/90">Last scanned:</span> {visibleLastScanned || "—"}</p>
        <p><span className="font-semibold text-white/90">Availability:</span> {availabilityText}</p>
      </div>
      {message && <p className="mt-2 text-xs text-amber-300">{message}</p>}
    </section>
  );
}
