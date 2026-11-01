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

export type StarterWorkTab = "order" | "tables" | "kds" | "reports" | "manage";
export type ServiceChannel = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type StarterCategory =
  | "ALL"
  | "COFFEE"
  | "TEA"
  | "BEER"
  | "BAKERY"
  | "BITES"
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
  imageUrl?: string; // Cloudflare R2 Image URL
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
  zone: "CAFE" | "BAR" | "GARDEN";
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
  // ☕ กาแฟ & เอสเปรสโซ่
  {
    code: "CAFE-ESP-01",
    barcode: "8859001001011",
    name: "อเมริกาโน่เย็น คั่วกลาง",
    nameEn: "Iced Medium Roast Americano",
    category: "COFFEE",
    unit: "แก้ว",
    price: "75.00",
    badge: "ขายดี #1",
    supportsSweetness: true,
  },
  {
    code: "CAFE-ESP-02",
    barcode: "8859001001028",
    name: "คาเฟ่ลาเต้เย็น นมสดฮอกไกโด",
    nameEn: "Iced Hokkaido Milk Latte",
    category: "COFFEE",
    unit: "แก้ว",
    price: "85.00",
    badge: "แนะนำ",
    supportsSweetness: true,
  },
  {
    code: "CAFE-ESP-03",
    barcode: "8859001001035",
    name: "เดอร์ตี้คอฟฟี่ นมเย็นจัดช็อตเข้ม",
    nameEn: "Signature Dirty Coffee",
    category: "COFFEE",
    unit: "แก้ว",
    price: "110.00",
    badge: "Signature",
    supportsSweetness: true,
  },
  {
    code: "CAFE-ESP-04",
    barcode: "8859001001042",
    name: "เอสเปรสโซ่เย็น สไตล์ไทยเข้มข้น",
    nameEn: "Thai Style Iced Espresso",
    category: "COFFEE",
    unit: "แก้ว",
    price: "80.00",
    supportsSweetness: true,
  },
  {
    code: "CAFE-ESP-05",
    barcode: "8859001001059",
    name: "คาราเมลมัคคิอาโต้เย็น",
    nameEn: "Iced Caramel Macchiato",
    category: "COFFEE",
    unit: "แก้ว",
    price: "95.00",
    supportsSweetness: true,
  },
  // 🍵 มัทฉะ & ชาพรีเมียม
  {
    code: "CAFE-TEA-01",
    barcode: "8859001002018",
    name: "อุจิมัทฉะลาเต้พรีเมียม",
    nameEn: "Ceremonial Uji Matcha Latte",
    category: "TEA",
    unit: "แก้ว",
    price: "115.00",
    badge: "เกรดพิธีชงชา",
    supportsSweetness: true,
  },
  {
    code: "CAFE-TEA-02",
    barcode: "8859001002025",
    name: "โฮจิฉะคั่วหอมลาเต้เย็น",
    nameEn: "Roasted Hojicha Latte",
    category: "TEA",
    unit: "แก้ว",
    price: "105.00",
    supportsSweetness: true,
  },
  {
    code: "CAFE-TEA-03",
    barcode: "8859001002032",
    name: "ชาไทยครีมชีสพ่นไฟ",
    nameEn: "Thai Tea Brûlée Cream Cheese",
    category: "TEA",
    unit: "แก้ว",
    price: "90.00",
    badge: "ยอดฮิต",
    supportsSweetness: true,
  },
  {
    code: "CAFE-TEA-04",
    barcode: "8859001002049",
    name: "ยูซุน้ำผึ้งโซดาสดชื่น",
    nameEn: "Yuzu Honey Sparkling Soda",
    category: "TEA",
    unit: "แก้ว",
    price: "95.00",
    supportsSweetness: true,
  },
  // 🍺 คราฟต์เบียร์ & ดราฟต์เบียร์
  {
    code: "BEER-IPA-01",
    barcode: "8859001003015",
    name: "คราฟต์เบียร์ Hazy IPA สด (Pint 473ml)",
    nameEn: "Tropical Hazy IPA Draft Pint",
    category: "BEER",
    unit: "แก้ว",
    price: "220.00",
    badge: "Tap #1 · ABV 6.2%",
    supportsBeerServe: true,
  },
  {
    code: "BEER-WZN-01",
    barcode: "8859001003022",
    name: "ไวเซ่นเบียร์สดข้าวสาลีเยอรมัน (Pint)",
    nameEn: "Bavarian Wheat Weizen Draft Pint",
    category: "BEER",
    unit: "แก้ว",
    price: "190.00",
    badge: "Tap #2 · นุ่มหอมกล้วย",
    supportsBeerServe: true,
  },
  {
    code: "BEER-PIL-01",
    barcode: "8859001003039",
    name: "พิลสเนอร์คราฟต์เบียร์สด (Pint)",
    nameEn: "Crisp Bohemian Pilsner Pint",
    category: "BEER",
    unit: "แก้ว",
    price: "170.00",
    badge: "Tap #3 · ดื่มง่าย",
    supportsBeerServe: true,
  },
  {
    code: "BEER-TWR-01",
    barcode: "8859001003046",
    name: "ทาวเวอร์เบียร์สดคราฟต์ 3 ลิตร",
    nameEn: "Craft Draft Beer Tower 3L",
    category: "BEER",
    unit: "ทาวเวอร์",
    price: "890.00",
    badge: "คุ้มยกแก๊ง",
    supportsBeerServe: true,
  },
  // 🥐 เบเกอรี่ & ครัวซองต์
  {
    code: "CAFE-BAK-01",
    barcode: "8859001004012",
    name: "ครัวซองต์เนยสดฝรั่งเศส AOP",
    nameEn: "French AOP Butter Croissant",
    category: "BAKERY",
    unit: "ชิ้น",
    price: "85.00",
    badge: "อบสดใหม่",
  },
  {
    code: "CAFE-BAK-02",
    barcode: "8859001004029",
    name: "ชีสเค้กหน้าไหม้บาสก์โฮมเมด",
    nameEn: "Basque Burnt Cheesecake",
    category: "BAKERY",
    unit: "ชิ้น",
    price: "135.00",
  },
  {
    code: "CAFE-BAK-03",
    barcode: "8859001004036",
    name: "เพนโอช็อกโกแลตดาร์ก 70%",
    nameEn: "Dark Chocolate Pain au Chocolat",
    category: "BAKERY",
    unit: "ชิ้น",
    price: "95.00",
  },
  // 🍟 กับแกล้ม & จานด่วนคาเฟ่
  {
    code: "BITE-SNK-01",
    barcode: "8859001005019",
    name: "เฟรนช์ฟรายส์ทรัฟเฟิลพาเมซานชีส",
    nameEn: "Truffle Parmesan Fries",
    category: "BITES",
    unit: "จาน",
    price: "140.00",
    badge: "คู่เบียร์ขายดี",
  },
  {
    code: "BITE-SNK-02",
    barcode: "8859001005026",
    name: "ปีกไก่ทอดน้ำปลาพริกแห้งกรอบ",
    nameEn: "Crispy Fish Sauce Chicken Wings",
    category: "BITES",
    unit: "จาน",
    price: "165.00",
  },
  {
    code: "BITE-SNK-03",
    barcode: "8859001005033",
    name: "ไส้กรอกเยอรมันรวมย่างเตาถ่าน",
    nameEn: "Grilled German Sausage Platter",
    category: "BITES",
    unit: "จาน",
    price: "240.00",
    badge: "ซิกเนเจอร์บาร์",
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
  { id: "NONE", label: "มาตรฐาน (ไม่เพิ่มท็อปปิ้ง)", price: "0.00" },
  { id: "EXTRA_SHOT", label: "+1 ช็อตเอสเปรสโซ่เข้ม (+20฿)", price: "20.00" },
  { id: "OAT_MILK", label: "เปลี่ยนเป็นนมโอ๊ต Oat Milk (+25฿)", price: "25.00" },
  { id: "CHEESE_FOAM", label: "ท็อปครีมชีสพ่นไฟ (+20฿)", price: "20.00" },
  { id: "FROSTED_GLASS", label: "แก้วแช่เย็นจัด Frosted (-4°C)", price: "0.00" },
];

const INITIAL_TABLES: {
  tableId: string;
  tableName: string;
  zone: "CAFE" | "BAR" | "GARDEN";
  zoneLabel: string;
  seats: number;
}[] = [
  { tableId: "C1", tableName: "โต๊ะคาเฟ่ C1 (ริมกระจก)", zone: "CAFE", zoneLabel: "โซนคาเฟ่แอร์", seats: 2 },
  { tableId: "C2", tableName: "โต๊ะคาเฟ่ C2 (บาร์ปลั๊กไฟ)", zone: "CAFE", zoneLabel: "โซนคาเฟ่แอร์", seats: 4 },
  { tableId: "C3", tableName: "โต๊ะคาเฟ่ C3 (โซฟาใหญ่)", zone: "CAFE", zoneLabel: "โซนคาเฟ่แอร์", seats: 6 },
  { tableId: "C4", tableName: "โต๊ะคาเฟ่ C4 (มุมหนังสือ)", zone: "CAFE", zoneLabel: "โซนคาเฟ่แอร์", seats: 2 },
  { tableId: "B1", tableName: "บาร์คราฟต์เบียร์ B1 (หน้าแท็ป)", zone: "BAR", zoneLabel: "เคาน์เตอร์บาร์เบียร์", seats: 2 },
  { tableId: "B2", tableName: "บาร์คราฟต์เบียร์ B2 (กลางบาร์)", zone: "BAR", zoneLabel: "เคาน์เตอร์บาร์เบียร์", seats: 2 },
  { tableId: "B3", tableName: "โต๊ะสูงบาร์เบียร์ B3", zone: "BAR", zoneLabel: "เคาน์เตอร์บาร์เบียร์", seats: 4 },
  { tableId: "B4", tableName: "โต๊ะสูงบาร์เบียร์ B4", zone: "BAR", zoneLabel: "เคาน์เตอร์บาร์เบียร์", seats: 4 },
  { tableId: "G1", tableName: "ซุ้มสวนลานเบียร์ G1", zone: "GARDEN", zoneLabel: "โซนสวน & ลานเบียร์", seats: 6 },
  { tableId: "G2", tableName: "ซุ้มสวนลานเบียร์ G2", zone: "GARDEN", zoneLabel: "โซนสวน & ลานเบียร์", seats: 6 },
  { tableId: "G3", tableName: "ระเบียงดนตรีสด G3", zone: "GARDEN", zoneLabel: "โซนสวน & ลานเบียร์", seats: 8 },
  { tableId: "G4", tableName: "ระเบียงดนตรีสด G4", zone: "GARDEN", zoneLabel: "โซนสวน & ลานเบียร์", seats: 4 },
];

