import { BotConfig, BotRole, Lens } from "@/types/bot";

export const PERSONA = `คุณคือ QA Tester มืออาชีพผู้ขี้สงสัยสุดขีดสำหรับระบบ DOME Pos (ร้านกาแฟ · เบียร์ · คาเฟ่ย์ สำหรับเจ้าของคนเดียว) ควบคู่กับนักบัญชี นักกฎหมายภาษีไทย (VAT 7% ใบกำกับภาษีอย่างย่อ) และนักพัฒนา (อ่าน HTTP/SQL/โค้ด หาสาเหตุได้) ในคนเดียว
นิสัยขี้สงสัย (Skeptical Tester): ห้ามเชื่อว่าหน้าจอผ่านแค่เพราะเปิดหน้าเว็บติด · ต้องวางแผนตรวจครบทั้ง 4 แท็บหลัก (สั่งออเดอร์ & แคชเชียร์, ผังโต๊ะ 12 โต๊ะ, จอคิวบาริสต้า KDS, รายงานยอดขาย & ปิดกะ) ทดสอบระดับความหวาน ท็อปปิ้ง การพักบิล การรับชำระเงินสด/QR PromptPay/Wallet การพิมพ์ใบเสร็จย่อและสติกเกอร์แปะแก้ว และการลงบัญชีอัตโนมัติในฐานข้อมูล PostgreSQL (domepos)
แต่ไม่ฟุ้ง: พูดเฉพาะสิ่งที่มีหลักฐาน ไม่เดา ไม่ออกนอกเรื่อง`;

const UAT_RULES = `${PERSONA}
เวลาทดสอบคุณใช้ระบบ DOME Pos (http://localhost:3005 · ฐานข้อมูล domepos) แบบ QA Tester ที่ขี้สงสัยและละเอียดทุกจุด:
1. ตรวจหน้าจอและทุกปุ่ม: ทดสอบสั่งเครื่องดื่ม/คราฟต์เบียร์/เบเกอรี่ เลือกความหวาน ท็อปปิ้ง พักบิลลงโต๊ะ เปิดผังโต๊ะดึงบิลกลับมาคิดเงิน ตรวจใบเสร็จย่อ/สติกเกอร์แก้ว จอคิวบาริสต้า KDS และรายงานปิดกะ
2. ตรวจฐานข้อมูล PostgreSQL (domepos): ตรวจตาราง pos_bill_inbox, ic_trans (trans_flag=44), ic_trans_detail, cb_trans, gl_journal_detail (Dr=Cr ดุลเป๊ะ) พร้อมล้างข้อมูลทดสอบเมื่อจบ
3. ตรวจ API ของ DOME Pos: /api/pos/bootstrap, /api/pos/bills, /api/pos/shift, /api/pos/restore, /api/pos/sync`;

interface Seed {
  role: BotRole;
  name: string;
  roleTitle: string;
  roleDescription: string;
  avatarIcon: string;
  accent: string;
  focus: string;
  lenses?: Lens[];
}

// คัดเฉพาะบอทสำหรับทดสอบ DOME Pos (pos-screen, pos-data, pos-api, pos-e2e) เพื่อให้ Dashboard กะทัดรัดตรงกับ DOME Pos
export const MODULES: Seed[] = [
  {
    role: "pos",
    name: "ผู้ตรวจ DOME Pos",
    roleTitle: "UAT DOME Pos (ร้านกาแฟ · เบียร์ · คาเฟ่ย์)",
    roleDescription: "โหมดเจ้าของคนเดียว ทำงานคนเดียว: สั่งออเดอร์ พักบิลผังโต๊ะ จอคิวบาริสต้า KDS รับชำระเงินสด/QR/Wallet ใบเสร็จ & สติกเกอร์แก้ว รายงานปิดกะ และบัญชีคู่ GL อัตโนมัติ",
    avatarIcon: "Store",
    accent: "#10b981",
    focus: "DOME Pos (http://localhost:3005 · ฐานข้อมูล domepos): หน้าจอสั่งออเดอร์ ผังโต๊ะ 12 โต๊ะ จอคิวบาริสต้า KDS รายงานยอดขาย & ปิดกะ, API (/api/pos/bootstrap, /api/pos/bills, /api/pos/shift, /api/pos/restore, /api/pos/sync), ตาราง pos_id, posconfig, pos_promotions, pos_point_condition, pos_bill_inbox, ic_trans (trans_flag=44), cb_trans, gl_journal_detail (Dr=Cr)",
    lenses: ["screen", "data", "api", "e2e"],
  },
];

export const LENSES: { key: Lens; label: string; how: string }[] = [
  { key: "screen", label: "หน้าจอ (pos-screen)", how: "ทำผ่านหน้าจอจริงบน Chrome: เปิดหน้าเว็บโหมดเจ้าของคนเดียว สั่งออเดอร์ พักบิลผังโต๊ะ รับชำระ QR ตรวจใบเสร็จ/สติกเกอร์แก้ว จอคิวบาริสต้า KDS และรายงานปิดกะ" },
  { key: "data", label: "ฐานข้อมูล (pos-data)", how: "ตรวจใน PostgreSQL (ฐานข้อมูล domepos): pos_id, posconfig, pos_promotions, pos_point_condition, pos_bill_inbox และการกระทบยอด ic_trans ↔ cb_trans ↔ gl_journal_detail (Dr=Cr)" },
  { key: "api", label: "API (pos-api)", how: "ตรวจ API ของ DOME Pos (/api/pos/bootstrap, /api/pos/bills, /api/pos/shift, /api/pos/restore, /api/pos/sync) คู่กับแถวจริงในฐานข้อมูล domepos" },
  { key: "e2e", label: "E2E ครบวงจร (pos-e2e)", how: "ทดสอบกระบวนการขายหน้าร้านตั้งแต่ต้นน้ำถึงปลายน้ำ: สั่งออเดอร์ → พักโต๊ะ → รับชำระเงิน → ตัดสต็อก IC → รับเงิน CB → ลงบัญชี GL ดุล 100%" },
];

export const INITIAL_BOTS: BotConfig[] = MODULES.flatMap((s) =>
  LENSES.filter((l) => !s.lenses || s.lenses.includes(l.key)).map((l) => ({ s, l })),
).map(({ s, l }, k) => ({
  id: `bot-${String(k + 1).padStart(2, "0")}`,
  number: k + 1,
  name: `${s.name} · ${l.label}`,
  role: s.role,
  lens: l.key,
  roleTitle: `${s.roleTitle} · ${l.label}`,
  roleDescription: s.roleDescription,
  avatarIcon: s.avatarIcon,
  accent: s.accent,
  status: "idle",
  systemPrompt: `${UAT_RULES}

หน้าที่ของคุณ: ${s.roleTitle} มุมตรวจ${l.label}
วิธีตรวจ: ${l.how}
จุดที่ต้องสำรวจ: ${s.focus}`,
  focus: `${s.focus} · ${l.how}`,
  taskHistory: [],
  events: [],
  stats: { runs: 0, passed: 0, failed: 0, stepsChecked: 0, lastActive: null },
}));

export const ROLES: BotRole[] = MODULES.map((s) => s.role);
