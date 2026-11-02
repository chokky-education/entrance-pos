"use client";

import {
  Cloud,
  Coffee,
  Database,
  FileText,
  Flame,
  Plus,
  RefreshCw,
  Store,
  X,
} from "lucide-react";
import type { StarterWorkTab } from "../DomePosScreen";

export interface PosNavDrawerProps {
  open: boolean;
  activeTab: StarterWorkTab;
  onClose: () => void;
  onSelectTab: (tab: StarterWorkTab) => void;
  onOpenAddMenu: () => void;
  occupiedTableCount: number;
  preparingKdsCount: number;
  shiftStatus: {
    isOpen: boolean;
    cashierCode: string;
    openedAt: string;
    openingFloat: string;
  };
  firebaseStatus: {
    d1Database: string;
    r2Bucket: string;
    latencyMs: number;
  };
  menuCount: number;
  autoSyncCountdown: number;
  syncLoading: boolean;
  onTriggerSync: () => void;
}

const DRAWER_ITEMS: {
  id: StarterWorkTab;
  label: string;
  sublabel: string;
  Icon: typeof Coffee;
}[] = [
  {
    id: "order",
    label: "ขายหน้าร้าน (Sales)",
    sublabel: "หน้าคิดเงิน กาแฟ & ห้องซ้อมดนตรี",
    Icon: Coffee,
  },
  {
    id: "tables",
    label: "ตั๋วเปิด / ผังโต๊ะ (Open Tickets)",
    sublabel: "ชั้น 1 Cafe (C1–C4) · ชั้น 2 ห้องซ้อม (S1–S2)",
    Icon: Store,
  },
  {
    id: "kds",
    label: "จอคิวบาริสต้า (Kitchen Display)",
    sublabel: "ลำดับคิวชงเครื่องดื่มและเรียกคิวเสียงไทย",
    Icon: Flame,
  },
  {
    id: "reports",
    label: "รายงาน & กะขาย (Shift & Receipts)",
    sublabel: "สรุปยอดขาย ประวัติบิล และเปิด/ปิดกะ",
    Icon: FileText,
  },
  {
    id: "manage",
    label: "จัดการสินค้า & Firebase (Back Office)",
    sublabel: "แก้ไขราคา รูปภาพ และการเชื่อมต่อ Firestore",
    Icon: Cloud,
  },
];

export function PosNavDrawer({
  open,
  activeTab,
  onClose,
  onSelectTab,
  onOpenAddMenu,
  occupiedTableCount,
  preparingKdsCount,
  shiftStatus,
  firebaseStatus,
  menuCount,
  autoSyncCountdown,
  syncLoading,
  onTriggerSync,
}: PosNavDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="dp-backdrop fixed inset-0 z-50 flex"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="เมนูนำทาง POS"
    >
      <aside
        className="flex h-full w-80 max-w-[85vw] flex-col bg-white text-[#212121] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loyverse-style Green Drawer Header */}
        <div className="bg-[#2fa84f] px-4 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Entrance Creative Space"
                className="size-11 rounded-full border-2 border-white/80 object-cover"
              />
              <div>
                <div className="text-sm font-bold leading-tight">
                  Entrance Creative Space
                </div>
                <div className="text-[11px] text-white/85">
                  อิสรภาพ · มรภ.บ้านสมเด็จฯ
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดเมนู"
              className="inline-flex size-8 items-center justify-center rounded-md text-white/90 hover:bg-white/15"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-md bg-black/15 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  shiftStatus.isOpen ? "bg-emerald-300" : "bg-rose-300"
                }`}
              />
              <span className="font-semibold">
                กะ: {shiftStatus.cashierCode}
              </span>
            </div>
            <span className="text-[11px] text-white/85">
              {shiftStatus.isOpen
                ? `เปิดกะ ${shiftStatus.openedAt} น.`
                : "ปิดกะแล้ว"}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 divide-y divide-[#f0f0f0] overflow-y-auto py-1">
          {DRAWER_ITEMS.map(({ id, label, sublabel, Icon }) => {
            const isActive = activeTab === id;
            const badge =
              id === "tables"
                ? occupiedTableCount
                : id === "kds"
                  ? preparingKdsCount
                  : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectTab(id);
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-[#e8f5ec] text-[#23863e]"
                    : "text-[#212121] hover:bg-[#f5f5f5]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`size-5 shrink-0 ${
                      isActive ? "text-[#2fa84f]" : "text-[#757575]"
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold">{label}</div>
                    <div className="text-[11px] text-[#757575]">{sublabel}</div>
                  </div>
                </div>
                {badge > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2fa84f] px-1.5 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Actions & Firebase Status Footer */}
        <div className="border-t border-[#e0e0e0] bg-[#fafafa] p-3 text-xs">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAddMenu();
            }}
            className="dp-btn-primary mb-2.5 flex h-9 w-full items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Plus className="size-4" />
            <span>+ เพิ่มเมนูใหม่ (Firebase)</span>
          </button>

          <div className="flex items-center justify-between text-[11px] text-[#757575]">
            <span className="inline-flex items-center gap-1 font-medium text-[#212121]">
              <Database className="size-3.5 text-[#2fa84f]" />
              {firebaseStatus.d1Database} ({menuCount} เมนู)
            </span>
            <button
              type="button"
              onClick={onTriggerSync}
              disabled={syncLoading}
              className="inline-flex items-center gap-1 font-semibold text-[#23863e] hover:underline"
            >
              <RefreshCw
                className={`size-3 ${syncLoading ? "animate-spin" : ""}`}
              />
              <span>ซิงค์ ({autoSyncCountdown}s)</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

