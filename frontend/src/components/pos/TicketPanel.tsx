"use client";

import type { RefObject } from "react";
import {
  Coffee,
  CreditCard,
  PauseCircle,
  QrCode,
  Sparkles,
  Trash2,
  Volume2,
  Wallet,
  Zap,
} from "lucide-react";
import {
  cmpDec,
  formatMoneyDisplay as formatMoney,
  mulDec,
  parseScaled,
} from "@/lib/numeric";
import type {
  HeldTableOrder,
  PaymentMethodCode,
  ServiceChannel,
  StarterCartLine,
} from "../DomePosScreen";

export interface TicketPanelProps {
  queueCounter: number;
  serviceChannel: ServiceChannel;
  onSelectChannel: (ch: ServiceChannel) => void;
  selectedTableId: string;
  onSelectTable: (tableId: string) => void;
  tables: {
    tableId: string;
    tableName: string;
    zone: "CAFE_F1" | "STUDIO_F2";
    zoneLabel: string;
    seats: number;
  }[];
  heldTables: Record<string, HeldTableOrder>;
  cashierCode: string;
  cartLines: StarterCartLine[];
  onClearCart: () => void;
  onOpenLineEdit: (lineId: string) => void;
  onAdjustLineQty: (lineId: string, delta: string) => void;
  onRemoveLine: (lineId: string) => void;
  discountInput: string;
  onDiscountChange: (val: string) => void;
  orderRemark: string;
  onRemarkChange: (val: string) => void;
  paymentMethod: PaymentMethodCode;
  onSelectPaymentMethod: (pm: PaymentMethodCode) => void;
  cartSubtotal: string;
  validDiscount: string;
  cartNetTotal: string;
  walletSummary: {
    custAddress: string;
    custBalance: string;
    merchBalance: string;
    tokenSymbol: string;
  };
  submittingBill: boolean;
  chargeDialogOpen: boolean;
  payButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenChargeScreen: () => void;
  onQuickExactCash: () => void;
  onHoldOrder: () => void;
  onSpeakTotal: () => void;
}

function formatMoneyBlankZero(val: string | number | undefined | null): string {
  const s = String(val ?? "").trim();
  if (!s || cmpDec(s, "0") === 0) return "";
  return formatMoney(s, 2);
}

const PAYMENT_OPTIONS: {
  code: PaymentMethodCode;
  label: string;
  Icon: typeof Wallet;
}[] = [
  { code: "CASH", label: "เงินสด", Icon: Wallet },
  { code: "PROMPTPAY", label: "QR", Icon: QrCode },
  { code: "TRANSFER", label: "โอน", Icon: CreditCard },
  { code: "CARD", label: "บัตร", Icon: CreditCard },
  { code: "WALLET", label: "Wallet", Icon: Sparkles },
];

