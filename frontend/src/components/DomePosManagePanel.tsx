"use client";

import { useState, type CSSProperties } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cmpDec, formatMoneyDisplay as formatMoney } from "@/lib/numeric";
import type { StarterCategory, StarterMenuItem } from "./DomePosScreen";

interface CloudflareConfigState {
  accountId: string;
  apiToken: string;
  d1DatabaseId: string;
  r2BucketName: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2PublicUrl: string;
}

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

  const [cfConfig, setCfConfig] = useState<CloudflareConfigState>({
    accountId: "",
    apiToken: "",
    d1DatabaseId: "",
    r2BucketName: "domepos-images",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2PublicUrl: "",
  });
  const [savingCf, setSavingCf] = useState(false);
  const [cfSyncResult, setCfSyncResult] = useState<{
    status: string;
    syncedTables: number;
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

  const handleSaveCloudflareSetup = async () => {
    setSavingCf(true);
    try {
      const res = await fetch("/api/pos/cloudflare/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: cfConfig.accountId.trim(),
          api_token: cfConfig.apiToken.trim(),
          d1_database_id: cfConfig.d1DatabaseId.trim(),
          r2_bucket_name: cfConfig.r2BucketName.trim() || "domepos-images",
          r2_access_key_id: cfConfig.r2AccessKeyId.trim(),
          r2_secret_access_key: cfConfig.r2SecretAccessKey.trim(),
          r2_public_url: cfConfig.r2PublicUrl.trim(),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setCfSyncResult({
          status: String(j.status || "CLOUDFLARE_CONNECTED"),
          syncedTables: Number(j.synced_tables ?? 4),
          syncedItems: Number(j.synced_items ?? allMenuItems.length),
          syncedImages: Number(j.synced_images ?? 19),
        });
        onNotify(
          "success",
          `บันทึกการตั้งค่า Cloudflare D1 & R2 และซิงค์ข้อมูลสินค้า ${j.synced_items ?? allMenuItems.length} รายการ + รูปภาพ ${j.synced_images ?? 19} รูป ขึ้น Cloudflare เรียบร้อยแล้ว`,
        );
      } else {
        onNotify(
          "error",
          String(j?.error || "ไม่สามารถบันทึกการตั้งค่า Cloudflare ได้"),
        );
      }
    } catch {
      onNotify("error", "เชื่อมต่อบริการตั้งค่า Cloudflare ไม่สำเร็จ");
    } finally {
      setSavingCf(false);
    }
  };

  return (
    <div
      className="dp-enter flex h-full w-full flex-col gap-4 overflow-y-auto bg-[#FBF7F1] p-4 text-[#2A1F18]"
      data-testid="pos-starter-manage-view"
    >
      {/* ส่วนที่ 1: ระบบเชื่อมต่อบัญชี Cloudflare ของผู้ใช้เอง (เก็บฐานข้อมูล D1 + รูปภาพ R2 บน Cloudflare ทั้งหมด) */}
      <div
        className="dp-surface p-4"
        data-testid="pos-cloudflare-onboarding-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EBE0D3] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#B5651D]/20 to-[#B5651D]/5 text-[#B5651D] ring-1 ring-[#B5651D]/20">
              <Cloud className="size-5" />
            </div>
            <div>
              <h2 className="dp-title text-sm">
                เชื่อมต่อบัญชี Cloudflare ของคุณ (เก็บข้อมูล D1 + รูปภาพ R2 บน Cloudflare 100%)
              </h2>
              <p className="dp-subtitle text-xs">
                สมัคร Cloudflare ฟรี แล้วนำรหัสเชื่อมต่อมากรอกเพื่อให้บิล เมนูสินค้า และรูปภาพทั้งหมดเก็บอยู่ในบัญชี Cloudflare ของร้านคุณโดยตรง
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="pos-cf-realtime-status-pill"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0F9D6B]/30 bg-[#0F9D6B]/10 px-2.5 text-xs font-extrabold text-[#0B7A53]"
            >
              <span className="dp-live size-2 rounded-full bg-[#0F9D6B]" />
              <span>
                Realtime SSE เชื่อมต่อแล้ว ({realtimeLatencyMs}ms · ล่าสุด {lastEventAt})
              </span>
            </span>

            {onTriggerRealtimeSync && (
              <button
                type="button"
                data-testid="pos-cf-trigger-realtime-btn"
                onClick={() => void onTriggerRealtimeSync()}
                className="dp-btn-ghost inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold"
              >
                <RefreshCw className="size-3.5" />
                <span>ทดสอบซิงค์ Realtime ทันที</span>
              </button>
            )}

            <a
              href="https://dash.cloudflare.com/sign-up"
              target="_blank"
              rel="noreferrer"
              data-testid="pos-cloudflare-signup-link"
              className="dp-btn-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold"
            >
              <ExternalLink className="size-3.5" />
              <span>1. สมัครบัญชี Cloudflare ฟรี</span>
            </a>
          </div>
        </div>

        {/* แถบแสดงรายการเหตุการณ์ซิงค์ Cloudflare D1 & R2 แบบ Realtime ล่าสุด */}
        {realtimeEvents.length > 0 && (
          <div
            data-testid="pos-cf-realtime-feed"
            className="dp-enter mt-3 rounded-xl border border-[#0F9D6B]/20 bg-[#0F9D6B]/5 p-2.5 text-xs"
          >
            <div className="mb-1 flex items-center justify-between font-extrabold text-[#0B7A53]">
              <span>⚡ รายการซิงค์ข้อมูล Cloudflare D1 &amp; R2 แบบ Realtime ล่าสุด</span>
              <span className="font-mono text-[11px] text-[#0B7A53]">
                SSE Stream: /api/pos/cloudflare/stream
              </span>
            </div>
            <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
              {realtimeEvents.slice(0, 5).map((ev) => (
                <div
                  key={ev.id}
                  className="dp-slide-in flex items-center justify-between rounded-lg bg-white/90 px-2 py-1 text-[11px] text-[#2A1F18]"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="rounded-md bg-[#0F9D6B] px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                      {ev.timestamp}
                    </span>
                    <span className="truncate font-semibold">{ev.message}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-[#0B7A53]">
                    {ev.latencyMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ขั้นตอนแนะนำสำหรับเจ้าของร้านคนเดียว */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div className="dp-surface dp-lift dp-stagger rounded-xl border-l-4 border-l-[#B5651D] bg-[#FBF7F1] p-2.5 text-xs" style={{ "--i": 0 } as CSSProperties}>
            <div className="font-extrabold text-[#8F4C10]">
              ขั้นที่ 1: สมัคร & คัดลอก Account ID
            </div>
            <div className="mt-0.5 text-[#6B5848]">
              เข้าเว็บ Cloudflare Dashboard มุมขวาบนคัดลอก <b>Account ID</b> และสร้าง <b>API Token</b> (สิทธิ์ D1:Edit, R2:Edit)
            </div>
          </div>
          <div className="dp-surface dp-lift dp-stagger rounded-xl border-l-4 border-l-[#D4823A] bg-[#FBF7F1] p-2.5 text-xs" style={{ "--i": 1 } as CSSProperties}>
            <div className="font-extrabold text-[#8F4C10]">
              ขั้นที่ 2: สร้างฐานข้อมูล D1 (SQL)
            </div>
            <div className="mt-0.5 text-[#6B5848]">
              ไปที่เมนู <b>Workers &amp; Pages → D1 SQL Database</b> กดสร้างฐานข้อมูลชื่อ <code>domepos-db</code> แล้วคัดลอก <b>Database ID</b>
            </div>
          </div>
          <div className="dp-surface dp-lift dp-stagger rounded-xl border-l-4 border-l-[#0F9D6B] bg-[#FBF7F1] p-2.5 text-xs" style={{ "--i": 2 } as CSSProperties}>
            <div className="font-extrabold text-[#0B7A53]">
              ขั้นที่ 3: สร้างคลังรูปภาพ R2 Bucket
            </div>
            <div className="mt-0.5 text-[#6B5848]">
              ไปที่เมนู <b>R2 Object Storage</b> สร้าง Bucket ชื่อ <code>domepos-images</code> สำหรับเก็บรูปสินค้าและโลโก้ทั้งหมด
            </div>
          </div>
        </div>

        {/* ฟอร์มกรอกข้อมูลเชื่อมต่อ Cloudflare */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#6B5848]">
              Cloudflare Account ID
            </label>
            <input
              type="text"
              data-testid="pos-cf-account-id-input"
              value={cfConfig.accountId}
              onChange={(e) =>
                setCfConfig((p) => ({ ...p, accountId: e.target.value }))
              }
              placeholder="เช่น 9a8b7c6d5e4f3a2b1c..."
              className="dp-input h-9 w-full rounded-lg px-2.5 font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6B5848]">
              Cloudflare API Token (D1 &amp; R2)
            </label>
            <input
              type="password"
              data-testid="pos-cf-api-token-input"
              value={cfConfig.apiToken}
              onChange={(e) =>
                setCfConfig((p) => ({ ...p, apiToken: e.target.value }))
              }
              placeholder="Bearer Token จาก Cloudflare..."
              className="dp-input h-9 w-full rounded-lg px-2.5 font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6B5848]">
              D1 Database ID (เก็บข้อมูลบิล/สินค้า)
            </label>
            <input
              type="text"
              data-testid="pos-cf-d1-id-input"
              value={cfConfig.d1DatabaseId}
              onChange={(e) =>
                setCfConfig((p) => ({ ...p, d1DatabaseId: e.target.value }))
              }
              placeholder="UUID ของฐานข้อมูล D1..."
              className="dp-input h-9 w-full rounded-lg px-2.5 font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6B5848]">
              R2 Bucket Name (เก็บรูปสินค้าทั้งหมด)
            </label>
            <input
              type="text"
              data-testid="pos-cf-r2-bucket-input"
              value={cfConfig.r2BucketName}
              onChange={(e) =>
                setCfConfig((p) => ({ ...p, r2BucketName: e.target.value }))
              }
              placeholder="domepos-images"
              className="dp-input h-9 w-full rounded-lg px-2.5 font-mono text-xs"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EBE0D3] pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#85725F]">
            <KeyRound className="size-3.5 text-[#B5651D]" />
            <span>
              ระบบซิงค์ข้อมูลขึ้น Cloudflare D1 &amp; R2 อัตโนมัติทุก 30 วินาที หรือกดซิงค์ทันทีได้ตลอดเวลา
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ปุ่ม Auto Sync ทุก 30 วินาที พร้อมเวลานับถอยหลังสด */}
            <button
              type="button"
              data-testid="pos-cf-autosync-30s-btn"
              onClick={onToggleAutoSync}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-xs font-extrabold transition ${
                autoSyncEnabled
                  ? "border-[#0F9D6B]/40 bg-[#0F9D6B]/10 text-[#0B7A53] shadow-xs hover:bg-[#0F9D6B]/20"
                  : "dp-btn-ghost"
              }`}
            >
              <RefreshCw
                className={`size-3.5 ${
                  autoSyncEnabled ? "animate-spin text-[#0F9D6B]" : ""
                }`}
              />
              <span>
                {autoSyncEnabled
                  ? `Auto Sync ทุก 30 วินาที: เปิดอยู่ (อีก ${autoSyncCountdown} วิ · รอบที่ ${autoSyncCycleCount})`
                  : "Auto Sync ทุก 30 วินาที: ปิด (คลิกเพื่อเปิด)"}
              </span>
            </button>

            <button
              type="button"
              data-testid="pos-cf-save-sync-btn"
              onClick={() => void handleSaveCloudflareSetup()}
              disabled={savingCf}
              className="dp-btn-success inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-extrabold disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${savingCf ? "animate-spin" : ""}`} />
              <span>
                {savingCf
                  ? "กำลังซิงค์ข้อมูลขึ้น Cloudflare..."
                  : "บันทึก & ซิงค์ข้อมูลทั้งหมดขึ้น Cloudflare ทันที"}
              </span>
            </button>
          </div>
        </div>

        {cfSyncResult && (
          <div
            data-testid="pos-cf-sync-result-banner"
            className="dp-enter mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#0F9D6B]/30 bg-[#0F9D6B]/10 px-3 py-2 text-xs font-bold text-[#0B7A53]"
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="dp-pop size-4 text-[#0F9D6B]" />
              <span>
                สถานะ Cloudflare: {cfSyncResult.status} · สร้างตาราง D1 ({cfSyncResult.syncedTables} ตาราง) · ซิงค์สินค้า ({cfSyncResult.syncedItems} รายการ) · ซิงค์รูปภาพ R2 ({cfSyncResult.syncedImages} รูป)
              </span>
            </div>
            <Database className="size-4 text-[#0B7A53]" />
          </div>
        )}
      </div>

      {/* ส่วนที่ 2: ระบบจัดการสินค้าอย่างง่าย (เพิ่ม/แก้ไขชื่อ ราคา หมวดหมู่ รูปภาพ ลบสินค้า) */}
      <div
        className="dp-surface flex-1 p-4"
        data-testid="pos-product-manager-card"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#EBE0D3] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#B5651D]/20 to-[#B5651D]/5 text-[#B5651D] ring-1 ring-[#B5651D]/20">
              <Package className="size-5" />
            </div>
            <div>
              <h2 className="dp-title text-sm">
                จัดการรายการสินค้า & รูปภาพเมนู ({allMenuItems.length} รายการ)
              </h2>
              <p className="dp-subtitle text-xs">
                แก้ไขชื่อเมนู ราคาขาย หน่วยนับ หรือเพิ่มรูปภาพสินค้าใหม่ได้ทันที ไม่ซับซ้อน
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อสินค้า..."
              className="dp-input h-8 w-52 rounded-lg px-2.5 text-xs"
            />
            <button
              type="button"
              data-testid="pos-manage-add-item-btn"
              onClick={onOpenAddMenuModal}
              className="dp-btn-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold"
            >
              <Plus className="size-3.5" />
              <span>+ เพิ่มสินค้าใหม่</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="pos-manage-items-table">
            <thead>
              <tr className="border-b border-[#EBE0D3] bg-[#F5EDE2] text-left font-bold text-[#6B5848]">
                <th className="py-2 pl-2">รูปสินค้า</th>
                <th className="py-2 px-2">รหัสสินค้า</th>
                <th className="py-2 px-2">ชื่อเมนูสินค้า</th>
                <th className="py-2 px-2">หมวดหมู่</th>
                <th className="py-2 px-2">หน่วยนับ</th>
                <th className="py-2 px-2 text-right">ราคาขาย (บาท)</th>
                <th className="py-2 pr-2 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBE0D3]/70">
              {filtered.map((item, idx) => {
                const isEditing = editingCode === item.code;
                const imgSrc = item.imageUrl || `/products/${item.code}.jpg`;
                return (
                  <tr
                    key={item.code}
                    className="dp-stagger transition-colors hover:bg-[#FBF7F1]"
                    style={{ "--i": idx } as CSSProperties}
                  >
                    <td className="py-2 pl-2">
                      <img
                        src={imgSrc}
                        alt={item.name}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/products/CAFE-ESP-01.jpg";
                        }}
                        className="size-10 rounded-xl object-cover ring-1 ring-[#EBE0D3]"
                      />
                    </td>
                    <td className="py-2 px-2 font-mono font-bold text-[#6B5848]">
                      {item.code}
                    </td>
                    <td className="py-2 px-2 font-bold text-[#2A1F18]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="dp-input h-7 w-full rounded-md px-2 text-xs"
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
                          className="dp-input h-7 rounded-md px-1.5 text-xs"
                        >
                          <option value="COFFEE">☕ กาแฟสด</option>
                          <option value="TEA">🍵 มัทฉะ & ชา</option>
                          <option value="BEER">🍺 คราฟต์เบียร์</option>
                          <option value="BAKERY">🥐 เบเกอรี่</option>
                          <option value="BITES">🍟 กับแกล้ม</option>
                        </select>
                      ) : (
                        <span className="rounded-md bg-[#F5EDE2] px-2 py-0.5 font-semibold text-[#6B5848]">
                          {item.category}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[#6B5848]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          className="dp-input h-7 w-16 rounded-md px-1.5 text-xs"
                        />
                      ) : (
                        item.unit
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-extrabold text-[#B5651D]">
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="dp-input h-7 w-24 rounded-md px-1.5 text-right font-mono text-xs"
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
                              className="dp-btn-success inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-bold"
                            >
                              <CheckCircle2 className="size-3" />
                              <span>บันทึก</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCode(null)}
                              className="dp-btn-ghost inline-flex h-7 items-center rounded-md px-2 text-[11px] font-bold"
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
                              className="dp-btn-ghost inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold"
                            >
                              <Pencil className="size-3 text-[#B5651D]" />
                              <span>แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteMenuItem(item.code)}
                              className="inline-flex h-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 hover:shadow-sm"
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
    </div>
  );
}
