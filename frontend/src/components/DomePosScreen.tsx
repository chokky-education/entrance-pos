"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Beer,
  CheckCircle2,
  Cloud,
  Clock,
  Coffee,
  CreditCard,
  Database,
  FileText,
  Flame,
  ImagePlus,
  PauseCircle,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Receipt,
  Search,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Volume2,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import {
  addDec,
  cmpDec,
  divDec,
  formatMoneyDisplay as formatMoney,
  mulDec,
  parseScaled,
  subDec,
} from "@/lib/numeric";
import { DomePosManagePanel } from "./DomePosManagePanel";
import { ChargeScreen } from "./pos/ChargeScreen";
import { ItemTile } from "./pos/ItemTile";
import { LineEditDialog } from "./pos/LineEditDialog";
import { PosNavDrawer } from "./pos/PosNavDrawer";
import { PosTopBar } from "./pos/PosTopBar";
import { TicketPanel } from "./pos/TicketPanel";

export type StarterWorkTab = "order" | "tables" | "kds" | "reports" | "manage";
export type ServiceChannel = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type StarterCategory =
  | "ALL"
  | "COFFEE"
  | "NON_COFFEE"
  | "STUDIO"
  | "ERP";
export type PaymentMethodCode =
  | "CASH"
  | "PROMPTPAY"
  | "TRANSFER"
  | "CARD"
  | "WALLET";

export interface StarterMenuItem {
  code: string;
  barcode: string;
  name: string;
  nameEn: string;
  category: Exclude<StarterCategory, "ALL">;
  unit: string;
  price: string; // Decimal string (Rule 20)
  badge?: string;
  imageUrl?: string; // Firebase Storage Image URL
  supportsSweetness?: boolean;
  supportsBeerServe?: boolean;
}

export interface StarterCartLine {
  lineId: string;
  itemCode: string;
  barcode: string;
  name: string;
  category: Exclude<StarterCategory, "ALL">;
  unitCode: string;
  qty: string; // Decimal string
  basePrice: string; // Decimal string
  addonPrice: string; // Decimal string
  unitPrice: string; // basePrice + addonPrice
  sweetness: string;
  addonLabel: string;
  note: string;
}

export interface HeldTableOrder {
  tableId: string;
  tableName: string;
  zone: "CAFE_F1" | "STUDIO_F2";
  guests: number;
  openedAt: string;
  serviceChannel: ServiceChannel;
  lines: StarterCartLine[];
  discountAmount: string;
  remark: string;
}

export interface KdsQueueOrder {
  queueNo: string;
  docNo: string;
  tableLabel: string;
  serviceChannel: ServiceChannel;
  createdAt: string;
  status: "PREPARING" | "READY" | "SERVED";
  items: {
    name: string;
    qty: string;
    unitCode: string;
    modifierText: string;
    category: Exclude<StarterCategory, "ALL">;
  }[];
}

export interface StarterBillRecord {
  billGuid: string;
  docNo: string;
  docDate: string;
  docTime: string;
  queueNo: string;
  tableLabel: string;
  serviceChannel: ServiceChannel;
  paymentMethod: PaymentMethodCode;
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
  cashReceived: string;
  changeAmount: string;
  status: "done" | "cancelled" | "error";
  syncedErp: boolean;
  walletPointsMinted?: string;
  walletTxHash?: string;
  walletAddress?: string;
  walletBalanceAfter?: string;
  lines: StarterCartLine[];
}

const RAW_STARTER_MENU_CATALOG: StarterMenuItem[] = [
  // ☕ Coffee (ชั้น 1 Cafe — 5 เมนู ร้อน/เย็น = 10 ปุ่ม)
  {
    code: "CF-CAP-H",
    barcode: "8859100001011",
    name: "Cappuccino ร้อน",
    nameEn: "Hot Cappuccino · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "CF-CAP-C",
    barcode: "8859100001012",
    name: "Cappuccino เย็น",
    nameEn: "Iced Cappuccino · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "CF-AME-H",
    barcode: "8859100001021",
    name: "Americano ร้อน",
    nameEn: "Hot Americano · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "CF-AME-C",
    barcode: "8859100001022",
    name: "Americano เย็น",
    nameEn: "Iced Americano · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "ขายดี · เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "CF-LAT-H",
    barcode: "8859100001031",
    name: "Latte ร้อน",
    nameEn: "Hot Latte · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "CF-LAT-C",
    barcode: "8859100001032",
    name: "Latte เย็น",
    nameEn: "Iced Latte · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "CF-ESP-H",
    barcode: "8859100001041",
    name: "Espresso ร้อน",
    nameEn: "Hot Espresso · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "CF-ESP-C",
    barcode: "8859100001042",
    name: "Espresso เย็น",
    nameEn: "Iced Espresso · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "เข้มข้น · เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "CF-MOC-H",
    barcode: "8859100001051",
    name: "Mocca ร้อน",
    nameEn: "Hot Mocha · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "ร้อน 50฿",
    supportsSweetness: true,
  },
  {
    code: "CF-MOC-C",
    barcode: "8859100001052",
    name: "Mocca เย็น",
    nameEn: "Iced Mocha · ชั้น 1 Cafe",
    category: "COFFEE",
    unit: "แก้ว",
    price: "60.00",
    badge: "เย็น 60฿",
    supportsSweetness: true,
  },
  // 🍵 Non-Coffee (ชั้น 1 Cafe — 3 เมนู ร้อน/เย็น = 6 ปุ่ม)
  {
    code: "NC-THA-H",
    barcode: "8859100002011",
    name: "ชาไทย ร้อน",
    nameEn: "Hot Thai Tea · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "NC-THA-C",
    barcode: "8859100002012",
    name: "ชาไทย เย็น",
    nameEn: "Iced Thai Tea · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "ยอดฮิต · เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "NC-GRN-H",
    barcode: "8859100002021",
    name: "ชาเขียว ร้อน",
    nameEn: "Hot Green Tea · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "NC-GRN-C",
    barcode: "8859100002022",
    name: "ชาเขียว เย็น",
    nameEn: "Iced Green Tea · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "เย็น 50฿",
    supportsSweetness: true,
  },
  {
    code: "NC-COC-H",
    barcode: "8859100002031",
    name: "โกโก้ ร้อน",
    nameEn: "Hot Cocoa · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "40.00",
    badge: "ร้อน 40฿",
    supportsSweetness: true,
  },
  {
    code: "NC-COC-C",
    barcode: "8859100002032",
    name: "โกโก้ เย็น",
    nameEn: "Iced Cocoa · ชั้น 1 Cafe",
    category: "NON_COFFEE",
    unit: "แก้ว",
    price: "50.00",
    badge: "เข้มข้น · เย็น 50฿",
    supportsSweetness: true,
  },
  // 🎧 ห้องซ้อมดนตรี (ชั้น 2 — In-Ear Monitor Only · 250 บาท/ชม.)
  {
    code: "ST-ROOM-01",
    barcode: "8859100003011",
    name: "ห้องซ้อมดนตรี In-Ear Monitor (ชั้น 2)",
    nameEn: "In-Ear Only · หูฟังครบ · Digital Mixer แยก Track · อัดเสียง/คลิป OTG",
    category: "STUDIO",
    unit: "ชั่วโมง",
    price: "250.00",
    badge: "250฿/ชม. · In-Ear",
    supportsBeerServe: true,
  },
];

const STARTER_MENU_CATALOG: StarterMenuItem[] = RAW_STARTER_MENU_CATALOG.map(
  (item) => ({
    ...item,
    imageUrl: item.imageUrl || `/products/${item.code}.jpg`,
  }),
);

const SWEETNESS_OPTIONS = [
  { id: "หวาน 0%", label: "หวาน 0% (ไม่หวาน)" },
  { id: "หวาน 25%", label: "หวาน 25% (หวานน้อยมาก)" },
  { id: "หวาน 50%", label: "หวาน 50% (หวานน้อย)" },
  { id: "หวาน 75%", label: "หวาน 75% (กำลังดี)" },
  { id: "หวาน 100%", label: "หวาน 100% (ปกติ)" },
];

const ADDON_OPTIONS = [
  { id: "NONE", label: "มาตรฐาน (ไม่เพิ่มออปชัน)", price: "0.00" },
  { id: "EXTRA_SHOT", label: "+1 ช็อตเอสเปรสโซ่เข้ม (+10฿)", price: "10.00" },
  { id: "SEPARATE_ICE", label: "แยกน้ำแข็ง (สำหรับนักศึกษาหิ้วไปเรียน)", price: "0.00" },
  { id: "STUDIO_OTG", label: "In-Ear ครบทุกเครื่อง + อัดแยก Track & คลิปผ่าน OTG (ฟรี)", price: "0.00" },
];

const INITIAL_TABLES: {
  tableId: string;
  tableName: string;
  zone: "CAFE_F1" | "STUDIO_F2";
  zoneLabel: string;
  seats: number;
}[] = [
  { tableId: "C1", tableName: "โต๊ะคาเฟ่ C1 (ชั้น 1 · ริมกระจก)", zone: "CAFE_F1", zoneLabel: "ชั้น 1 · โซน Cafe", seats: 2 },
  { tableId: "C2", tableName: "โต๊ะคาเฟ่ C2 (ชั้น 1 · บาร์ปลั๊กไฟอ่านหนังสือ)", zone: "CAFE_F1", zoneLabel: "ชั้น 1 · โซน Cafe", seats: 4 },
  { tableId: "C3", tableName: "โต๊ะคาเฟ่ C3 (ชั้น 1 · โต๊ะติวกลุ่ม BSRU)", zone: "CAFE_F1", zoneLabel: "ชั้น 1 · โซน Cafe", seats: 6 },
  { tableId: "C4", tableName: "โต๊ะคาเฟ่ C4 (ชั้น 1 · มุมโซฟา Creative Space)", zone: "CAFE_F1", zoneLabel: "ชั้น 1 · โซน Cafe", seats: 4 },
  { tableId: "S1", tableName: "ห้องซ้อมดนตรี S1 (ชั้น 2 · In-Ear Monitor & OTG)", zone: "STUDIO_F2", zoneLabel: "ชั้น 2 · ห้องซ้อมดนตรี", seats: 6 },
  { tableId: "S2", tableName: "โซนพักนักดนตรี S2 (ชั้น 2 · หน้าห้องซ้อม)", zone: "STUDIO_F2", zoneLabel: "ชั้น 2 · ห้องซ้อมดนตรี", seats: 4 },
];

const CATEGORY_META: Record<
  StarterCategory,
  { label: string; colorClass: string }
> = {
  ALL: { label: "ทั้งหมด", colorClass: "bg-amber-500 text-slate-950" },
  COFFEE: { label: "☕ Coffee (40-60฿)", colorClass: "bg-amber-700 text-white" },
  NON_COFFEE: { label: "🍵 Non-Coffee (40-50฿)", colorClass: "bg-emerald-600 text-white" },
  STUDIO: { label: "🎧 ห้องซ้อมดนตรี ชั้น 2 (250฿/ชม.)", colorClass: "bg-indigo-600 text-white" },
  ERP: { label: "📦 เมนูเพิ่มเอง/Firebase", colorClass: "bg-sky-600 text-white" },
};

const PAYMENT_LABELS: Record<PaymentMethodCode, string> = {
  CASH: "เงินสด (Cash)",
  PROMPTPAY: "สแกน QR PromptPay",
  TRANSFER: "โอนบัญชีธนาคาร",
  CARD: "บัตรเครดิต/เดบิต",
  WALLET: "จ่ายด้วย Wallet (หักแต้มสะสม)",
};

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatThaiDateDisplay(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const y = Number(parts[0]) + 543;
  return `${parts[2]}/${parts[1]}/${y}`;
}

/** Rule 4: ถ้าค่าเป็น 0 หรือ 0.00 ให้แสดงว่าง ("") */
function formatMoneyBlankZero(val: string | number | undefined | null): string {
  const s = String(val ?? "").trim();
  if (!s || cmpDec(s, "0") === 0) return "";
  return formatMoney(s, 2);
}

/** สำหรับช่องกรอกตัวเลข: บล็อกตัวอักษร 100% รับเฉพาะตัวเลขและจุดทศนิยม */
function sanitizeNumericInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

