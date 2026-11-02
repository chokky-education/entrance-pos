"use client";

import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import { formatMoneyDisplay as formatMoney, mulDec } from "@/lib/numeric";
import type { StarterCartLine } from "../DomePosScreen";

export interface LineEditDialogProps {
  line: StarterCartLine | null;
  sweetnessOptions: { id: string; label: string }[];
  addonOptions: { id: string; label: string; price: string }[];
  onClose: () => void;
  onAdjustQty: (lineId: string, delta: string) => void;
  onUpdateOption: (
    lineId: string,
    patch: { sweetness?: string; addonId?: string; note?: string },
  ) => void;
  onRemoveLine: (lineId: string) => void;
}

export function LineEditDialog({
  line,
  sweetnessOptions,
  addonOptions,
  onClose,
  onAdjustQty,
  onUpdateOption,
  onRemoveLine,
}: LineEditDialogProps) {
  if (!line) return null;

  const lineTotal = mulDec(line.qty, line.unitPrice);
  const currentAddonId =
    addonOptions.find((a) => a.label === line.addonLabel)?.id ?? "NONE";
  const supportsSweetness =
    line.category === "COFFEE" || line.category === "NON_COFFEE";

  return (
    <div
      className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`แก้ไขรายการ ${line.name}`}
    >
      <div
        className="dp-modal flex w-full max-w-md flex-col overflow-hidden rounded-[6px] border border-[#e0e0e0] bg-white text-[#212121] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-[#e0e0e0] bg-[#fafafa] px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#212121]">{line.name}</div>
            <div className="font-mono text-xs text-[#757575]">
              ฿{formatMoney(line.unitPrice, 2)} / {line.unitCode} · รวม ฿
              {formatMoney(lineTotal, 2)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างแก้ไขรายการ"
            className="inline-flex size-8 items-center justify-center rounded-md text-[#757575] hover:bg-[#eeeeee] hover:text-[#212121]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4 text-xs">
          {/* Quantity Stepper */}
          <div>
            <div className="mb-1.5 font-bold text-[#757575]">จำนวน</div>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => onAdjustQty(line.lineId, "-1")}
                className="dp-btn-ghost inline-flex size-11 items-center justify-center text-base font-bold"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-16 text-center font-mono text-2xl font-extrabold text-[#212121]">
                {line.qty}
              </span>
              <button
                type="button"
                onClick={() => onAdjustQty(line.lineId, "1")}
                className="dp-btn-primary inline-flex size-11 items-center justify-center text-base font-bold"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Sweetness Level Selector */}
          {supportsSweetness && (
            <div>
              <div className="mb-1.5 font-bold text-[#757575]">ระดับความหวาน</div>
              <div className="grid grid-cols-5 gap-1.5">
                {sweetnessOptions.map((sw) => {
                  const active = line.sweetness === sw.id;
                  return (
                    <button
                      key={sw.id}
                      type="button"
                      data-testid={`pos-starter-sweet-${sw.id}`}
                      onClick={() =>
                        onUpdateOption(line.lineId, { sweetness: sw.id })
                      }
                      className={`h-9 rounded-[6px] text-xs font-bold transition ${
                        active ? "dp-chip-active" : "dp-chip"
                      }`}
                    >
                      {sw.id.replace("หวาน ", "")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Addon Options */}
          <div>
            <div className="mb-1.5 font-bold text-[#757575]">ตัวเลือกเสริม</div>
            <div className="grid grid-cols-1 gap-1.5">
              {addonOptions.map((ad) => {
                const active = currentAddonId === ad.id;
                return (
                  <button
                    key={ad.id}
                    type="button"
                    onClick={() =>
                      onUpdateOption(line.lineId, { addonId: ad.id })
                    }
                    className={`flex h-9 items-center justify-between rounded-[6px] px-3 text-xs font-semibold transition ${
                      active ? "dp-chip-active" : "dp-chip"
                    }`}
                  >
                    <span>{ad.label}</span>
                    {active && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {/* Keep accessible select synchronized for keyboard/UAT compatibility */}
            <select
              aria-label="แก้ไขตัวเลือกเสริมในตะกร้า"
              data-testid="pos-starter-addon-select"
              value={currentAddonId}
              onChange={(e) =>
                onUpdateOption(line.lineId, { addonId: e.target.value })
              }
              className="sr-only"
            >
              {addonOptions.map((ad) => (
                <option key={ad.id} value={ad.id}>
                  {ad.label}
                </option>
              ))}
            </select>
          </div>

          {/* Note Input */}
          <div>
            <label className="mb-1.5 block font-bold text-[#757575]">
              หมายเหตุเฉพาะรายการ
            </label>
            <input
              type="text"
              value={line.note}
              onChange={(e) =>
                onUpdateOption(line.lineId, { note: e.target.value })
              }
              placeholder="เช่น แยกน้ำแข็ง, หวานน้อยมาก, เพิ่มเวลาซ้อม..."
              className="dp-input h-9 w-full rounded-[6px] px-3 text-xs text-[#212121]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#e0e0e0] bg-[#fafafa] px-4 py-3">
          <button
            type="button"
            onClick={() => {
              onRemoveLine(line.lineId);
              onClose();
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-[#e53935] transition hover:bg-rose-100"
          >
            <Trash2 className="size-4" />
            <span>ลบรายการ</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="dp-btn-primary inline-flex h-10 items-center gap-1.5 px-5 text-xs font-bold"
          >
            <Check className="size-4" />
            <span>ตกลง</span>
          </button>
        </div>
      </div>
    </div>
  );
}

