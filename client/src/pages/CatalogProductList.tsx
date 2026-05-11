/**
 * CatalogProductList.tsx — extracted product display components from Catalog.tsx
 * Covers: ProductPlaceholder, ProductDetailModal, ProductCard
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Pill,
  Stethoscope,
  Baby,
  Leaf,
  ShoppingBag,
  Sparkles,
  Heart,
  ShieldCheck,
  X,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";

// ─── Category icon + palette ──────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; bg: string; color: string }
> = {
  medicine: { icon: Pill, bg: "rgba(43,127,255,0.10)", color: "#2B7FFF" },
  devices: { icon: Stethoscope, bg: "rgba(0,200,150,0.10)", color: "#00C896" },
  baby: { icon: Baby, bg: "rgba(244,63,94,0.10)", color: "#F43F5E" },
  nutrition: { icon: Leaf, bg: "rgba(0,200,150,0.10)", color: "#00C896" },
  fmcg: { icon: ShoppingBag, bg: "rgba(245,158,11,0.10)", color: "#F59E0B" },
  wellness: { icon: Sparkles, bg: "rgba(43,127,255,0.10)", color: "#2B7FFF" },
  personal_care: { icon: Heart, bg: "rgba(244,63,94,0.10)", color: "#F43F5E" },
};
const DEFAULT_CONFIG = {
  icon: Pill,
  bg: "rgba(43,127,255,0.10)",
  color: "#2B7FFF",
};

// ─── Availability language ────────────────────────────────────────────────────
export function getAvailabilityLabel(
  availableQty: number,
  requiresPrescription: boolean,
  schedule: string
): { label: string; color: string } {
  if (availableQty > 0 && !requiresPrescription) {
    return { label: "Available now", color: "#00C896" };
  }
  if (availableQty > 0 && requiresPrescription) {
    return { label: "Prescription review required", color: "#F59E0B" };
  }
  if (
    availableQty === 0 &&
    (schedule === "H" || schedule === "H1" || schedule === "X")
  ) {
    return { label: "Available on request", color: "#6B6B75" };
  }
  return { label: "Currently unavailable", color: "#6B6B75" };
}

// ─── Product Placeholder ──────────────────────────────────────────────────────
export function ProductPlaceholder({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const Icon = cfg.icon;
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "#141416" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: cfg.bg }}
      >
        <Icon size={18} strokeWidth={1.5} style={{ color: cfg.color }} />
      </div>
    </div>
  );
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────
export function ProductDetailModal({
  item,
  cartQty,
  onAdd,
  onRemove,
  onClose,
}: {
  item: any;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isRx = item.requiresPrescription;
  const avail = getAvailabilityLabel(available, isRx, item.schedule ?? "");
  const canAdd = available > 0;
  const images = [
    item.imageUrl,
    item.imageHeroUrl,
    item.imageSideUrl,
    item.imageRearUrl,
    item.imageLabelUrl,
    item.imageNutritionUrl,
  ].filter(Boolean) as string[];
  const [imgIdx, setImgIdx] = useState(0);
  const safeIdx = Math.min(imgIdx, Math.max(0, images.length - 1));
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: "#141416",
          border: "1px solid #2A2A2E",
          maxHeight: "92dvh",
          overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2
            className="text-base font-semibold leading-snug pr-4"
            style={{ color: "#F0F0F2" }}
          >
            {item.name}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-opacity hover:opacity-60 shrink-0"
            style={{ color: "#6B6B75" }}
          >
            <X size={16} />
          </button>
        </div>
        {images.length > 0 ? (
          <div
            className="relative mx-4 mb-3 rounded-xl overflow-hidden"
            style={{ aspectRatio: "4/3", background: "#0A0A0B" }}
          >
            <img
              src={images[safeIdx]}
              alt={`${item.name} view ${safeIdx + 1}`}
              className="w-full h-full object-contain"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                  disabled={safeIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-20"
                  style={{
                    background: "rgba(14,14,16,0.80)",
                    color: "#F0F0F2",
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() =>
                    setImgIdx(i => Math.min(images.length - 1, i + 1))
                  }
                  disabled={safeIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-20"
                  style={{
                    background: "rgba(14,14,16,0.80)",
                    color: "#F0F0F2",
                  }}
                >
                  <ChevronRight size={14} />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        background:
                          i === safeIdx ? "#2B7FFF" : "rgba(255,255,255,0.25)",
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            className="mx-4 mb-3 rounded-xl overflow-hidden"
            style={{ aspectRatio: "4/3", background: "#0A0A0B" }}
          >
            <ProductPlaceholder category={item.category ?? "medicine"} />
          </div>
        )}
        <div className="px-4 pb-5 space-y-3">
          {(item.displayLabel || item.packSize) && (
            <p className="text-sm" style={{ color: "#A0A0A8" }}>
              {item.displayLabel || item.packSize}
            </p>
          )}
          {item.companyName && (
            <p className="text-xs" style={{ color: "#6B6B75" }}>
              {item.companyName}
            </p>
          )}
          {isRx && (
            <div className="mt-2">
              <Badge
                variant="regulated"
                className="text-xs inline-flex items-center gap-2"
              >
                <ShieldCheck size={12} strokeWidth={2} />
                Prescription required
              </Badge>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span
              className="text-lg font-semibold"
              style={{ color: "#F0F0F2" }}
            >
              ₹{Number(item.sellingPrice).toFixed(0)}
            </span>
            {Number(item.mrp) > Number(item.sellingPrice) && (
              <span
                className="text-sm line-through"
                style={{ color: "#4B4B55" }}
              >
                ₹{Number(item.mrp).toFixed(0)}
              </span>
            )}
            {item.gstRate && (
              <span className="text-xs ml-auto" style={{ color: "#4B4B55" }}>
                incl. {item.gstRate}% GST
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                avail.label.includes("Available") && !isRx
                  ? "success"
                  : avail.label.includes("Prescription")
                    ? "regulated"
                    : avail.label.includes("Currently")
                      ? "destructive"
                      : "warning"
              }
              className="text-xs"
            >
              {avail.label}
            </Badge>
          </div>
          {canAdd &&
            (cartQty === 0 ? (
              <button
                onClick={onAdd}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: "#2B7FFF", color: "white" }}
              >
                Add to order
              </button>
            ) : (
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{
                  background: "rgba(43,127,255,0.12)",
                  border: "1px solid rgba(43,127,255,0.25)",
                }}
              >
                <button
                  onClick={onRemove}
                  className="transition-opacity hover:opacity-60"
                  style={{ color: "#2B7FFF" }}
                >
                  <Minus size={16} />
                </button>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#2B7FFF" }}
                >
                  {cartQty} in order
                </span>
                <button
                  onClick={onAdd}
                  disabled={cartQty >= available}
                  className="transition-opacity hover:opacity-60 disabled:opacity-30"
                  style={{ color: "#2B7FFF" }}
                >
                  <Plus size={16} />
                </button>
              </div>
            ))}
          {item.genericName && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{ background: "#0A0A0B", border: "1px solid #1C1C1F" }}
            >
              <Info
                size={12}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
                style={{ color: "#4B4B55" }}
              />
              <p
                className="text-xs leading-relaxed"
                style={{ color: "#6B6B75" }}
              >
                Generic name:{" "}
                <span style={{ color: "#A0A0A8" }}>{item.genericName}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
export function ProductCard({
  item,
  cartQty,
  onAdd,
  onRemove,
  onDetail,
  onConsult,
}: {
  item: any;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onDetail: () => void;
  onConsult?: () => void;
}) {
  const available = Number(item.availableQty) || 0;
  const isRx = item.requiresPrescription;
  const etaMins = item.etaMins ?? null;
  const etaText = item.etaText ?? (etaMins ? `~${etaMins} min` : null);
  const avail = getAvailabilityLabel(available, isRx, item.schedule ?? "");
  const canAdd = available > 0;

  return (
    <div
      className="premium-card flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-blue-400/30 hover:shadow-[0_22px_48px_rgba(43,127,255,0.12)]"
      onClick={onDetail}
    >
      {/* ── Visual zone ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: "4/3", background: "#141416" }}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ProductPlaceholder category={item.category ?? "medicine"} />
        )}

        {/* Rx treatment — prominent, not tiny */}
        {isRx && (
          <div className="absolute top-2 left-2">
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                background: "rgba(14,14,16,0.92)",
                border: "1px solid rgba(245,158,11,0.40)",
              }}
            >
              <ShieldCheck
                size={10}
                strokeWidth={2}
                style={{ color: "#F59E0B" }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: "#F59E0B" }}
              >
                Prescription required
              </span>
            </div>
          </div>
        )}

        {/* Out-of-stock overlay */}
        {!canAdd && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            style={{ background: "rgba(10,10,11,0.65)" }}
          >
            <span
              className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{
                color: "#A0A0A8",
                background: "#1C1C1F",
                border: "1px solid #2A2A2E",
              }}
            >
              {avail.label}
            </span>
          </div>
        )}
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <div className="p-3">
        {/* Name */}
        <h3
          className="text-sm font-semibold leading-snug line-clamp-2 mb-0.5"
          style={{ color: "#F0F0F2" }}
        >
          {item.name}
        </h3>

        {/* Dosage / form */}
        {(item.displayLabel || item.packSize) && (
          <p
            className="text-xs mb-0.5 leading-snug"
            style={{ color: "#6B6B75" }}
          >
            {item.displayLabel || item.packSize}
          </p>
        )}

        {/* Manufacturer */}
        {item.companyName && (
          <p
            className="text-[10px] truncate mb-1.5 leading-snug"
            style={{ color: "#4B4B55" }}
          >
            {item.companyName}
          </p>
        )}

        {/* Product type flags */}
        {(() => {
          const flags: Array<{ label: string; color: string; bg: string }> = [];
          if (!item.requiresPrescription)
            flags.push({
              label: "OTC",
              color: "#00C896",
              bg: "rgba(0,200,150,0.10)",
            });
          if (item.isChronic)
            flags.push({
              label: "Chronic",
              color: "#2B7FFF",
              bg: "rgba(43,127,255,0.10)",
            });
          if (item.category === "devices")
            flags.push({
              label: "Device",
              color: "#A0A0A8",
              bg: "rgba(160,160,168,0.10)",
            });
          if (item.category === "nutrition")
            flags.push({
              label: "Nutrition",
              color: "#00C896",
              bg: "rgba(0,200,150,0.10)",
            });
          if (item.category === "baby")
            flags.push({
              label: "Baby care",
              color: "#F43F5E",
              bg: "rgba(244,63,94,0.10)",
            });
          if (item.category === "personal_care")
            flags.push({
              label: "Personal care",
              color: "#F43F5E",
              bg: "rgba(244,63,94,0.10)",
            });
          if (item.category === "wellness")
            flags.push({
              label: "Wellness",
              color: "#2B7FFF",
              bg: "rgba(43,127,255,0.10)",
            });
          if (flags.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1 mb-2">
              {flags.map(f => (
                <Badge
                  key={f.label}
                  variant="outline"
                  className="text-[9px]"
                  style={{ color: f.color, background: f.bg }}
                >
                  {f.label}
                </Badge>
              ))}
            </div>
          );
        })()}

        {/* Availability */}
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
          <span
            className="flex items-center gap-1.5 text-[10px] font-semibold"
            style={{ color: avail.color }}
          >
            <span
              className={`status-dot ${canAdd ? (isRx ? "status-dot-warning" : "status-dot-success") : "status-dot-neutral"}`}
            />
            {avail.label}
          </span>
          {etaText && canAdd && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "rgba(43,127,255,0.12)", color: "#2B7FFF" }}
            >
              {etaText}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
            ₹{Number(item.sellingPrice).toFixed(0)}
          </span>
          {Number(item.mrp) > Number(item.sellingPrice) && (
            <span
              className="text-[10px] line-through"
              style={{ color: "#4B4B55" }}
            >
              ₹{Number(item.mrp).toFixed(0)}
            </span>
          )}
        </div>

        {/* Add / qty control */}
        {canAdd &&
          (cartQty === 0 ? (
            <button
              onClick={e => {
                e.stopPropagation();
                onAdd();
              }}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              Add
            </button>
          ) : (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-1.5"
              style={{
                background: "rgba(43,127,255,0.12)",
                border: "1px solid rgba(43,127,255,0.25)",
              }}
            >
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="transition-opacity hover:opacity-60"
                style={{ color: "#2B7FFF" }}
              >
                <Minus size={13} />
              </button>
              <span
                className="text-xs font-semibold"
                style={{ color: "#2B7FFF" }}
              >
                {cartQty}
              </span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onAdd();
                }}
                disabled={cartQty >= available}
                className="transition-opacity hover:opacity-60 disabled:opacity-30"
                style={{ color: "#2B7FFF" }}
              >
                <Plus size={13} />
              </button>
            </div>
          ))}
        {/* Rx consult shortcut — only for Rx items when not in cart */}
        {isRx && cartQty === 0 && onConsult && (
          <button
            onClick={e => {
              e.stopPropagation();
              onConsult();
            }}
            className="w-full mt-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-opacity hover:opacity-70 flex items-center justify-center gap-1"
            style={{
              color: "#6B6B75",
              background: "transparent",
              border: "1px solid #2A2A2E",
            }}
          >
            <Stethoscope size={10} strokeWidth={1.75} />
            Need a prescription? Talk to a doctor
          </button>
        )}
      </div>
    </div>
  );
}
