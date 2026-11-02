"use client";

import type { RefObject } from "react";
import {
  Cloud,
  Coffee,
  Database,
  FileText,
  Flame,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import type { StarterWorkTab } from "../DomePosScreen";

export interface PosTopBarProps {
  activeTab: StarterWorkTab;
  onSelectTab: (tab: StarterWorkTab) => void;
  onOpenDrawer: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  occupiedTableCount: number;
  preparingKdsCount: number;
  latencyMs: number;
  shiftOpen: boolean;
  cashierCode: string;
  syncLoading: boolean;
  onTriggerSync: () => void;
  onOpenAddMenu: () => void;
}

const TAB_ITEMS: {
  id: StarterWorkTab;
  label: string;
  shortLabel: string;
  testId: string;
  Icon: typeof Coffee;
}[] = [
  {
    id: "order",
    label: "ขายหน้าร้าน",
    shortLabel: "ขาย",
    testId: "pos-starter-tab-order",
    Icon: Coffee,
  },
  {
    id: "tables",
    label: "ตั๋วเปิด / โต๊ะ",
    shortLabel: "โต๊ะ",
    testId: "pos-starter-tab-tables",
    Icon: Store,
  },
  {
    id: "kds",
    label: "จอคิวบาริสต้า (KDS)",
    shortLabel: "KDS",
    testId: "pos-starter-tab-kds",
    Icon: Flame,
  },
  {
    id: "reports",
    label: "รายงาน & กะ",
    shortLabel: "รายงาน",
    testId: "pos-starter-tab-reports",
    Icon: FileText,
  },
  {
    id: "manage",
    label: "สินค้า & ตั้งค่า",
    shortLabel: "สินค้า",
    testId: "pos-starter-tab-manage",
    Icon: Cloud,
  },
];

export function PosTopBar({
  activeTab,
  onSelectTab,
  onOpenDrawer,
  searchQuery,
  onSearchChange,
  searchInputRef,
  occupiedTableCount,
  preparingKdsCount,
  latencyMs,
  shiftOpen,
  cashierCode,
  syncLoading,
  onTriggerSync,
  onOpenAddMenu,
}: PosTopBarProps) {
  return (
    <header className="dp-header z-20 flex h-14 shrink-0 items-center justify-between gap-2 px-3 text-white select-none">
      {/* Left: Hamburger + Brand + Quick Tab Switcher */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="เปิดเมนูหลัก"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/15 active:bg-white/25"
        >
          <Menu className="size-5" />
        </button>

        <div
          data-testid="dome-pos-brand-badge"
          className="flex items-center gap-2 pr-1"
        >
          <img
            src="/logo.png"
            alt="Entrance Creative Space Logo"
            data-testid="dome-pos-logo"
            className="size-7 shrink-0 rounded-full border border-white/40 object-cover"
          />
          <div className="hidden leading-tight xl:block">
            <div className="text-xs font-bold tracking-tight text-white">
              Entrance Creative Space
            </div>
            <div className="text-[10px] text-white/80">
              Cafe ชั้น 1 · ห้องซ้อม ชั้น 2
            </div>
          </div>
        </div>

        {/* Loyverse-style flat navigation tabs */}
        <nav className="flex items-center gap-1 rounded-md bg-black/15 p-1">
          {TAB_ITEMS.map(({ id, label, shortLabel, testId, Icon }) => {
            const isActive = activeTab === id;
            const badgeCount =
              id === "tables"
                ? occupiedTableCount
                : id === "kds"
                  ? preparingKdsCount
                  : 0;
            return (
              <button
                key={id}
                type="button"
                data-testid={testId}
                onClick={() => onSelectTab(id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-white text-[#23863e] shadow-xs"
                    : "text-white/90 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
                <span className="md:hidden">{shortLabel}</span>
                {badgeCount > 0 && (
                  <span
                    className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      isActive
                        ? "bg-[#2fa84f] text-white"
                        : "bg-[#f9a825] text-[#212121]"
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center/Right: Search bar (when on order tab) + Compact status icons */}
      <div className="flex items-center gap-2">
        {activeTab === "order" && (
          <div className="relative flex h-9 w-44 items-center sm:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-white/75" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด (F2)"
              className="h-9 w-full rounded-md border border-white/25 bg-white/15 pl-8 pr-7 text-xs font-medium text-white placeholder-white/75 outline-none transition focus:border-white focus:bg-white focus:text-[#212121] focus:placeholder-[#757575]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2 text-white/80 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          data-testid="pos-starter-add-menu-btn"
          onClick={onOpenAddMenu}
          title="เพิ่มสินค้าใหม่"
          className="hidden h-8 items-center gap-1 rounded-md border border-white/30 bg-white/15 px-2.5 text-xs font-semibold text-white transition hover:bg-white/25 sm:inline-flex"
        >
          <Plus className="size-3.5" />
          <span className="hidden lg:inline">เพิ่มเมนู</span>
        </button>

        <button
          type="button"
          data-testid="pos-starter-cloudflare-badge"
          onClick={() => onSelectTab("manage")}
          title={`เชื่อมต่อ Firebase Firestore (${latencyMs}ms) · กะ ${cashierCode}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/25 bg-black/15 px-2.5 text-[11px] font-semibold text-white transition hover:bg-black/25"
        >
          <span
            className={`size-2 rounded-full ${
              shiftOpen ? "bg-emerald-300" : "bg-rose-300"
            }`}
          />
          <Database className="size-3.5 shrink-0 text-white/90" />
          <span className="hidden sm:inline">{cashierCode}</span>
          <span className="font-mono text-[10px] text-white/80">
            {latencyMs}ms
          </span>
        </button>

        <button
          type="button"
          data-testid="pos-starter-sync-btn"
          onClick={onTriggerSync}
          disabled={syncLoading}
          title="ซิงค์ข้อมูล Firebase ทันที"
          className="inline-flex size-8 items-center justify-center rounded-md border border-white/25 bg-black/15 text-white transition hover:bg-black/25 disabled:opacity-50"
        >
          <RefreshCw
            className={`size-3.5 ${syncLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </header>
  );
}