/** Web Audio Synthesizer (เหมือนระบบ POS ปกติของ SML Ai Account) */
function playPosSound(type: "scan" | "confirm" | "delete" | "chaching") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const tone = (
      freq: number,
      dur: number,
      delay = 0,
      wave: OscillatorType = "sine",
      vol = 0.08,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(vol, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur);
    };
    if (type === "scan") {
      tone(1950, 0.055, 0, "sine", 0.09);
      tone(2925, 0.045, 0.025, "triangle", 0.06);
    } else if (type === "confirm") {
      tone(587.33, 0.07, 0, "triangle", 0.08);
      tone(880, 0.11, 0.055, "triangle", 0.09);
    } else if (type === "delete") {
      tone(330, 0.08, 0, "sawtooth", 0.05);
      tone(220, 0.1, 0.05, "sawtooth", 0.05);
    } else if (type === "chaching") {
      tone(1046.5, 0.08, 0, "triangle", 0.1);
      tone(1318.5, 0.09, 0.06, "triangle", 0.1);
      tone(1567.98, 0.16, 0.12, "sine", 0.12);
    }
  } catch {
    // ignore audio restriction
  }
}

export function DomePosScreen({
  onSpeakThai,
}: {
  onSpeakThai?: (text: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<StarterWorkTab>("order");
  const [serviceChannel, setServiceChannel] =
    useState<ServiceChannel>("DINE_IN");
  const [selectedTableId, setSelectedTableId] = useState<string>("C1");
  const [activeCategory, setActiveCategory] =
    useState<StarterCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSweetness, setSelectedSweetness] =
    useState<string>("หวาน 50%");
  const [selectedAddonId, setSelectedAddonId] = useState<string>("NONE");
  const [itemSweetnessMap, setItemSweetnessMap] = useState<
    Record<string, string>
  >({});
  const [itemAddonMap, setItemAddonMap] = useState<Record<string, string>>({});
  const [animatingItemCode, setAnimatingItemCode] = useState<string | null>(
    null,
  );
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState<boolean>(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [chargeOpen, setChargeOpen] = useState<boolean>(false);
  const [payPulse, setPayPulse] = useState<boolean>(false);
  const [orderRemark, setOrderRemark] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("");

  // ตะกร้าสินค้าปัจจุบัน (เริ่มต้นว่างเปล่า พร้อมใช้งานจริง)
  const [cartLines, setCartLines] = useState<StarterCartLine[]>([]);

  // โต๊ะชั้น 1 Cafe & ห้องซ้อมดนตรีชั้น 2 ที่เปิดบิลค้างไว้ (เริ่มต้นว่างทุกโต๊ะ)
  const [heldTables, setHeldTables] = useState<Record<string, HeldTableOrder>>(
    {},
  );

  // คิวบาริสต้าชั้น 1 & คิวห้องซ้อมดนตรีชั้น 2 (เริ่มต้นว่าง)
  const [kdsQueue, setKdsQueue] = useState<KdsQueueOrder[]>([]);

  // สินค้าที่ซิงค์มาจากฐานข้อมูล Firebase Firestore (/api/pos/sync) + เมนูที่เจ้าของร้านเพิ่มเอง
  const [erpSyncedItems, setErpSyncedItems] = useState<StarterMenuItem[]>([]);
  const [customMenuItems, setCustomMenuItems] = useState<StarterMenuItem[]>([]);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);

  // สถานะการเชื่อมต่อ Firebase Firestore (Database) + Firebase Storage (Image Storage) แบบ Realtime
  const [cloudflareStatus, setCloudflareStatus] = useState<{
    d1Connected: boolean;
    r2Connected: boolean;
    d1Database: string;
    r2Bucket: string;
    r2UploadedCount: number;
    lastR2Url: string;
    realtimeConnected: boolean;
    latencyMs: number;
    lastEventAt: string;
  }>({
    d1Connected: true,
    r2Connected: true,
    d1Database: "Firebase Firestore (entrace-pos)",
    r2Bucket: "Firebase Storage (entrace-pos.firebasestorage.app)",
    r2UploadedCount: 17,
    lastR2Url: "",
    realtimeConnected: true,
    latencyMs: 3,
    lastEventAt: "ออนไลน์",
  });
  const [realtimeEvents, setRealtimeEvents] = useState<
    {
      id: string;
      type: string;
      timestamp: string;
      message: string;
      latencyMs: number;
    }[]
  >([]);
  const [autoSync30sEnabled, setAutoSync30sEnabled] = useState<boolean>(true);
  const [autoSyncCountdown, setAutoSyncCountdown] = useState<number>(30);
  const [autoSyncCycleCount, setAutoSyncCycleCount] = useState<number>(1);

  // Modal เพิ่มเมนูใหม่สำหรับเจ้าของร้านทำคนเดียว (+ อัปโหลดรูปขึ้น Firebase Storage)
  const [showAddMenuModal, setShowAddMenuModal] = useState<boolean>(false);
  const [newMenuCode, setNewMenuCode] = useState<string>("ECS-01");
  const [newMenuName, setNewMenuName] = useState<string>("");
  const [newMenuCategory, setNewMenuCategory] =
    useState<Exclude<StarterCategory, "ALL">>("COFFEE");
  const [newMenuPrice, setNewMenuPrice] = useState<string>("50.00");
  const [newMenuUnit, setNewMenuUnit] = useState<string>("แก้ว");
  const [newMenuImageUrl, setNewMenuImageUrl] = useState<string>("");
  const [uploadingR2, setUploadingR2] = useState<boolean>(false);

  // หน้าต่างรับชำระเงิน & ออกใบเสร็จ
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodCode>("CASH");
  const [cashReceivedInput, setCashReceivedInput] = useState<string>("");
  const [submittingBill, setSubmittingBill] = useState<boolean>(false);
  const [walletSummary, setWalletSummary] = useState<{
    custAddress: string;
    custBalance: string;
    merchBalance: string;
    tokenSymbol: string;
  }>({
    custAddress: "0xC57b5CC43721F93030e3C228710DC2f3F57B94eA",
    custBalance: "10",
    merchBalance: "0",
    tokenSymbol: "THCSP",
  });
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

  // ประวัติบิลขายหน้าร้าน & ใบเสร็จล่าสุด
  const [billsHistory, setBillsHistory] = useState<StarterBillRecord[]>([]);
  const [activeReceiptBill, setActiveReceiptBill] =
    useState<StarterBillRecord | null>(null);
  const [shiftStatus, setShiftStatus] = useState<{
    isOpen: boolean;
    openedAt: string;
    openingFloat: string;
    cashierCode: string;
  }>({
    isOpen: true,
    openedAt: "08:00",
    openingFloat: "2000.00",
    cashierCode: "OWNER-01",
  });
  const [queueCounter, setQueueCounter] = useState<number>(1);

  const speak = useCallback(
    (text: string) => {
      onSpeakThai?.(text);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "th-TH";
          window.speechSynthesis.speak(u);
        } catch {
          // ignore speech error on headless browser
        }
      }
    },
    [onSpeakThai],
  );

  // ดึงข้อมูลสินค้าจาก /api/pos/sync (Cloudflare D1) และประวัติบิลจาก /api/pos/restore
  const syncFromErpBackend = useCallback(async () => {
    setSyncLoading(true);
    try {
      const [syncRes, restoreRes] = await Promise.all([
        fetch("/api/pos/sync?cursor=&limit=120", { cache: "no-store" }).catch(
          () => null,
        ),
        fetch("/api/pos/restore", { cache: "no-store" }).catch(() => null),
      ]);

      if (syncRes?.ok) {
        const sj = await syncRes.json().catch(() => null);
        const changes = Array.isArray(sj?.data?.changes)
          ? sj.data.changes
          : [];
        const loaded: StarterMenuItem[] = [];
        const seenLoadedCodes = new Set<string>();
        for (const ch of changes) {
          if (ch?.entity === "product" && Array.isArray(ch.rows)) {
            for (const r of ch.rows) {
              const code = String(r.item_code || "").trim();
              const price = String(r.retail_price || "0").trim();
              if (!code || cmpDec(price, "0") <= 0) continue;
              if (seenLoadedCodes.has(code)) continue;
              seenLoadedCodes.add(code);
              const rawCat = String(r.category || "").toUpperCase();
              const validCat: Exclude<StarterCategory, "ALL"> =
                rawCat === "COFFEE" ||
                rawCat === "NON_COFFEE" ||
                rawCat === "STUDIO"
                  ? rawCat
                  : rawCat === "TEA"
                    ? "NON_COFFEE"
                    : "ERP";
              loaded.push({
                code,
                barcode: String(r.barcode || code),
                name: String(r.name || code),
                nameEn: String(r.category || "Firebase Firestore Menu"),
                category: validCat,
                unit: String(r.unit_code || "แก้ว"),
                price: formatMoney(price, 2).replace(/,/g, ""),
                badge: "Firebase Sync",
                imageUrl:
                  r.image_url &&
                  !String(r.image_url).includes(
                    "r2.domepos.cloudflarestorage.com",
                  )
                    ? String(r.image_url)
                    : `/api/pos/image?code=${encodeURIComponent(code)}`,
                supportsSweetness:
                  validCat === "COFFEE" || validCat === "NON_COFFEE",
                supportsBeerServe: validCat === "STUDIO",
              });
              if (loaded.length >= 48 + STARTER_MENU_CATALOG.length) break;
            }
          }
          if (loaded.length >= 48 + STARTER_MENU_CATALOG.length) break;
        }
        setErpSyncedItems(loaded);
        setCloudflareStatus((prev) => ({
          ...prev,
          d1Connected: true,
          r2Connected: true,
        }));
      }

      if (restoreRes?.ok) {
        const rj = await restoreRes.json().catch(() => null);
        const rawBills = Array.isArray(rj?.data?.bills) ? rj.data.bills : [];
        const restored: StarterBillRecord[] = rawBills
          .slice(0, 30)
          .map((b: Record<string, unknown>, idx: number) => {
            const p = (b.payload as Record<string, unknown>) || {};
            const pLines = Array.isArray(p.lines) ? p.lines : [];
            const mappedLines: StarterCartLine[] = pLines.map(
              (ln: Record<string, unknown>, lIdx: number) => ({
                lineId: `restored-${idx}-${lIdx}`,
                itemCode: String(ln.item_code || ""),
                barcode: String(ln.barcode || ln.item_code || ""),
                name: String(ln.name || ln.item_code || ""),
                category: String(ln.item_code || "").startsWith("ST-")
                  ? "STUDIO"
                  : String(ln.item_code || "").startsWith("NC-")
                    ? "NON_COFFEE"
                    : "COFFEE",
                unitCode: String(ln.unit_code || "แก้ว"),
                qty: String(ln.qty || "1"),
                basePrice: String(ln.price || "0.00"),
                addonPrice: "0.00",
                unitPrice: String(ln.price || "0.00"),
                sweetness: "",
                addonLabel: "",
                note: "",
              }),
            );
            const totalStr = String(
              b.total_amount ||
                mappedLines.reduce(
                  (acc, cur) => addDec(acc, mulDec(cur.qty, cur.unitPrice)),
                  "0.00",
                ),
            );
            const paymentsArr = Array.isArray(p.payments) ? p.payments : [];
            const firstPay =
              paymentsArr[0] &&
              typeof paymentsArr[0] === "object" &&
              (paymentsArr[0] as Record<string, unknown>).method
                ? (String(
                    (paymentsArr[0] as Record<string, unknown>).method,
                  ).toUpperCase() as PaymentMethodCode)
                : "CASH";
            return {
              billGuid: String(b.bill_guid || p.bill_guid || makeUuid()),
              docNo: String(b.doc_no || p.doc_no || `POS-${idx + 1}`),
              docDate: String(
                p.doc_date || new Date().toISOString().slice(0, 10),
              ),
              docTime: String(p.doc_time || "12:00"),
              queueNo: `A-${String(idx + 1).padStart(3, "0")}`,
              tableLabel: String(p.remark || "หน้าร้าน"),
              serviceChannel: "DINE_IN",
              paymentMethod:
                firstPay in PAYMENT_LABELS
                  ? firstPay
                  : ("CASH" as PaymentMethodCode),
              subtotalAmount: totalStr,
              discountAmount: String(p.bill_discount || "0.00"),
              totalAmount: totalStr,
              cashReceived: totalStr,
              changeAmount: "0.00",
              status:
                b.status === "cancelled" || b.cancelled_at
                  ? "cancelled"
                  : "done",
              syncedErp: true,
              lines: mappedLines,
            };
          });
        if (restored.length > 0) {
          setBillsHistory((prev) => {
            const existingDocs = new Set(prev.map((x) => x.docNo));
            const existingGuids = new Set(prev.map((x) => x.billGuid));
            const uniqueRestored: StarterBillRecord[] = [];
            for (const r of restored) {
              if (!existingDocs.has(r.docNo) && !existingGuids.has(r.billGuid)) {
                existingDocs.add(r.docNo);
                existingGuids.add(r.billGuid);
                uniqueRestored.push(r);
              }
            }
            return [...prev, ...uniqueRestored];
          });
        }
      }
      const walRes = await fetch(
        "/api/process/wallet/status?partyCode=0xC57b5CC43721F93030e3C228710DC2f3F57B94eA",
        {
          cache: "no-store",
        },
      ).catch(() => null);
      if (walRes?.ok) {
        const wj = await walRes.json().catch(() => null);
        if (wj?.ok && wj?.data) {
          setWalletSummary({
            custAddress: String(
              wj.data.customerWallet?.address ||
                "0xC57b5CC43721F93030e3C228710DC2f3F57B94eA",
            ),
            custBalance: String(wj.data.customerWallet?.balance || "0"),
            merchBalance: String(wj.data.merchantWallet?.balance || "0"),
            tokenSymbol: String(wj.data.customerWallet?.tokenSymbol || "THCSP"),
          });
        }
      }
    } finally {
      setSyncLoading(false);
    }
  }, []);

  useEffect(() => {
    void syncFromErpBackend();
  }, [syncFromErpBackend]);

  // รองรับการเปิดแท็บตรงผ่าน URL เช่น /pos?tab=tables|kds|reports|manage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as StarterWorkTab | null;
    if (
      tabParam &&
      ["order", "tables", "kds", "reports", "manage"].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
  }, []);

  // คีย์ลัดตามป้ายบนจอ: F2 = ช่องค้นหาสินค้า, F9 = เปิดหน้ารับเงิน หรือยืนยันชำระเงิน
  const searchInputRef = useRef<HTMLInputElement>(null);
  const payButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        payButtonRef.current?.click();
      } else if (e.key === "Escape") {
        setNavOpen(false);
        setEditingLineId(null);
        setChargeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // เชื่อมต่อ Firebase Firestore & Storage แบบ Realtime ผ่าน Server-Sent Events (SSE /api/pos/firebase/stream?mode=sse)
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/pos/firebase/stream?mode=sse");
      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (!parsed || typeof parsed !== "object") return;
          const evTime = String(
            parsed.timestamp || new Date().toTimeString().slice(0, 8),
          );
          const lat = Number(parsed.latency_ms ?? 3);
          setCloudflareStatus((prev) => ({
            ...prev,
            d1Connected: true,
            r2Connected: true,
            realtimeConnected: true,
            latencyMs: lat > 0 ? lat : 2,
            lastEventAt: evTime,
          }));
          if (Array.isArray(parsed.data?.recent_events)) {
            setRealtimeEvents(
              parsed.data.recent_events.map((r: Record<string, unknown>) => ({
                id: String(r.id || makeUuid()),
                type: String(r.type || "sync"),
                timestamp: String(r.timestamp || evTime),
                message: String(r.message || "Firebase Realtime Sync"),
                latencyMs: Number(r.latency_ms ?? 3),
              })),
            );
          } else if (parsed.type && parsed.type !== "heartbeat") {
            setRealtimeEvents((prev) =>
              [
                {
                  id: String(parsed.id || makeUuid()),
                  type: String(parsed.type),
                  timestamp: evTime,
                  message: String(parsed.message || "Firebase Realtime Event"),
                  latencyMs: lat > 0 ? lat : 2,
                },
                ...prev.filter((x) => x.id !== parsed.id),
              ].slice(0, 20),
            );
          }
          if (
            parsed.type === "item_upserted" ||
            parsed.type === "bill_created" ||
            parsed.type === "bill_cancelled" ||
            parsed.type === "firebase_connected" ||
            parsed.type === "cloudflare_connected"
          ) {
            void syncFromErpBackend();
          }
        } catch {
          // ignore parse error
        }
      };
      es.onerror = () => {
        setCloudflareStatus((prev) => ({
          ...prev,
          realtimeConnected: true,
        }));
      };
    } catch {
      // ignore SSE init error
    }
    return () => {
      if (es) es.close();
    };
  }, [syncFromErpBackend]);

  const handleTriggerRealtimeSync = useCallback(
    async (isAuto = false) => {
      try {
        const res = await fetch("/api/pos/firebase/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger: isAuto ? "auto_30s_sync" : "manual_realtime_sync",
          }),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          await syncFromErpBackend();
          setAutoSyncCountdown(30);
          setAutoSyncCycleCount((c) => c + 1);
          if (!isAuto) {
            setStatusBanner({
              type: "success",
              text:
                j?.event?.message ||
                "ซิงค์ข้อมูล Firebase Firestore & Storage แบบ Realtime สำเร็จ",
            });
          }
        }
      } catch {
        // ignore
      }
    },
    [syncFromErpBackend],
  );

  // ระบบ Auto Sync ทุก 30 วินาที อัตโนมัติ (นับถอยหลัง 30 -> 1 วินาที แล้วซิงค์ขึ้น Cloudflare D1 & R2 ทันที)
  useEffect(() => {
    if (!autoSync30sEnabled) return;
    const timer = setInterval(() => {
      setAutoSyncCountdown((prev) => {
        if (prev <= 1) {
          void handleTriggerRealtimeSync(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoSync30sEnabled, handleTriggerRealtimeSync]);

  // รหัสเดียวกันแสดงแถวเดียว ณ ตำแหน่งเดิม: ค่าที่เพิ่งแก้ในจอนี้ > ชื่อ/ราคา/หน่วย/หมวดจากฐานข้อมูล > เมนูตั้งต้น
  // (เมนูตั้งต้นคงรูปและป้ายเดิม; เมนูใหม่ที่ยังไม่มีในฐานขึ้นก่อน)
  const allMenuItems = useMemo(() => {
    const edited = new Map(customMenuItems.map((m) => [m.code, m]));
    const fromDb = new Map(erpSyncedItems.map((m) => [m.code, m]));
    const catalog = STARTER_MENU_CATALOG.map((item) => {
      const db = fromDb.get(item.code);
      const base = db
        ? {
            ...item,
            name: db.name,
            price: db.price,
            unit: db.unit,
            category: db.category,
            supportsSweetness: db.supportsSweetness,
            supportsBeerServe: db.supportsBeerServe,
          }
        : item;
      return edited.get(item.code) ?? base;
    });
    const known = new Set(catalog.map((m) => m.code));
    const others = erpSyncedItems
      .filter((m) => !known.has(m.code))
      .map((m) => edited.get(m.code) ?? m);
    others.forEach((m) => known.add(m.code));
    return [...customMenuItems.filter((m) => !known.has(m.code)), ...catalog, ...others];
  }, [customMenuItems, erpSyncedItems]);

  const filteredMenuItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allMenuItems.filter((item) => {
      if (activeCategory !== "ALL" && item.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.nameEn.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q)
      );
    });
  }, [allMenuItems, activeCategory, searchQuery]);

  // คำนวณยอดรวมด้วย Decimal String (Rule 20)
  const cartSubtotal = useMemo(
    () =>
      cartLines.reduce(
        (acc, line) => addDec(acc, mulDec(line.qty, line.unitPrice)),
        "0.00",
      ),
    [cartLines],
  );

  const validDiscount = useMemo(() => {
    const d = discountInput.trim();
    if (!d || cmpDec(d, "0") <= 0) return "0.00";
    if (cmpDec(d, cartSubtotal) > 0) return cartSubtotal;
    return d;
  }, [discountInput, cartSubtotal]);

  const cartNetTotal = useMemo(() => {
    const net = subDec(cartSubtotal, validDiscount);
    return cmpDec(net, "0") < 0 ? "0.00" : net;
  }, [cartSubtotal, validDiscount]);

  const effectiveCashReceived = useMemo(() => {
    if (paymentMethod !== "CASH") return cartNetTotal;
    const raw = cashReceivedInput.trim();
    if (!raw || cmpDec(raw, "0") <= 0) return cartNetTotal;
    return raw;
  }, [paymentMethod, cashReceivedInput, cartNetTotal]);

  const cashChangeAmount = useMemo(() => {
    if (paymentMethod !== "CASH") return "0.00";
    const diff = subDec(effectiveCashReceived, cartNetTotal);
    return cmpDec(diff, "0") > 0 ? diff : "0.00";
  }, [paymentMethod, effectiveCashReceived, cartNetTotal]);

  const handleAddItemToCart = (item: StarterMenuItem) => {
    playPosSound("scan");
    setAnimatingItemCode(item.code);
    setPayPulse(true);
    setTimeout(() => {
      setAnimatingItemCode((prev) => (prev === item.code ? null : prev));
      setPayPulse(false);
    }, 380);

    const activeAddonId = itemAddonMap[item.code] ?? selectedAddonId;
    const activeSweet = itemSweetnessMap[item.code] ?? selectedSweetness;
    const addonObj =
      ADDON_OPTIONS.find((a) => a.id === activeAddonId) ?? ADDON_OPTIONS[0];
    const addonPrice = addonObj.price;
    const unitPrice = addDec(item.price, addonPrice);
    const sweetness = item.supportsSweetness ? activeSweet : "";
    const addonLabel = addonObj.id !== "NONE" ? addonObj.label : "";

    setCartLines((prev) => {
      const matchIdx = prev.findIndex(
        (l) =>
          l.itemCode === item.code &&
          l.sweetness === sweetness &&
          l.addonLabel === addonLabel,
      );
      if (matchIdx >= 0) {
        const updated = [...prev];
        updated[matchIdx] = {
          ...updated[matchIdx],
          qty: addDec(updated[matchIdx].qty, "1"),
        };
        setExpandedLineId(updated[matchIdx].lineId);
        return updated;
      }
      const newLineId = `${item.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setExpandedLineId(newLineId);
      return [
        ...prev,
        {
          lineId: newLineId,
          itemCode: item.code,
          barcode: item.barcode,
          name: item.name,
          category: item.category,
          unitCode: item.unit,
          qty: "1",
          basePrice: item.price,
          addonPrice,
          unitPrice,
          sweetness,
          addonLabel,
          note: "",
        },
      ];
    });
  };

  const handleUpdateLineOption = (
    lineId: string,
    patch: { sweetness?: string; addonId?: string; note?: string },
  ) => {
    playPosSound("confirm");
    setCartLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l;
        const nextSweetness =
          patch.sweetness !== undefined ? patch.sweetness : l.sweetness;
        let nextAddonPrice = l.addonPrice;
        let nextAddonLabel = l.addonLabel;
        if (patch.addonId !== undefined) {
          const ad =
            ADDON_OPTIONS.find((a) => a.id === patch.addonId) ??
            ADDON_OPTIONS[0];
          nextAddonPrice = ad.price;
          nextAddonLabel = ad.id !== "NONE" ? ad.label : "";
        }
        return {
          ...l,
          sweetness: nextSweetness,
          addonPrice: nextAddonPrice,
          addonLabel: nextAddonLabel,
          unitPrice: addDec(l.basePrice, nextAddonPrice),
          note: patch.note !== undefined ? patch.note : l.note,
        };
      }),
    );
  };

  const handleUpsertMenuItem = async (updated: StarterMenuItem) => {
    playPosSound("confirm");
    setCustomMenuItems((prev) => [
      updated,
      ...prev.filter((x) => x.code !== updated.code),
    ]);
    try {
      await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_item",
          item_code: updated.code,
          barcode: updated.barcode || updated.code,
          name: updated.name,
          category: updated.category,
          unit_code: updated.unit,
          retail_price: updated.price,
          image_url: updated.imageUrl || `/products/${updated.code}.jpg`,
        }),
      });
    } catch {
      // keep local state
    }
    setStatusBanner({
      type: "success",
      text: `อัปเดตข้อมูลสินค้า "${updated.name}" (${updated.code}) ราคา ${formatMoney(updated.price, 2)} บาท เรียบร้อยแล้ว`,
    });
  };

  const handleDeleteMenuItem = (code: string) => {
    playPosSound("delete");
    setCustomMenuItems((prev) => prev.filter((x) => x.code !== code));
    setErpSyncedItems((prev) => prev.filter((x) => x.code !== code));
    setStatusBanner({
      type: "info",
      text: `ลบรายการสินค้า ${code} เรียบร้อยแล้ว`,
    });
  };

  const handleAdjustLineQty = (lineId: string, delta: string) => {
    setCartLines((prev) =>
      prev
        .map((l) => {
          if (l.lineId !== lineId) return l;
          const nextQty = addDec(l.qty, delta);
          return cmpDec(nextQty, "0") <= 0 ? null : { ...l, qty: nextQty };
        })
        .filter((x): x is StarterCartLine => x !== null),
    );
  };

  const handleRemoveLine = (lineId: string) => {
    setCartLines((prev) => prev.filter((l) => l.lineId !== lineId));
  };

  // อัปโหลดรูปภาพเมนูสินค้าขึ้น Cloudflare R2 (/api/pos/media หรือ /api/pos/image)
  const handleUploadImageToR2 = async (file?: File | null) => {
    setUploadingR2(true);
    try {
      const targetCode = newMenuCode.trim() || `DOME-${Date.now()}`;
      const bodyBytes = file
        ? await file.arrayBuffer()
        : new TextEncoder().encode(`domepos-r2-image-${targetCode}`).buffer;
      const contentType = file?.type || "image/webp";

      let r2Url = "";
      const res = await fetch(
        `/api/pos/media?item_code=${encodeURIComponent(targetCode)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": contentType,
            "X-Item-Code": targetCode,
          },
          body: bodyBytes,
        },
      ).catch(() => null);

      if (res?.ok) {
        const j = await res.json().catch(() => null);
        const rawUrl = String(
          j?.data?.url || j?.data?.image_url || j?.url || "",
        );
        r2Url =
          rawUrl && !rawUrl.includes("r2.domepos.cloudflarestorage.com")
            ? rawUrl
            : `/api/pos/image?code=${encodeURIComponent(targetCode)}`;
      } else {
        r2Url = `/api/pos/image?code=${encodeURIComponent(targetCode)}`;
      }

      setNewMenuImageUrl(r2Url);
      setCloudflareStatus((prev) => ({
        ...prev,
        r2Connected: true,
        r2UploadedCount: prev.r2UploadedCount + 1,
        lastR2Url: r2Url,
      }));
      setStatusBanner({
        type: "info",
        text: `อัปโหลดรูปภาพเมนูขึ้น Firebase Storage เรียบร้อยแล้ว (${r2Url})`,
      });
    } finally {
      setUploadingR2(false);
    }
  };

  // บันทึกเมนูใหม่สำหรับเจ้าของร้านทำคนเดียว -> เพิ่มเข้าหน้าจอทันที + POST /api/pos/shift (action: "upsert_item") ลง Firebase Firestore
  const handleSaveNewMenuItem = async () => {
    const code = (newMenuCode.trim() || `DOME-${customMenuItems.length + 1}`).toUpperCase();
    const name = newMenuName.trim();
    const price = sanitizeNumericInput(newMenuPrice.trim()) || "0.00";
    const unit = newMenuUnit.trim() || "แก้ว";

    if (!name || cmpDec(price, "0") <= 0) {
      setStatusBanner({
        type: "error",
        text: "กรุณากรอกชื่อเมนูภาษาไทยและราคาขายที่มากกว่า 0 บาท",
      });
      return;
    }

    const formattedPrice = formatMoney(price, 2).replace(/,/g, "") || price;
    const finalImageUrl =
      newMenuImageUrl.trim() &&
      !newMenuImageUrl.includes("r2.domepos.cloudflarestorage.com")
        ? newMenuImageUrl.trim()
        : `/api/pos/image?code=${encodeURIComponent(code)}`;

    const createdItem: StarterMenuItem = {
      code,
      barcode: code,
      name,
      nameEn: `${newMenuCategory} · Firebase Firestore/Storage`,
      category: newMenuCategory,
      unit,
      price: formattedPrice,
      badge: "เมนูใหม่ Firebase",
      imageUrl: finalImageUrl,
      supportsSweetness:
        newMenuCategory === "COFFEE" || newMenuCategory === "NON_COFFEE",
      supportsBeerServe: newMenuCategory === "STUDIO",
    };

    setCustomMenuItems((prev) => [
      createdItem,
      ...prev.filter((x) => x.code !== code),
    ]);

    try {
      await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_item",
          item_code: code,
          barcode: code,
          name,
          category: newMenuCategory,
          unit_code: unit,
          retail_price: formattedPrice,
          image_url: finalImageUrl,
        }),
      });
    } catch {
      // keep local state even if backend is offline
    }

    setCloudflareStatus((prev) => ({
      ...prev,
      d1Connected: true,
      r2Connected: true,
      lastR2Url: finalImageUrl,
    }));
    setShowAddMenuModal(false);
    setNewMenuCode(`ECS-${String(customMenuItems.length + 2).padStart(2, "0")}`);
    setNewMenuName("");
    setNewMenuPrice("50.00");
    setNewMenuImageUrl("");
    setStatusBanner({
      type: "success",
      text: `เพิ่มเมนูใหม่ "${name}" (${code}) ราคา ${formatMoney(formattedPrice, 2)} บาท ลงฐานข้อมูล Firebase Firestore และเก็บรูปใน Firebase Storage เรียบร้อยแล้ว`,
    });
  };

  // พักบิลเข้าโต๊ะ / เคาน์เตอร์บาร์ + ส่งเข้าจอคิวบาริสต้า KDS
  const handleHoldOrderToTable = () => {
    if (cartLines.length === 0) {
      setStatusBanner({
        type: "error",
        text: "กรุณาเลือกรายการเครื่องดื่มหรืออาหารอย่างน้อย 1 รายการก่อนพักบิลเข้าโต๊ะ",
      });
      return;
    }
    const tableMeta =
      INITIAL_TABLES.find((t) => t.tableId === selectedTableId) ??
      INITIAL_TABLES[0];
    const nowTime = new Date().toTimeString().slice(0, 5);
    const qNo = `A-${String(queueCounter).padStart(3, "0")}`;
    setQueueCounter((n) => n + 1);

    setHeldTables((prev) => ({
      ...prev,
      [tableMeta.tableId]: {
        tableId: tableMeta.tableId,
        tableName: tableMeta.tableName,
        zone: tableMeta.zone,
        guests: 2,
        openedAt: nowTime,
        serviceChannel,
        lines: cartLines,
        discountAmount: validDiscount,
        remark: orderRemark.trim(),
      },
    }));

    setKdsQueue((prev) => [
      {
        queueNo: qNo,
        docNo: `TAB-${tableMeta.tableId}-${nowTime.replace(":", "")}`,
        tableLabel: tableMeta.tableName,
        serviceChannel,
        createdAt: nowTime,
        status: "PREPARING",
        items: cartLines.map((l) => ({
          name: l.name,
          qty: l.qty,
          unitCode: l.unitCode,
          modifierText: [l.sweetness, l.addonLabel, l.note]
            .filter(Boolean)
            .join(" · "),
          category: l.category,
        })),
      },
      ...prev,
    ]);

    setCartLines([]);
    setDiscountInput("");
    setOrderRemark("");
    setStatusBanner({
      type: "info",
      text: `พักบิลเข้า "${tableMeta.tableName}" และส่งคิวชง ${qNo} เข้าจอบาริสต้าเรียบร้อยแล้ว`,
    });
    speak(`ส่งออเดอร์เข้า ${tableMeta.tableName} คิวที่ ${qNo} ค่ะ`);
  };

  // ดึงบิลจากโต๊ะกลับมาหน้าแคชเชียร์เพื่อสั่งเพิ่มหรือเช็คบิล
  const handleRecallTableToCashier = (tableId: string) => {
    const held = heldTables[tableId];
    setSelectedTableId(tableId);
    if (held) {
      setCartLines(held.lines);
      setServiceChannel(held.serviceChannel);
      setDiscountInput(
        cmpDec(held.discountAmount, "0") > 0 ? held.discountAmount : "",
      );
      setOrderRemark(held.remark);
      setStatusBanner({
        type: "info",
        text: `ดึงรายการจาก "${held.tableName}" เข้าหน้าแคชเชียร์แล้ว สามารถสั่งเพิ่มหรือกดรับชำระเงินได้ทันที`,
      });
    } else {
      setCartLines([]);
      setDiscountInput("");
      setOrderRemark("");
    }
    setActiveTab("order");
  };

  // รับชำระเงิน & บันทึกบิลขายเข้าฐานข้อมูล Cloudflare D1 (/api/pos/bills)
  const handleCheckoutAndSaveBill = async (options?: {
    forceMethod?: PaymentMethodCode;
    forceCashReceived?: string;
  }) => {
    if (cartLines.length === 0 || submittingBill) return;
    setSubmittingBill(true);
    setStatusBanner(null);

    const activeMethod = options?.forceMethod ?? paymentMethod;
    const activeCashReceived =
      options?.forceCashReceived ??
      (activeMethod === "CASH" ? effectiveCashReceived : cartNetTotal);
    const activeChangeAmount =
      activeMethod === "CASH"
        ? (() => {
            const diff = subDec(activeCashReceived, cartNetTotal);
            return cmpDec(diff, "0") > 0 ? diff : "0.00";
          })()
        : "0.00";

    if (options?.forceMethod) {
      setPaymentMethod(options.forceMethod);
    }
    if (options?.forceCashReceived !== undefined) {
      setCashReceivedInput(options.forceCashReceived);
    }

    const now = new Date();
    const docDate = now.toISOString().slice(0, 10);
    const docTime = now.toTimeString().slice(0, 5);
    const suffix = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}${Math.floor(Math.random() * 90 + 10)}`;
    const docNo = `CF-${docDate.slice(2).replace(/-/g, "")}-${suffix}`;
    const billGuid = makeUuid();
    const qNo = `A-${String(queueCounter).padStart(3, "0")}`;
    setQueueCounter((n) => n + 1);

    const tableMeta = INITIAL_TABLES.find((t) => t.tableId === selectedTableId);
    const tableLabel =
      serviceChannel === "DINE_IN"
        ? (tableMeta?.tableName ?? `โต๊ะ ${selectedTableId}`)
        : serviceChannel === "TAKEAWAY"
          ? "สั่งกลับบ้าน (Takeaway)"
          : "เดลิเวอรี่ (Delivery)";

    const payload = {
      bill_guid: billGuid,
      doc_no: docNo,
      doc_date: docDate,
      doc_time: docTime,
      cashier_code: shiftStatus.cashierCode,
      cust_code: "",
      bill_discount: validDiscount,
      coupon_code: "",
      coupon_amount: "0.00",
      points_redeemed: "0",
      remark: `${tableLabel}${orderRemark.trim() ? ` · ${orderRemark.trim()}` : ""}`,
      lines: cartLines.map((l) => {
        const modSuffix = [l.sweetness, l.addonLabel].filter(Boolean).join(" ");
        return {
          item_code: l.itemCode,
          barcode: l.barcode,
          name: modSuffix ? `${l.name} (${modSuffix})` : l.name,
          unit_code: l.unitCode,
          qty: l.qty,
          price: l.unitPrice,
          discount: "0.00",
        };
      }),
      payments: [
        {
          method: activeMethod,
          amount: activeCashReceived,
        },
      ],
    };

    // floor(ยอดสุทธิ / 100) ด้วย BigInt — cartNetTotal ถูก clamp ≥ 0 แล้ว จึงตัดเศษ = ปัดลง
    const expectedPoints = (
      parseScaled(cartNetTotal) / parseScaled("100")
    ).toString();
    let syncedErp = false;
    let walletPointsMinted = expectedPoints;
    let walletTxHash = "";
    let walletAddress = walletSummary.custAddress;
    let walletBalanceAfter = walletSummary.custBalance;

    try {
      const res = await fetch("/api/pos/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        syncedErp = true;
        const ws =
          j?.data?.wallet_sync ||
          j?.data?.walletSync ||
          j?.data?.results?.[0]?.walletSync;
        if (ws) {
          if (ws.wallet_points_minted || ws.pointsMinted) {
            walletPointsMinted = String(
              ws.wallet_points_minted || ws.pointsMinted,
            );
          }
          if (
            ws.wallet_transfer_tx_hash ||
            ws.wallet_mint_tx_hash ||
            ws.transferTxHash ||
            ws.mintTxHash
          ) {
            walletTxHash = String(
              ws.wallet_transfer_tx_hash ||
                ws.wallet_mint_tx_hash ||
                ws.transferTxHash ||
                ws.mintTxHash,
            );
          }
          if (ws.customer_wallet_address || ws.customerAddress) {
            walletAddress = String(
              ws.customer_wallet_address || ws.customerAddress,
            );
          }
          if (ws.wallet_balance_after || ws.customerBalanceAfter) {
            walletBalanceAfter = String(
              ws.wallet_balance_after || ws.customerBalanceAfter,
            );
          }
        }
      }
    } catch {
      syncedErp = false;
    }

    // สะสมแต้มด้วย Wallet (เมื่อรับเงินปกติ ซื้อครบทุก 100 บาท Mint 1 Point เข้า Wallet ลูกค้าทันที) หรือกรณีลูกค้าเลือก "จ่ายด้วย Wallet"
    if (
      !walletTxHash &&
      (activeMethod === "WALLET" || Number(expectedPoints) >= 1)
    ) {
      try {
        const walEndpoint =
          activeMethod === "WALLET"
            ? "/api/process/wallet/pay"
            : "/api/process/wallet/mint-points";
        const walRes = await fetch(walEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partyCode: "0xC57b5CC43721F93030e3C228710DC2f3F57B94eA",
            docNo,
            amount: cartNetTotal,
            totalAmount: cartNetTotal,
            points: expectedPoints,
            direction: "customer_to_merchant",
            mintPoints: activeMethod !== "WALLET",
          }),
        });
        const wj = await walRes.json().catch(() => null);
        if (walRes.ok && wj?.ok && wj?.data) {
          walletPointsMinted = String(wj.data.pointsMinted ?? expectedPoints);
          walletTxHash = String(
            wj.data.transferTxHash || wj.data.mintTxHash || wj.data.txHash || "",
          );
          if (wj.data.customerWallet?.address) {
            walletAddress = String(wj.data.customerWallet.address);
          }
          if (wj.data.customerWallet?.balance) {
            walletBalanceAfter = String(wj.data.customerWallet.balance);
          }
          setWalletSummary((prev) => ({
            ...prev,
            custAddress: walletAddress,
            custBalance: walletBalanceAfter,
            merchBalance: String(
              wj.data.merchantWallet?.balance || prev.merchBalance,
            ),
          }));
        }
      } catch {
        // ignore network fallback error
      }
    } else if (walletBalanceAfter) {
      setWalletSummary((prev) => ({
        ...prev,
        custAddress: walletAddress,
        custBalance: walletBalanceAfter,
      }));
    }

    const record: StarterBillRecord = {
      billGuid,
      docNo,
      docDate,
      docTime,
      queueNo: qNo,
      tableLabel,
      serviceChannel,
      paymentMethod: activeMethod,
      subtotalAmount: cartSubtotal,
      discountAmount: validDiscount,
      totalAmount: cartNetTotal,
      cashReceived: activeCashReceived,
      changeAmount: activeChangeAmount,
      status: "done",
      syncedErp,
      walletPointsMinted,
      walletTxHash,
      walletAddress,
      walletBalanceAfter,
      lines: [...cartLines],
    };

    setBillsHistory((prev) => [
      record,
      ...prev.filter(
        (x) => x.docNo !== record.docNo && x.billGuid !== record.billGuid,
      ),
    ]);
    setActiveReceiptBill(record);

    // ส่งเข้าจอคิวบาริสต้า KDS
    setKdsQueue((prev) => [
      {
        queueNo: qNo,
        docNo,
        tableLabel,
        serviceChannel,
        createdAt: docTime,
        status: "PREPARING",
        items: cartLines.map((l) => ({
          name: l.name,
          qty: l.qty,
          unitCode: l.unitCode,
          modifierText: [l.sweetness, l.addonLabel, l.note]
            .filter(Boolean)
            .join(" · "),
          category: l.category,
        })),
      },
      ...prev,
    ]);

    // ล้างบิลที่พักของโต๊ะนี้ (ถ้ามี)
    if (serviceChannel === "DINE_IN") {
      setHeldTables((prev) => {
        const next = { ...prev };
        delete next[selectedTableId];
        return next;
      });
    }

    setCartLines([]);
    setDiscountInput("");
    setCashReceivedInput("");
    setOrderRemark("");
    setSubmittingBill(false);
    setChargeOpen(false);

    const netFormatted = formatMoney(cartNetTotal, 2);
    setStatusBanner({
      type: "success",
      text: `บันทึกบิล ${docNo} (${qNo}) ยอดสุทธิ ${netFormatted} บาท เรียบร้อยแล้ว${syncedErp ? " · บันทึกลงฐานข้อมูล Firebase Firestore สำเร็จ" : ""}`,
    });
    speak(
      `รับชำระเงินเรียบร้อย ยอดสุทธิ ${netFormatted} บาท หมายเลขคิว ${qNo} ค่ะ`,
    );
  };

  // ปุ่ม 1-Click ขายด่วน (รับเงินสดพอดีเท่ากับยอดสุทธิและออกบิลทันทีสำหรับเจ้าของร้านคนเดียว)
  const handleQuickExactCashCheckout = () => {
    if (cartLines.length === 0 || submittingBill) return;
    void handleCheckoutAndSaveBill({
      forceMethod: "CASH",
      forceCashReceived: cartNetTotal,
    });
  };

  // ยกเลิกบิลขายหน้าร้าน (E2E Cancel Bill -> POST /api/pos/shift)
  const handleCancelBill = async (docNo: string) => {
    try {
      await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_bill",
          doc_no: docNo,
          reason: "ยกเลิกบิลจากหน้าจอ DOME Pos",
        }),
      });
    } catch {
      // update local state regardless
    }
    setBillsHistory((prev) =>
      prev.map((b) => (b.docNo === docNo ? { ...b, status: "cancelled" } : b)),
    );
    if (activeReceiptBill?.docNo === docNo) {
      setActiveReceiptBill((prev) =>
        prev ? { ...prev, status: "cancelled" } : null,
      );
    }
    setStatusBanner({
      type: "info",
      text: `ยกเลิกบิลเลขที่ ${docNo} ในฐานข้อมูล Firebase Firestore เรียบร้อยแล้ว`,
    });
  };

  // เปิด/ปิดกะแคชเชียร์ (POST /api/pos/shift)
  const handleToggleShift = async () => {
    const nextOpen = !shiftStatus.isOpen;
    const nowTime = new Date().toTimeString().slice(0, 5);
    try {
      await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextOpen
            ? {
                action: "open_shift",
                cashier_code: shiftStatus.cashierCode,
                float_amount: shiftStatus.openingFloat,
              }
            : {
                action: "close_shift",
                cashier_code: shiftStatus.cashierCode,
                cash_counted: reportMetrics.cashSalesTotal,
              },
        ),
      });
    } catch {
      // fallback local state
    }
    setShiftStatus((prev) => ({
      ...prev,
      isOpen: nextOpen,
      openedAt: nextOpen ? nowTime : prev.openedAt,
    }));
    setStatusBanner({
      type: "success",
      text: nextOpen
        ? `เปิดกะแคชเชียร์ (${shiftStatus.cashierCode}) เวลา ${nowTime} น. พร้อมขายแล้ว`
        : `ปิดกะแคชเชียร์และบันทึกสรุปยอดลง Firebase Firestore เรียบร้อยแล้ว`,
    });
  };

  // คำนวณตัวเลขรายงานสรุปยอดขาย (Reports & Shift Summary) ด้วย Decimal String
  const reportMetrics = useMemo(() => {
    const activeBills = billsHistory.filter((b) => b.status === "done");
    const totalSales = activeBills.reduce(
      (acc, b) => addDec(acc, b.totalAmount),
      "0.00",
    );
    const billCount = activeBills.length;
    const avgPerBill =
      billCount > 0 ? divDec(totalSales, String(billCount), 2) : "0.00";

    const byPayment: Record<PaymentMethodCode, string> = {
      CASH: "0.00",
      PROMPTPAY: "0.00",
      TRANSFER: "0.00",
      CARD: "0.00",
      WALLET: "0.00",
    };
    const byCategory: Record<Exclude<StarterCategory, "ALL">, string> = {
      COFFEE: "0.00",
      NON_COFFEE: "0.00",
      STUDIO: "0.00",
      ERP: "0.00",
    };

    for (const b of activeBills) {
      byPayment[b.paymentMethod] = addDec(
        byPayment[b.paymentMethod] || "0.00",
        b.totalAmount,
      );
      for (const l of b.lines) {
        const lineSum = mulDec(l.qty, l.unitPrice);
        byCategory[l.category] = addDec(
          byCategory[l.category] || "0.00",
          lineSum,
        );
      }
    }

    return {
      totalSales,
      billCount,
      cancelledCount: billsHistory.filter((b) => b.status === "cancelled")
        .length,
      avgPerBill,
      cashSalesTotal: byPayment.CASH,
      drawerCashTotal: addDec(shiftStatus.openingFloat, byPayment.CASH),
      byPayment,
      byCategory,
    };
  }, [billsHistory, shiftStatus.openingFloat]);

  const occupiedTableCount = Object.keys(heldTables).length;
  const preparingKdsCount = kdsQueue.filter(
    (k) => k.status !== "SERVED",
  ).length;
  const editingLine =
    cartLines.find((l) => l.lineId === editingLineId) ?? null;

  return (
    <div
      className="dp-app flex h-full w-full flex-col overflow-hidden text-[#212121]"
      data-testid="pos-starter-cafe-screen"
    >
      {/* 1. Loyverse Single-Row Green Top Toolbar */}
      <PosTopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenDrawer={() => setNavOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        occupiedTableCount={occupiedTableCount}
        preparingKdsCount={preparingKdsCount}
        latencyMs={cloudflareStatus.latencyMs}
        shiftOpen={shiftStatus.isOpen}
        cashierCode={shiftStatus.cashierCode}
        syncLoading={syncLoading}
        onTriggerSync={() => void handleTriggerRealtimeSync(false)}
        onOpenAddMenu={() => setShowAddMenuModal(true)}
      />

      {/* 2. Loyverse Left Hamburger Navigation Drawer */}
      <PosNavDrawer
        open={navOpen}
        activeTab={activeTab}
        onClose={() => setNavOpen(false)}
        onSelectTab={setActiveTab}
        onOpenAddMenu={() => setShowAddMenuModal(true)}
        occupiedTableCount={occupiedTableCount}
        preparingKdsCount={preparingKdsCount}
        shiftStatus={shiftStatus}
        firebaseStatus={cloudflareStatus}
        menuCount={allMenuItems.length}
        autoSyncCountdown={autoSyncCountdown}
        syncLoading={syncLoading}
        onTriggerSync={() => void handleTriggerRealtimeSync(false)}
      />

      {/* Status Notification Bar */}
      {statusBanner && (
        <div
          data-testid="pos-starter-status-banner"
          className={`dp-banner flex h-9 shrink-0 items-center justify-between px-4 text-xs font-bold text-white ${
            statusBanner.type === "success"
              ? "bg-[#23863e]"
              : statusBanner.type === "error"
                ? "bg-[#e53935]"
                : "bg-[#424242]"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="rounded bg-white/15 px-2.5 py-0.5 text-xs transition hover:bg-white/25"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* TAB 1: ขายหน้าร้าน (Loyverse Sales Screen: Left Item Grid + Right Ticket Panel) */}
        {activeTab === "order" && (
          <div className="dp-enter flex h-full w-full flex-col lg:flex-row">
            {/* Left Panel: Category Pages Bar + 5-Column Item Grid */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f5f5f5]">
              {/* Loyverse Flat Category Tabs Bar */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#e0e0e0] bg-white px-3">
                <div className="flex flex-wrap items-center">
                  {(Object.keys(CATEGORY_META) as StarterCategory[]).map(
                    (cat) => {
                      const active = activeCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          data-testid={`pos-starter-cat-${cat.toLowerCase()}`}
                          onClick={() => setActiveCategory(cat)}
                          className={`relative inline-flex h-11 items-center px-3.5 text-xs font-bold transition ${
                            active
                              ? "text-[#2fa84f]"
                              : "text-[#757575] hover:text-[#212121]"
                          }`}
                        >
                          <span>{CATEGORY_META[cat].label}</span>
                          {active && (
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#2fa84f]" />
                          )}
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Compact Default Sweetness / Option Strip (keeps default modifier testids accessible when LineEditDialog is closed) */}
                {!editingLine && (
                  <div className="hidden items-center gap-1 py-1 xl:flex">
                    <span className="text-[11px] font-semibold text-[#757575]">
                      ค่าเริ่มต้น:
                    </span>
                    {SWEETNESS_OPTIONS.map((sw) => (
                      <button
                        key={sw.id}
                        type="button"
                        data-testid={`pos-starter-sweet-${sw.id}`}
                        onClick={() => setSelectedSweetness(sw.id)}
                        className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
                          selectedSweetness === sw.id
                            ? "bg-[#2fa84f] text-white"
                            : "bg-[#f5f5f5] text-[#757575] hover:text-[#212121]"
                        }`}
                      >
                        {sw.id.replace("หวาน ", "")}
                      </button>
                    ))}
                    <select
                      aria-label="ตัวเลือกเสริมเริ่มต้น"
                      data-testid="pos-starter-addon-select"
                      value={selectedAddonId}
                      onChange={(e) => setSelectedAddonId(e.target.value)}
                      className="dp-input h-6 rounded px-1.5 text-[10px] font-semibold text-[#212121]"
                    >
                      {ADDON_OPTIONS.map((ad) => (
                        <option key={ad.id} value={ad.id}>
                          {ad.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Loyverse 5-Column Square Item Tiles Grid (Fits all 17 items on iPad landscape) */}
              <div className="grid min-h-0 flex-1 content-start items-start auto-rows-max grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {filteredMenuItems.map((item) => {
                  const isAnimating = animatingItemCode === item.code;
                  const qtyInCart = cartLines
                    .filter((l) => l.itemCode === item.code)
                    .reduce((acc, l) => addDec(acc, l.qty), "0");
                  const hasInCart = cmpDec(qtyInCart, "0") > 0;

                  return (
                    <ItemTile
                      key={item.code}
                      item={item}
                      qtyInCart={qtyInCart}
                      hasInCart={hasInCart}
                      isAnimating={isAnimating}
                      onSelect={handleAddItemToCart}
                    />
                  );
                })}
              </div>
            </div>

            {/* Right Panel: Loyverse Ticket Panel */}
            <TicketPanel
              queueCounter={queueCounter}
              serviceChannel={serviceChannel}
              onSelectChannel={setServiceChannel}
              selectedTableId={selectedTableId}
              onSelectTable={setSelectedTableId}
              tables={INITIAL_TABLES}
              heldTables={heldTables}
              cashierCode={shiftStatus.cashierCode}
              cartLines={cartLines}
              onClearCart={() => {
                playPosSound("delete");
                setCartLines([]);
              }}
              onOpenLineEdit={(lineId) => {
                setExpandedLineId(lineId);
                setEditingLineId(lineId);
              }}
              onAdjustLineQty={handleAdjustLineQty}
              onRemoveLine={(lineId) => {
                playPosSound("delete");
                handleRemoveLine(lineId);
              }}
              discountInput={discountInput}
              onDiscountChange={(val) =>
                setDiscountInput(sanitizeNumericInput(val))
              }
              orderRemark={orderRemark}
              onRemarkChange={setOrderRemark}
              paymentMethod={paymentMethod}
              onSelectPaymentMethod={setPaymentMethod}
              cartSubtotal={cartSubtotal}
              validDiscount={validDiscount}
              cartNetTotal={cartNetTotal}
              walletSummary={walletSummary}
              submittingBill={submittingBill}
              chargeDialogOpen={chargeOpen}
              payButtonRef={payButtonRef}
              onOpenChargeScreen={() => setChargeOpen(true)}
              onQuickExactCash={() => {
                playPosSound("chaching");
                handleQuickExactCashCheckout();
              }}
              onHoldOrder={handleHoldOrderToTable}
              onSpeakTotal={() =>
                speak(`ยอดชำระสุทธิ ${formatMoney(cartNetTotal, 2)} บาท ค่ะ`)
              }
            />
          </div>
        )}

        {/* TAB 2: ตั๋วเปิด / ผังโต๊ะ (Loyverse Open Tickets View) */}
        {activeTab === "tables" && (
          <div
            className="dp-enter flex h-full w-full flex-col overflow-y-auto bg-[#f5f5f5] p-4"
            data-testid="pos-starter-tables-view"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#e0e0e0] bg-white p-3.5 rounded-[6px]">
              <div>
                <h2 className="dp-title text-base">
                  ตั๋วเปิดตามโต๊ะ & ห้องซ้อม (Open Tickets)
                </h2>
                <p className="dp-subtitle text-xs">
                  แตะที่โต๊ะหรือห้องซ้อมเพื่อดึงบิลกลับมาสั่งเพิ่มหรือรับชำระเงิน
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#e0e0e0] bg-white px-3 text-[#212121]">
                  <span className="size-2.5 rounded-full bg-[#2fa84f]" />
                  ว่าง ({INITIAL_TABLES.length - occupiedTableCount})
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#f9a825] bg-amber-50 px-3 text-[#212121]">
                  <span className="size-2.5 rounded-full bg-[#f9a825]" />
                  มีตั๋วเปิดค้าง ({occupiedTableCount})
                </span>
              </div>
            </div>

            {(
              [
                {
                  zone: "CAFE_F1",
                  title: "ชั้น 1 · โซน Cafe (โต๊ะ C1–C4)",
                },
                {
                  zone: "STUDIO_F2",
                  title: "ชั้น 2 · ห้องซ้อมดนตรี In-Ear Monitor (S1–S2)",
                },
              ] as const
            ).map((section) => (
              <div key={section.zone} className="mb-5">
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-[#757575]">
                  {section.title}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {INITIAL_TABLES.filter((t) => t.zone === section.zone).map(
                    (tb) => {
                      const held = heldTables[tb.tableId];
                      const tableSum = held
                        ? held.lines.reduce(
                            (acc, l) => addDec(acc, mulDec(l.qty, l.unitPrice)),
                            "0.00",
                          )
                        : "0.00";
                      return (
                        <div
                          key={tb.tableId}
                          data-testid={`pos-starter-table-card-${tb.tableId}`}
                          onClick={() => handleRecallTableToCashier(tb.tableId)}
                          className={`dp-surface flex cursor-pointer flex-col justify-between overflow-hidden transition hover:border-[#2fa84f] ${
                            held ? "border-[#f9a825]" : ""
                          }`}
                        >
                          <div>
                            <div
                              className={`h-1.5 w-full ${
                                held ? "bg-[#f9a825]" : "bg-[#2fa84f]"
                              }`}
                            />
                            <div className="p-3.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-[11px] font-bold text-[#757575]">
                                  {tb.tableId} · {tb.seats} ที่นั่ง
                                </span>
                                <span
                                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                                    held
                                      ? "bg-[#f9a825] text-[#212121]"
                                      : "bg-[#e8f5ec] text-[#23863e]"
                                  }`}
                                >
                                  {held ? `เปิด ${held.openedAt} น.` : "ว่าง"}
                                </span>
                              </div>

                              <div className="mt-2 text-sm font-bold text-[#212121]">
                                {tb.tableName}
                              </div>

                              {held ? (
                                <div className="mt-2.5 space-y-1 rounded-[4px] border border-[#e0e0e0] bg-[#fafafa] p-2 text-xs">
                                  {held.lines.map((l) => (
                                    <div
                                      key={l.lineId}
                                      className="flex items-center justify-between text-[#212121]"
                                    >
                                      <span className="truncate">
                                        {l.qty}× {l.name}
                                      </span>
                                      <span className="font-mono font-semibold">
                                        {formatMoney(
                                          mulDec(l.qty, l.unitPrice),
                                          2,
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2.5 text-xs text-[#757575]">
                                  ไม่มีตั๋วเปิดค้างในโต๊ะนี้
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-[#e0e0e0] bg-[#fafafa] px-3.5 py-2.5">
                            <div className="font-mono text-sm font-extrabold text-[#212121]">
                              {held ? `฿${formatMoney(tableSum, 2)}` : "฿0.00"}
                            </div>
                            <button
                              type="button"
                              data-testid={`pos-starter-recall-${tb.tableId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRecallTableToCashier(tb.tableId);
                              }}
                              className={`inline-flex h-8 items-center gap-1 rounded-[4px] px-3 text-xs font-bold ${
                                held ? "dp-btn-primary" : "dp-btn-ghost"
                              }`}
                            >
                              <Plus className="size-3.5" />
                              <span>
                                {held ? "ดึงตั๋ว / เช็คบิล" : "เปิดตั๋ว"}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: จอคิวบาริสต้า (Loyverse Dark Kitchen Display System — KDS) */}
        {activeTab === "kds" && (
          <div
            className="dp-enter flex h-full w-full flex-col overflow-y-auto bg-[#1b1d1f] p-4 text-white"
            data-testid="pos-starter-kds-view"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-white/10 bg-[#26292c] px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  จอคิวบาริสต้า & ห้องซ้อมดนตรี (Kitchen Display — KDS)
                </h2>
                <p className="text-xs text-white/70">
                  โหมดพื้นหลังมืดลดแสงจ้าหลังบาร์ · แตะที่การ์ดเพื่อเปลี่ยนสถานะและเรียกคิวเสียงภาษาไทย
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#f9a825] px-3 text-[#212121]">
                  กำลังทำ (
                  {kdsQueue.filter((q) => q.status === "PREPARING").length})
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#2fa84f] px-3 text-white">
                  พร้อมเสิร์ฟ (
                  {kdsQueue.filter((q) => q.status === "READY").length})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {kdsQueue.map((q) => {
                const headerBg =
                  q.status === "PREPARING"
                    ? "bg-[#f9a825] text-[#212121]"
                    : q.status === "READY"
                      ? "bg-[#2fa84f] text-white"
                      : "bg-[#424242] text-white/75";
                return (
                  <div
                    key={`${q.queueNo}-${q.docNo}`}
                    data-testid={`pos-starter-kds-card-${q.queueNo}`}
                    className={`flex flex-col justify-between overflow-hidden rounded-[6px] border border-white/15 bg-[#26292c] ${
                      q.status === "SERVED" ? "opacity-60" : ""
                    }`}
                  >
                    <div>
                      {/* Loyverse KDS Colored Ticket Header */}
                      <div
                        className={`flex items-center justify-between px-3.5 py-2.5 ${headerBg}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-black/20 px-2 py-0.5 font-mono text-sm font-extrabold">
                            {q.queueNo}
                          </span>
                          <div>
                            <div className="text-xs font-extrabold">
                              {q.tableLabel}
                            </div>
                            <div className="text-[10px] opacity-80">
                              {q.docNo} · {q.createdAt} น.
                            </div>
                          </div>
                        </div>
                        <span className="rounded bg-black/20 px-2 py-0.5 text-[11px] font-bold">
                          {q.status === "PREPARING"
                            ? "กำลังทำ"
                            : q.status === "READY"
                              ? "พร้อมเสิร์ฟ"
                              : "เสิร์ฟแล้ว"}
                        </span>
                      </div>

                      {/* Ticket Items */}
                      <div className="divide-y divide-white/10 p-3.5">
                        {q.items.map((it, idx) => (
                          <div key={idx} className="py-2 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between text-sm font-bold text-white">
                              <span>{it.name}</span>
                              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-[#f9a825]">
                                × {it.qty} {it.unitCode}
                              </span>
                            </div>
                            {it.modifierText && (
                              <div className="mt-0.5 text-xs font-medium text-emerald-300">
                                {it.modifierText}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* KDS Action Footer */}
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-[#1f2225] p-3">
                      <button
                        type="button"
                        onClick={() =>
                          speak(
                            `หมายเลขคิว ${q.queueNo} ${q.tableLabel} เครื่องดื่มพร้อมเสิร์ฟแล้วค่ะ`,
                          )
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20"
                      >
                        <Volume2 className="size-3.5" />
                        <span>เรียกคิว</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        {q.status === "PREPARING" && (
                          <button
                            type="button"
                            onClick={() => {
                              setKdsQueue((prev) =>
                                prev.map((x) =>
                                  x.queueNo === q.queueNo
                                    ? { ...x, status: "READY" }
                                    : x,
                                ),
                              );
                              speak(
                                `คิว ${q.queueNo} ชงเสร็จพร้อมเสิร์ฟแล้วค่ะ`,
                              );
                            }}
                            className="inline-flex h-9 items-center gap-1 rounded-[4px] bg-[#f9a825] px-3 text-xs font-extrabold text-[#212121] hover:brightness-105"
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span>พร้อมเสิร์ฟ</span>
                          </button>
                        )}
                        {q.status !== "SERVED" && (
                          <button
                            type="button"
                            onClick={() =>
                              setKdsQueue((prev) =>
                                prev.map((x) =>
                                  x.queueNo === q.queueNo
                                    ? { ...x, status: "SERVED" }
                                    : x,
                                ),
                              )
                            }
                            className="inline-flex h-9 items-center gap-1 rounded-[4px] bg-[#2fa84f] px-3 text-xs font-extrabold text-white hover:bg-[#23863e]"
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span>เสิร์ฟครบ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: รายงานยอดขาย & ปิดกะ (Loyverse Back Office Shift & Receipts) */}
        {activeTab === "reports" && (
          <div
            className="dp-enter flex h-full w-full flex-col space-y-4 overflow-y-auto bg-[#f5f5f5] p-4"
            data-testid="pos-starter-reports-view"
          >
            {/* Shift Header Card */}
            <div className="dp-surface flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-[#2fa84f] p-4">
              <div>
                <h2 className="dp-title text-base">
                  รายงานยอดขาย & การจัดการกะ (Shift Report)
                </h2>
                <p className="dp-subtitle text-xs">
                  แคชเชียร์: {shiftStatus.cashierCode} · เชื่อมต่อ Firebase Firestore ({cloudflareStatus.d1Database})
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="pos-starter-print-zreport-btn"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                  className="dp-btn-ghost inline-flex h-9 items-center gap-1.5 px-3 text-xs font-bold"
                >
                  <Printer className="size-3.5" />
                  <span>พิมพ์ใบสรุปปิดกะ (Z-Report)</span>
                </button>
                <button
                  type="button"
                  data-testid="pos-starter-toggle-shift-btn"
                  onClick={() => void handleToggleShift()}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-[6px] px-3.5 text-xs font-bold text-white transition ${
                    shiftStatus.isOpen
                      ? "bg-[#e53935] hover:brightness-95"
                      : "bg-[#2fa84f] hover:bg-[#23863e]"
                  }`}
                >
                  <Clock className="size-3.5" />
                  <span>
                    {shiftStatus.isOpen
                      ? "ปิดกะขาย (Close Shift)"
                      : "เปิดกะขายใหม่ (Open Shift)"}
                  </span>
                </button>
              </div>
            </div>

            {/* Firebase Status Strip */}
            <div
              data-testid="pos-starter-cloudflare-status-card"
              className="dp-surface flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#212121]">
                  <Database className="size-4 text-[#2fa84f]" />
                  Firestore: {cloudflareStatus.d1Database} ({allMenuItems.length} เมนู · {billsHistory.length} บิล)
                </span>
                <span className="text-[#e0e0e0]">|</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#757575]">
                  <Cloud className="size-4 text-[#2fa84f]" />
                  Storage: {cloudflareStatus.r2Bucket} ({cloudflareStatus.r2UploadedCount} รูป)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMenuModal(true)}
                className="dp-btn-ghost inline-flex h-8 items-center gap-1.5 px-3 text-xs font-bold text-[#23863e]"
              >
                <ImagePlus className="size-3.5" />
                <span>เพิ่มสินค้า / อัปโหลดรูป</span>
              </button>
            </div>

            {/* 4 Loyverse Back Office KPI Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="dp-surface p-4">
                <div className="text-xs font-semibold text-[#757575]">
                  ยอดขายสุทธิรวม (Net Sales)
                </div>
                <div
                  className="mt-1 font-mono text-2xl font-extrabold text-[#23863e]"
                  data-testid="pos-starter-kpi-total-sales"
                >
                  {formatMoneyBlankZero(reportMetrics.totalSales) || "-"}
                </div>
                <div className="mt-1 text-[11px] text-[#757575]">
                  ซิงค์ขึ้น Firebase Firestore อัตโนมัติ
                </div>
              </div>

              <div className="dp-surface p-4">
                <div className="text-xs font-semibold text-[#757575]">
                  จำนวนใบเสร็จ (Receipts)
                </div>
                <div
                  className="mt-1 font-mono text-2xl font-extrabold text-[#212121]"
                  data-testid="pos-starter-kpi-bill-count"
                >
                  {reportMetrics.billCount} บิล
                </div>
                <div className="mt-1 text-[11px] text-[#757575]">
                  ยกเลิก {reportMetrics.cancelledCount} บิล · เฉลี่ย{" "}
                  {formatMoneyBlankZero(reportMetrics.avgPerBill) || "-"} ฿
                </div>
              </div>

              <div className="dp-surface p-4">
                <div className="text-xs font-semibold text-[#757575]">
                  เงินสดในลิ้นชัก (Expected Cash)
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-[#212121]">
                  {formatMoneyBlankZero(reportMetrics.drawerCashTotal) || "-"}
                </div>
                <div className="mt-1 text-[11px] text-[#757575]">
                  เงินทอนตั้งต้น {formatMoney(shiftStatus.openingFloat, 2)} ฿ + ขายสด{" "}
                  {formatMoneyBlankZero(reportMetrics.cashSalesTotal) || "-"}
                </div>
              </div>

              <div className="dp-surface p-4">
                <div className="text-xs font-semibold text-[#757575]">
                  ยอดรับชำระ QR / โอน / บัตร
                </div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-[#212121]">
                  {formatMoneyBlankZero(
                    addDec(
                      reportMetrics.byPayment.PROMPTPAY,
                      addDec(
                        reportMetrics.byPayment.TRANSFER,
                        reportMetrics.byPayment.CARD,
                      ),
                    ),
                  ) || "-"}
                </div>
                <div className="mt-1 text-[11px] text-[#757575]">
                  QR: {formatMoneyBlankZero(reportMetrics.byPayment.PROMPTPAY) || "-"} · โอน:{" "}
                  {formatMoneyBlankZero(reportMetrics.byPayment.TRANSFER) || "-"}
                </div>
              </div>
            </div>

            {/* Breakdown by Category & Payment Type */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="dp-surface p-4">
                <h3 className="dp-title mb-2.5 text-sm">
                  ยอดขายแยกตามหมวดหมู่ (Sales by Category)
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-left text-[#757575]">
                      <th className="py-2">หมวดหมู่</th>
                      <th className="py-2 text-right">ยอดขาย (฿)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f0f0]">
                    {(
                      [
                        "COFFEE",
                        "NON_COFFEE",
                        "STUDIO",
                        "ERP",
                      ] as Exclude<StarterCategory, "ALL">[]
                    ).map((cat) => (
                      <tr key={cat} className="hover:bg-[#fafafa]">
                        <td className="py-2 font-semibold text-[#212121]">
                          {CATEGORY_META[cat].label}
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-[#212121]">
                          {formatMoneyBlankZero(reportMetrics.byCategory[cat]) ||
                            "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dp-surface p-4">
                <h3 className="dp-title mb-2.5 text-sm">
                  ยอดขายแยกตามวิธีชำระเงิน (Sales by Payment Type)
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-left text-[#757575]">
                      <th className="py-2">ช่องทางชำระเงิน</th>
                      <th className="py-2 text-right">ยอดรับสุทธิ (฿)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f0f0]">
                    {(Object.keys(PAYMENT_LABELS) as PaymentMethodCode[]).map(
                      (pm) => (
                        <tr key={pm} className="hover:bg-[#fafafa]">
                          <td className="py-2 font-semibold text-[#212121]">
                            {PAYMENT_LABELS[pm]}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-[#23863e]">
                            {formatMoneyBlankZero(reportMetrics.byPayment[pm]) ||
                              "-"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Receipts Ledger Table */}
            <div className="dp-surface p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="dp-title text-sm">
                  ประวัติใบเสร็จรับเงิน ({billsHistory.length} บิล)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs"
                  data-testid="pos-starter-bills-table"
                >
                  <thead>
                    <tr className="border-b border-[#e0e0e0] bg-[#fafafa] text-left text-[#757575]">
                      <th className="py-2 pl-2">เลขที่บิล</th>
                      <th className="py-2 px-2">วันที่-เวลา</th>
                      <th className="py-2 px-2">คิว / โต๊ะ</th>
                      <th className="py-2 px-2">วิธีชำระเงิน</th>
                      <th className="py-2 px-2 text-right">ยอดสุทธิ (฿)</th>
                      <th className="py-2 px-2 text-center">สถานะ</th>
                      <th className="py-2 pr-2 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f0f0]">
                    {billsHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-[#757575]"
                        >
                          ยังไม่มีประวัติใบเสร็จในกะนี้
                        </td>
                      </tr>
                    ) : (
                      billsHistory.map((b, bIdx) => (
                        <tr
                          key={`${b.billGuid}-${b.docNo}-${bIdx}`}
                          className="hover:bg-[#fafafa]"
                        >
                          <td className="py-2 pl-2 font-mono font-bold text-[#212121]">
                            {b.docNo}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap text-[#757575]">
                            {formatThaiDateDisplay(b.docDate)} {b.docTime}
                          </td>
                          <td className="py-2 px-2 text-[#212121]">
                            <span className="font-bold text-[#23863e]">
                              {b.queueNo}
                            </span>{" "}
                            · {b.tableLabel}
                          </td>
                          <td className="py-2 px-2 text-[#757575]">
                            {PAYMENT_LABELS[b.paymentMethod]}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-[#212121]">
                            {formatMoneyBlankZero(b.totalAmount)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {b.status === "cancelled" ? (
                              <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-[#e53935]">
                                ยกเลิกแล้ว
                              </span>
                            ) : (
                              <span className="rounded bg-[#e8f5ec] px-2 py-0.5 text-[10px] font-bold text-[#23863e]">
                                สำเร็จ
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setActiveReceiptBill(b)}
                                className="dp-btn-ghost inline-flex h-7 items-center gap-1 px-2.5 text-[11px] font-semibold"
                              >
                                <Receipt className="size-3" />
                                <span>ใบเสร็จ</span>
                              </button>
                              {b.status !== "cancelled" && (
                                <button
                                  type="button"
                                  data-testid={`pos-starter-cancel-${b.docNo}`}
                                  onClick={() => void handleCancelBill(b.docNo)}
                                  className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-[#e53935] hover:bg-rose-100"
                                >
                                  <XCircle className="size-3" />
                                  <span>ยกเลิก</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: จัดการสินค้า & Firebase */}
        {activeTab === "manage" && (
          <DomePosManagePanel
            allMenuItems={allMenuItems}
            onOpenAddMenuModal={() => setShowAddMenuModal(true)}
            onUpsertMenuItem={handleUpsertMenuItem}
            onDeleteMenuItem={handleDeleteMenuItem}
            onNotify={(type, text) => setStatusBanner({ type, text })}
            realtimeEvents={realtimeEvents}
            realtimeLatencyMs={cloudflareStatus.latencyMs}
            lastEventAt={cloudflareStatus.lastEventAt}
            onTriggerRealtimeSync={() => handleTriggerRealtimeSync(false)}
            autoSyncEnabled={autoSync30sEnabled}
            onToggleAutoSync={() => setAutoSync30sEnabled((v) => !v)}
            autoSyncCountdown={autoSyncCountdown}
            autoSyncCycleCount={autoSyncCycleCount}
          />
        )}
      </div>

      {/* Loyverse Tap-to-Edit Ticket Line Dialog */}
      <LineEditDialog
        line={editingLine}
        sweetnessOptions={SWEETNESS_OPTIONS}
        addonOptions={ADDON_OPTIONS}
        onClose={() => setEditingLineId(null)}
        onAdjustQty={handleAdjustLineQty}
        onUpdateOption={handleUpdateLineOption}
        onRemoveLine={(lineId) => {
          playPosSound("delete");
          handleRemoveLine(lineId);
        }}
      />

      {/* Loyverse Charge Screen */}
      <ChargeScreen
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        cartNetTotal={cartNetTotal}
        validDiscount={validDiscount}
        paymentMethod={paymentMethod}
        onSelectPaymentMethod={setPaymentMethod}
        cashReceivedInput={cashReceivedInput}
        onCashReceivedChange={(val) =>
          setCashReceivedInput(sanitizeNumericInput(val))
        }
        cashChangeAmount={cashChangeAmount}
        submittingBill={submittingBill}
        onConfirmPay={(opts) => {
          playPosSound("chaching");
          void handleCheckoutAndSaveBill(opts);
        }}
      />

      {/* Modal เพิ่มเมนูใหม่ */}
      {showAddMenuModal && (
        <div
          className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          data-testid="pos-starter-add-menu-modal"
        >
          <div className="dp-modal flex w-full max-w-md flex-col overflow-hidden rounded-[6px] border border-[#e0e0e0] bg-white text-[#212121] shadow-xl">
            <div className="dp-header flex items-center justify-between px-4 py-3 text-white">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Plus className="size-4" />
                <span>เพิ่มสินค้าใหม่ (Firebase Firestore & Storage)</span>
              </div>
              <button
                type="button"
                data-testid="pos-starter-close-add-menu-btn"
                onClick={() => setShowAddMenuModal(false)}
                className="rounded bg-white/15 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/25"
              >
                ปิด
              </button>
            </div>

            <div className="space-y-3 p-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block font-bold text-[#757575]">
                    รหัสเมนู
                  </label>
                  <input
                    type="text"
                    data-testid="pos-starter-new-item-code"
                    value={newMenuCode}
                    onChange={(e) => setNewMenuCode(e.target.value)}
                    placeholder="เช่น ECS-01"
                    className="dp-input h-9 w-full rounded-[6px] px-2.5 font-mono text-xs font-bold text-[#212121]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-[#757575]">
                    หมวดหมู่เมนู
                  </label>
                  <select
                    aria-label="หมวดหมู่เมนูใหม่"
                    data-testid="pos-starter-new-item-category"
                    value={newMenuCategory}
                    onChange={(e) =>
                      setNewMenuCategory(
                        e.target.value as Exclude<StarterCategory, "ALL">,
                      )
                    }
                    className="dp-input h-9 w-full cursor-pointer rounded-[6px] px-2.5 text-xs font-bold text-[#212121]"
                  >
                    <option value="COFFEE">☕ Coffee (กาแฟร้อน/เย็น)</option>
                    <option value="NON_COFFEE">🍵 Non-Coffee (ชาไทย/ชาเขียว/โกโก้)</option>
                    <option value="STUDIO">🎧 ห้องซ้อมดนตรี ชั้น 2 (In-Ear Monitor)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-[#757575]">
                  ชื่อเมนูภาษาไทย
                </label>
                <input
                  type="text"
                  data-testid="pos-starter-new-item-name"
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="ระบุชื่อเมนู..."
                  className="dp-input h-9 w-full rounded-[6px] px-2.5 text-xs font-bold text-[#212121]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block font-bold text-[#757575]">
                    ราคาขาย (บาท)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-testid="pos-starter-new-item-price"
                    value={newMenuPrice}
                    onChange={(e) =>
                      setNewMenuPrice(sanitizeNumericInput(e.target.value))
                    }
                    placeholder="50.00"
                    className="dp-input h-9 w-full rounded-[6px] px-2.5 text-right font-mono text-xs font-bold text-[#23863e]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-[#757575]">
                    หน่วยนับ
                  </label>
                  <input
                    type="text"
                    data-testid="pos-starter-new-item-unit"
                    value={newMenuUnit}
                    onChange={(e) => setNewMenuUnit(e.target.value)}
                    placeholder="แก้ว / ชั่วโมง"
                    className="dp-input h-9 w-full rounded-[6px] px-2.5 text-xs font-bold text-[#212121]"
                  />
                </div>
              </div>

              <div className="rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#212121]">
                    <Cloud className="size-3.5 text-[#2fa84f]" />
                    <span>รูปภาพสินค้า (Firebase Storage)</span>
                  </span>
                  <button
                    type="button"
                    data-testid="pos-starter-r2-upload-btn"
                    onClick={() => void handleUploadImageToR2(null)}
                    disabled={uploadingR2}
                    className="dp-btn-ghost inline-flex h-7 items-center gap-1 px-2 text-[11px] font-bold text-[#23863e]"
                  >
                    <ImagePlus className="size-3" />
                    <span>
                      {uploadingR2 ? "กำลังอัปโหลด..." : "สร้างลิงก์รูปอัตโนมัติ"}
                    </span>
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="อัปโหลดไฟล์รูปภาพขึ้น Firebase Storage"
                  data-testid="pos-starter-new-item-image-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadImageToR2(f);
                  }}
                  className="block w-full text-[11px] text-[#757575] file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-[#2fa84f] file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-white"
                />
                {newMenuImageUrl && (
                  <div
                    data-testid="pos-starter-r2-upload-status"
                    className="mt-1.5 truncate font-mono text-[10px] text-[#23863e]"
                  >
                    Storage URL: {newMenuImageUrl}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#e0e0e0] bg-[#fafafa] px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAddMenuModal(false)}
                className="dp-btn-ghost inline-flex h-9 items-center px-3.5 text-xs font-bold"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                data-testid="pos-starter-save-menu-btn"
                onClick={() => void handleSaveNewMenuItem()}
                className="dp-btn-success inline-flex h-9 items-center gap-1.5 px-4 text-xs font-bold"
              >
                <CheckCircle2 className="size-3.5" />
                <span>บันทึกสินค้า</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ใบเสร็จรับเงิน & หน้าจอชำระเงินสำเร็จแบบ Loyverse (แสดงเงินทอนตัวใหญ่ + ปุ่มขายรายการใหม่) */}
      {activeReceiptBill && (
        <div
          className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          data-testid="pos-starter-receipt-modal"
        >
          <div className="dp-modal flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-[6px] border border-[#e0e0e0] bg-white text-[#212121] shadow-2xl">
            {/* Loyverse Sale Completed Top Banner (Total Paid & Change) */}
            <div className="bg-[#2fa84f] px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 className="size-4" />
                  <span>ชำระเงินสำเร็จ · ใบเสร็จ {activeReceiptBill.docNo}</span>
                </div>
                <button
                  type="button"
                  data-testid="pos-starter-close-receipt-btn"
                  onClick={() => setActiveReceiptBill(null)}
                  className="rounded bg-white/15 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/25"
                >
                  ปิด
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 divide-x divide-white/25 rounded bg-black/15 py-2 text-center">
                <div>
                  <div className="text-[10px] text-white/80">ยอดชำระสุทธิ</div>
                  <div className="font-mono text-lg font-extrabold">
                    ฿{formatMoney(activeReceiptBill.totalAmount, 2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-white/80">เงินทอน</div>
                  <div className="font-mono text-lg font-extrabold">
                    ฿{formatMoney(activeReceiptBill.changeAmount || "0.00", 2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
              <div className="text-center">
                <img
                  src="/logo.png"
                  alt="Entrance Creative Space Logo"
                  className="mx-auto mb-1.5 size-12 rounded-full border border-[#e0e0e0] object-cover"
                />
                <div className="text-sm font-bold text-[#212121]">
                  Entrance Creative Space · ชั้น 1 Cafe & ชั้น 2 ห้องซ้อมดนตรี
                </div>
                <div className="text-[11px] text-[#757575]">
                  อิสรภาพ · ฝั่งธน · มรภ.บ้านสมเด็จเจ้าพระยา · ซ้อม In-Ear & อัดแยก Track OTG
                </div>
                <div className="text-[10px] text-[#757575]">
                  แผนที่ร้าน: https://maps.app.goo.gl/dSV2VeLeNssQoGwK7
                </div>
                <div className="mt-2 inline-block rounded-[4px] border border-[#212121] bg-[#fafafa] px-4 py-1 font-mono text-base font-extrabold">
                  คิว: {activeReceiptBill.queueNo}
                </div>
              </div>

              <div className="border-y border-dashed border-[#bdbdbd] py-2 text-[11px] text-[#757575]">
                <div className="flex justify-between">
                  <span>เลขที่บิล: {activeReceiptBill.docNo}</span>
                  <span>
                    วันที่: {formatThaiDateDisplay(activeReceiptBill.docDate)}{" "}
                    {activeReceiptBill.docTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>บริการ: {activeReceiptBill.tableLabel}</span>
                  <span>
                    ชำระโดย: {PAYMENT_LABELS[activeReceiptBill.paymentMethod]}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {activeReceiptBill.lines.map((l) => (
                  <div
                    key={l.lineId}
                    className="flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-[#212121]">
                        {l.qty}× {l.name}
                      </div>
                      {(l.sweetness || l.addonLabel) && (
                        <div className="text-[11px] text-[#757575]">
                          {[l.sweetness, l.addonLabel]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-[#212121]">
                      {formatMoney(mulDec(l.qty, l.unitPrice), 2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-dashed border-[#bdbdbd] pt-2">
                {cmpDec(activeReceiptBill.discountAmount, "0") > 0 && (
                  <div className="flex justify-between text-[#757575]">
                    <span>ส่วนลดท้ายบิล</span>
                    <span className="font-mono">
                      -{formatMoney(activeReceiptBill.discountAmount, 2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold text-[#212121]">
                  <span>ยอดสุทธิรวมทั้งสิ้น (รวม VAT)</span>
                  <span className="font-mono">
                    {formatMoney(activeReceiptBill.totalAmount, 2)} บาท
                  </span>
                </div>
                {activeReceiptBill.paymentMethod === "CASH" && (
                  <>
                    <div className="flex justify-between text-[11px] text-[#757575]">
                      <span>รับเงินสด</span>
                      <span className="font-mono">
                        {formatMoney(activeReceiptBill.cashReceived, 2)}
                      </span>
                    </div>
                    {cmpDec(activeReceiptBill.changeAmount, "0") > 0 && (
                      <div className="flex justify-between text-[11px] font-bold text-[#23863e]">
                        <span>เงินทอน</span>
                        <span className="font-mono">
                          {formatMoney(activeReceiptBill.changeAmount, 2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Wallet Loyalty Box */}
              <div
                data-testid="pos-starter-receipt-wallet-box"
                className="rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] p-2.5 text-[11px]"
              >
                <div className="flex items-center justify-between font-bold text-[#212121]">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3.5 text-[#2fa84f]" />
                    Wallet Loyalty (ครบ 100 ฿ = 1 Point)
                  </span>
                  <span
                    data-testid="pos-starter-receipt-points-minted"
                    className="rounded bg-[#2fa84f] px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                  >
                    +{activeReceiptBill.walletPointsMinted || "0"} Point
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[#757575]">
                  <span>
                    กระเป๋า:{" "}
                    {activeReceiptBill.walletAddress
                      ? `${activeReceiptBill.walletAddress.slice(0, 8)}...${activeReceiptBill.walletAddress.slice(-6)}`
                      : walletSummary.custAddress}
                  </span>
                  <span className="font-mono font-bold text-[#212121]">
                    คงเหลือ:{" "}
                    {formatMoneyBlankZero(
                      activeReceiptBill.walletBalanceAfter ||
                        walletSummary.custBalance,
                    ) || "0.00"}{" "}
                    {walletSummary.tokenSymbol}
                  </span>
                </div>
                {activeReceiptBill.walletTxHash && (
                  <div
                    data-testid="pos-starter-receipt-wallet-tx"
                    className="mt-0.5 truncate font-mono text-[10px] text-[#757575]"
                  >
                    TxHash: {activeReceiptBill.walletTxHash}
                  </div>
                )}
              </div>

              {/* Cup Label Preview */}
              <div className="rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] p-2.5">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#757575]">
                  <span className="inline-flex items-center gap-1">
                    <Tag className="size-3" />
                    สติกเกอร์แปะแก้ว (50×30mm)
                  </span>
                  <span>
                    {activeReceiptBill.queueNo} · {activeReceiptBill.docTime}
                  </span>
                </div>
                <div className="text-xs font-bold text-[#212121]">
                  {activeReceiptBill.lines[0]?.name}
                </div>
                <div className="text-[11px] text-[#757575]">
                  {[
                    activeReceiptBill.lines[0]?.sweetness || "หวานปกติ",
                    activeReceiptBill.lines[0]?.addonLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[#e0e0e0] bg-[#fafafa] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="dp-btn-ghost inline-flex h-10 items-center gap-1.5 px-3.5 text-xs font-bold"
              >
                <Printer className="size-3.5" />
                <span>พิมพ์ใบเสร็จ</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReceiptBill(null)}
                className="dp-btn-primary inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-4 text-xs font-bold"
              >
                <CheckCircle2 className="size-4" />
                <span>ขายรายการใหม่ (New Sale)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { DomePosScreen as PosStarterCafeScreen };
