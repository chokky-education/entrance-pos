import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SharedDbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export const REPO_ROOT = resolve(process.cwd(), "..");
const BACKEND_ENV_PATH = join(REPO_ROOT, "backend", ".env.local");
const BACKEND_CFG_PATH = join(REPO_ROOT, "backend", "configs", "domepos.json");
const FRONTEND_API_DIR = join(REPO_ROOT, "frontend", "src", "app", "api");
const BACKEND_ROUTER_PATH = join(REPO_ROOT, "backend", "cmd", "api", "main.go");

let cachedDbCfg: SharedDbConfig | undefined;

/**
 * โหลดค่าการเชื่อมต่อ PostgreSQL สำหรับ DOME Pos (ฐานข้อมูล domepos เท่านั้น)
 */
export function loadSharedDbConfig(): SharedDbConfig {
  if (cachedDbCfg) return cachedDbCfg;
  const fileCfg: Partial<Record<string, string>> = {};
  try {
    if (existsSync(BACKEND_ENV_PATH)) {
      for (const line of readFileSync(BACKEND_ENV_PATH, "utf8").split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (!m) continue;
        const [, k, v] = m;
        const val = v.replace(/^['"]|['"]$/g, "");
        if (k === "PG_HOST") fileCfg.host = val;
        else if (k === "PG_PORT") fileCfg.port = val;
        else if (k === "PG_USER") fileCfg.user = val;
        else if (k === "PG_PASSWORD") fileCfg.password = val;
        else if (k === "PG_DATABASE") fileCfg.database = val;
      }
    } else if (existsSync(BACKEND_CFG_PATH)) {
      Object.assign(fileCfg, JSON.parse(readFileSync(BACKEND_CFG_PATH, "utf8")));
    }
  } catch {
    /* fallback to env */
  }
  cachedDbCfg = {
    host: process.env.UAT_PG_HOST || fileCfg.host || "127.0.0.1",
    port: process.env.UAT_PG_PORT || fileCfg.port || "5432",
    user: process.env.UAT_PG_USER || fileCfg.user || "postgres",
    password: process.env.UAT_PG_PASSWORD !== undefined ? process.env.UAT_PG_PASSWORD : (fileCfg.password ?? ""),
    database: process.env.UAT_PG_DATABASE || fileCfg.database || "domepos",
  };
  return cachedDbCfg;
}

export interface SchemaSummary {
  menuKey: string;
  title: string;
  tableName: string;
  codeField: string;
  nameField: string;
  fields: string[];
}

export interface TransMenuSummary {
  menuKey: string;
  title: string;
  kind: string;
  transType: number;
  transFlag: number;
  mode: string;
  partyType: string;
  prefix: string;
}

export interface ApiRouteSummary {
  pattern: string;
  regex: RegExp;
  methods: string[];
}

export interface LiveBlueprint {
  fingerprint: number;
  masterSchemas: SchemaSummary[];
  transMenus: TransMenuSummary[];
  validMenuKeys: Map<string, { title: string; kind: "master" | "trans" | "report" | "custom" | "leaf" }>;
  apiRoutes: ApiRouteSummary[];
  backendProcessRoutes: string[];
}

let liveCache: LiveBlueprint | undefined;

function statMtime(p: string): number {
  try {
    return existsSync(p) ? statSync(p).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function walkApiRoutes(dir: string, prefix = "/api"): { files: { path: string; route: string; mtime: number }[] } {
  const files: { path: string; route: string; mtime: number }[] = [];
  if (!existsSync(dir)) return { files };
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...walkApiRoutes(full, `${prefix}/${e.name}`).files);
    } else if (e.name === "route.ts") {
      files.push({ path: full, route: prefix, mtime: statMtime(full) });
    }
  }
  return { files };
}

function computeFingerprint(): number {
  let max = statMtime(BACKEND_ROUTER_PATH);
  for (const f of walkApiRoutes(FRONTEND_API_DIR).files) {
    max = Math.max(max, f.mtime);
  }
  return max;
}

export function getLiveBlueprint(): LiveBlueprint {
  const fp = computeFingerprint();
  if (liveCache && liveCache.fingerprint === fp) return liveCache;

  const validMenuKeys = new Map<string, { title: string; kind: "master" | "trans" | "report" | "custom" | "leaf" }>([
    ["pos_starter", { title: "DOME Pos ร้านกาแฟ เบียร์ คาเฟ่ย์ (โหมดเจ้าของคนเดียว)", kind: "custom" }],
    ["pos_tables", { title: "ผังโต๊ะ & แท็บบาร์ (12 โต๊ะ)", kind: "custom" }],
    ["pos_kds", { title: "จอคิวบาริสต้า & บาร์น้ำ (KDS)", kind: "custom" }],
    ["pos_reports", { title: "รายงานยอดขาย & ปิดกะ", kind: "report" }],
  ]);

  const masterSchemas: SchemaSummary[] = [
    {
      menuKey: "pos_starter",
      title: "เมนูเครื่องดื่ม เบียร์สด และเบเกอรี่ (ic_inventory)",
      tableName: "ic_inventory",
      codeField: "code",
      nameField: "name_1",
      fields: ["code", "name_1", "unit_standard", "group_main", "sale_price1", "barcode"],
    },
  ];

  const transMenus: TransMenuSummary[] = [
    {
      menuKey: "pos_starter",
      title: "ขายหน้าร้าน DOME Pos (บิลขายสด POS)",
      kind: "ic_trans",
      transType: 2,
      transFlag: 44,
      mode: "pos",
      partyType: "ar",
      prefix: "POS-CAFE-",
    },
  ];

  const apiRoutes: ApiRouteSummary[] = [
    { pattern: "/api/pos/bootstrap", regex: /^\/api\/pos\/bootstrap$/, methods: ["GET"] },
    { pattern: "/api/pos/bills", regex: /^\/api\/pos\/bills$/, methods: ["GET", "POST"] },
    { pattern: "/api/pos/shift", regex: /^\/api\/pos\/shift$/, methods: ["GET", "POST"] },
    { pattern: "/api/pos/restore", regex: /^\/api\/pos\/restore$/, methods: ["GET"] },
    { pattern: "/api/pos/sync", regex: /^\/api\/pos\/sync$/, methods: ["POST"] },
    { pattern: "/api/process/wallet/status", regex: /^\/api\/process\/wallet\/status$/, methods: ["GET"] },
    { pattern: "/api/process/wallet/mint-points", regex: /^\/api\/process\/wallet\/mint-points$/, methods: ["POST"] },
  ];

  for (const f of walkApiRoutes(FRONTEND_API_DIR).files) {
    try {
      if (apiRoutes.some((r) => r.pattern === f.route)) continue;
      const src = readFileSync(f.path, "utf8");
      const methods = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      const regexStr =
        "^" +
        f.route
          .replace(/\[\.\.\.[a-zA-Z0-9_]+\]/g, ".+")
          .replace(/\[[a-zA-Z0-9_]+\]/g, "[^/]+") +
        "$";
      apiRoutes.push({
        pattern: f.route,
        regex: new RegExp(regexStr),
        methods: methods.length ? methods : ["GET", "POST"],
      });
    } catch {
      /* ignore */
    }
  }

  liveCache = {
    fingerprint: fp,
    masterSchemas,
    transMenus,
    validMenuKeys,
    apiRoutes,
    backendProcessRoutes: [
      "GET /api/pos/bootstrap",
      "GET /api/pos/bills",
      "POST /api/pos/bills",
      "GET /api/pos/shift",
      "POST /api/pos/shift",
      "GET /api/pos/restore",
      "POST /api/pos/sync",
    ],
  };
  return liveCache;
}

export function validateLiveMenuKey(menuKey: string): void {
  const bp = getLiveBlueprint();
  if (bp.validMenuKeys.has(menuKey)) return;
  const suggestions = [...bp.validMenuKeys.entries()]
    .map(([k, v]) => `${k} (${v.title})`)
    .join(", ");
  throw new Error(`ไม่มีเมนู "${menuKey}" ใน DOME Pos — ใช้เฉพาะ menuKey ที่มีจริง: ${suggestions}`);
}

export function validateLiveApiRoute(method: string, rawPath: string): void {
  const bp = getLiveBlueprint();
  const cleanPath = String(rawPath || "").split("?")[0].trim();
  const m = String(method || "GET").toUpperCase();
  const match = bp.apiRoutes.find((r) => r.regex.test(cleanPath));
  if (!match) {
    const validList = bp.apiRoutes.map((r) => `${r.pattern} [${r.methods.join("/")}]`).join(", ");
    throw new Error(`ไม่มี API route "${cleanPath}" ใน DOME Pos — ใช้เฉพาะ route ที่มีจริง: ${validList}`);
  }
  if (!match.methods.includes(m)) {
    throw new Error(`API route "${cleanPath}" ไม่รองรับ HTTP ${m} (รองรับเฉพาะ ${match.methods.join(", ")})`);
  }
}

export function getRecentCodeChanges(): string {
  try {
    const status = execFileSync("git", ["status", "-s", "backend/", "frontend/"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 3000,
      windowsHide: true,
    }).trim();
    const log = execFileSync("git", ["log", "-n", "3", "--oneline"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 3000,
      windowsHide: true,
    }).trim();
    return `Commit ล่าสุด:\n${log}${status ? `\nไฟล์ที่กำลังแก้ไขสดใน Working Tree:\n${status.slice(0, 1000)}` : ""}`;
  } catch {
    return "";
  }
}

export function getSmlFoundationGuide(_moduleRole?: string): string {
  const bp = getLiveBlueprint();
  const apiList = bp.apiRoutes.map((r) => `${r.pattern} [${r.methods.join("/")}]`).join(", ");
  const recent = getRecentCodeChanges();

  return `### แผนผังโครงสร้างจริงล่าสุดของ DOME Pos (อ่านสดจากโค้ด d:\\domepos · ฐานข้อมูล domepos)
1. **โหมดเจ้าของคนเดียว ทำงานคนเดียว (Solo-Owner Mode)**:
   - เปิดเข้าหน้าเว็บ \`http://localhost:3005/\` แล้วเข้าสู่หน้าจอขายหน้าร้าน \`[data-testid="pos-starter-cafe-screen"]\` ทันทีโดยไม่ต้องล็อกอิน
   - มี 4 แท็บหลักในหน้าจอเดียว:
     1) \`[data-testid="pos-starter-tab-order"]\` — สั่งออเดอร์ & แคชเชียร์ (กาแฟสด, มัทฉะ, คราฟต์เบียร์, เบเกอรี่, พักบิล, ขายด่วนรับเงินสดพอดี, QR PromptPay, ThaiFi Wallet)
     2) \`[data-testid="pos-starter-tab-tables"]\` — ผังโต๊ะ & แท็บบาร์ (12 โต๊ะ: C1-C4, B1-B4, G1-G4)
     3) \`[data-testid="pos-starter-tab-kds"]\` — จอคิวบาริสต้า & บาร์น้ำ (KDS)
     4) \`[data-testid="pos-starter-tab-reports"]\` — รายงานยอดขาย & ปิดกะ
2. **API Routes ของ DOME Pos**:
   - ${apiList}
3. **ฐานข้อมูล PostgreSQL (\`domepos\`) และการลงบัญชีคู่ GL อัตโนมัติ**:
   - ตารางหลัก: \`pos_id\`, \`posconfig\`, \`pos_promotions\`, \`pos_point_condition\`, \`pos_member_groups\`, \`pos_bill_inbox\`, \`ic_inventory\`, \`ic_trans\` (\`trans_flag = 44\`), \`ic_trans_detail\`, \`cb_trans\`, \`gl_journal\`, \`gl_journal_detail\`
   - ทุกบิลขาย POS ลงสมุดรายวัน \`gl_journal_detail\` ด้วยสมการบัญชี \`SUM(debit) = SUM(credit)\` ดุลเป๊ะระดับสตางค์${recent ? `\n4. **การแก้ไขโค้ดล่าสุดใน Repo**:\n${recent}` : ""}`;
}

export interface WebCommandEntry {
  id: string;
  prompt: string;
  targetBotIds?: string[];
  status: "pending" | "dispatched" | "completed";
  createdAt: string;
  updatedAt: string;
  note?: string;
}

const WEB_COMMANDS_PATH = join(process.cwd(), "runs", "web-commands.json");

export function listWebCommands(statusFilter?: "pending" | "dispatched" | "completed"): WebCommandEntry[] {
  try {
    if (!existsSync(WEB_COMMANDS_PATH)) return [];
    const list = JSON.parse(readFileSync(WEB_COMMANDS_PATH, "utf8")) as WebCommandEntry[];
    if (!Array.isArray(list)) return [];
    return statusFilter ? list.filter((c) => c.status === statusFilter) : list;
  } catch {
    return [];
  }
}

export function enqueueWebCommand(prompt: string, targetBotIds?: string[]): WebCommandEntry {
  const list = listWebCommands();
  const now = new Date().toISOString();
  const entry: WebCommandEntry = {
    id: `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: prompt.trim(),
    targetBotIds: targetBotIds?.length ? targetBotIds : undefined,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(entry);
  if (list.length > 100) list.length = 100;
  try {
    writeFileSync(WEB_COMMANDS_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
  } catch {
    /* ignore */
  }
  return entry;
}

export function ackWebCommand(id: string, status: "dispatched" | "completed" = "completed", note?: string): WebCommandEntry | null {
  const list = listWebCommands();
  const found = list.find((c) => c.id === id);
  if (!found) return null;
  found.status = status;
  found.updatedAt = new Date().toISOString();
  if (note) found.note = note;
  try {
    writeFileSync(WEB_COMMANDS_PATH, JSON.stringify(list, null, 2) + "\n", "utf8");
  } catch {
    /* ignore */
  }
  return found;
}
