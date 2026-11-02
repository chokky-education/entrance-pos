"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Printer,
  QrCode,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cmpDec, formatMoneyDisplay as formatMoney } from "@/lib/numeric";
import type { PaymentMethodCode } from "../DomePosScreen";

export interface ChargeScreenProps {
  open: boolean;
  onClose: () => void;
  cartNetTotal: string;
  validDiscount: string;
  paymentMethod: PaymentMethodCode;
  onSelectPaymentMethod: (pm: PaymentMethodCode) => void;
  cashReceivedInput: string;
  onCashReceivedChange: (val: string) => void;
  cashChangeAmount: string;
  submittingBill: boolean;
  onConfirmPay: (options?: {
    forceMethod?: PaymentMethodCode;
    forceCashReceived?: string;
  }) => void;
}

function formatMoneyBlankZero(val: string | number | undefined | null): string {
  const s = String(val ?? "").trim();
  if (!s || cmpDec(s, "0") === 0) return "";
  return formatMoney(s, 2);
}

const PAYMENT_METHODS: {
  code: PaymentMethodCode;
  label: string;
  sublabel: string;
  Icon: typeof Wallet;
}[] = [
  {
    code: "CASH",
    label: "เงินสด (Cash)",
    sublabel: "คำนวณเงินทอนอัตโนมัติ",
    Icon: Wallet,
  },
  {
    code: "PROMPTPAY",
    label: "QR พร้อมเพย์",
    sublabel: "สแกนจ่ายเข้าบัญชีร้าน",
    Icon: QrCode,
  },
  {
    code: "TRANSFER",
    label: "โอนเงินธนาคาร",
    sublabel: "Mobile Banking",
    Icon: CreditCard,
  },
  {
    code: "CARD",
    label: "บัตรเครดิต / เดบิต",
    sublabel: "เครื่องรูดบัตร EDC",
    Icon: CreditCard,
  },
  {
    code: "WALLET",
    label: "จ่ายด้วย Wallet",
    sublabel: "ใช้แต้มสะสมลูกค้า",
    Icon: Sparkles,
  },
];

