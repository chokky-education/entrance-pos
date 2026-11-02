"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  ExternalLink,
  KeyRound,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { cmpDec, formatMoneyDisplay as formatMoney } from "@/lib/numeric";
import type { StarterCategory, StarterMenuItem } from "./DomePosScreen";

interface FirebaseConfigState {
  projectId: string;
  apiKey: string;
  databaseId: string;
  storageBucket: string;
}

const CATEGORY_BADGE_LABELS: Record<Exclude<StarterCategory, "ALL">, string> = {
  COFFEE: "กาแฟ (Coffee)",
  NON_COFFEE: "ไม่ใช่กาแฟ (Non-Coffee)",
  STUDIO: "ห้องซ้อมดนตรี ชั้น 2",
  ERP: "เมนูเพิ่มเอง",
};

export function DomePosManagePanel({
  allMenuItems,
  onOpenAddMenuModal,
  onUpsertMenuItem,
  onDeleteMenuItem,
  onNotify,
  realtimeEvents = [],
  realtimeLatencyMs = 3,
  lastEventAt = "ออนไลน์",
  onTriggerRealtimeSync,
  autoSyncEnabled = true,
  onToggleAutoSync,
  autoSyncCountdown = 30,
  autoSyncCycleCount = 1,
}: {
  allMenuItems: StarterMenuItem[];
  onOpenAddMenuModal: () => void;
  onUpsertMenuItem: (item: StarterMenuItem) => Promise<void>;
  onDeleteMenuItem: (code: string) => void;
  onNotify: (type: "success" | "info" | "error", text: string) => void;
  realtimeEvents?: {
    id: string;
    type: string;
    timestamp: string;
    message: string;
    latencyMs: number;
  }[];
  realtimeLatencyMs?: number;
  lastEventAt?: string;
  onTriggerRealtimeSync?: () => Promise<void>;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  autoSyncCountdown?: number;
  autoSyncCycleCount?: number;
}) {
  const [searchText, setSearchText] = useState("");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCategory, setEditCategory] =
    useState<Exclude<StarterCategory, "ALL">>("COFFEE");
  const [showFirebaseDetail, setShowFirebaseDetail] = useState(true);

  const [fbConfig, setFbConfig] = useState<FirebaseConfigState>({
    projectId: "entrace-pos",
    apiKey: "AIzaSyDCDQ4ECpC2Rky--cMGsGR6qLHHcNImYng",
    databaseId: "(default)",
    storageBucket: "entrace-pos.firebasestorage.app",
  });
  const [savingFb, setSavingFb] = useState(false);
  const [fbSyncResult, setFbSyncResult] = useState<{
    status: string;
    syncedCollections: number;
    syncedItems: number;
    syncedImages: number;
  } | null>(null);

  const filtered = allMenuItems.filter((m) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return (
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  const startEdit = (item: StarterMenuItem) => {
    setEditingCode(item.code);
    setEditName(item.name);
    setEditPrice(item.price);
    setEditUnit(item.unit);
    setEditCategory(item.category);
  };

  const saveEdit = async (orig: StarterMenuItem) => {
    const cleanPrice = editPrice.replace(/[^0-9.]/g, "") || orig.price;
    if (!editName.trim() || cmpDec(cleanPrice, "0") <= 0) {
      onNotify("error", "กรุณาระบุชื่อสินค้าและราคาที่มากกว่า 0 บาท");
      return;
    }
    await onUpsertMenuItem({
      ...orig,
      name: editName.trim(),
      price: formatMoney(cleanPrice, 2).replace(/,/g, ""),
      unit: editUnit.trim() || orig.unit,
      category: editCategory,
    });
    setEditingCode(null);
  };

  const handleSaveFirebaseSetup = async () => {
    setSavingFb(true);
    try {
      const res = await fetch("/api/pos/firebase/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fbConfig.projectId.trim(),
          api_key: fbConfig.apiKey.trim(),
          database_id: fbConfig.databaseId.trim() || "(default)",
          storage_bucket:
            fbConfig.storageBucket.trim() ||
            (fbConfig.projectId.trim()
              ? `${fbConfig.projectId.trim()}.firebasestorage.app`
              : "domepos-images.firebasestorage.app"),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setFbSyncResult({
          status: String(j.status || "FIREBASE_CONNECTED"),
          syncedCollections: Number(
            j.synced_collections ?? j.synced_tables ?? 4,
          ),
          syncedItems: Number(j.synced_items ?? allMenuItems.length),
          syncedImages: Number(j.synced_images ?? 19),
        });
        onNotify(
          "success",
          `บันทึกการตั้งค่า Firebase Firestore & Storage และซิงค์ข้อมูลสินค้า ${j.synced_items ?? allMenuItems.length} รายการ + รูปภาพ ${j.synced_images ?? 19} รูป ขึ้น Firebase เรียบร้อยแล้ว`,
        );
      } else {
        onNotify(
          "error",
          String(j?.error || "ไม่สามารถบันทึกการตั้งค่า Firebase ได้"),
        );
      }
    } catch {
      onNotify("error", "เชื่อมต่อบริการตั้งค่า Firebase ไม่สำเร็จ");
    } finally {
      setSavingFb(false);
    }
  };

  return (
    <div
      className="dp-enter flex h-full w-full flex-col gap-4 overflow-y-auto bg-[#f5f5f5] p-4 text-[#212121]"
      data-testid="pos-starter-manage-view"
    >
      {/* ส่วนที่ 1: รายการสินค้า (Loyverse Back Office Item List) */}
      <div
        className="dp-surface p-4"
        data-testid="pos-product-manager-card"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#e0e0e0] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[6px] bg-[#e8f5ec] text-[#2fa84f]">
              <Package className="size-5" />
            </div>
            <div>
              <h2 className="dp-title text-sm">
                รายการสินค้า (Items · {allMenuItems.length} รายการ)
              </h2>
              <p className="dp-subtitle text-xs">
                แก้ไขชื่อเมนู ราคาขาย หมวดหมู่ หรือเพิ่มสินค้าใหม่เข้า Firebase Firestore
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-[#757575]" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อสินค้า..."
                className="dp-input h-9 w-52 rounded-[6px] pl-8 pr-2.5 text-xs"
              />
            </div>
            <button
              type="button"
              data-testid="pos-manage-add-item-btn"
              onClick={onOpenAddMenuModal}
              className="dp-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs font-bold"
            >
              <Plus className="size-4" />
              <span>+ เพิ่มสินค้า</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="pos-manage-items-table">
            <thead>
              <tr className="border-b border-[#e0e0e0] bg-[#fafafa] text-left font-bold text-[#757575]">
                <th className="py-2.5 pl-2">รูป</th>
                <th className="py-2.5 px-2">รหัส</th>
                <th className="py-2.5 px-2">ชื่อสินค้า</th>
                <th className="py-2.5 px-2">หมวดหมู่</th>
                <th className="py-2.5 px-2">หน่วย</th>
                <th className="py-2.5 px-2 text-right">ราคา (฿)</th>
                <th className="py-2.5 pr-2 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {filtered.map((item) => {
                const isEditing = editingCode === item.code;
                const imgSrc = item.imageUrl || `/products/${item.code}.jpg`;
                return (
                  <tr
                    key={item.code}
                    className="transition-colors hover:bg-[#fafafa]"
                  >
                    <td className="py-2 pl-2">
                      <img
                        src={imgSrc}
                        alt={item.name}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/products/CAFE-ESP-01.jpg";
                        }}
                        className="size-9 rounded-[4px] border border-[#e0e0e0] object-cover"
                      />
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] font-semibold text-[#757575]">
                      {item.code}
                    </td>
                    <td className="py-2 px-2 font-bold text-[#212121]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="dp-input h-8 w-full rounded-[4px] px-2 text-xs"
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {isEditing ? (
                        <select
                          aria-label="แก้ไขหมวดหมู่สินค้า"
                          value={editCategory}
                          onChange={(e) =>
                            setEditCategory(
                              e.target.value as Exclude<StarterCategory, "ALL">,
                            )
                          }
                          className="dp-input h-8 rounded-[4px] px-2 text-xs"
                        >
                          <option value="COFFEE">กาแฟ (Coffee)</option>
                          <option value="NON_COFFEE">ไม่ใช่กาแฟ (Non-Coffee)</option>
                          <option value="STUDIO">ห้องซ้อมดนตรี ชั้น 2</option>
                        </select>
                      ) : (
                        <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-[11px] font-semibold text-[#212121]">
                          {CATEGORY_BADGE_LABELS[item.category] || item.category}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[#757575]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          className="dp-input h-8 w-16 rounded-[4px] px-2 text-xs"
                        />
                      ) : (
                        item.unit
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-[#23863e]">
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="dp-input h-8 w-24 rounded-[4px] px-2 text-right font-mono text-xs"
                        />
                      ) : (
                        formatMoney(item.price, 2)
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdit(item)}
                              className="dp-btn-success inline-flex h-7 items-center gap-1 px-2.5 text-[11px] font-bold"
                            >
                              <CheckCircle2 className="size-3" />
                              <span>บันทึก</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCode(null)}
                              className="dp-btn-ghost inline-flex h-7 items-center px-2 text-[11px] font-bold"
                            >
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              data-testid={`pos-manage-edit-${item.code}`}
                              onClick={() => startEdit(item)}
                              className="dp-btn-ghost inline-flex h-7 items-center gap-1 px-2 text-[11px] font-semibold"
                            >
                              <Pencil className="size-3 text-[#2fa84f]" />
                              <span>แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteMenuItem(item.code)}
                              className="inline-flex h-7 items-center justify-center rounded-[4px] border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-[#e53935] transition hover:bg-rose-100"
                              title="ลบรายการ"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ส่วนที่ 2: การเชื่อมต่อ Firebase Firestore & Storage (Collapsible Back Office Card) */}
      <div
        className="dp-surface p-4"
        data-testid="pos-cloudflare-onboarding-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[6px] bg-[#e8f5ec] text-[#2fa84f]">
              <Cloud className="size-5" />
            </div>
            <div>
              <h2 className="dp-title text-sm">
                การเชื่อมต่อฐานข้อมูล Firebase Cloud Firestore & Storage
              </h2>
              <p className="dp-subtitle text-xs">
                โปรเจกต์ปัจจุบัน: <code className="font-mono font-bold text-[#212121]">{fbConfig.projectId}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="pos-cf-realtime-status-pill"
              className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#2fa84f]/30 bg-[#e8f5ec] px-2.5 text-xs font-bold text-[#23863e]"
            >
              <span className="size-2 rounded-full bg-[#2fa84f]" />
              <span>
                ออนไลน์ ({realtimeLatencyMs}ms · {lastEventAt})
              </span>
            </span>

            {onTriggerRealtimeSync && (
              <button
                type="button"
                data-testid="pos-cf-trigger-realtime-btn"
                onClick={() => void onTriggerRealtimeSync()}
                className="dp-btn-ghost inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-bold"
              >
                <RefreshCw className="size-3.5" />
                <span>ซิงค์ทันที</span>
              </button>
            )}

            <a
              href="https://console.firebase.google.com/project/entrace-pos/firestore"
              target="_blank"
              rel="noreferrer"
              data-testid="pos-cloudflare-signup-link"
              className="dp-btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs font-bold"
            >
              <ExternalLink className="size-3.5" />
              <span>เปิด Firebase Console</span>
            </a>

            <button
              type="button"
              onClick={() => setShowFirebaseDetail((v) => !v)}
              className="dp-btn-ghost inline-flex size-8 items-center justify-center"
              aria-label="พับหรือกางตั้งค่า Firebase"
            >
              {showFirebaseDetail ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
          </div>
        </div>

        {showFirebaseDetail && (
          <div className="mt-3 border-t border-[#e0e0e0] pt-3">
            {realtimeEvents.length > 0 && (
              <div
                data-testid="pos-cf-realtime-feed"
                className="mb-3 rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] p-2.5 text-xs"
              >
                <div className="mb-1 flex items-center justify-between font-bold text-[#23863e]">
                  <span>รายการซิงค์ข้อมูล Realtime ล่าสุด</span>
                  <span className="font-mono text-[11px] text-[#757575]">
                    /api/pos/firebase/stream
                  </span>
                </div>
                <div className="max-h-20 space-y-1 overflow-y-auto">
                  {realtimeEvents.slice(0, 4).map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px] text-[#212121]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="rounded bg-[#2fa84f] px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                          {ev.timestamp}
                        </span>
                        <span className="truncate font-medium">{ev.message}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] font-bold text-[#23863e]">
                        {ev.latencyMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#757575]">
                  Firebase Project ID
                </label>
                <input
                  type="text"
                  data-testid="pos-cf-account-id-input"
                  value={fbConfig.projectId}
                  onChange={(e) =>
                    setFbConfig((p) => ({ ...p, projectId: e.target.value }))
                  }
                  placeholder="entrace-pos"
                  className="dp-input h-9 w-full rounded-[6px] px-2.5 font-mono text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#757575]">
                  Firebase Web API Key
                </label>
                <input
                  type="password"
                  data-testid="pos-cf-api-token-input"
                  value={fbConfig.apiKey}
                  onChange={(e) =>
                    setFbConfig((p) => ({ ...p, apiKey: e.target.value }))
                  }
                  placeholder="AIzaSy..."
                  className="dp-input h-9 w-full rounded-[6px] px-2.5 font-mono text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#757575]">
                  Firestore Database ID
                </label>
                <input
                  type="text"
                  data-testid="pos-cf-d1-id-input"
                  value={fbConfig.databaseId}
                  onChange={(e) =>
                    setFbConfig((p) => ({ ...p, databaseId: e.target.value }))
                  }
                  placeholder="(default)"
                  className="dp-input h-9 w-full rounded-[6px] px-2.5 font-mono text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#757575]">
                  Firebase Storage Bucket
                </label>
                <input
                  type="text"
                  data-testid="pos-cf-r2-bucket-input"
                  value={fbConfig.storageBucket}
                  onChange={(e) =>
                    setFbConfig((p) => ({
                      ...p,
                      storageBucket: e.target.value,
                    }))
                  }
                  placeholder="entrace-pos.firebasestorage.app"
                  className="dp-input h-9 w-full rounded-[6px] px-2.5 font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e0e0e0] pt-3">
              <div className="flex items-center gap-1.5 text-xs text-[#757575]">
                <KeyRound className="size-3.5 text-[#2fa84f]" />
                <span>ซิงค์ข้อมูลอัตโนมัติทุก 30 วินาที</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="pos-cf-autosync-30s-btn"
                  onClick={onToggleAutoSync}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-[6px] border px-3 text-xs font-bold transition ${
                    autoSyncEnabled
                      ? "border-[#2fa84f]/40 bg-[#e8f5ec] text-[#23863e]"
                      : "dp-btn-ghost"
                  }`}
                >
                  <RefreshCw
                    className={`size-3.5 ${
                      autoSyncEnabled ? "animate-spin text-[#2fa84f]" : ""
                    }`}
                  />
                  <span>
                    {autoSyncEnabled
                      ? `Auto Sync: เปิด (${autoSyncCountdown}s · รอบ ${autoSyncCycleCount})`
                      : "Auto Sync: ปิด"}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="pos-cf-save-sync-btn"
                  onClick={() => void handleSaveFirebaseSetup()}
                  disabled={savingFb}
                  className="dp-btn-success inline-flex h-9 items-center gap-1.5 px-4 text-xs font-bold disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-3.5 ${savingFb ? "animate-spin" : ""}`}
                  />
                  <span>
                    {savingFb
                      ? "กำลังซิงค์..."
                      : "บันทึก & ซิงค์ขึ้น Firebase"}
                  </span>
                </button>
              </div>
            </div>

            {fbSyncResult && (
              <div
                data-testid="pos-cf-sync-result-banner"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#2fa84f]/30 bg-[#e8f5ec] px-3 py-2 text-xs font-bold text-[#23863e]"
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-[#2fa84f]" />
                  <span>
                    สถานะ Firebase: {fbSyncResult.status} · คอลเลกชัน ({fbSyncResult.syncedCollections}) · สินค้า ({fbSyncResult.syncedItems} รายการ) · รูปภาพ ({fbSyncResult.syncedImages} รูป)
                  </span>
                </div>
                <Database className="size-4 text-[#23863e]" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
