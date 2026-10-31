import { BotConfig, BotTask, ScriptRun } from "@/types/bot";
import { saveScript } from "./mcp";
import { ackWebCommand, enqueueWebCommand, validateLiveApiRoute, validateLiveMenuKey } from "./sml-foundation";
import { addEvent, getBotById, getBots } from "./swarm-store";
import { psqlRead } from "./uat-health";
import { startRuns } from "./uat-runs";

type Step = Record<string, unknown> & {
  title?: string;
  do?: string;
  method?: string;
  sql?: unknown;
  database?: string;
  save?: Record<string, string>;
  as?: string;
  name?: string;
};
type Script = { title: string; steps: Step[]; cleanup?: Step[]; severityOnFail?: string };

const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replaceAll(process.env.UAT_PG_PASSWORD || "\u0000", "***");

function varGuard(sc: Script) {
  const known = new Set(["run.id", "run.short", "run.tag"]);
  for (const st of [...sc.steps, ...(sc.cleanup ?? [])]) {
    const rest = { ...st, sql: undefined };
    for (const [, k] of JSON.stringify(rest).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
      if (!known.has(k) && !k.startsWith("env."))
        throw new Error(`ขั้น "${st.title}": ใช้ตัวแปร {{${k}}} ที่ไม่มีขั้นก่อนหน้า save ไว้`);
    for (const k of Object.keys(st.save ?? {})) known.add(k);
    if (st.as) known.add(st.as);
    if (st.do === "set" && st.name) known.add(st.name);
  }
}

async function sqlGuard(sc: Script) {
  for (const s of sc.steps) {
    if (s?.do !== "db.query" || s.database || typeof s.sql !== "string") continue;
    const sql = s.sql.replace(/(?<!:):(['"]?)[A-Za-z_]\w*\1/g, "NULL");
    const e = await psqlRead(`EXPLAIN ${sql}`).then(() => "", errText);
    const miss = e.match(/(relation|column) \S+ does not exist/);
    if (miss) throw new Error(`ขั้น "${s.title}": ${miss[0]}`);
  }
}

export async function checkScript(sc: Script) {
  varGuard(sc);
  for (const st of [...sc.steps, ...(sc.cleanup ?? [])]) {
    const raw = st as Record<string, unknown>;
    if (
      (st?.do === "ui.openMenu" || st?.do === "sml.auditScreen" || st?.do === "sml.auditReport") &&
      typeof raw.menuKey === "string"
    ) {
      validateLiveMenuKey(raw.menuKey);
    }
    if (st?.do === "api.request" && typeof raw.path === "string" && !raw.path.includes("{{")) {
      validateLiveApiRoute(String(raw.method ?? "GET"), raw.path);
    }
  }
  await sqlGuard(sc);
}

function pickBotsLocal(_command: string): BotConfig[] {
  return getBots();
}

async function writeScript(bot: BotConfig, id: string, command: string): Promise<Script> {
  let sc: Script;
  if (bot.lens === "screen" || bot.lens === "e2e") {
    sc = {
      title: `${bot.name}: ตรวจหน้าจอ DOME Pos โหมดเจ้าของคนเดียว (${command.slice(0, 50)})`,
      severityOnFail: "S1",
      steps: [
        { title: "เปิดเข้าหน้าเว็บ DOME Pos โหมดเจ้าของคนเดียว", do: "ui.demoLogin" },
        {
          title: "ตรวจหน้าจอ POS Starter ร้านกาแฟ เบียร์ คาเฟ่ย์ แสดงผลครบถ้วน",
          do: "ui.expectVisible",
          selector: '[data-testid="pos-starter-cafe-screen"]',
        },
        {
          title: "เปิดแท็บ 2. ผังโต๊ะ & แท็บบาร์",
          do: "ui.click",
          selector: '[data-testid="pos-starter-tab-tables"]',
        },
        {
          title: "เปิดแท็บ 3. จอคิวบาริสต้า & บาร์น้ำ (KDS)",
          do: "ui.click",
          selector: '[data-testid="pos-starter-tab-kds"]',
        },
        {
          title: "เปิดแท็บ 4. รายงานยอดขาย & ปิดกะ",
          do: "ui.click",
          selector: '[data-testid="pos-starter-tab-reports"]',
        },
        { title: "ตรวจว่าไม่มี HTTP>=400, JS error หรือ SQLSTATE", do: "ui.expectClean" },
      ],
      cleanup: [],
    };
  } else if (bot.lens === "data") {
    sc = {
      title: `${bot.name}: ตรวจความสมบูรณ์ข้อมูลตาราง POS และสมการบัญชี GL ในฐานข้อมูล domepos`,
      severityOnFail: "S1",
      steps: [
        {
          title: "PG (domepos): ตรวจตารางรหัสเครื่อง POS (pos_id) มีเครื่อง POS-01",
          do: "db.query",
          sql: "SELECT machinecode FROM pos_id WHERE machinecode = 'POS-01'",
          rows: 1,
        },
        {
          title: "PG (domepos): ตรวจสมการบัญชี GL (ผลต่าง Debit - Credit ของบิล POS ต้องเป็น 0.00)",
          do: "db.query",
          sql: "SELECT COALESCE(SUM(debit - credit), 0)::numeric(18,2) AS diff FROM gl_journal_detail",
          expect: [{ col: "diff", op: "eq", value: "0.00" }],
        },
      ],
      cleanup: [],
    };
  } else {
    sc = {
      title: `${bot.name}: ตรวจ API Bootstrap และรายการบิลขาย DOME Pos`,
      severityOnFail: "S1",
      steps: [
        { title: "เปิดเข้าหน้าเว็บ DOME Pos โหมดเจ้าของคนเดียว", do: "ui.demoLogin" },
        {
          title: "API (GET): ตรวจความพร้อมของเครื่อง POS (/api/pos/bootstrap?pos_id=POS-01)",
          do: "api.request",
          method: "GET",
          path: "/api/pos/bootstrap?pos_id=POS-01",
          expectStatus: 200,
        },
        {
          title: "API (GET): ตรวจ API กู้คืนสถานะบิลและผังโต๊ะ (/api/pos/restore?pos_id=POS-01)",
          do: "api.request",
          method: "GET",
          path: "/api/pos/restore?pos_id=POS-01",
          expectStatus: 200,
        },
      ],
      cleanup: [],
    };
  }

  await checkScript(sc);
  saveScript({
    script: {
      ...sc,
      id,
      module: bot.role,
      lens: bot.lens === "e2e" ? "screen" : bot.lens,
      severityOnFail: sc.severityOnFail ?? "S2",
      description: `Code-First Local Engine (0 Token): ${command}`,
    },
  });
  return sc;
}

export async function commandBot(
  botId: string,
  command: string,
  title?: string,
  scriptId?: string,
): Promise<BotConfig | null> {
  const bot = getBotById(botId);
  if (!bot) return null;
  const task: BotTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || command.slice(0, 40),
    kind: "agent",
    status: "running",
    startedAt: new Date().toISOString(),
    prompt: command,
  };
  try {
    const id = scriptId ?? `ask-${bot.role}-${bot.lens}`;
    const sc = await writeScript(bot, id, command);
    const run = startRuns([id]).runs[0];
    if (!run) throw new Error(`เข้าคิวรันสคริปต์ ${id} ไม่ได้`);
    Object.assign(task, {
      status: "completed",
      scriptId: id,
      runId: run.id,
      result: `สร้างสคริปต์ Code-First "${sc.title}" (${sc.steps.length} ขั้น · 0 Token) แล้วสั่งรันจริง (รอบ ${run.id}):\n${sc.steps.map((s, i) => `${i + 1}. ${s.title ?? s.do}`).join("\n")}`,
    });
    addEvent(bot, "info", `รับคำสั่ง → สร้างสคริปต์ Code-First ${id} (0 Token) แล้วเข้าคิวรัน`);
  } catch (e) {
    task.status = "error";
    task.result = `ทำตามคำสั่งไม่สำเร็จ: ${errText(e)}`;
    addEvent(bot, "error", task.result);
  }
  task.finishedAt = new Date().toISOString();
  bot.taskHistory.unshift(task);
  bot.taskHistory.length = Math.min(bot.taskHistory.length, 30);
  bot.stats.lastActive = task.finishedAt;
  return bot;
}

export async function dispatch(command: string, botIds?: string[]): Promise<BotConfig[]> {
  const cmdRecord = enqueueWebCommand(command, botIds);
  const bots = botIds?.length ? getBots().filter((b) => botIds.includes(b.id)) : pickBotsLocal(command);
  if (!bots.length) throw new Error("ไม่พบบอทที่เกี่ยวกับคำสั่งนี้");
  const batch = await Promise.all(bots.map((b) => commandBot(b.id, command, command.slice(0, 40))));
  const out = batch.filter((b): b is BotConfig => b !== null);
  ackWebCommand(
    cmdRecord.id,
    "completed",
    `Code-First Local Engine กระจายสคริปต์ให้บอท DOME Pos ${out.length} ตัวรันขนานทันที (ประหยัด Token 100%)`,
  );
  return out;
}

export async function proposeScripts(_runIds?: string[]) {
  // ปิดการให้ AI สุ่มเขียนสคริปต์หลังจบงานเพื่อประหยัด Token 100%
}

export async function healScript(_run: ScriptRun, _why: string): Promise<string | undefined> {
  return undefined;
}

export function promoteHeal(_run: ScriptRun) {
  // ไม่ใช้ AI heal ที่เสียโควตา
}