export function ChargeScreen({
  open,
  onClose,
  cartNetTotal,
  validDiscount,
  paymentMethod,
  onSelectPaymentMethod,
  cashReceivedInput,
  onCashReceivedChange,
  cashChangeAmount,
  submittingBill,
  onConfirmPay,
}: ChargeScreenProps) {
  if (!open) return null;

  return (
    <div
      className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="หน้าจอรับชำระเงิน"
    >
      <div
        className="dp-modal flex w-full max-w-2xl flex-col overflow-hidden rounded-[6px] border border-[#e0e0e0] bg-white text-[#212121] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loyverse Charge Header */}
        <div className="flex h-14 items-center justify-between bg-[#2fa84f] px-4 text-white">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/15"
          >
            <ArrowLeft className="size-4" />
            <span>กลับไปหน้าตั๋วขาย</span>
          </button>
          <div className="text-sm font-bold">รับชำระเงิน (Charge)</div>
          <div className="w-24 text-right font-mono text-xs text-white/85">
            F9 = ยืนยัน
          </div>
        </div>

        {/* Big Total Due Banner */}
        <div className="border-b border-[#e0e0e0] bg-[#fafafa] py-5 text-center">
          <div className="text-xs font-semibold text-[#757575]">
            ยอดชำระสุทธิ (รวม VAT 7%)
            {cmpDec(validDiscount, "0") > 0 && (
              <span className="ml-2 text-[#e53935]">
                (ส่วนลด -{formatMoney(validDiscount, 2)} ฿)
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-4xl font-extrabold tracking-tight text-[#212121]">
            ฿{formatMoneyBlankZero(cartNetTotal) || "0.00"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-12">
          {/* Left: Cash Received & Quick Tender Buttons */}
          <div className="space-y-3 md:col-span-7">
            <div className="text-xs font-bold text-[#757575]">
              รับเงินสด (Cash Received)
            </div>

            <div className="flex items-center gap-2">
              <div className="dp-input flex h-12 flex-1 items-center justify-between rounded-[6px] px-3">
                <span className="text-xs font-semibold text-[#757575]">
                  รับเงินมา (฿):
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="จำนวนเงินสดที่รับมา"
                  value={
                    cmpDec(cashReceivedInput || "0", "0") === 0
                      ? ""
                      : cashReceivedInput
                  }
                  onChange={(e) => {
                    onSelectPaymentMethod("CASH");
                    onCashReceivedChange(e.target.value);
                  }}
                  placeholder={formatMoneyBlankZero(cartNetTotal) || "0.00"}
                  className="h-9 w-36 bg-transparent text-right font-mono text-lg font-extrabold text-[#212121] outline-none"
                />
              </div>
            </div>

            {/* Quick Banknote Tender Buttons (Tap to immediately tender cash like Loyverse) */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-[#757575]">
                แตะจำนวนธนบัตรเพื่อรับเงินสดทันที:
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onConfirmPay({
                      forceMethod: "CASH",
                      forceCashReceived: cartNetTotal,
                    })
                  }
                  disabled={submittingBill}
                  className="dp-btn-ghost h-11 font-mono text-xs font-extrabold text-[#23863e] hover:border-[#2fa84f] hover:bg-[#e8f5ec]"
                >
                  พอดี (฿{formatMoney(cartNetTotal, 0)})
                </button>
                {["100", "500", "1000"].map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => {
                      onSelectPaymentMethod("CASH");
                      onCashReceivedChange(bill);
                    }}
                    className="dp-btn-ghost h-11 font-mono text-sm font-extrabold text-[#212121] hover:border-[#2fa84f] hover:bg-[#e8f5ec]"
                  >
                    ฿{bill}
                  </button>
                ))}
              </div>
            </div>

            {/* Prominent Change Box */}
            <div className="flex items-center justify-between rounded-[6px] border border-[#e0e0e0] bg-[#e8f5ec] px-4 py-3">
              <span className="text-xs font-bold text-[#23863e]">
                เงินทอน (Change)
              </span>
              <span className="font-mono text-2xl font-extrabold text-[#23863e]">
                ฿{formatMoneyBlankZero(cashChangeAmount) || "0.00"}
              </span>
            </div>
          </div>

          {/* Right: Payment Method Selection */}
          <div className="space-y-2 md:col-span-5">
            <div className="text-xs font-bold text-[#757575]">
              เลือกวิธีชำระเงิน
            </div>
            <div className="space-y-1.5">
              {PAYMENT_METHODS.map((pm) => {
                const active = paymentMethod === pm.code;
                return (
                  <button
                    key={pm.code}
                    type="button"
                    data-testid={`pos-starter-paymethod-${pm.code.toLowerCase()}`}
                    onClick={() => onSelectPaymentMethod(pm.code)}
                    className={`flex w-full items-center justify-between rounded-[6px] border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-[#2fa84f] bg-[#e8f5ec] text-[#23863e]"
                        : "border-[#e0e0e0] bg-white text-[#212121] hover:bg-[#f5f5f5]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <pm.Icon
                        className={`size-4 shrink-0 ${
                          active ? "text-[#2fa84f]" : "text-[#757575]"
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold">{pm.label}</div>
                        <div className="text-[10px] text-[#757575]">
                          {pm.sublabel}
                        </div>
                      </div>
                    </div>
                    {active && (
                      <CheckCircle2 className="size-4 shrink-0 text-[#2fa84f]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Confirm Charge Button */}
        <div className="flex items-center justify-end gap-2 border-t border-[#e0e0e0] bg-[#fafafa] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="dp-btn-ghost h-11 px-4 text-xs font-bold"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="pos-starter-confirm-pay-btn"
            onClick={() => onConfirmPay()}
            disabled={submittingBill}
            className="dp-pay inline-flex h-11 items-center gap-2 rounded-[6px] px-6 text-sm font-bold text-white disabled:opacity-50"
          >
            <Printer className="size-4" />
            <span data-testid="pos-starter-pay-submit-btn">
              {submittingBill
                ? "กำลังบันทึกบิล..."
                : `ยืนยันชำระเงิน ฿${formatMoneyBlankZero(cartNetTotal) || "0.00"} & พิมพ์ใบเสร็จ`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