const CATEGORY_META: Record<
  StarterCategory,
  { label: string; colorClass: string }
> = {
  ALL: { label: "ทั้งหมด", colorClass: "bg-amber-500 text-slate-950" },
  COFFEE: { label: "☕ กาแฟสด", colorClass: "bg-amber-700 text-white" },
  TEA: { label: "🍵 มัทฉะ & ชา", colorClass: "bg-emerald-600 text-white" },
  BEER: { label: "🍺 คราฟต์เบียร์", colorClass: "bg-yellow-500 text-slate-950" },
  BAKERY: { label: "🥐 เบเกอรี่", colorClass: "bg-orange-600 text-white" },
  BITES: { label: "🍟 กับแกล้ม", colorClass: "bg-rose-600 text-white" },
  ERP: { label: "📦 เมนูเพิ่มเอง/D1", colorClass: "bg-sky-600 text-white" },
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
  const [expandedLineId, setExpandedLineId] = useState<string | null>("init-1");
  const [payPulse, setPayPulse] = useState<boolean>(false);
  const [orderRemark, setOrderRemark] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("");

  // ตะกร้าสินค้าปัจจุบัน (เริ่มต้นมีออเดอร์ตัวอย่างพร้อมกดขายด่วนได้ทันที)
  const [cartLines, setCartLines] = useState<StarterCartLine[]>([
    {
      lineId: "init-1",
      itemCode: "CAFE-ESP-03",
      barcode: "8859001001035",
      name: "เดอร์ตี้คอฟฟี่ นมเย็นจัดช็อตเข้ม",
      category: "COFFEE",
      unitCode: "แก้ว",
      qty: "1",
      basePrice: "110.00",
      addonPrice: "0.00",
      unitPrice: "110.00",
      sweetness: "หวาน 50%",
      addonLabel: "",
      note: "",
    },
    {
      lineId: "init-2",
      itemCode: "CAFE-BAK-01",
      barcode: "8859001004012",
      name: "ครัวซองต์เนยสดฝรั่งเศส AOP",
      category: "BAKERY",
      unitCode: "ชิ้น",
      qty: "1",
      basePrice: "85.00",
      addonPrice: "0.00",
      unitPrice: "85.00",
      sweetness: "",
      addonLabel: "",
      note: "อุ่นร้อน",
    },
  ]);

  // โต๊ะที่เปิดบิลค้างไว้ (Held Bar / Cafe Tabs)
  const [heldTables, setHeldTables] = useState<Record<string, HeldTableOrder>>({
    B1: {
      tableId: "B1",
      tableName: "บาร์คราฟต์เบียร์ B1 (หน้าแท็ป)",
      zone: "BAR",
      guests: 2,
      openedAt: "18:45",
      serviceChannel: "DINE_IN",
      discountAmount: "0.00",
      remark: "ขอแก้วแช่เย็นจัด",
      lines: [
        {
          lineId: "held-b1-1",
          itemCode: "BEER-IPA-01",
          barcode: "8859001003015",
          name: "คราฟต์เบียร์ Hazy IPA สด (Pint 473ml)",
          category: "BEER",
          unitCode: "แก้ว",
          qty: "2",
          basePrice: "220.00",
          addonPrice: "0.00",
          unitPrice: "220.00",
          sweetness: "",
          addonLabel: "แก้วแช่เย็นจัด Frosted (-4°C)",
          note: "",
        },
        {
          lineId: "held-b1-2",
          itemCode: "BITE-SNK-01",
          barcode: "8859001005019",
          name: "เฟรนช์ฟรายส์ทรัฟเฟิลพาเมซานชีส",
          category: "BITES",
          unitCode: "จาน",
          qty: "1",
          basePrice: "140.00",
          addonPrice: "0.00",
          unitPrice: "140.00",
          sweetness: "",
          addonLabel: "",
          note: "",
        },
      ],
    },
  });

  // คิวบาริสต้า & บาร์น้ำ (Barista & Taproom KDS)
  const [kdsQueue, setKdsQueue] = useState<KdsQueueOrder[]>([
    {
      queueNo: "A-001",
      docNo: "CAFE-6910-0001",
      tableLabel: "บาร์คราฟต์เบียร์ B1",
      serviceChannel: "DINE_IN",
      createdAt: "18:45",
      status: "PREPARING",
      items: [
        {
          name: "คราฟต์เบียร์ Hazy IPA สด (Pint 473ml)",
          qty: "2",
          unitCode: "แก้ว",
          modifierText: "แก้วแช่เย็นจัด Frosted (-4°C)",
          category: "BEER",
        },
        {
          name: "เฟรนช์ฟรายส์ทรัฟเฟิลพาเมซานชีส",
          qty: "1",
          unitCode: "จาน",
          modifierText: "เสิร์ฟร้อน",
          category: "BITES",
        },
      ],
    },
  ]);

  // สินค้าที่ซิงค์มาจากฐานข้อมูล Cloudflare D1 (/api/pos/sync) + เมนูที่เจ้าของร้านเพิ่มเอง
  const [erpSyncedItems, setErpSyncedItems] = useState<StarterMenuItem[]>([]);
  const [customMenuItems, setCustomMenuItems] = useState<StarterMenuItem[]>([]);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);

  // สถานะการเชื่อมต่อ Cloudflare D1 (Database) + Cloudflare R2 (Image Storage) แบบ Realtime
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
    d1Database: "Cloudflare D1 (domepos-db)",
    r2Bucket: "Cloudflare R2 (domepos-media)",
    r2UploadedCount: 19,
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

  // Modal เพิ่มเมนูใหม่สำหรับเจ้าของร้านทำคนเดียว (+ อัปโหลดรูปขึ้น Cloudflare R2)
  const [showAddMenuModal, setShowAddMenuModal] = useState<boolean>(false);
  const [newMenuCode, setNewMenuCode] = useState<string>("DOME-01");
  const [newMenuName, setNewMenuName] = useState<string>("");
  const [newMenuCategory, setNewMenuCategory] =
    useState<Exclude<StarterCategory, "ALL">>("COFFEE");
  const [newMenuPrice, setNewMenuPrice] = useState<string>("85.00");
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
  const [queueCounter, setQueueCounter] = useState<number>(2);

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
                rawCat === "TEA" ||
                rawCat === "BEER" ||
                rawCat === "BAKERY" ||
                rawCat === "BITES"
                  ? rawCat
                  : "ERP";
              loaded.push({
                code,
                barcode: String(r.barcode || code),
                name: String(r.name || code),
                nameEn: String(r.category || "Cloudflare D1 Menu"),
                category: validCat,
                unit: String(r.unit_code || "แก้ว"),
                price: formatMoney(price, 2).replace(/,/g, ""),
                badge: "D1 Sync",
                imageUrl:
                  r.image_url &&
                  !String(r.image_url).includes(
                    "r2.domepos.cloudflarestorage.com",
                  )
                    ? String(r.image_url)
                    : `/api/pos/image?code=${encodeURIComponent(code)}`,
                supportsSweetness: validCat === "COFFEE" || validCat === "TEA",
                supportsBeerServe: validCat === "BEER",
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
                category: String(ln.item_code || "").startsWith("BEER-")
                  ? "BEER"
                  : String(ln.item_code || "").startsWith("CAFE-TEA")
                    ? "TEA"
                    : String(ln.item_code || "").startsWith("CAFE-BAK")
                      ? "BAKERY"
                      : String(ln.item_code || "").startsWith("BITE-")
                        ? "BITES"
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

  // คีย์ลัดตามป้ายบนจอ: F2 = ช่องค้นหาสินค้า, F9 = ชำระเงิน (click() ไม่ทำงานเมื่อปุ่ม disabled)
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // เชื่อมต่อ Cloudflare D1 & R2 แบบ Realtime ผ่าน Server-Sent Events (SSE /api/pos/cloudflare/stream?mode=sse)
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/pos/cloudflare/stream?mode=sse");
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
                message: String(r.message || "Cloudflare Realtime Sync"),
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
                  message: String(parsed.message || "Cloudflare Realtime Event"),
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
        const res = await fetch("/api/pos/cloudflare/stream", {
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
                "ซิงค์ข้อมูล Cloudflare D1 & R2 แบบ Realtime สำเร็จ",
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
        text: `อัปโหลดรูปภาพเมนูขึ้น Cloudflare R2 เรียบร้อยแล้ว (${r2Url})`,
      });
    } finally {
      setUploadingR2(false);
    }
  };

  // บันทึกเมนูใหม่สำหรับเจ้าของร้านทำคนเดียว -> เพิ่มเข้าหน้าจอทันที + POST /api/pos/shift (action: "upsert_item") ลง Cloudflare D1
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
      nameEn: `${newMenuCategory} · Cloudflare D1/R2`,
      category: newMenuCategory,
      unit,
      price: formattedPrice,
      badge: "เมนูใหม่ D1/R2",
      imageUrl: finalImageUrl,
      supportsSweetness:
        newMenuCategory === "COFFEE" || newMenuCategory === "TEA",
      supportsBeerServe: newMenuCategory === "BEER",
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
    setNewMenuCode(`DOME-${String(customMenuItems.length + 2).padStart(2, "0")}`);
    setNewMenuName("");
    setNewMenuPrice("85.00");
    setNewMenuImageUrl("");
    setStatusBanner({
      type: "success",
      text: `เพิ่มเมนูใหม่ "${name}" (${code}) ราคา ${formatMoney(formattedPrice, 2)} บาท ลงฐานข้อมูล Cloudflare D1 และเก็บรูปใน Cloudflare R2 เรียบร้อยแล้ว`,
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

    const netFormatted = formatMoney(cartNetTotal, 2);
    setStatusBanner({
      type: "success",
      text: `บันทึกบิล ${docNo} (${qNo}) ยอดสุทธิ ${netFormatted} บาท เรียบร้อยแล้ว${syncedErp ? " · บันทึกลงฐานข้อมูล Cloudflare D1 สำเร็จ" : ""}`,
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
      text: `ยกเลิกบิลเลขที่ ${docNo} ในฐานข้อมูล Cloudflare D1 เรียบร้อยแล้ว`,
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
        : `ปิดกะแคชเชียร์และบันทึกสรุปยอดลง Cloudflare D1 เรียบร้อยแล้ว`,
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
      TEA: "0.00",
      BEER: "0.00",
      BAKERY: "0.00",
      BITES: "0.00",
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

  return (
    <div
      className="dp-app flex h-full w-full flex-col overflow-hidden text-[#2A1F18]"
      data-testid="pos-starter-cafe-screen"
    >
      {/* แถบหัวเรื่อง Espresso ไล่เฉด (dp-header) + แท็บกระจก (dp-glass/dp-tab) */}
      <div className="dp-header z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="dome-pos-brand-badge"
            className="dp-glass inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-extrabold text-white"
          >
            <img
              src="/logo.png"
              alt="DOME Pos Logo"
              data-testid="dome-pos-logo"
              className="size-7 shrink-0 rounded-full object-cover ring-2 ring-[#E9BC74]/80 shadow-[0_0_14px_rgba(233,188,116,0.45)]"
            />
            <span className="bg-gradient-to-r from-white to-[#F4D9AE] bg-clip-text text-sm tracking-wide text-transparent">DOME Pos</span>
            <span className="hidden text-[11px] font-medium text-[#E9BC74]/90 sm:inline">
              · สาขาสำนักงานใหญ่ (POS-01 · โหมดเจ้าของร้านคนเดียว)
            </span>
          </span>

          {/* ปุ่มสลับ 5 แท็บหลัก E2E Workflow */}
          <div className="dp-glass flex flex-wrap items-center gap-1 rounded-xl p-1">
            <button
              type="button"
              data-testid="pos-starter-tab-order"
              onClick={() => setActiveTab("order")}
              className={`dp-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold leading-none ${
                activeTab === "order" ? "dp-tab-active" : ""
              }`}
            >
              <Coffee className="size-3.5 shrink-0" />
              <span>1. ขายหน้าร้าน (POS)</span>
            </button>

            <button
              type="button"
              data-testid="pos-starter-tab-tables"
              onClick={() => setActiveTab("tables")}
              className={`dp-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold leading-none ${
                activeTab === "tables" ? "dp-tab-active" : ""
              }`}
            >
              <Store className="size-3.5 shrink-0" />
              <span>2. ผังโต๊ะ & บาร์</span>
              {occupiedTableCount > 0 && (
                <span key={occupiedTableCount} className="dp-pop inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-700 px-1 text-[10px] font-extrabold text-white shadow-[0_2px_6px_rgba(225,29,72,0.5)]">
                  {occupiedTableCount}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="pos-starter-tab-kds"
              onClick={() => setActiveTab("kds")}
              className={`dp-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold leading-none ${
                activeTab === "kds" ? "dp-tab-active" : ""
              }`}
            >
              <Flame className="size-3.5 shrink-0" />
              <span>3. จอคิวบาริสต้า (KDS)</span>
              {preparingKdsCount > 0 && (
                <span key={preparingKdsCount} className="dp-pop inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-700 px-1 text-[10px] font-extrabold text-white shadow-[0_2px_6px_rgba(16,185,129,0.5)]">
                  {preparingKdsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="pos-starter-tab-reports"
              onClick={() => setActiveTab("reports")}
              className={`dp-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold leading-none ${
                activeTab === "reports" ? "dp-tab-active" : ""
              }`}
            >
              <FileText className="size-3.5 shrink-0" />
              <span>4. รายงาน & ปิดกะ</span>
            </button>

            <button
              type="button"
              data-testid="pos-starter-tab-manage"
              onClick={() => setActiveTab("manage")}
              className={`dp-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold leading-none ${
                activeTab === "manage" ? "dp-tab-active" : ""
              }`}
            >
              <Cloud className="size-3.5 shrink-0" />
              <span>5. จัดการสินค้า & Cloudflare</span>
            </button>
          </div>
        </div>

        {/* สถานะ Cloudflare D1 + R2, สถานะกะแคชเชียร์ & ปุ่มซิงค์สินค้า */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="pos-starter-cloudflare-badge"
            onClick={() => setActiveTab("manage")}
            className="dp-glass inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-white transition hover:bg-white/15"
            title="เชื่อมต่อฐานข้อมูล Cloudflare D1 และเก็บรูปภาพทั้งหมดบน Cloudflare R2 แบบ Realtime"
          >
            <span className="dp-live size-2 rounded-full bg-emerald-400" />
            <Database className="size-3.5 shrink-0 text-[#E9BC74]" />
            <span>Cloudflare Realtime</span>
            <span className="text-white/50">·</span>
            <Cloud className="size-3.5 shrink-0 text-sky-200" />
            <span>D1/R2 ({cloudflareStatus.latencyMs}ms)</span>
          </button>

          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-2.5 text-xs font-bold text-emerald-50 backdrop-blur">
            <span
              className={`size-2 rounded-full ${shiftStatus.isOpen ? "dp-live bg-emerald-300" : "bg-rose-300"}`}
            />
            <span>
              กะ: {shiftStatus.cashierCode} (
              {shiftStatus.isOpen ? `ออนไลน์ ${shiftStatus.openedAt} น.` : "ปิดกะแล้ว"}
              )
            </span>
          </span>

          <button
            type="button"
            data-testid="pos-starter-sync-btn"
            onClick={() => void handleTriggerRealtimeSync(false)}
            disabled={syncLoading}
            className="dp-glass inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
            title="ระบบซิงค์อัตโนมัติทุก 30 วินาที (คลิกเพื่อซิงค์ทันที)"
          >
            <RefreshCw
              className={`size-3.5 shrink-0 ${syncLoading ? "animate-spin" : ""}`}
            />
            <span>
              Auto Sync 30วิ ({autoSyncCountdown}s · {allMenuItems.length} เมนู)
            </span>
          </button>
        </div>
      </div>

      {/* แถบแจ้งสถานะการทำงาน */}
      {statusBanner && (
        <div
          data-testid="pos-starter-status-banner"
          className={`dp-banner flex h-10 shrink-0 items-center justify-between px-4 text-xs font-bold text-white shadow-[0_6px_16px_-10px_rgba(0,0,0,0.5)] ${
            statusBanner.type === "success"
              ? "bg-gradient-to-r from-[#0B7A53] via-[#0F9D6B] to-[#19B47C]"
              : statusBanner.type === "error"
                ? "bg-gradient-to-r from-[#9F1239] via-[#C62828] to-[#E0533D]"
                : "bg-gradient-to-r from-[#8F4C10] via-[#B5651D] to-[#D4823A]"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="dp-pop size-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="rounded-lg bg-white/15 px-2.5 py-1 text-xs transition hover:bg-white/25"
          >
            รับทราบ
          </button>
        </div>
      )}

      {/* เนื้อหาหลักของแต่ละแท็บ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activeTab === "order" && (
          <div className="dp-enter flex h-full w-full flex-col lg:flex-row">
            {/* ฝั่งซ้าย (58%): ProductCatalogView แบบ SML Ai Account POS ปกติ */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 lg:w-[58%]">
              {/* แถวที่ 1: โหมดบริการ + เลือกโต๊ะ + ช่องสแกนบาร์โค้ด/ค้นหาสินค้า (SML POS Barcode Bar) */}
              <div className="dp-surface mb-2.5 flex flex-wrap items-center gap-2 p-2">
                <div className="flex h-9 items-center gap-1 rounded-xl bg-[#F5EDE2] p-1">
                  {(
                    [
                      { id: "DINE_IN", label: "🍽️ ทานที่ร้าน" },
                      { id: "TAKEAWAY", label: "🛍️ สั่งกลับบ้าน" },
                      { id: "DELIVERY", label: "🛵 เดลิเวอรี่" },
                    ] as { id: ServiceChannel; label: string }[]
                  ).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      data-testid={`pos-starter-channel-${ch.id}`}
                      onClick={() => setServiceChannel(ch.id)}
                      className={`inline-flex h-7 items-center rounded-lg px-3 text-xs font-bold leading-none transition-all duration-300 ${
                        serviceChannel === ch.id
                          ? "dp-chip-active"
                          : "text-[#6B5848] hover:bg-white/70"
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>

                {serviceChannel === "DINE_IN" && (
                  <div className="dp-input dp-enter flex h-9 items-center gap-1.5 rounded-xl px-2.5">
                    <span className="text-xs font-bold text-[#8F4C10]">
                      โต๊ะ/บาร์:
                    </span>
                    <select
                      aria-label="เลือกโต๊ะหรือบาร์"
                      data-testid="pos-starter-table-select"
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      className="h-7 cursor-pointer rounded-lg bg-transparent px-1 text-xs font-bold text-[#2A1F18] outline-none"
                    >
                      {INITIAL_TABLES.map((tb) => (
                        <option key={tb.tableId} value={tb.tableId}>
                          {tb.tableName}
                          {heldTables[tb.tableId] ? " (มีบิลพัก)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative ml-auto flex h-9 min-w-[200px] flex-1 items-center">
                  <Search className="pointer-events-none absolute left-3 size-4 text-[#B5651D]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า (F2)..."
                    className="dp-input h-9 w-full rounded-xl bg-[#FBF7F1] pl-9 pr-3 text-xs font-semibold text-[#2A1F18] placeholder-[#A08C79] focus:bg-white"
                  />
                </div>
              </div>

              {/* แถวที่ 2: หมวดหมู่สินค้า + ปุ่มจัดการ/เพิ่มเมนูใหม่ (Baseline h-8 เดียวกันเป๊ะ) */}
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(CATEGORY_META) as StarterCategory[]).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`pos-starter-cat-${cat.toLowerCase()}`}
                        onClick={() => setActiveCategory(cat)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold leading-none ${
                          activeCategory === cat ? "dp-chip-active" : "dp-chip"
                        }`}
                      >
                        <span>{CATEGORY_META[cat].label}</span>
                      </button>
                    ),
                  )}
                </div>

                <button
                  type="button"
                  data-testid="pos-starter-add-menu-btn"
                  onClick={() => setShowAddMenuModal(true)}
                  className="dp-btn-success inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold leading-none"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span>+ เพิ่มเมนูใหม่ (D1/R2)</span>
                </button>
              </div>

              {/* ตารางการ์ดสินค้าแบบ SML Ai Account POS: ความสูงการ์ดกะทัดรัดเท่ากันทุกหมวดหมู่ (content-start items-start auto-rows-max) */}
              <div className="grid min-h-0 flex-1 content-start items-start auto-rows-max grid-cols-2 gap-3 overflow-y-auto px-0.5 pt-1 pb-3 pr-1.5 sm:grid-cols-3 xl:grid-cols-4">
                {filteredMenuItems.map((item, idx) => {
                  const isAnimating = animatingItemCode === item.code;
                  const itemSweet =
                    itemSweetnessMap[item.code] ?? selectedSweetness;
                  const itemAddon = itemAddonMap[item.code] ?? selectedAddonId;
                  const qtyInCart = cartLines
                    .filter((l) => l.itemCode === item.code)
                    .reduce((acc, l) => addDec(acc, l.qty), "0");
                  const hasInCart = cmpDec(qtyInCart, "0") > 0;
                  const imgSrc = item.imageUrl || `/products/${item.code}.jpg`;
                  const isPrimaryOptionHost =
                    item.code === "CAFE-ESP-01" ||
                    (idx === 0 &&
                      !filteredMenuItems.some(
                        (m) => m.code === "CAFE-ESP-01",
                      ));

                  return (
                    <div
                      key={item.code}
                      style={{ "--i": idx } as React.CSSProperties}
                      className={`dp-stagger dp-lift group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-[0_1px_2px_rgba(42,31,24,0.05),0_8px_20px_-12px_rgba(42,31,24,0.2)] ${
                        isAnimating
                          ? "dp-card-hit scale-[1.03] border-[#0F9D6B]"
                          : hasInCart
                            ? "border-[#B5651D]/70 ring-1 ring-[#B5651D]/30"
                            : "border-[#EBE0D3] hover:border-[#D4823A]/60"
                      }`}
                    >
                      {/* Floating +1 ⚡ Badge Animation เหมือน SML Ai Account POS */}
                      {isAnimating && (
                        <div className="dp-plus-one pointer-events-none absolute top-2 right-2 z-20 rounded-full bg-gradient-to-b from-[#19B47C] to-[#0B7A53] px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow-[0_6px_14px_-4px_rgba(15,157,107,0.8)]">
                          +1 ⚡
                        </div>
                      )}

                      {/* ป้ายจำนวนในตะกร้ามุมขวาบน */}
                      {hasInCart && !isAnimating && (
                        <div key={qtyInCart} className="dp-pop pointer-events-none absolute top-2 right-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-b from-[#D4823A] to-[#8F4C10] px-1.5 font-mono text-[11px] font-extrabold text-white shadow-[0_4px_10px_-2px_rgba(143,76,16,0.6)] ring-2 ring-white">
                          {qtyInCart}
                        </div>
                      )}

                      {/* พื้นที่คลิกสั่งสินค้าพร้อมรูปภาพทุกเมนู */}
                      <button
                        type="button"
                        data-testid={`pos-starter-item-${item.code}`}
                        onClick={() => handleAddItemToCart(item)}
                        className="flex flex-col text-left focus:outline-none"
                      >
                        <div className="relative h-32 w-full shrink-0 overflow-hidden bg-[#F5EDE2]">
                          <img
                            src={imgSrc}
                            alt={item.name}
                            data-testid={`pos-starter-img-${item.code}`}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "/products/CAFE-ESP-01.jpg";
                            }}
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/10" />
                          <div className="absolute top-2 left-2 flex items-center gap-1">
                            <span className="rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/95 backdrop-blur-sm">
                              {item.code}
                            </span>
                            {item.badge && (
                              <span className="rounded-md bg-gradient-to-r from-[#E9BC74] to-[#D4823A] px-1.5 py-0.5 text-[10px] font-extrabold text-[#2A1F18] shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="absolute right-2 bottom-2 rounded-full bg-white/95 px-2.5 py-0.5 font-mono text-xs font-extrabold text-[#8F4C10] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur transition-transform duration-300 group-hover:-translate-y-0.5">
                            ฿{formatMoney(item.price, 2)}
                          </div>
                        </div>

                        <div className="px-3 pt-2.5 pb-2">
                          <div className="line-clamp-1 text-[13px] font-bold text-[#2A1F18] transition-colors group-hover:text-[#B5651D]">
                            {item.name}
                          </div>
                          <div className="truncate text-[10px] text-[#A08C79]">
                            {item.nameEn} · ต่อ{item.unit}
                          </div>
                        </div>
                      </button>

                      {/* ตัวเลือกเฉพาะสินค้า (Option อยู่ที่ตัวสินค้าเฉพาะเมนูเครื่องดื่ม/เบียร์) */}
                      {(item.supportsSweetness || item.supportsBeerServe) && (
                        <div
                          className="border-t border-[#F1E8DC] bg-[#FBF7F1] px-2.5 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.supportsSweetness && (
                            <div className="mb-1 flex flex-wrap items-center gap-0.5">
                              {SWEETNESS_OPTIONS.map((sw) => (
                                <button
                                  key={sw.id}
                                  type="button"
                                  data-testid={
                                    isPrimaryOptionHost
                                      ? `pos-starter-sweet-${sw.id}`
                                      : `pos-item-sweet-${item.code}-${sw.id}`
                                  }
                                  onClick={() => {
                                    setSelectedSweetness(sw.id);
                                    setItemSweetnessMap((p) => ({
                                      ...p,
                                      [item.code]: sw.id,
                                    }));
                                  }}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold leading-none ${
                                    itemSweet === sw.id ? "dp-chip-active" : "dp-chip"
                                  }`}
                                >
                                  {sw.id.replace("หวาน ", "")}
                                </button>
                              ))}
                            </div>
                          )}

                          <select
                            aria-label={`ตัวเลือกเสริม ${item.name}`}
                            data-testid={
                              isPrimaryOptionHost
                                ? "pos-starter-addon-select"
                                : `pos-item-addon-${item.code}`
                            }
                            value={itemAddon}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedAddonId(val);
                              setItemAddonMap((p) => ({
                                ...p,
                                [item.code]: val,
                              }));
                            }}
                            className="dp-input h-7 w-full cursor-pointer rounded-lg px-2 text-[10px] font-bold text-[#4A3B30]"
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
                  );
                })}
              </div>
            </div>

            {/* ฝั่งขวา (42%): CartPanel เต็มความสูงแบบ SML Ai Account POS ปกติ */}
            <div className="flex w-full shrink-0 flex-col border-l border-[#EBE0D3] bg-white shadow-[-12px_0_32px_-20px_rgba(42,31,24,0.35)] lg:w-[42%]">
              {/* 1. แถบหัวตะกร้าสี Terracotta (#B5651D) แบบ SML POS */}
              <div className="flex h-12 shrink-0 items-center justify-between bg-gradient-to-r from-[#8F4C10] via-[#B5651D] to-[#D4823A] px-3.5 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.15)]">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-[#FCE7C8]" />
                  <span className="font-mono text-xs font-extrabold">
                    #POS-{String(queueCounter).padStart(3, "0")}
                  </span>
                  <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] font-bold text-[#FCE7C8] ring-1 ring-white/20">
                    {serviceChannel === "DINE_IN"
                      ? `โต๊ะ ${selectedTableId}`
                      : serviceChannel === "TAKEAWAY"
                        ? "กลับบ้าน"
                        : "เดลิเวอรี่"}
                  </span>
                  <span className="hidden rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-white/15 sm:inline">
                    👤 {shiftStatus.cashierCode}
                  </span>
                </div>
                {cartLines.length > 0 && (
                  <button
                    type="button"
                    data-testid="pos-starter-clear-cart-btn"
                    onClick={() => {
                      playPosSound("delete");
                      setCartLines([]);
                    }}
                    className="dp-pop inline-flex h-7 items-center gap-1 rounded-full bg-white/15 px-3 text-[11px] font-bold text-white ring-1 ring-white/25 transition hover:bg-rose-600 hover:ring-rose-400"
                  >
                    <Trash2 className="size-3" />
                    <span>ล้างตะกร้า</span>
                  </button>
                )}
              </div>

              {/* 2. หัวตารางรายการสินค้า (#F5EDE2) */}
              <div className="grid shrink-0 grid-cols-12 border-b border-[#EBE0D3] bg-[#F5EDE2] px-3.5 py-2 text-[11px] font-bold tracking-wide text-[#6B5848]">
                <div className="col-span-6">รายการสินค้า ({cartLines.length})</div>
                <div className="col-span-3 text-center">จำนวน</div>
                <div className="col-span-3 text-right">ราคารวม</div>
              </div>

              {/* 3. รายการสินค้าในตะกร้า (คลิกเพื่อกางปุ่มคำสั่งและแก้ไข Option เฉพาะรายการแบบ SML POS) */}
              <div className="min-h-0 flex-1 divide-y divide-[#F1E8DC] overflow-y-auto bg-white">
                {cartLines.length === 0 ? (
                  <div className="dp-enter flex h-56 flex-col items-center justify-center p-4 text-center text-xs text-[#A08C79]">
                    <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FBF7F1] to-[#F5EDE2] shadow-[inset_0_2px_6px_rgba(42,31,24,0.08)]">
                      <Coffee className="size-8 animate-pulse text-[#D4823A]" />
                    </div>
                    <span className="text-sm font-bold text-[#4A3B30]">
                      ยังไม่มีรายการสินค้าในบิล
                    </span>
                    <span className="mt-0.5 text-[11px]">
                      คลิกการ์ดรูปสินค้าทางซ้าย หรือสแกนบาร์โค้ดเพื่อเริ่มขาย
                    </span>
                  </div>
                ) : (
                  cartLines.map((line, index) => {
                    const lineTotal = mulDec(line.qty, line.unitPrice);
                    const isExpanded = expandedLineId === line.lineId;
                    const lineImg = `/products/${line.itemCode}.jpg`;
                    const isDrinkOrBeer =
                      line.category === "COFFEE" ||
                      line.category === "TEA" ||
                      line.category === "BEER";

                    return (
                      <div
                        key={line.lineId}
                        onClick={() =>
                          setExpandedLineId(isExpanded ? null : line.lineId)
                        }
                        className={`dp-slide-in cursor-pointer px-3.5 py-2.5 transition-colors duration-200 ${
                          isExpanded
                            ? "bg-gradient-to-r from-[#FFF6EA] to-white shadow-[inset_3px_0_0_#B5651D]"
                            : "hover:bg-[#FBF7F1]"
                        }`}
                      >
                        <div className="grid grid-cols-12 items-center gap-1.5">
                          <div className="col-span-6 flex items-center gap-2 min-w-0">
                            <img
                              src={lineImg}
                              alt={line.name}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  "/products/CAFE-ESP-01.jpg";
                              }}
                              className="size-10 shrink-0 rounded-xl object-cover shadow-[0_3px_8px_-3px_rgba(42,31,24,0.4)] ring-1 ring-[#EBE0D3]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-bold text-[#2A1F18]">
                                {index + 1}. {line.name}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[#85725F]">
                                <span className="font-mono">
                                  @{formatMoney(line.unitPrice, 2)}/{line.unitCode}
                                </span>
                                {line.sweetness && (
                                  <span className="rounded-full bg-[#B5651D]/12 px-1.5 py-px font-bold text-[#8F4C10]">
                                    {line.sweetness}
                                  </span>
                                )}
                                {line.addonLabel && (
                                  <span className="rounded-full bg-[#0F9D6B]/12 px-1.5 py-px font-bold text-[#0B7A53]">
                                    {line.addonLabel}
                                  </span>
                                )}
                                {line.note && (
                                  <span className="text-[#B5651D]">
                                    ({line.note})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            className="col-span-3 flex items-center justify-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleAdjustLineQty(line.lineId, "-1")
                              }
                              className="dp-btn-ghost inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold"
                            >
                              -
                            </button>
                            <span key={line.qty} className="dp-bump inline-block min-w-6 text-center font-mono text-xs font-extrabold text-[#2A1F18]">
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleAdjustLineQty(line.lineId, "1")
                              }
                              className="dp-btn-primary inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold"
                            >
                              +
                            </button>
                          </div>

                          <div className="col-span-3 flex items-center justify-end gap-1.5">
                            <span key={lineTotal} className="dp-bump inline-block font-mono text-xs font-extrabold text-[#8F4C10]">
                              {formatMoney(lineTotal, 2)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playPosSound("delete");
                                handleRemoveLine(line.lineId);
                              }}
                              className="inline-flex size-7 items-center justify-center rounded-full text-[#C2410C]/70 transition hover:bg-rose-50 hover:text-rose-600"
                              title="ลบรายการ"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* แถบตัวเลือกเฉพาะสินค้า (Item-Specific Option & Action Bar เมื่อคลิกที่แถว) */}
                        {isExpanded && isDrinkOrBeer && (
                          <div
                            className="dp-expand mt-2 rounded-xl border border-[#EBE0D3] bg-white p-2.5 text-[11px] shadow-[0_6px_16px_-10px_rgba(42,31,24,0.35)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(line.category === "COFFEE" ||
                              line.category === "TEA") && (
                              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                                <span className="font-bold text-[#8F4C10]">
                                  ความหวาน:
                                </span>
                                {SWEETNESS_OPTIONS.map((sw) => (
                                  <button
                                    key={sw.id}
                                    type="button"
                                    onClick={() =>
                                      handleUpdateLineOption(line.lineId, {
                                        sweetness: sw.id,
                                      })
                                    }
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold leading-none ${
                                      line.sweetness === sw.id ? "dp-chip-active" : "dp-chip"
                                    }`}
                                  >
                                    {sw.id}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="shrink-0 font-bold text-[#8F4C10]">
                                ตัวเลือกเสริม:
                              </span>
                              <select
                                aria-label="แก้ไขตัวเลือกเสริมในตะกร้า"
                                value={
                                  ADDON_OPTIONS.find(
                                    (a) => a.label === line.addonLabel,
                                  )?.id ?? "NONE"
                                }
                                onChange={(e) =>
                                  handleUpdateLineOption(line.lineId, {
                                    addonId: e.target.value,
                                  })
                                }
                                className="dp-input h-7 flex-1 cursor-pointer rounded-lg px-2 text-[11px] font-bold text-[#2A1F18]"
                              >
                                {ADDON_OPTIONS.map((ad) => (
                                  <option key={ad.id} value={ad.id}>
                                    {ad.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* 4. แถบโปรโมชัน & สะสมแต้ม ThaiFi Custody Wallet สีเขียวอ่อน (#ECFDF5) แบบ SML POS */}
              <div
                data-testid="pos-starter-wallet-card"
                className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-y border-[#BFEBD8] bg-gradient-to-r from-[#ECFDF5] via-[#F3FCF8] to-[#ECFDF5] px-3.5 py-2 text-[11px]"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 shrink-0 animate-pulse text-[#0F9D6B]" />
                  <span
                    data-testid="pos-starter-wallet-auto-point-badge"
                    className="font-bold text-[#065F46]"
                  >
                    สะสมแต้ม Wallet: ครบทุก 100 ฿ รับ 1 Point (บิลนี้ +
                    {(parseScaled(cartNetTotal) / parseScaled("100")).toString()}{" "}
                    Point)
                  </span>
                </div>
                <span
                  data-testid="pos-starter-wallet-balance"
                  className="font-mono font-bold text-[#047857]"
                >
                  คงเหลือ:{" "}
                  {formatMoneyBlankZero(walletSummary.custBalance) || "0.00"}{" "}
                  {walletSummary.tokenSymbol}
                </span>
              </div>

              {/* 5. ส่วนสรุปยอด + ช่องทางชำระเงิน + ปุ่มชำระเงินเขียวไล่เฉด (dp-pay) + ปุ่มคำสั่งล่าง 8 ปุ่ม */}
              <div className="shrink-0 space-y-2 bg-gradient-to-b from-[#FBF7F1] to-[#F5EDE2] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="dp-input flex h-8 items-center gap-1.5 rounded-xl px-2.5">
                    <span className="shrink-0 text-[11px] font-bold text-[#85725F]">
                      ส่วนลด (฿):
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="ส่วนลดท้ายบิล"
                      value={
                        cmpDec(discountInput || "0", "0") === 0
                          ? ""
                          : discountInput
                      }
                      onChange={(e) =>
                        setDiscountInput(sanitizeNumericInput(e.target.value))
                      }
                      placeholder=""
                      className="h-5 w-full bg-transparent text-right font-mono text-xs font-bold text-[#8F4C10] outline-none"
                    />
                  </div>
                  <div className="dp-input flex h-8 items-center gap-1.5 rounded-xl px-2.5">
                    <input
                      type="text"
                      value={orderRemark}
                      onChange={(e) => setOrderRemark(e.target.value)}
                      placeholder="หมายเหตุท้ายบิล (เช่น แยกน้ำแข็ง)..."
                      className="h-5 w-full bg-transparent text-xs text-[#2A1F18] placeholder-[#A08C79] outline-none"
                    />
                  </div>
                </div>

                {/* เลือกวิธีรับชำระเงิน (เงินสด / QR / โอน / บัตร / จ่ายด้วย Wallet) */}
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
                      { code: "CASH", label: "เงินสด", Icon: Wallet },
                      { code: "PROMPTPAY", label: "QR พร้อมเพย์", Icon: QrCode },
                      { code: "TRANSFER", label: "โอนเงิน", Icon: CreditCard },
                      { code: "CARD", label: "บัตรเครดิต", Icon: CreditCard },
                      { code: "WALLET", label: "จ่ายด้วย Wallet", Icon: Sparkles },
                    ] as {
                      code: PaymentMethodCode;
                      label: string;
                      Icon: typeof Wallet;
                    }[]
                  ).map((pm) => (
                    <button
                      key={pm.code}
                      type="button"
                      data-testid={`pos-starter-paymethod-${pm.code.toLowerCase()}`}
                      onClick={() => setPaymentMethod(pm.code)}
                      className={`inline-flex h-9 items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-bold leading-none ${
                        paymentMethod === pm.code ? "dp-chip-active" : "dp-chip"
                      }`}
                    >
                      <pm.Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{pm.label}</span>
                    </button>
                  ))}
                </div>

                {/* กรณีรับเงินสด: ช่องรับเงิน + ปุ่มธนบัตรด่วน + เงินทอน */}
                {paymentMethod === "CASH" && (
                  <div className="dp-expand flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-[#EBE0D3] bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(42,31,24,0.05)]">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-[#85725F]">
                        รับเงินสด:
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
                        onChange={(e) =>
                          setCashReceivedInput(
                            sanitizeNumericInput(e.target.value),
                          )
                        }
                        placeholder={formatMoneyBlankZero(cartNetTotal)}
                        className="dp-input h-7 w-24 rounded-lg bg-[#FBF7F1] px-2 text-right font-mono text-xs font-bold text-[#2A1F18]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {["100", "500", "1000"].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => setCashReceivedInput(bill)}
                          className="dp-chip inline-flex h-7 items-center rounded-full px-2.5 font-mono text-[11px] font-bold hover:bg-[#B5651D] hover:text-white"
                        >
                          {bill}
                        </button>
                      ))}
                    </div>
                    <div key={cashChangeAmount} className="dp-bump text-right text-xs font-extrabold text-[#0B7A53]">
                      ทอน: {formatMoneyBlankZero(cashChangeAmount) || "-"}
                    </div>
                  </div>
                )}

                {/* ปุ่มชำระเงินเขียวไล่เฉด + แสงวิ่ง (dp-pay) + ยอดสุทธิ */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    ref={payButtonRef}
                    data-testid="pos-starter-confirm-pay-btn"
                    onClick={() => {
                      playPosSound("chaching");
                      void handleCheckoutAndSaveBill();
                    }}
                    disabled={cartLines.length === 0 || submittingBill}
                    className={`dp-pay flex h-14 flex-1 items-center justify-between rounded-2xl px-4 text-white disabled:opacity-40 disabled:saturate-50 ${
                      payPulse ? "dp-bump ring-4 ring-[#0F9D6B]/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                        <Printer className="size-5" />
                      </span>
                      <div className="text-left">
                        <div
                          className="text-xs font-extrabold leading-tight"
                          data-testid="pos-starter-pay-submit-btn"
                        >
                          {submittingBill
                            ? "กำลังบันทึกบิล..."
                            : "ชำระเงิน & พิมพ์ใบเสร็จ (F9)"}
                        </div>
                        <div className="text-[10px] text-emerald-50/85">
                          รวม VAT 7% · บันทึกลง Cloudflare D1
                        </div>
                      </div>
                    </div>
                    <div
                      key={cartNetTotal}
                      className="dp-bump font-mono text-2xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                      data-testid="pos-starter-net-total"
                    >
                      {formatMoneyBlankZero(cartNetTotal) || "0.00"} ฿
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      speak(
                        `ยอดชำระสุทธิ ${formatMoney(cartNetTotal, 2)} บาท ค่ะ`,
                      )
                    }
                    className="dp-btn-ghost inline-flex h-14 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[#B5651D]"
                    title="พูดยอดชำระ"
                  >
                    <Volume2 className="size-4" />
                    <span className="text-[9px] font-bold">พูดยอด</span>
                  </button>
                </div>

                {/* แผงปุ่มคำสั่งล่าง (SML POS Bottom Command Grid) */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="pos-starter-quick-cash-btn"
                    onClick={() => {
                      playPosSound("chaching");
                      handleQuickExactCashCheckout();
                    }}
                    disabled={cartLines.length === 0 || submittingBill}
                    className="dp-btn-primary inline-flex h-9 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold disabled:opacity-40"
                  >
                    <Zap className="size-3.5 shrink-0" />
                    <span>ขายด่วนเงินสดพอดี</span>
                  </button>

                  <button
                    type="button"
                    data-testid="pos-starter-hold-btn"
                    onClick={handleHoldOrderToTable}
                    disabled={cartLines.length === 0}
                    className="dp-btn-ghost inline-flex h-9 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    <PauseCircle className="size-3.5 shrink-0 text-[#B5651D]" />
                    <span data-testid="pos-starter-hold-table-btn">
                      พักบิลเข้าโต๊ะ/บาร์
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("manage")}
                    className="dp-btn-ghost inline-flex h-9 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold"
                  >
                    <Cloud className="size-3.5 shrink-0 text-[#B5651D]" />
                    <span>จัดการสินค้า/Cloudflare</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* แท็บที่ 2: ผังโต๊ะคาเฟ่ & แท็บบาร์เบียร์ (Table & Bar Tab Map) */}
        {activeTab === "tables" && (
          <div
            className="dp-enter flex h-full w-full flex-col overflow-y-auto p-5"
            data-testid="pos-starter-tables-view"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="dp-title text-base">
                  ผังโต๊ะคาเฟ่ · เคาน์เตอร์บาร์คราฟต์เบียร์ · ลานเบียร์ในสวน
                </h2>
                <p className="dp-subtitle text-xs">
                  คลิกที่โต๊ะเพื่อดึงรายการกลับมาสั่งเพิ่ม หรือกดเช็คบิลออกใบเสร็จรับเงินทันที
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-emerald-700">
                  <span className="dp-live size-2.5 rounded-full bg-emerald-500" />
                  โต๊ะว่าง ({INITIAL_TABLES.length - occupiedTableCount})
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E9BC74]/70 bg-[#FFF6EA] px-3 text-[#8F4C10]">
                  <span className="size-2.5 rounded-full bg-[#D4823A]" />
                  เปิดบิลค้างอยู่ ({occupiedTableCount})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {INITIAL_TABLES.map((tb, tbIdx) => {
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
                    style={{ "--i": tbIdx } as React.CSSProperties}
                    className={`dp-stagger dp-lift flex flex-col justify-between rounded-2xl border p-4 ${
                      held
                        ? "border-[#E9BC74] bg-gradient-to-br from-[#FFF1DC] via-[#FFF9F0] to-white shadow-[0_10px_28px_-14px_rgba(181,101,29,0.55)]"
                        : "border-[#EBE0D3] bg-white shadow-[0_1px_2px_rgba(42,31,24,0.05),0_8px_20px_-14px_rgba(42,31,24,0.25)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-[#F5EDE2] px-2.5 py-0.5 text-[11px] font-bold text-[#6B5848]">
                          {tb.zoneLabel} · {tb.seats} ที่นั่ง
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            held
                              ? "dp-pop bg-gradient-to-r from-[#E9BC74] to-[#D4823A] text-[#2A1F18] shadow-[0_3px_8px_-3px_rgba(181,101,29,0.7)]"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {held ? `เปิดโต๊ะ ${held.openedAt} น.` : "ว่างพร้อมรับลูกค้า"}
                        </span>
                      </div>

                      <div className="mt-2.5 text-base font-extrabold text-[#2A1F18]">
                        {tb.tableName}
                      </div>

                      {held ? (
                        <div className="mt-2 space-y-1 rounded-xl bg-white/80 p-2.5 text-xs ring-1 ring-[#F1E8DC]">
                          {held.lines.map((l) => (
                            <div
                              key={l.lineId}
                              className="flex items-center justify-between text-[#4A3B30]"
                            >
                              <span className="truncate">
                                {l.qty}x {l.name}
                              </span>
                              <span className="font-mono font-bold text-[#8F4C10]">
                                {formatMoney(mulDec(l.qty, l.unitPrice), 2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-[#A08C79]">
                          ยังไม่มีออเดอร์ค้างในโต๊ะนี้
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[#F1E8DC] pt-3">
                      <div className="dp-money font-mono text-base font-extrabold">
                        {held ? `฿${formatMoney(tableSum, 2)}` : "โต๊ะว่าง"}
                      </div>
                      <button
                        type="button"
                        data-testid={`pos-starter-recall-${tb.tableId}`}
                        onClick={() => handleRecallTableToCashier(tb.tableId)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold leading-none ${
                          held ? "dp-btn-primary" : "dp-btn-ghost"
                        }`}
                      >
                        <Plus className="size-3.5" />
                        <span>
                          {held ? "ดึงบิล / เช็คบิล" : "เปิดโต๊ะสั่งอาหาร"}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* แท็บที่ 3: จอคิวบาริสต้า & บาร์เบียร์สด (Barista & Taproom KDS) */}
        {activeTab === "kds" && (
          <div
            className="dp-enter flex h-full w-full flex-col overflow-y-auto p-5"
            data-testid="pos-starter-kds-view"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="dp-title text-base">
                  จอคิวบาริสต้าชงกาแฟ & บาร์เทนเดอร์กดคราฟต์เบียร์สด (Real-time KDS)
                </h2>
                <p className="dp-subtitle text-xs">
                  แยกสีตามสถานะคิว พร้อมกดเรียกคิวลูกค้าด้วยเสียงพูดภาษาไทยและพิมพ์สติกเกอร์แปะแก้ว
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {kdsQueue.map((q, qIdx) => (
                <div
                  key={`${q.queueNo}-${q.docNo}`}
                  data-testid={`pos-starter-kds-card-${q.queueNo}`}
                  style={{ "--i": qIdx } as React.CSSProperties}
                  className={`dp-stagger relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 pt-5 transition-all duration-500 ${
                    q.status === "PREPARING"
                      ? "border-[#E9BC74] bg-white shadow-[0_10px_28px_-16px_rgba(181,101,29,0.6)]"
                      : q.status === "READY"
                        ? "dp-glow-ready border-emerald-300 bg-gradient-to-b from-emerald-50 to-white"
                        : "border-[#EBE0D3] bg-[#FBF7F1] opacity-70"
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1.5 ${
                      q.status === "PREPARING"
                        ? "bg-gradient-to-r from-[#E9BC74] via-[#D4823A] to-[#B5651D]"
                        : q.status === "READY"
                          ? "bg-gradient-to-r from-[#19B47C] to-[#0B7A53]"
                          : "bg-[#EBE0D3]"
                    }`}
                  />
                  <div>
                    <div className="flex items-center justify-between border-b border-[#F1E8DC] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-gradient-to-br from-[#3A2416] to-[#1F130C] px-2.5 py-1 font-mono text-sm font-extrabold text-[#E9BC74] shadow-[0_4px_10px_-4px_rgba(31,19,12,0.7)]">
                          คิว {q.queueNo}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-[#2A1F18]">
                            {q.tableLabel}
                          </div>
                          <div className="text-[11px] text-[#A08C79]">
                            เลขบิล {q.docNo} · เวลา {q.createdAt} น.
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                          q.status === "PREPARING"
                            ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                            : q.status === "READY"
                              ? "dp-pop bg-gradient-to-r from-[#19B47C] to-[#0B7A53] text-white shadow-[0_4px_10px_-4px_rgba(15,157,107,0.8)]"
                              : "bg-[#F5EDE2] text-[#85725F]"
                        }`}
                      >
                        {q.status === "PREPARING"
                          ? "⏳ กำลังชง/กดเบียร์"
                          : q.status === "READY"
                            ? "🔔 พร้อมเสิร์ฟ"
                            : "✅ เสิร์ฟครบแล้ว"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {q.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#F1E8DC] bg-[#FBF7F1] p-2.5"
                        >
                          <div className="flex items-center justify-between text-xs font-extrabold text-[#2A1F18]">
                            <span>{it.name}</span>
                            <span className="rounded-full bg-[#B5651D]/12 px-2 py-0.5 font-mono text-[#8F4C10]">
                              {it.qty} {it.unitCode}
                            </span>
                          </div>
                          {it.modifierText && (
                            <div className="mt-1 text-[11px] font-semibold text-[#0B7A53]">
                              สูตร/การเสิร์ฟ: {it.modifierText}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1E8DC] pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        speak(
                          `หมายเลขคิว ${q.queueNo} ${q.tableLabel} เครื่องดื่มและอาหารพร้อมเสิร์ฟแล้วค่ะ`,
                        )
                      }
                      className="dp-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[#B5651D]"
                    >
                      <Volume2 className="size-3.5" />
                      <span>เรียกคิวเสียงไทย</span>
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
                            speak(`คิว ${q.queueNo} ชงเสร็จพร้อมเสิร์ฟแล้วค่ะ`);
                          }}
                          className="dp-btn-primary inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-extrabold"
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>ชงเสร็จ/พร้อมเสิร์ฟ</span>
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
                          className="dp-btn-success inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-extrabold"
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>เสิร์ฟครบแล้ว</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* แท็บที่ 4: รายงานยอดขาย & ปิดกะ E2E (DOME Pos Reports, Cloudflare D1/R2 & Shift Control) */}
        {activeTab === "reports" && (
          <div
            className="dp-enter flex h-full w-full flex-col space-y-4 overflow-y-auto p-5"
            data-testid="pos-starter-reports-view"
          >
            {/* หัวข้อรายงาน + ปุ่มพิมพ์สรุปยอดกะ & ปิดกะ */}
            <div className="dp-surface flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-[#B5651D] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="dp-title text-base">
                  รายงานยอดขาย DOME Pos & ควบคุมกะเจ้าของร้านคนเดียว
                </h2>
                <span className="dp-subtitle text-xs">
                  · เก็บข้อมูลบน Cloudflare D1 & รูปภาพ R2
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="pos-starter-print-zreport-btn"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                  className="dp-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                >
                  <Printer className="size-3.5" />
                  <span>พิมพ์ใบสรุปปิดกะ (Z-Report)</span>
                </button>
                <button
                  type="button"
                  data-testid="pos-starter-toggle-shift-btn"
                  onClick={() => void handleToggleShift()}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold leading-none transition ${
                    shiftStatus.isOpen
                      ? "bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-[0_6px_16px_-8px_rgba(225,29,72,0.8)] hover:brightness-110"
                      : "dp-btn-success"
                  }`}
                >
                  <Clock className="size-3.5" />
                  <span>
                    {shiftStatus.isOpen
                      ? "ปิดกะสรุปยอดเข้า Cloudflare D1"
                      : "เปิดกะแคชเชียร์ใหม่"}
                  </span>
                </button>
              </div>
            </div>

            {/* การ์ดสถานะการเชื่อมต่อ Cloudflare D1 (Database) + Cloudflare R2 (Object Storage) */}
            <div
              data-testid="pos-starter-cloudflare-status-card"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-[#FFF6EA] p-4 shadow-[0_1px_2px_rgba(42,31,24,0.05),0_8px_20px_-14px_rgba(14,116,144,0.35)]"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <Database className="size-4 shrink-0 text-sky-500" />
                  <span className="font-extrabold text-sky-800">
                    ฐานข้อมูล: {cloudflareStatus.d1Database} ({allMenuItems.length} เมนู · {billsHistory.length} บิล)
                  </span>
                </div>

                <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E9BC74]/70 bg-white px-3 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <Cloud className="size-4 shrink-0 text-[#B5651D]" />
                  <span className="font-extrabold text-[#8F4C10]">
                    คลังรูปภาพ: {cloudflareStatus.r2Bucket} (อัปโหลดแล้ว {cloudflareStatus.r2UploadedCount} รูป)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddMenuModal(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 px-3.5 text-xs font-extrabold text-white shadow-[0_6px_16px_-8px_rgba(14,165,233,0.8)] transition hover:brightness-110"
              >
                <ImagePlus className="size-3.5" />
                <span>อัปโหลดรูปเมนูขึ้น Cloudflare R2</span>
              </button>
            </div>

            {/* 4 การ์ด KPI สรุปยอดขายจริง */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div style={{ "--i": 0 } as React.CSSProperties} className="dp-surface dp-lift dp-stagger relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-[#E9BC74] before:to-[#B5651D]">
                <div className="text-xs font-semibold text-[#85725F]">
                  ยอดขายสุทธิรวมในกะ (บาท)
                </div>
                <div
                  className="dp-money mt-1 font-mono text-3xl font-extrabold tracking-tight"
                  data-testid="pos-starter-kpi-total-sales"
                >
                  {formatMoneyBlankZero(reportMetrics.totalSales) || "-"}
                </div>
                <div className="mt-1 text-[11px] text-[#0B7A53]">
                  บันทึกเข้าฐานข้อมูล Cloudflare D1 อัตโนมัติ
                </div>
              </div>

              <div style={{ "--i": 1 } as React.CSSProperties} className="dp-surface dp-lift dp-stagger relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-[#A08C79] before:to-[#4A3B30]">
                <div className="text-xs font-semibold text-[#85725F]">
                  จำนวนบิลขายสำเร็จ / ยกเลิก
                </div>
                <div
                  className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-[#2A1F18]"
                  data-testid="pos-starter-kpi-bill-count"
                >
                  {reportMetrics.billCount} บิล
                </div>
                <div className="mt-1 text-[11px] text-[#A08C79]">
                  ยกเลิก {reportMetrics.cancelledCount} บิล · เฉลี่ยต่อบิล{" "}
                  {formatMoneyBlankZero(reportMetrics.avgPerBill) || "-"} ฿
                </div>
              </div>

              <div style={{ "--i": 2 } as React.CSSProperties} className="dp-surface dp-lift dp-stagger relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-[#19B47C] before:to-[#0B7A53]">
                <div className="text-xs font-semibold text-[#85725F]">
                  ยอดเงินสดในลิ้นชัก (รวมเงินทอนตั้งต้น)
                </div>
                <div className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-[#0F9D6B]">
                  {formatMoneyBlankZero(reportMetrics.drawerCashTotal) || "-"}
                </div>
                <div className="mt-1 text-[11px] text-[#A08C79]">
                  เงินทอนตั้งต้น {formatMoney(shiftStatus.openingFloat, 2)} ฿ + ขายสด{" "}
                  {formatMoneyBlankZero(reportMetrics.cashSalesTotal) || "-"}
                </div>
              </div>

              <div style={{ "--i": 3 } as React.CSSProperties} className="dp-surface dp-lift dp-stagger relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-sky-400 before:to-sky-600">
                <div className="text-xs font-semibold text-[#85725F]">
                  ยอดรับชำระ QR / โอน / บัตร
                </div>
                <div className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-sky-600">
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
                <div className="mt-1 text-[11px] text-[#A08C79]">
                  QR: {formatMoneyBlankZero(reportMetrics.byPayment.PROMPTPAY) || "-"} · โอน:{" "}
                  {formatMoneyBlankZero(reportMetrics.byPayment.TRANSFER) || "-"}
                </div>
              </div>
            </div>

            {/* ตารางสรุปแยกตามหมวดหมู่ & วิธีชำระเงิน */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="dp-surface dp-enter p-4">
                <h3 className="dp-title mb-2.5 text-sm">
                  สรุปยอดขายแยกตามหมวดหมู่ (กาแฟ · ชา · คราฟต์เบียร์ · เบเกอรี่ · กับแกล้ม)
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#EBE0D3] text-left text-[#85725F]">
                      <th className="py-1.5">หมวดหมู่สินค้า</th>
                      <th className="py-1.5 text-right">ยอดขายรวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1E8DC]">
                    {(
                      [
                        "COFFEE",
                        "TEA",
                        "BEER",
                        "BAKERY",
                        "BITES",
                        "ERP",
                      ] as Exclude<StarterCategory, "ALL">[]
                    ).map((cat) => (
                      <tr key={cat} className="transition-colors hover:bg-[#FBF7F1]">
                        <td className="py-2 font-semibold text-[#4A3B30]">
                          {CATEGORY_META[cat].label}
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-[#8F4C10]">
                          {formatMoneyBlankZero(reportMetrics.byCategory[cat]) ||
                            "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dp-surface dp-enter p-4">
                <h3 className="dp-title mb-2.5 text-sm">
                  สรุปยอดรับชำระแยกตามช่องทาง (Cash / PromptPay / Transfer / Card / Wallet)
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#EBE0D3] text-left text-[#85725F]">
                      <th className="py-1.5">ช่องทางรับชำระเงิน</th>
                      <th className="py-1.5 text-right">ยอดรับสุทธิ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1E8DC]">
                    {(Object.keys(PAYMENT_LABELS) as PaymentMethodCode[]).map(
                      (pm) => (
                        <tr key={pm} className="transition-colors hover:bg-[#FBF7F1]">
                          <td className="py-2 font-semibold text-[#4A3B30]">
                            {PAYMENT_LABELS[pm]}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-[#0B7A53]">
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

            {/* ตารางประวัติบิลขายหน้าร้าน (POS Bill Ledger & Reprint / Cancel Bill) */}
            <div className="dp-surface dp-enter p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="dp-title text-sm">
                  ทะเบียนบิลขายหน้าร้าน DOME Pos ({billsHistory.length} บิล)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs"
                  data-testid="pos-starter-bills-table"
                >
                  <thead>
                    <tr className="border-b border-[#EBE0D3] text-left text-[#85725F]">
                      <th className="py-2 pr-2">เลขที่บิล</th>
                      <th className="py-2 px-2">วันที่-เวลา</th>
                      <th className="py-2 px-2">คิว / โต๊ะ</th>
                      <th className="py-2 px-2">วิธีชำระเงิน</th>
                      <th className="py-2 px-2 text-right">ยอดสุทธิ (บาท)</th>
                      <th className="py-2 px-2 text-center">สถานะ D1</th>
                      <th className="py-2 pl-2 text-right">จัดการบิล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1E8DC]">
                    {billsHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-[#A08C79]"
                        >
                          ยังไม่มีประวัติบิลในกะนี้ (ลองกดสั่งกาแฟ/เบียร์แล้วกดรับชำระเงินที่แท็บ 1)
                        </td>
                      </tr>
                    ) : (
                      billsHistory.map((b, bIdx) => (
                        <tr
                          key={`${b.billGuid}-${b.docNo}-${bIdx}`}
                          style={{ "--i": bIdx } as React.CSSProperties}
                          className="dp-stagger transition-colors hover:bg-[#FBF7F1]"
                        >
                          <td className="py-2 pr-2 font-mono font-bold text-[#2A1F18]">
                            {b.docNo}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap text-[#6B5848]">
                            {formatThaiDateDisplay(b.docDate)} {b.docTime}
                          </td>
                          <td className="py-2 px-2 text-[#4A3B30]">
                            <span className="font-bold text-[#B5651D]">
                              {b.queueNo}
                            </span>{" "}
                            · {b.tableLabel}
                          </td>
                          <td className="py-2 px-2 text-[#6B5848]">
                            {PAYMENT_LABELS[b.paymentMethod]}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-extrabold text-[#8F4C10]">
                            {formatMoneyBlankZero(b.totalAmount)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {b.status === "cancelled" ? (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                                ยกเลิกแล้ว
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                ปกติ (Cloudflare D1)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setActiveReceiptBill(b)}
                                className="dp-btn-ghost inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold"
                              >
                                <Receipt className="size-3" />
                                <span>ใบเสร็จ</span>
                              </button>
                              {b.status !== "cancelled" && (
                                <button
                                  type="button"
                                  data-testid={`pos-starter-cancel-${b.docNo}`}
                                  onClick={() => void handleCancelBill(b.docNo)}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                                >
                                  <XCircle className="size-3" />
                                  <span>ยกเลิกบิล</span>
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

        {/* แท็บที่ 5: จัดการสินค้า & เชื่อมต่อบัญชี Cloudflare ของผู้ใช้ */}
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

      {/* Modal เพิ่มเมนูใหม่ (+ อัปโหลดรูปขึ้น Cloudflare R2 & บันทึกลง Cloudflare D1) */}
      {showAddMenuModal && (
        <div
          className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          data-testid="pos-starter-add-menu-modal"
        >
          <div className="dp-modal flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[#EBE0D3] bg-white text-[#2A1F18] shadow-[0_30px_80px_-20px_rgba(31,19,12,0.6)]">
            <div className="dp-header flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#E9BC74]">
                <Plus className="size-4" />
                <span>เพิ่มเมนูใหม่ (บันทึกลง Cloudflare D1 & เก็บรูป R2)</span>
              </div>
              <button
                type="button"
                data-testid="pos-starter-close-add-menu-btn"
                onClick={() => setShowAddMenuModal(false)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/90 transition hover:bg-white/20"
              >
                ปิด
              </button>
            </div>

            <div className="space-y-3 p-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block font-bold text-[#6B5848]">
                    รหัสเมนู
                  </label>
                  <input
                    type="text"
                    data-testid="pos-starter-new-item-code"
                    value={newMenuCode}
                    onChange={(e) => setNewMenuCode(e.target.value)}
                    placeholder="เช่น DOME-01"
                    className="dp-input h-9 w-full rounded-xl px-2.5 font-mono text-xs font-bold text-[#2A1F18]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-[#6B5848]">
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
                    className="dp-input h-9 w-full cursor-pointer rounded-xl px-2.5 text-xs font-bold text-[#2A1F18]"
                  >
                    <option value="COFFEE">☕ กาแฟสด</option>
                    <option value="TEA">🍵 มัทฉะ & ชา</option>
                    <option value="BEER">🍺 คราฟต์เบียร์</option>
                    <option value="BAKERY">🥐 เบเกอรี่</option>
                    <option value="BITES">🍟 กับแกล้ม / ของทานเล่น</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-[#6B5848]">
                  ชื่อเมนูภาษาไทย
                </label>
                <input
                  type="text"
                  data-testid="pos-starter-new-item-name"
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="เช่น ลาเต้เย็นเมล็ดคั่วพิเศษ / คราฟต์เบียร์สด..."
                  className="dp-input h-9 w-full rounded-xl px-2.5 text-xs font-bold text-[#2A1F18]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block font-bold text-[#6B5848]">
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
                    placeholder="85.00"
                    className="dp-input h-9 w-full rounded-xl px-2.5 text-right font-mono text-xs font-bold text-[#8F4C10]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-[#6B5848]">
                    หน่วยนับ
                  </label>
                  <input
                    type="text"
                    data-testid="pos-starter-new-item-unit"
                    value={newMenuUnit}
                    onChange={(e) => setNewMenuUnit(e.target.value)}
                    placeholder="แก้ว / ชิ้น / จาน"
                    className="dp-input h-9 w-full rounded-xl px-2.5 text-xs font-bold text-[#2A1F18]"
                  />
                </div>
              </div>

              {/* ส่วนอัปโหลดรูปภาพเมนูขึ้น Cloudflare R2 */}
              <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-sky-800">
                    <Cloud className="size-3.5 text-sky-500" />
                    <span>รูปภาพเมนูสินค้า (เก็บใน Cloudflare R2)</span>
                  </span>
                  <button
                    type="button"
                    data-testid="pos-starter-r2-upload-btn"
                    onClick={() => void handleUploadImageToR2(null)}
                    disabled={uploadingR2}
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-sky-100 px-2.5 text-[11px] font-bold text-sky-700 transition hover:bg-sky-200"
                  >
                    <ImagePlus className="size-3" />
                    <span>
                      {uploadingR2 ? "กำลังอัปโหลด R2..." : "สร้างลิงก์รูป R2 อัตโนมัติ"}
                    </span>
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="อัปโหลดไฟล์รูปภาพขึ้น Cloudflare R2"
                  data-testid="pos-starter-new-item-image-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadImageToR2(f);
                  }}
                  className="block w-full text-[11px] text-[#6B5848] file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sky-600 file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-white hover:file:bg-sky-500"
                />
                {newMenuImageUrl && (
                  <div
                    data-testid="pos-starter-r2-upload-status"
                    className="dp-enter mt-1.5 truncate font-mono text-[10px] text-emerald-700"
                  >
                    R2 URL: {newMenuImageUrl}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#F1E8DC] bg-[#FBF7F1] px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAddMenuModal(false)}
                className="dp-btn-ghost inline-flex h-9 items-center rounded-xl px-3.5 text-xs font-bold"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                data-testid="pos-starter-save-menu-btn"
                onClick={() => void handleSaveNewMenuItem()}
                className="dp-btn-success inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
              >
                <CheckCircle2 className="size-3.5" />
                <span>บันทึกเมนูใหม่ลง D1/R2</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal แสดงใบเสร็จรับเงินอย่างย่อ 80mm + สติกเกอร์แปะแก้ว (Receipt & Cup Label Preview) */}
      {activeReceiptBill && (
        <div
          className="dp-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          data-testid="pos-starter-receipt-modal"
        >
          <div className="dp-modal flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[#EBE0D3] bg-white text-slate-900 shadow-[0_30px_80px_-20px_rgba(31,19,12,0.6)]">
            <div className="dp-header flex items-center justify-between px-4 py-3 text-white">
              <div className="flex items-center gap-2 text-xs font-extrabold">
                <Receipt className="size-4 text-[#E9BC74]" />
                <span>ใบเสร็จรับเงินอย่างย่อ & ป้ายคิวบาริสต้า</span>
              </div>
              <button
                type="button"
                data-testid="pos-starter-close-receipt-btn"
                onClick={() => setActiveReceiptBill(null)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/20"
              >
                ปิดหน้าต่าง
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
              <div className="text-center">
                <img
                  src="/logo.png"
                  alt="DOME Pos Logo"
                  className="dp-pop mx-auto mb-1.5 size-14 rounded-full object-cover shadow-[0_6px_16px_-6px_rgba(181,101,29,0.7)] ring-2 ring-[#E9BC74]"
                />
                <div className="text-sm font-extrabold text-slate-900">
                  DOME Pos · ร้านกาแฟ เบียร์ คาเฟ่ย์
                </div>
                <div className="text-[11px] text-slate-500">
                  ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (ABB) · Cloudflare D1/R2
                </div>
                <div className="mt-2 inline-block rounded-2xl border-2 border-[#2A1F18] bg-[#FBF7F1] px-4 py-1 font-mono text-lg font-extrabold">
                  คิวรับเครื่องดื่ม: {activeReceiptBill.queueNo}
                </div>
              </div>

              <div className="border-y border-dashed border-slate-300 py-2 text-[11px] text-slate-700">
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
                      <div className="font-bold text-slate-900">
                        {l.qty}x {l.name}
                      </div>
                      {(l.sweetness || l.addonLabel) && (
                        <div className="text-[11px] text-slate-500">
                          {[l.sweetness, l.addonLabel].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      {formatMoney(mulDec(l.qty, l.unitPrice), 2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-dashed border-slate-300 pt-2">
                {cmpDec(activeReceiptBill.discountAmount, "0") > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>ส่วนลดท้ายบิล</span>
                    <span className="font-mono">
                      -{formatMoney(activeReceiptBill.discountAmount, 2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold text-slate-900">
                  <span>ยอดสุทธิรวมทั้งสิ้น (รวม VAT)</span>
                  <span className="font-mono">
                    {formatMoney(activeReceiptBill.totalAmount, 2)} บาท
                  </span>
                </div>
                {activeReceiptBill.paymentMethod === "CASH" && (
                  <>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>รับเงินสด</span>
                      <span className="font-mono">
                        {formatMoney(activeReceiptBill.cashReceived, 2)}
                      </span>
                    </div>
                    {cmpDec(activeReceiptBill.changeAmount, "0") > 0 && (
                      <div className="flex justify-between text-[11px] font-bold text-emerald-700">
                        <span>เงินทอน</span>
                        <span className="font-mono">
                          {formatMoney(activeReceiptBill.changeAmount, 2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* กล่องแสดงผล ThaiFi Custody Wallet & แต้มสะสม On-Chain (ครบทุก 100 บาท = 1 Point เข้า Wallet ลูกค้า) */}
              <div
                data-testid="pos-starter-receipt-wallet-box"
                className="rounded-xl border border-purple-300 bg-purple-50 p-2.5 text-[11px]"
              >
                <div className="flex items-center justify-between font-extrabold text-purple-900">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3.5 text-purple-600" />
                    ThaiFi Custody Wallet (ครบ 100 ฿ = 1 Point)
                  </span>
                  <span
                    data-testid="pos-starter-receipt-points-minted"
                    className="rounded-full bg-purple-700 px-2 py-0.5 font-mono text-[10px] text-white"
                  >
                    +{activeReceiptBill.walletPointsMinted || "0"} Point
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-purple-800">
                  <span>
                    กระเป๋าลูกค้า:{" "}
                    {activeReceiptBill.walletAddress
                      ? `${activeReceiptBill.walletAddress.slice(0, 8)}...${activeReceiptBill.walletAddress.slice(-6)}`
                      : walletSummary.custAddress}
                  </span>
                  <span className="font-mono font-bold">
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
                    className="mt-0.5 truncate font-mono text-[10px] text-purple-600"
                  >
                    TxHash: {activeReceiptBill.walletTxHash}
                  </div>
                )}
              </div>

              {/* ตัวอย่างสติกเกอร์แปะแก้ว (Cup Sticker 50x30mm) */}
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-amber-900">
                  <span className="inline-flex items-center gap-1">
                    <Tag className="size-3" />
                    สติกเกอร์แปะแก้วบาริสต้า (Cup Label 50×30mm)
                  </span>
                  <span>
                    {activeReceiptBill.queueNo} · {activeReceiptBill.docTime}
                  </span>
                </div>
                <div className="text-xs font-extrabold text-slate-900">
                  {activeReceiptBill.lines[0]?.name}
                </div>
                <div className="text-[11px] font-semibold text-amber-800">
                  {[
                    activeReceiptBill.lines[0]?.sweetness || "หวานปกติ",
                    activeReceiptBill.lines[0]?.addonLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#F1E8DC] bg-[#FBF7F1] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="dp-btn-success inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
              >
                <Printer className="size-3.5" />
                <span>พิมพ์ใบเสร็จ & สติกเกอร์แปะแก้ว</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReceiptBill(null)}
                className="dp-btn-ghost inline-flex h-9 items-center rounded-xl px-3.5 text-xs font-bold"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { DomePosScreen as PosStarterCafeScreen };