export function TicketPanel({
  queueCounter,
  serviceChannel,
  onSelectChannel,
  selectedTableId,
  onSelectTable,
  tables,
  heldTables,
  cashierCode,
  cartLines,
  onClearCart,
  onOpenLineEdit,
  onAdjustLineQty,
  onRemoveLine,
  discountInput,
  onDiscountChange,
  orderRemark,
  onRemarkChange,
  paymentMethod,
  onSelectPaymentMethod,
  validDiscount,
  cartNetTotal,
  walletSummary,
  submittingBill,
  chargeDialogOpen,
  payButtonRef,
  onOpenChargeScreen,
  onQuickExactCash,
  onHoldOrder,
  onSpeakTotal,
}: TicketPanelProps) {
  const totalPoints = (
    parseScaled(cartNetTotal) / parseScaled("100")
  ).toString();

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-[#e0e0e0] bg-white lg:w-[390px] xl:w-[420px]">
      {/* 1. Loyverse Ticket Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e0e0e0] px-3.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#212121]">ตั๋วขาย</span>
          <span className="rounded bg-[#e8f5ec] px-2 py-0.5 font-mono text-xs font-bold text-[#23863e]">
            #POS-{String(queueCounter).padStart(3, "0")}
          </span>
          <span className="text-[11px] text-[#757575]">· {cashierCode}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSpeakTotal}
            title="พูดยอดชำระ"
            className="inline-flex size-8 items-center justify-center rounded-md text-[#757575] transition hover:bg-[#f5f5f5] hover:text-[#212121]"
          >
            <Volume2 className="size-4" />
          </button>
          {cartLines.length > 0 && (
            <button
              type="button"
              data-testid="pos-starter-clear-cart-btn"
              onClick={onClearCart}
              title="ล้างตั๋วขาย"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#e53935] transition hover:bg-rose-50"
            >
              <Trash2 className="size-3.5" />
              <span>ล้าง</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Dining Option & Table Selector Bar (Loyverse Subheader) */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[#e0e0e0] bg-[#fafafa] px-3 py-2">
        <div className="flex rounded-md border border-[#e0e0e0] bg-white p-0.5">
          {(
            [
              { id: "DINE_IN", label: "ทานที่ร้าน" },
              { id: "TAKEAWAY", label: "กลับบ้าน" },
              { id: "DELIVERY", label: "เดลิเวอรี่" },
            ] as { id: ServiceChannel; label: string }[]
          ).map((ch) => (
            <button
              key={ch.id}
              type="button"
              data-testid={`pos-starter-channel-${ch.id}`}
              onClick={() => onSelectChannel(ch.id)}
              className={`h-7 rounded px-2.5 text-[11px] font-bold transition ${
                serviceChannel === ch.id
                  ? "bg-[#2fa84f] text-white"
                  : "text-[#757575] hover:text-[#212121]"
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {serviceChannel === "DINE_IN" && (
          <select
            aria-label="เลือกโต๊ะหรือห้องซ้อม"
            data-testid="pos-starter-table-select"
            value={selectedTableId}
            onChange={(e) => onSelectTable(e.target.value)}
            className="dp-input h-8 flex-1 cursor-pointer rounded-md px-2 text-xs font-bold text-[#212121]"
          >
            {tables.map((tb) => (
              <option key={tb.tableId} value={tb.tableId}>
                {tb.tableName}
                {heldTables[tb.tableId] ? " (พักบิล)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 3. Ticket Item Lines (Tap row to open LineEditDialog) */}
      <div className="min-h-0 flex-1 divide-y divide-[#f0f0f0] overflow-y-auto bg-white">
        {cartLines.length === 0 ? (
          <div className="flex h-full min-h-44 flex-col items-center justify-center p-6 text-center text-xs text-[#757575]">
            <Coffee className="mb-2 size-8 text-[#bdbdbd]" />
            <div className="font-semibold text-[#212121]">ยังไม่มีรายการในตั๋ว</div>
            <div className="mt-0.5 text-[11px]">
              แตะไทล์สินค้าทางซ้ายเพื่อเพิ่มลงตั๋วขาย
            </div>
          </div>
        ) : (
          cartLines.map((line) => {
            const lineTotal = mulDec(line.qty, line.unitPrice);
            const modifiers = [
              line.sweetness,
              line.addonLabel,
              line.note ? `"${line.note}"` : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={line.lineId}
                onClick={() => onOpenLineEdit(line.lineId)}
                className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 transition hover:bg-[#f5f5f5] active:bg-[#e8f5ec]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-xs font-bold text-[#212121]">
                      {line.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-[#757575]">
                      × {line.qty}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[#757575]">
                    {modifiers || `@${formatMoney(line.unitPrice, 2)}/${line.unitCode} · แตะเพื่อแก้ไข`}
                  </div>
                </div>

                {/* Quick inline stepper + line total */}
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`ลดจำนวน ${line.name}`}
                    onClick={() => onAdjustLineQty(line.lineId, "-1")}
                    className="inline-flex size-6 items-center justify-center rounded border border-[#e0e0e0] bg-white text-xs font-bold text-[#212121] hover:bg-[#f5f5f5]"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`เพิ่มจำนวน ${line.name}`}
                    onClick={() => onAdjustLineQty(line.lineId, "1")}
                    className="inline-flex size-6 items-center justify-center rounded border border-[#e0e0e0] bg-white text-xs font-bold text-[#2fa84f] hover:bg-[#e8f5ec]"
                  >
                    +
                  </button>
                  <span className="w-16 text-right font-mono text-xs font-bold text-[#212121]">
                    {formatMoney(lineTotal, 2)}
                  </span>
                  <button
                    type="button"
                    aria-label={`ลบ ${line.name}`}
                    onClick={() => onRemoveLine(line.lineId)}
                    className="inline-flex size-6 items-center justify-center rounded text-[#757575] hover:bg-rose-50 hover:text-[#e53935]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Compact Loyalty Wallet Strip */}
      <div
        data-testid="pos-starter-wallet-card"
        className="flex shrink-0 items-center justify-between border-t border-[#e0e0e0] bg-[#f9fbf9] px-3.5 py-1.5 text-[11px]"
      >
        <span
          data-testid="pos-starter-wallet-auto-point-badge"
          className="font-semibold text-[#23863e]"
        >
          สะสมแต้ม Wallet (+{totalPoints} Pt)
        </span>
        <span
          data-testid="pos-starter-wallet-balance"
          className="font-mono font-semibold text-[#757575]"
        >
          คงเหลือ: {formatMoneyBlankZero(walletSummary.custBalance) || "0.00"}{" "}
          {walletSummary.tokenSymbol}
        </span>
      </div>

      {/* 5. Discount, Note, Totals & Loyverse SAVE / CHARGE Footer */}
      <div className="shrink-0 space-y-2 border-t border-[#e0e0e0] bg-[#fafafa] p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="dp-input flex h-8 items-center gap-1 rounded-md px-2">
            <span className="shrink-0 text-[11px] font-semibold text-[#757575]">
              ส่วนลด:
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="ส่วนลดท้ายบิล"
              value={
                cmpDec(discountInput || "0", "0") === 0 ? "" : discountInput
              }
              onChange={(e) => onDiscountChange(e.target.value)}
              placeholder="0.00"
              className="h-6 w-full bg-transparent text-right font-mono text-xs font-bold text-[#212121] outline-none"
            />
          </div>
          <div className="dp-input flex h-8 items-center rounded-md px-2">
            <input
              type="text"
              value={orderRemark}
              onChange={(e) => onRemarkChange(e.target.value)}
              placeholder="หมายเหตุท้ายบิล..."
              className="h-6 w-full bg-transparent text-xs text-[#212121] placeholder-[#757575] outline-none"
            />
          </div>
        </div>

        {/* Quick Payment Method Strip (kept mounted when ChargeScreen is closed) */}
        {!chargeDialogOpen && (
          <div className="grid grid-cols-5 gap-1">
            {PAYMENT_OPTIONS.map((pm) => (
              <button
                key={pm.code}
                type="button"
                data-testid={`pos-starter-paymethod-${pm.code.toLowerCase()}`}
                onClick={() => onSelectPaymentMethod(pm.code)}
                className={`inline-flex h-7 items-center justify-center gap-1 rounded text-[11px] font-semibold ${
                  paymentMethod === pm.code ? "dp-chip-active" : "dp-chip"
                }`}
              >
                <pm.Icon className="size-3 shrink-0" />
                <span className="truncate">{pm.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Total Summary Row */}
        <div className="flex items-baseline justify-between pt-0.5">
          <div className="text-xs font-bold text-[#212121]">
            รวมทั้งสิ้น{" "}
            <span className="font-normal text-[#757575]">(รวม VAT 7%)</span>
            {cmpDec(validDiscount, "0") > 0 && (
              <span className="ml-1.5 text-[11px] font-semibold text-[#e53935]">
                ลด -{formatMoney(validDiscount, 2)}
              </span>
            )}
          </div>
          <div
            data-testid="pos-starter-net-total"
            className="font-mono text-xl font-extrabold text-[#212121]"
          >
            {formatMoneyBlankZero(cartNetTotal) || "0.00"} ฿
          </div>
        </div>

        {/* Loyverse Two-Button Bar: SAVE (Hold) + CHARGE */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="pos-starter-hold-btn"
            onClick={onHoldOrder}
            disabled={cartLines.length === 0}
            className="dp-btn-ghost inline-flex h-12 items-center justify-center gap-1.5 px-3 text-xs font-bold text-[#212121] disabled:opacity-40"
          >
            <PauseCircle className="size-4 text-[#f9a825]" />
            <span data-testid="pos-starter-hold-table-btn">พักบิล</span>
          </button>

          <button
            type="button"
            data-testid="pos-starter-quick-cash-btn"
            onClick={onQuickExactCash}
            disabled={cartLines.length === 0 || submittingBill}
            title="รับเงินสดพอดีทันที (1-Click)"
            className="dp-btn-ghost inline-flex h-12 items-center justify-center gap-1 px-2.5 text-xs font-bold text-[#23863e] disabled:opacity-40"
          >
            <Zap className="size-4" />
            <span className="hidden sm:inline">เงินสดพอดี</span>
          </button>

          <button
            type="button"
            ref={payButtonRef}
            data-testid={
              chargeDialogOpen
                ? "pos-ticket-open-charge-btn"
                : "pos-starter-confirm-pay-btn"
            }
            onClick={onOpenChargeScreen}
            disabled={cartLines.length === 0 || submittingBill}
            className="dp-pay flex h-12 flex-1 items-center justify-between rounded-[6px] px-4 text-white disabled:opacity-40"
          >
            <span
              data-testid={
                chargeDialogOpen
                  ? "pos-ticket-open-charge-label"
                  : "pos-starter-pay-submit-btn"
              }
              className="text-sm font-bold tracking-wide uppercase"
            >
              {submittingBill ? "กำลังบันทึก..." : "ชำระเงิน (F9)"}
            </span>
            <span className="font-mono text-base font-extrabold">
              ฿{formatMoneyBlankZero(cartNetTotal) || "0.00"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}

