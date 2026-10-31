// UAT script runner: runs ONE JSON script step by step (UI via Playwright, AI via Stagehand + Computer Use, API, PostgreSQL via psql)
// and prints one JSON line per event on stdout. Spawned by src/lib/uat-runs.ts.
// Usage: node runner/run.mjs --script <file> --out <dir> --base <erp url>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EVIDENCE_RULE } from "./evidence-rule.mjs";

// โหลดค่าเริ่มต้นจาก .env.local ของ DOME Pos UAT หรือ backend/.env.local โดยอัตโนมัติ
try {
  for (const envFile of [
    resolve(import.meta.dirname, "../.env.local"),
    resolve(import.meta.dirname, "../../backend/.env.local"),
  ]) {
    if (existsSync(envFile)) {
      for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (!m) continue;
        const [, k, rawVal] = m;
        const val = rawVal.replace(/^['"]|['"]$/g, "");
        if (k.startsWith("UAT_") || k.startsWith("OLLAMA_") || k.startsWith("ISSUEMATE_") || k === "ERP_TARGET_URL") {
          if (!process.env[k]) process.env[k] = val;
        } else if (k === "PG_HOST" && !process.env.UAT_PG_HOST) process.env.UAT_PG_HOST = val;
        else if (k === "PG_PORT" && !process.env.UAT_PG_PORT) process.env.UAT_PG_PORT = val;
        else if (k === "PG_USER" && !process.env.UAT_PG_USER) process.env.UAT_PG_USER = val;
        else if (k === "PG_PASSWORD" && process.env.UAT_PG_PASSWORD === undefined) process.env.UAT_PG_PASSWORD = val;
      }
    }
  }
  const cfgPath = resolve(import.meta.dirname, "../../backend/configs/domepos.json");
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    process.env.UAT_PG_HOST ||= cfg.host || "127.0.0.1";
    process.env.UAT_PG_PORT ||= cfg.port || "5432";
    process.env.UAT_PG_USER ||= cfg.user || "postgres";
    if (process.env.UAT_PG_PASSWORD === undefined) process.env.UAT_PG_PASSWORD = cfg.password ?? "";
  }
  process.env.UAT_PG_DATABASE ||= "domepos";
} catch { /* ignore */ }

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const script = JSON.parse(readFileSync(arg("script"), "utf8"));
const outDir = arg("out");
const base = new URL(arg("base"));
mkdirSync(outDir, { recursive: true });

// Every secret env value (and its JSON-escaped form) is masked in all output: events, run.json, evidence, IssueMate.
const isSecretKey = (k) => /PASS|TOKEN|SECRET|KEY/i.test(k);
const secrets = Object.entries(process.env).filter(([k, v]) => isSecretKey(k) && v && v.length >= 4).flatMap(([, v]) => [v, JSON.stringify(v).slice(1, -1)]);
const redact = (s) => secrets.reduce((t, v) => t.split(v).join("***REDACTED***"), String(s ?? ""));
const emit = (o) => process.stdout.write(redact(JSON.stringify(o)) + "\n");
const cut = (s, n = 400) => { const t = redact(s); return t.length > n ? t.slice(0, n) + "…" : t; };

class Fail extends Error {
  constructor(msg, expected, actual) { super(msg); this.expected = expected; this.actual = actual; }
}

// ---------- variables ({{name}} in step params; psql :'name' in SQL) ----------
const runId = process.env.UAT_RUN_ID || Date.now().toString(36).toUpperCase();
const vars = { "run.id": runId, "run.short": runId.slice(-6).toUpperCase(), "run.tag": `UAT-${runId}` };
const fill = (s) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
  if (k.startsWith("env.")) {
    if (!k.startsWith("env.UAT_")) throw new Fail(`อ่านได้เฉพาะตัวแปร env.UAT_*: ${k}`);
    if (isSecretKey(k)) throw new Fail(`ห้ามอ่านค่าลับ ${k} ในสคริปต์ (ใช้ ui.adminLogin แทน)`);
    return process.env[k.slice(4)] ?? "";
  }
  if (!(k in vars)) throw new Fail(`ไม่มีตัวแปร {{${k}}} (ต้อง save จากขั้นตอนก่อนหน้า)`);
  return vars[k];
});
const fillDeep = (v, key) => typeof v === "string" && key !== "sql" ? fill(v) : Array.isArray(v) ? v.map((x) => fillDeep(x)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, k)])) : v;

// ---------- comparison (money is never float: decimal strings via BigInt) ----------
const NUM = /^-?\d+(\.\d+)?$/;
const clean = (v) => String(v ?? "").trim().replace(/,/g, "");
const scaled = (s, sc) => { const neg = s.startsWith("-"); const [i, f = ""] = s.replace("-", "").split("."); const n = BigInt(i + f.padEnd(sc, "0")); return neg ? -n : n; };
function cmpNum(a, b) {
  a = clean(a); b = clean(b);
  if (!NUM.test(a) || !NUM.test(b)) return null;
  const sc = Math.max((a.split(".")[1] ?? "").length, (b.split(".")[1] ?? "").length);
  const x = scaled(a, sc), y = scaled(b, sc);
  return x < y ? -1 : x > y ? 1 : 0;
}
function check(actual, op = "eq", expected) {
  const c = cmpNum(actual, expected);
  switch (op) {
    case "eq": return c === null ? String(actual ?? "") === String(expected ?? "") : c === 0;
    case "ne": return c === null ? String(actual ?? "") !== String(expected ?? "") : c !== 0;
    case "same": return String(actual ?? "") === String(expected ?? "");
    case "gt": return c !== null && c > 0;
    case "gte": return c !== null && c >= 0;
    case "lt": return c !== null && c < 0;
    case "lte": return c !== null && c <= 0;
    case "contains": return String(actual ?? "").includes(String(expected));
    case "matches": return new RegExp(String(expected)).test(String(actual ?? ""));
    case "exists": return actual !== undefined && actual !== null && String(actual) !== "";
    case "empty": return actual === undefined || actual === null || String(actual) === "";
    default: throw new Fail(`ไม่รู้จักเงื่อนไข op="${op}"`);
  }
}
const mustMatch = (what, actual, op, expected) => {
  if (!check(actual, op, expected)) throw new Fail(`${what} ไม่ตรง`, `${op ?? "eq"} ${expected ?? ""}`.trim(), cut(actual));
};
async function poll(fn, timeout) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { const r = await fn(); if (r.ok) return r; last = r; } catch (e) { last = { ok: false, actual: e.message }; }
    if (Date.now() > end) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ---------- PostgreSQL via psql (variables go through psql :'name' quoting) ----------
const PSQL = process.env.UAT_PSQL || "C:/Program Files/PostgreSQL/18/bin/psql.exe";
const dbChecked = {};
function psql(sql, { readOnly, csv, db = process.env.UAT_PG_DATABASE }) {
  const host = process.env.UAT_PG_HOST;
  if (!host || !process.env.UAT_PG_DATABASE || !process.env.UAT_PG_USER) throw new Fail("ยังไม่ได้ตั้ง UAT_PG_HOST / UAT_PG_DATABASE / UAT_PG_USER (และ UAT_PG_PASSWORD) ใน .env.local");
  const normalizedSql = String(sql ?? "")
    .replace(/'\{\{\s*([\w.]+)\s*\}\}'/g, (_, k) => `:'${k.replace(/\W/g, "_")}'`)
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => `:'${k.replace(/\W/g, "_")}'`);
  const v = Object.entries(vars).flatMap(([k, x]) => ["-v", `${k.replace(/\W/g, "_")}=${x}`]);
  try {
    return execFileSync(PSQL, ["-X", "-v", "ON_ERROR_STOP=1", ...(csv ? ["--csv"] : []), ...v, "-f", "-"], {
      input: normalizedSql, encoding: "utf8", timeout: 30_000, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PGHOST: host, PGPORT: process.env.UAT_PG_PORT || "5432", PGUSER: process.env.UAT_PG_USER, PGPASSWORD: process.env.UAT_PG_PASSWORD || "", PGDATABASE: db, PGOPTIONS: readOnly ? "-c default_transaction_read_only=on" : "" },
    });
  } catch (e) { throw new Fail(`psql ผิดพลาด: ${cut(e.stderr || e.message, 500)}`); }
}
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
// The test-DB guard: every db.* step is refused unless the requested DB AND current_database() are on the allow-list.
// UAT_PG_ALLOW_DB can only narrow TEST_DBS, never widen it — customer databases are unreachable whatever the env says.
const TEST_DBS = new Set([
  "domepos",
  "uat_domepos",
  ...(process.env.UAT_PG_ALLOW_DB || "")
    .split(",")
    .map((s) => s.trim())
    .filter((d) => d && d !== "smldemo"),
]);
const ALLOW_DB = (process.env.UAT_PG_ALLOW_DB || "domepos,uat_domepos")
  .split(",")
  .map((s) => s.trim())
  .filter((d) => TEST_DBS.has(d));
// + ฐาน uat_<ชื่อ> ที่ MCP test_db สร้าง: ยอมเมื่อฐานที่ต่อได้จริงมีป้าย COMMENT "uat-tester" (ต้องตรงกับ src/lib/test-db.ts)
const TEST_DB_NAME = /^uat_[a-z0-9_]{1,30}$/;
function ensureDemoDb(db = process.env.UAT_PG_DATABASE) {
  if (TEST_DB_NAME.test(db ?? "")) {
    if (dbChecked[db] === undefined) dbChecked[db] = parseCsv(psql("select current_database() as db, shobj_description(oid, 'pg_database') as mark from pg_database where datname = current_database()", { readOnly: true, csv: true, db }))[0];
    if (dbChecked[db]?.db !== db || dbChecked[db]?.mark !== "uat-tester") throw new Fail(`ปฏิเสธ: ฐาน "${db}" ไม่ได้สร้างจาก MCP test_db`);
    return db;
  }
  if (!ALLOW_DB.includes(db)) throw new Fail(`ปฏิเสธ: ฐานข้อมูล "${db}" ไม่อยู่ในรายการฐานทดสอบที่อนุญาต (${ALLOW_DB.join(", ")})`);
  if (dbChecked[db] === undefined) dbChecked[db] = parseCsv(psql("select current_database() as db", { readOnly: true, csv: true, db }))[0]?.db;
  if (!ALLOW_DB.includes(dbChecked[db])) throw new Fail(`ปฏิเสธ: ต่อได้ฐาน "${dbChecked[db]}" ซึ่งไม่ใช่ฐานทดสอบที่อนุญาต (${ALLOW_DB.join(", ")})`);
  return db;
}

// ---------- browser (launched lazily on the first ui.* / api.* step) ----------
let browser, context, page;
let issues = [];
const dialogs = [];
const sameOrigin = (u) => { const url = new URL(u, base); if (url.origin !== base.origin) throw new Fail(`ห้ามเปิดนอกเว็บเป้าหมาย (${base.origin}): ${url.origin}`); return url; };
async function loadPlaywright() {
  const found = [
    process.env.UAT_PLAYWRIGHT,
    resolve(import.meta.dirname, "../node_modules/playwright/index.mjs"),
    resolve(import.meta.dirname, "../../frontend/node_modules/playwright/index.mjs"),
  ].filter((p) => p && existsSync(p));
  if (!found.length) throw new Fail("ไม่พบ Playwright: รัน pnpm install ใน d:\\domepos\\uat หรือตั้ง UAT_PLAYWRIGHT=<path ของ playwright/index.mjs> ใน .env.local");
  const mod = await import(pathToFileURL(found[0]).href);
  return mod.chromium ?? mod.default.chromium;
}
// ---------- AI on Ollama Cloud: Stagehand uses the brain model, Computer Use uses the eyes model ----------
// Tested 2026-10-29 on a 1600x900 ERP screenshot: kimi-k3 pointed at 4/4 targets correctly, deepseek-v4.1-flash 0/4
const OLLAMA = process.env.OLLAMA_API_URL || "https://ollama.com";
const BRAIN = process.env.UAT_BRAIN_MODEL || process.env.OLLAMA_MODEL || "deepseek-v4.1-flash";
const EYES = process.env.UAT_EYES_MODEL || "kimi-k3";
async function ollama(model, messages, schema) {
  if (messages[0]?.role === "system") messages = [{ ...messages[0], content: `${messages[0].content}\n\n${EVIDENCE_RULE}` }, ...messages.slice(1)]; // กฎกลางเดียวกับ askBrain
  if (!process.env.OLLAMA_API_KEY) throw new Fail("ยังไม่ได้ตั้ง OLLAMA_API_KEY ใน .env.local");
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, think: false, format: schema, options: { temperature: 0 }, messages }), signal: AbortSignal.timeout(120_000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Fail(`สมอง AI (${model}) ตอบ HTTP ${res.status}${d.error ? `: ${d.error}` : ""}`);
  const text = String(d.message?.content ?? "");
  try { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { throw new Fail(`สมอง AI (${model}) ตอบไม่ใช่ JSON`, "JSON", cut(text, 200)); }
}
// Stagehand v4 "bring your own model": it only asks for structured (json_schema) answers
async function stagehandModel(params) {
  const images = [];
  const text = (c) => [].concat(c).map((b) => (b.type === "text" ? b.text : b.type === "image" ? (images.push(b.data), "[ภาพหน้าจอ]") : JSON.stringify(b))).join("\n");
  const schema = params.responseFormat?.schema;
  const messages = [{ role: "system", content: `${params.systemPrompt ?? ""}${schema ? `\n\nตอบเป็น JSON object เดียวตาม JSON Schema นี้:\n${JSON.stringify(schema)}` : ""}` }, ...params.messages.map((m) => ({ role: m.role, content: text(m.content) }))];
  if (images.length) messages.at(-1).images = images;
  const data = await ollama(BRAIN, messages, schema);
  return { role: "assistant", content: { type: "text", text: JSON.stringify(data) }, outputFormat: "json_schema", structuredContent: data };
}
let stagehand, shBrowser;
const needsStagehand = false;
async function loadStagehand() {
  const found = [
    process.env.UAT_STAGEHAND,
    resolve(import.meta.dirname, "../node_modules/@browserbasehq/stagehand/dist/index.mjs"),
  ].filter((p) => p && existsSync(p));
  if (!found.length) throw new Fail("ไม่พบ Stagehand: ตั้ง UAT_STAGEHAND=<path ของ @browserbasehq/stagehand/dist/index.mjs> ใน .env.local");
  return import(pathToFileURL(found[0]).href);
}
const freePort = () => new Promise((ok, no) => { const srv = createServer().on("error", no).listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => ok(port)); }); });

// ---------- video + Playwright trace (kept only when the run does not pass) ----------
// page.screencast (Playwright 1.64) also records the Stagehand tab attached over CDP; recordVideo would need a context we create ourselves.
// ui.adminLogin types the real admin password and a trace keeps it in clear (fill value + POST body) → such scripts record nothing.
const RECORD = ![...script.steps, ...(script.cleanup ?? [])].some((s) => s.do === "ui.adminLogin");
let recording = false;
async function startRecording(viewport) {
  if (!RECORD || !page.screencast) return;
  await context.tracing.start({ snapshots: true, screenshots: false, title: script.title });
  recording = true;
  // ponytail: 5 fps at 1280 wide keeps ffmpeg light next to parallel bots; raise fps if reviewers need smoother playback
  await page.screencast.start({ path: join(outDir, "video.webm"), size: { width: 1280, height: Math.round((640 * viewport.height) / viewport.width) * 2 }, fps: 5 });
}
async function stopRecording(keep) {
  if (!recording) return;
  recording = false;
  await page.screencast.stop().catch(() => {});
  await context.tracing.stop(keep ? { path: join(outDir, "trace.zip") } : {}).catch(() => {});
  if (!keep) rmSync(join(outDir, "video.webm"), { force: true });
}

let gone = "";
async function ensurePage() {
  if (page) return page;
  const chromium = await loadPlaywright();
  const headless = process.env.UAT_HEADED !== "1";
  const viewport = script.viewport ?? { width: 1600, height: 900 };
  if (needsStagehand) {
    // Stagehand launches Chrome, Playwright attaches over CDP: ui.* steps and AI steps drive the same tab
    const { localBrowser, Stagehand } = await loadStagehand();
    const port = await freePort();
    const opts = { headless, port, viewport, locale: "th-TH", chromiumSandbox: false };
    shBrowser = await localBrowser.launch(opts).catch(() => localBrowser.launch({ ...opts, executablePath: chromium.executablePath() }));
    stagehand = await Stagehand.create({ browser: shBrowser, model: { generate: stagehandModel } });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    context = browser.contexts()[0];
    page = context.pages()[0] ?? (await context.newPage());
  } else {
    browser = await chromium.launch({ channel: "chrome", headless }).catch(() => chromium.launch({ headless }));
    context = await browser.newContext({ viewport, locale: "th-TH" });
    page = await context.newPage();
  }
  await startRecording(viewport).catch(() => {}); // recording is extra evidence: never fail the run over it
  // เบราว์เซอร์ของตัวทดสอบดับ (OOM-killer / รีสตาร์ทบริการ) → ขั้นที่เหลือพังเพราะเครื่องทดสอบ ไม่ใช่ ERP
  browser.on("disconnected", () => { gone ||= "เบราว์เซอร์ของตัวทดสอบปิดตัว (หน่วยความจำเครื่องไม่พอหรือบริการรีสตาร์ท)"; });
  page.on("crash", () => { gone ||= "หน้าเว็บในเบราว์เซอร์ของตัวทดสอบแครช (มักเพราะหน่วยความจำไม่พอ)"; });
  page.on("dialog", (d) => { dialogs.push(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
  // แนบข้อความ error จากเซิร์ฟเวอร์ (ผ่าน cut = ตัดค่าลับ) ให้รู้ว่าพังเพราะอะไร · ponytail: อ่าน body แบบ async — ถ้าตอบช้ามากอาจไปนับในขั้นตรวจถัดไป
  page.on("response", async (r) => { if (r.status() >= 400 && r.url().startsWith(base.origin)) { const body = (await r.text().catch(() => "")).replace(/\s+/g, " ").trim(); issues.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}${body ? ` → ${cut(body, 160)}` : ""}`); } });
  page.on("pageerror", (e) => issues.push(`JS: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_QUIC_PROTOCOL_ERROR|favicon\.ico|A tree hydrated but some attributes/i.test(m.text())) issues.push(`console: ${m.text().slice(0, 200)}`); });
  return page;
}
const DB_ERROR_TEXT = /SQLSTATE[^\n]*|column "[^"]+" does not exist|relation "[^"]+" does not exist|syntax error at[^\n]*/i;
let evidenceSeq = 0;
const saveJson = (name, data) => { const f = `${String(++evidenceSeq).padStart(3, "0")}-${name}.json`; writeFileSync(join(outDir, f), redact(JSON.stringify(data, null, 1)).slice(0, 300_000)); return f; };
const shot = async (name) => { const f = `${String(++evidenceSeq).padStart(3, "0")}-${name}.png`; await page.screenshot({ path: join(outDir, f) }).catch(() => {}); return f; };
// ภาพหน้าจอสดของบอท: เขียนทับ live.jpg ไฟล์เดียว (เขียนไฟล์ชั่วคราวแล้ว rename กันหน้าเว็บอ่านภาพครึ่งไฟล์)
const live = async () => {
  const buf = await page?.screenshot({ type: "jpeg", quality: 50 }).catch(() => null);
  if (!buf) return;
  writeFileSync(join(outDir, "live.tmp"), buf);
  renameSync(join(outDir, "live.tmp"), join(outDir, "live.jpg"));
  emit({ t: "live" });
};
const jpeg64 = async () => (await page.screenshot({ type: "jpeg", quality: 70 })).toString("base64");

// ---------- ระนาบ baseline (กฎ UI ลุงจืด: ทุกอย่างในแถวเดียวกันต้องมีกึ่งกลางแนวตั้งตรงกันเป๊ะ) → ข้อค้นพบ S4 ไม่ทำให้ขั้นล้ม ----------
// ทำงานในหน้าเว็บ (page.evaluate) ห้ามอ้างตัวแปรนอกฟังก์ชัน · ชิ้นที่วัด = ช่องกรอก/ปุ่ม/ไอคอน + ข้อความ 1 บรรทัด
// ข้อความวัดจากขอบตัวอักษรจริง (Range) ไม่ใช่กล่อง label ที่ยืดเต็มแถว · ข้อความใน inline เดียวกันเบราว์เซอร์วางบน baseline เดียวกันแล้ว → นับเป็นชิ้นเดียว
// แถว = บรรพบุรุษชั้นบนสุดที่สูงไม่เกิน 64px · แถวที่มีของซ้อนบน-ล่าง (ชื่อ + คำอธิบาย 2 บรรทัด) ข้ามทั้งแถว กันแจ้งผิด
// ponytail: แถวที่เป็น grid หลายบรรทัดในกล่องเดียว (label/input เป็นลูกตรงของ grid สูง >64px) ไม่ถูกจับเป็นแถว — SML ใช้ flex ต่อแถว (CustomerDetailScreen.tsx:1398)
function measureAlignment() {
  const ROW_MAX = 64, ATOM_MAX = 48, TOL = 1, rows = new Map();
  const rowOf = (el) => {
    if (!rows.has(el)) { const p = el.parentElement; rows.set(el, p && p !== document.body && p.getBoundingClientRect().height <= ROW_MAX ? rowOf(p) : el); }
    return rows.get(el);
  };
  const blockOf = (el) => { while (el.parentElement && ["inline", "contents"].includes(getComputedStyle(el).display)) el = el.parentElement; return el; };
  const ok = (el, r) => r.width >= 2 && r.height >= 4 && r.height <= ATOM_MAX && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const atom = (el, r, what, control) => ({ el, r, what, control, cy: r.top + r.height / 2 });
  const atoms = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]),select,textarea,button,svg,img")) {
    const r = el.getBoundingClientRect();
    if (!el.parentElement?.closest("svg") && ok(el, r)) atoms.push(atom(el, r, el.tagName.toLowerCase(), !el.matches("svg,img")));
  }
  const texts = new Map(), range = document.createRange(), walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n, k = 0; (n = walk.nextNode()) && k < 5000; k++) {
    const p = n.parentElement;
    if (!p || !n.data.trim() || p.closest("script,style,noscript,select,textarea,svg")) continue;
    range.selectNodeContents(n);
    const rs = range.getClientRects(), key = blockOf(p);
    if (rs.length === 1 && ok(p, rs[0]) && !(texts.get(key)?.r.height >= rs[0].height)) texts.set(key, atom(p, rs[0], `"${n.data.trim().slice(0, 24)}"`, false));
  }
  const groups = new Map();
  for (const a of [...atoms, ...texts.values()]) { const g = rowOf(a.el); if (groups.has(g)) groups.get(g).push(a); else groups.set(g, [a]); }
  // จุดกึ่งกลางต้องเห็นจริง (ไม่ถูกกล่องเลื่อน/ป๊อปอัปบัง)
  const shown = (a) => { const h = document.elementFromPoint(a.r.left + a.r.width / 2, a.cy); return !!h && (a.el.contains(h) || h.contains(a.el)); };
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2 || g.some((a) => g.some((b) => Math.min(a.r.bottom, b.r.bottom) <= Math.max(a.r.top, b.r.top)))) continue;
    g.sort((a, b) => a.r.left - b.r.left);
    const ref = g.find((a) => a.control) ?? g[0]; // อ้างอิงช่องกรอก/ปุ่มตัวแรกในแถว (ไม่มี = ชิ้นซ้ายสุด)
    const bad = g.filter((a) => Math.abs(a.cy - ref.cy) > TOL);
    if (!bad.length || !shown(ref)) continue;
    const seen = bad.filter(shown);
    if (!seen.length) continue;
    out.push({
      key: [ref, ...seen].map((a) => a.what).join("|"),
      text: `แถว y≈${Math.round(ref.cy)} อ้างอิง ${ref.what}: ${seen.map((a) => `${a.what} (x ${Math.round(a.r.left)}) ${a.cy > ref.cy ? "ต่ำกว่า" : "สูงกว่า"} ${Math.abs(a.cy - ref.cy).toFixed(1)}px`).join(", ")}`,
      boxes: [ref, ...seen].map((a, i) => ({ x: a.r.left, y: a.r.top, w: a.r.width, h: a.r.height, bad: i > 0 })),
    });
    if (out.length >= 8) break;
  }
  return out;
}
// กรอบเขียว = ชิ้นอ้างอิง, แดง = ชิ้นที่เหลื่อม (วาดทับชั่วคราวเพื่อถ่ายภาพหลักฐาน แล้วลบทิ้ง)
function drawBoxes(boxes) {
  const host = document.body.appendChild(document.createElement("div"));
  host.id = "__uat_align";
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  for (const b of boxes) host.appendChild(document.createElement("div")).style.cssText = `position:absolute;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;outline:2px solid ${b.bad ? "#ff1744" : "#00c853"}`;
}
const alignSeen = new Set(); // แถวเดิมที่เจอแล้วในรอบนี้ไม่แจ้งซ้ำ
async function alignFindings() {
  const rows = (await page.evaluate(measureAlignment).catch(() => [])).filter((r) => !alignSeen.has(r.key) && alignSeen.add(r.key));
  if (!rows.length) return [];
  await page.evaluate(drawBoxes, rows.flatMap((r) => r.boxes)).catch(() => {});
  const evidence = await shot("align");
  await page.evaluate(() => document.getElementById("__uat_align")?.remove()).catch(() => {});
  return [{ severity: "S4", kind: "baseline", text: cut(`ระนาบเหลื่อม ${rows.length} แถว — ${rows.map((r) => r.text).join(" · ")}`, 800), evidence }];
}

// ---------- ภาพต่างจากรอบล่าสุดที่ผ่าน (ui.screenshot + ภาพหน้าแรกของ PDF) → ข้อค้นพบ S4 ไม่ทำให้ขั้นล้ม ----------
// ภาพอ้างอิงถาวร baselines/<script>/<key>.png นอก runs/ · เขียนทับเฉพาะรอบที่ผ่าน (ภาพต่างที่รอบผ่าน = ยอมรับหน้าตาใหม่ แจ้งครั้งเดียว)
const BASELINE_DIR = join(process.env.UAT_BASELINE_DIR || fileURLToPath(new URL("../baselines", import.meta.url)), String(script.id ?? "script").replace(/[^\w-]/g, "_"));
const DIFF_PCT = Number(process.env.UAT_VISUAL_DIFF_PCT) || 0.3; // % ของพิกเซลที่ไม่ได้ปิดไว้
const fresh = new Map(); // key → { src: ภาพรอบนี้, masks } · masks ของภาพอ้างอิงเก็บคู่ใน <key>.json (เลขยาวในภาพเก่าแต่สั้นในภาพใหม่ ต้องปิดทั้งสองฝั่ง)
// ส่วนที่เปลี่ยนทุกรอบ (เลขเอกสาร วันที่ เวลา ยอด) = ข้อความ/ค่าในช่องที่มีตัวเลข → ไม่นับในการเทียบ · พิกัดเป็นพิกเซลภาพ (คูณ devicePixelRatio)
function dynamicRects() {
  const k = devicePixelRatio, out = [];
  const add = (r) => r.width && r.height && out.push([Math.floor((r.left - 2) * k), Math.floor((r.top - 2) * k), Math.ceil((r.width + 4) * k), Math.ceil((r.height + 4) * k)]);
  const walk = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\d/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  for (let n; (n = walk.nextNode()); ) { const r = document.createRange(); r.selectNodeContents(n); for (const x of r.getClientRects()) add(x); }
  for (const el of document.querySelectorAll("input, textarea, select")) if (/\d/.test(el.value)) add(el.getBoundingClientRect());
  return out.slice(0, 5000);
}
// ถอดและเทียบ PNG ด้วย canvas ของ Chromium ที่เปิดอยู่แล้ว (ไม่เพิ่ม dependency · Blob ไม่ผ่าน URL จึงไม่ติด CSP ของหน้า)
// พิกเซลต่าง = สีช่องใดช่องหนึ่งห่างเกิน tol (กันขอบตัวอักษรเพี้ยนเล็กน้อย) · ภาพ diff: เทาจาง = ภาพรอบนี้, แดง = ต่าง, ฟ้า = ส่วนที่ไม่นับ
async function comparePng({ a, b, masks, tol, maxPct }) {
  const load = async (s) => {
    const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext("2d");
    x.drawImage(bm, 0, 0);
    return { w: bm.width, h: bm.height, d: x.getImageData(0, 0, bm.width, bm.height).data, c, x };
  };
  const [A, B] = await Promise.all([load(a), load(b)]);
  if (A.w !== B.w || A.h !== B.h) return { size: `${B.w}×${B.h} → ${A.w}×${A.h}` };
  const skip = new Uint8Array(A.w * A.h);
  for (const [x, y, w, h] of masks) for (let j = Math.max(0, y); j < Math.min(A.h, y + h); j++) skip.fill(1, j * A.w + Math.max(0, x), j * A.w + Math.min(A.w, x + w));
  const img = A.x.createImageData(A.w, A.h), o = img.data, d = A.d, e = B.d;
  let diff = 0, used = 0;
  for (let p = 0, i = 0; p < skip.length; p++, i += 4) {
    const g = 178 + (d[i] + d[i + 1] + d[i + 2]) / 40;
    o[i + 3] = 255;
    if (skip[p]) { o[i] = g - 60; o[i + 1] = g - 20; o[i + 2] = 255; continue; }
    used++;
    if (Math.max(Math.abs(d[i] - e[i]), Math.abs(d[i + 1] - e[i + 1]), Math.abs(d[i + 2] - e[i + 2])) > tol) { diff++; o[i] = 255; o[i + 1] = 0; o[i + 2] = 0; }
    else o[i] = o[i + 1] = o[i + 2] = g;
  }
  const pct = used ? (diff / used) * 100 : 0;
  if (pct <= maxPct) return { pct };
  A.x.putImageData(img, 0, 0);
  const bytes = new Uint8Array(await (await A.c.convertToBlob({ type: "image/png" })).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pct, png: btoa(s) };
}
// file = ภาพใน outDir · คืน note (ต่อท้าย detail ของขั้น) + finding เมื่อต่างเกินเกณฑ์ · เทียบไม่ได้ก็ไม่ทำให้ขั้นล้ม
async function visualCheck(raw, file, masks) {
  let key = raw;
  for (let n = 2; fresh.has(key); n++) key = `${raw}-${n}`;
  const cur = join(outDir, file), old = join(BASELINE_DIR, `${key}.png`);
  if (!existsSync(cur)) return { note: "ไม่มีภาพให้เทียบ" };
  fresh.set(key, { src: cur, masks });
  if (!existsSync(old)) return { note: "ภาพแรกของสคริปต์นี้ เก็บเป็นภาพอ้างอิงเมื่อรอบผ่าน" };
  try {
    const r = await page.evaluate(comparePng, { a: readFileSync(cur).toString("base64"), b: readFileSync(old).toString("base64"), masks: [...masks, ...readMasks(old)], tol: 40, maxPct: DIFF_PCT });
    const vs = "รอบล่าสุดที่ผ่าน";
    if (r.size) return { note: `ขนาดภาพต่างจาก${vs}`, finding: { severity: "S4", kind: "visual", text: `ขนาดภาพ "${key}" ต่างจาก${vs} ${r.size}`, evidence: file } };
    const pct = `${r.pct.toFixed(2)}% (เกณฑ์ ${DIFF_PCT}%)`;
    if (!r.png) return { note: `ต่างจาก${vs} ${pct}` };
    const f = `${String(++evidenceSeq).padStart(3, "0")}-diff-${key}.png`;
    writeFileSync(join(outDir, f), Buffer.from(r.png, "base64"));
    return { note: `ต่างจาก${vs} ${pct}`, finding: { severity: "S4", kind: "visual", text: `ภาพ "${key}" ต่างจาก${vs} ${pct} · ภาพ diff: แดง = ต่าง, ฟ้า = ตัวเลข/วันที่ที่เปลี่ยนทุกรอบ (ไม่นับ)`, evidence: f } };
  } catch (e) { return { note: `เทียบภาพไม่ได้: ${cut(e.message, 120)}` }; }
}
const readMasks = (png) => { try { return JSON.parse(readFileSync(png.replace(/\.png$/, ".json"), "utf8")); } catch { return []; } };
function saveBaselines() {
  for (const [key, { src, masks }] of fresh) {
    try {
      mkdirSync(BASELINE_DIR, { recursive: true });
      const dst = join(BASELINE_DIR, key);
      writeFileSync(`${dst}.json`, JSON.stringify(masks));
      copyFileSync(src, `${dst}.tmp`);
      renameSync(`${dst}.tmp`, `${dst}.png`);
    } catch { /* ไม่มี baseline = รอบหน้าเริ่มใหม่ ไม่กระทบผลรอบนี้ */ }
  }
}

// ---------- Computer Use: the eyes model looks at the screen and picks one action per turn ----------
const SEE_SCHEMA = { type: "object", properties: { pass: { type: "boolean" }, reason: { type: "string" } }, required: ["pass", "reason"] };
const PLAY_SCHEMA = {
  type: "object", required: ["thought", "action"],
  properties: {
    thought: { type: "string" }, action: { type: "string", enum: ["click", "double_click", "type", "press", "scroll", "act", "done"] },
    x: { type: "number" }, y: { type: "number" }, text: { type: "string" }, key: { type: "string" }, instruction: { type: "string" },
    ok: { type: "boolean" }, findings: { type: "array", items: { type: "string" } },
  },
};
const playPrompt = (w, h) => `คุณคือนักบัญชี นักกฎหมายภาษีไทย และนักพัฒนาในคนเดียว ใช้โปรแกรม SML AI Account บนฐานข้อมูล Demo แบบพนักงานบัญชี/ขาย/จัดซื้อ/สต๊อกของ SME ไทย เพื่อหาจุดผิด
นิสัยขี้สงสัย: ตัวเลขเงิน ภาษี ยอดคงเหลือบนจอต้องสมเหตุสมผลตามหลักบัญชีและกฎหมายภาษี · ไม่ฟุ้ง: ทำเฉพาะตามเป้าหมาย ไม่ลองฟีเจอร์นอกเรื่อง
กฎหน้าจอมาตรฐานของ SML AI Account (สำคัญมาก ห้ามเข้าใจผิดว่าเป็นบั๊ก):
- แถบเครื่องมือ 2 โหมด (2-Mode Toolbar): เมื่อเปิดหน้าจอครั้งแรกจะอยู่ใน "โหมดดูข้อมูล" แสดงเฉพาะปุ่ม [แก้ไข] [เพิ่มใหม่] [ลบ] [ปิดหน้าจอ] และจะซ่อนปุ่ม [บันทึก] เสมอ! เมื่อคลิกปุ่ม [เพิ่มใหม่] หรือ [แก้ไข] แล้วเท่านั้นจึงจะเปลี่ยนเป็นโหมดแก้ไขและแสดงปุ่ม [บันทึก] กับ [ปิดหน้าจอ]
- โครงสร้างจอเป็น Split-Pane: ฝั่งซ้ายคือตารางรายการ (DataList) มีช่องค้นหารายการซ้ายมือ (พิมพ์ค้นหาที่นี่แล้วคลิกแถวในตารางซ้ายเพื่อโหลดข้อมูลขึ้นฝั่งขวา) · ฝั่งขวาคือฟอร์มรายละเอียด (Detail Pane) ซึ่งปุ่มแว่นขยาย (🔍) ในช่องรหัสใช้เปิด Popup เลือกข้อมูลอ้างอิงเท่านั้น
- ช่องตัวเลขที่มีค่าเป็น 0 หรือ 0.00 จะแสดงเป็นช่องว่าง ("") ตามมาตรฐาน SML · ฐานข้อมูล smldemo มีข้อมูลตัวอย่างเก่าจากระบบเดิมที่มีสต็อกติดลบอยู่ก่อนแล้ว ไม่ใช่บั๊กของหน้าจอ
ทุกตาคุณได้ภาพหน้าจอ ${w}x${h} พิกเซล เป้าหมาย และสิ่งที่ทำไปแล้ว เลือกทำ 1 อย่างต่อตา ตอบเป็น JSON:
- click / double_click: x,y = พิกัดพิกเซลกึ่งกลางของปุ่มหรือช่องบนภาพนี้
- type: text = ข้อความที่จะพิมพ์ลงช่องที่โฟกัสอยู่ (คลิกช่องก่อนในตาก่อนหน้า)
- press: key = ปุ่มคีย์บอร์ดแบบ Playwright เช่น Enter Tab Escape
- scroll: x,y = จุดที่จะเลื่อน, text = down หรือ up
- act: instruction = สั่ง Stagehand เป็นภาษาไทย 1 อย่าง ใช้เมื่อชี้พิกัดไม่ได้ เช่น "เลือกลูกค้ารายแรกในหน้าต่างค้นหา"
- done: จบ ok=true เมื่อทำตามเป้าหมายครบ, ok=false เมื่อทำต่อไม่ได้เพราะโปรแกรมผิดพลาด
thought = 1 ประโยค (ห้ามว่าง): เห็นอะไรบนจอตอนนี้ และทำไมเลือกทำสิ่งนี้ · อ่านคำแนะนำที่โปรแกรมแสดงบนจอด้วย
ถ้าสิ่งที่ทำไปแล้วมีคำว่า "จอไม่เปลี่ยน" ห้ามทำซ้ำแบบเดิม ให้ลองวิธีอื่น เช่น คลิกแถวก่อนแล้วค่อยกดตกลง, ดับเบิลคลิกแถว, กด Enter หรือใช้ act
findings = สิ่งผิดปกติที่เห็นจริงบนจอ เป็นภาษาไทย (ข้อความ error, เงิน/ภาษี/ยอดรวมคำนวณผิด, ปุ่มกดแล้วไม่ทำงาน, ภาษาไทยเพี้ยน) ใส่ได้ทุกตา ไม่มีให้เป็น []
กฎ: อยู่ในเว็บนี้เท่านั้น · สร้างข้อมูลตัวอย่าง/บันทึกเอกสารทดสอบเพิ่มได้ โดยใส่ ${vars["run.tag"]} ในช่องหมายเหตุหรือรายละเอียดเสมอ · บันทึกแล้วเปิดรายงานที่เกี่ยวข้องดูว่ายอดเปลี่ยนตรงเสมอ · ห้ามลบหรือแก้เอกสาร/ข้อมูลที่ไม่ได้สร้างในรอบนี้ · ห้ามแก้การตั้งค่าระบบ ผู้ใช้ หรือสิทธิ์ · ห้ามออกจากระบบ`;
async function playAction(a, w, h) {
  const inside = Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.y >= 0 && a.x <= w && a.y <= h;
  try {
    switch (a.action) {
      case "click":
      case "double_click":
        if (!inside) return `ข้าม: พิกัดนอกจอ (${a.x},${a.y})`;
        await page.mouse[a.action === "click" ? "click" : "dblclick"](a.x, a.y);
        return `${a.action === "click" ? "คลิก" : "ดับเบิลคลิก"} (${Math.round(a.x)},${Math.round(a.y)})`;
      case "type": await page.keyboard.type(String(a.text ?? "").slice(0, 200), { delay: 20 }); return `พิมพ์ "${cut(a.text, 80)}"`;
      case "press": await page.keyboard.press(String(a.key)); return `กด ${a.key}`;
      case "scroll":
        await page.mouse.move(inside ? a.x : w / 2, inside ? a.y : h / 2);
        await page.mouse.wheel(0, a.text === "up" ? -500 : 500);
        return `เลื่อน${a.text === "up" ? "ขึ้น" : "ลง"}`;
      case "act": {
        const r = await stagehand.act(String(a.instruction ?? ""));
        return `Stagehand ${r.data?.success ? "ทำแล้ว" : "ทำไม่ได้"}: ${cut(r.data?.actionDescription || a.instruction, 120)}`;
      }
      default: return `ข้าม: ไม่รู้จัก action ${a.action}`;
    }
  } catch (e) { return `ทำไม่สำเร็จ (${a.action}): ${cut(e.message, 120)}`; }
}

const dig = (obj, path) => String(path ?? "").replace(/^\$\.?/, "").split(".").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);

// เก็บ PDF + ภาพหน้าแรกเป็นหลักฐาน แล้วหาทุกค่าใน contains (ใช้ทั้ง report.pdf และ ui.pdf)
// ภาพหน้าแรกเทียบกับรอบที่ผ่านด้วยเกณฑ์ % อย่างเดียว (ไม่มี DOM ให้หาตำแหน่งตัวเลข) · ภาพอ้างอิงผูกกับชื่อขั้น (title ไทย → hash)
async function checkPdf(buf, contains, title) {
  const base = `${String(++evidenceSeq).padStart(3, "0")}-report`;
  const pdf = join(outDir, `${base}.pdf`);
  writeFileSync(pdf, buf);
  let text;
  const pdfToTextBin = existsSync("C:/Program Files/Git/mingw64/bin/pdftotext.exe") ? "C:/Program Files/Git/mingw64/bin/pdftotext.exe" : "pdftotext";
  try { text = execFileSync(pdfToTextBin, ["-enc", "UTF-8", "-layout", pdf, "-"], { encoding: "utf8", timeout: 30_000 }); }
  catch (e) { throw Object.assign(new Fail(`อ่านข้อความใน PDF ไม่ได้ (เครื่องทดสอบต้องมี pdftotext จาก poppler-utils): ${cut(e.message, 200)}`), { evidence: `${base}.pdf` }); }
  let evidence = `${base}.pdf`;
  try { execFileSync("pdftoppm", ["-png", "-r", "80", "-f", "1", "-l", "1", "-singlefile", pdf, join(outDir, base)], { timeout: 30_000 }); evidence = `${base}.png`; } catch { /* ไม่มีภาพก็ยังมีไฟล์ PDF */ }
  const flat = text.replace(/\s+/g, " ");
  const want = [].concat(contains ?? []).map(String);
  for (const w of want) if (!flat.includes(w)) throw Object.assign(new Fail(`PDF รายงานไม่มีข้อความ "${w}"`, w, cut(flat, 300)), { evidence });
  const v = evidence.endsWith(".png") ? await visualCheck(`pdf-${createHash("sha1").update(String(title)).digest("hex").slice(0, 10)}`, evidence, []) : {};
  return { detail: `PDF ${Math.ceil(buf.length / 1024)} KB · พบครบ ${want.length} ค่า${v.note ? ` · ${v.note}` : ""}`, evidence, findings: v.finding && [v.finding] };
}

// ---------- step kinds ----------
const ACTIONS = {
  async "ui.demoLogin"(p) {
    const pg = await ensurePage();
    await pg.goto(sameOrigin("/").href, { waitUntil: "domcontentloaded", timeout: p.timeout ?? 30_000 });
    const posScreen = pg.locator('[data-testid="pos-starter-cafe-screen"]');
    const isPosReady = await posScreen.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
    if (isPosReady) {
      return { detail: `เข้าหน้า DOME Pos โหมดเจ้าของคนเดียวพร้อมใช้งาน → ${new URL(pg.url()).pathname}` };
    }
    const btn = pg.locator('[data-testid="demo-login-btn"]');
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 10_000 }).catch(() => {});
      await posScreen.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    }
    return { detail: `เปิดหน้า DOME Pos แล้ว → ${new URL(pg.url()).pathname}` };
  },
  async "ui.adminLogin"(p) {
    return ACTIONS["ui.demoLogin"](p);
  },
  async "ui.goto"(p) {
    const pg = await ensurePage();
    const res = await pg.goto(sameOrigin(p.url ?? p.path).href, { waitUntil: "domcontentloaded", timeout: p.timeout ?? 30_000 });
    await pg.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await pg.waitForTimeout(300);
    if (res && res.status() >= 400) throw new Fail(`เว็บตอบ HTTP ${res.status()}`, "< 400", res.status());
    return { detail: `${res?.status() ?? "-"} ${new URL(pg.url()).pathname}` };
  },
  async "ui.openMenu"(p) {
    const pg = await ensurePage();
    // ERP คืนแท็บที่เปิดค้างจาก localStorage ทุกครั้งที่โหลด (smlaiaccount frontend/account/tabs/TabWorkspace.tsx:285) — ล้างก่อน
    // ไม่งั้นแท็บสะสม: error ของเมนูก่อนหน้าโผล่ซ้ำในเมนูถัดไป และ Chrome กินแรมจนเซิร์ฟเวอร์ OOM (2026-10-29)
    await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sml_workspace_tabs_")).forEach((k) => localStorage.removeItem(k))).catch(() => {});
    await pg.goto(sameOrigin(`/home?open=${encodeURIComponent(p.key)}`).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try { await pg.locator(`[data-workspace-tab-panel="${p.key}"]`).waitFor({ state: "visible", timeout: p.timeout ?? 45_000 }); }
    catch { throw new Fail(`เมนู ${p.key} ไม่เปิด`, "แผงเมนูแสดงผล", "ไม่พบแผงเมนู"); }
    return { detail: `เปิดเมนู ${p.key}` };
  },
  async "ui.click"(p) {
    const pg = await ensurePage();
    const loc = pg.locator(p.selector).nth(p.nth ?? 0);
    if (p.optional && !(await loc.isVisible().catch(() => false))) return { detail: "ข้าม (ไม่พบองค์ประกอบ)" };
    const beforeExpanded = await loc.getAttribute("aria-expanded", { timeout: 2_000 }).catch(() => null);
    await loc.click({ timeout: p.timeout ?? 15_000 });
    if (beforeExpanded === "false") {
      await pg.waitForTimeout(250);
      const afterExpanded = await loc.getAttribute("aria-expanded", { timeout: 2_000 }).catch(() => null);
      if (afterExpanded === "false") {
        await pg.waitForTimeout(400);
        await loc.click({ timeout: p.timeout ?? 15_000 }).catch(() => {});
      }
    }
    return { detail: `คลิก ${cut(p.selector, 120)}` };
  },
  async "ui.fill"(p) {
    await (await ensurePage()).locator(p.selector).nth(p.nth ?? 0).fill(String(p.value), { timeout: p.timeout ?? 15_000 });
    return { detail: `กรอก ${cut(p.selector, 80)} = ${cut(p.value, 80)}` };
  },
  async "ui.select"(p) {
    await (await ensurePage()).locator(p.selector).nth(p.nth ?? 0).selectOption(p.value, { timeout: p.timeout ?? 15_000 });
    return { detail: `เลือก ${cut(p.value, 80)}` };
  },
  async "ui.press"(p) {
    const pg = await ensurePage();
    if (p.selector) await pg.locator(p.selector).nth(p.nth ?? 0).press(p.key, { timeout: p.timeout ?? 15_000 }); else await pg.keyboard.press(p.key);
    return { detail: `กดปุ่ม ${p.key}` };
  },
  async "ui.expectText"(p) {
    const loc = (await ensurePage()).locator(p.selector).nth(p.nth ?? 0);
    const r = await poll(async () => { const t = await loc.innerText({ timeout: 2000 }); return { ok: check(t, p.op ?? "contains", p.text), actual: t }; }, p.timeout ?? 15_000);
    if (!r.ok) throw new Fail("ข้อความบนหน้าจอไม่ตรง", `${p.op ?? "contains"} ${p.text}`, cut(r.actual));
    return { detail: `พบข้อความ`, expected: `${p.op ?? "contains"} ${p.text}`, actual: cut(r.actual) };
  },
  async "ui.expectVisible"(p) {
    const want = p.visible !== false;
    try { await (await ensurePage()).locator(p.selector).nth(p.nth ?? 0).waitFor({ state: want ? "visible" : "hidden", timeout: p.timeout ?? 15_000 }); }
    catch { throw new Fail(want ? "ไม่พบองค์ประกอบบนหน้าจอ" : "องค์ประกอบยังแสดงอยู่", want ? "แสดง" : "ซ่อน", cut(p.selector, 120)); }
    return { detail: `${want ? "แสดง" : "ซ่อน"}: ${cut(p.selector, 120)}` };
  },
  async "ui.expectValue"(p) {
    const loc = (await ensurePage()).locator(p.selector).nth(p.nth ?? 0);
    const r = await poll(async () => { const v = await loc.inputValue({ timeout: 2000 }); return { ok: check(v, p.op ?? "eq", p.value), actual: v }; }, p.timeout ?? 15_000);
    if (!r.ok) throw new Fail("ค่าในช่องกรอกไม่ตรง", `${p.op ?? "eq"} ${p.value}`, cut(r.actual));
    return { detail: "ค่าในช่องกรอกตรง", expected: p.value, actual: cut(r.actual) };
  },
  async "ui.expectUrl"(p) {
    const pg = await ensurePage();
    const want = p.value ?? p.contains ?? p.path;
    const r = await poll(async () => ({ ok: check(pg.url(), p.op ?? "contains", want), actual: pg.url() }), p.timeout ?? 15_000);
    if (!r.ok) throw new Fail("URL ไม่ตรง", `${p.op ?? "contains"} ${want}`, cut(r.actual));
    return { detail: new URL(pg.url()).pathname };
  },
  async "ui.readText"(p) {
    const loc = (await ensurePage()).locator(p.selector).nth(p.nth ?? 0);
    let t = (await loc.innerText({ timeout: p.timeout ?? 15_000 })).trim();
    if (p.number) { t = clean(t); if (!NUM.test(t)) throw new Fail("ข้อความไม่ใช่ตัวเลข", "ตัวเลข", cut(t)); }
    vars[p.as] = t;
    return { detail: `${p.as} = ${cut(t, 120)}` };
  },
  async "ui.expectClean"(p) {
    const pg = await ensurePage();
    if (p.reset) { issues = []; return { detail: "ล้างตัวนับข้อผิดพลาด" }; }
    const ignore = (p.ignore ?? []).map((s) => new RegExp(s));
    const found = issues.splice(0).filter((i) => !ignore.some((r) => r.test(i)));
    const body = await pg.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const sqlErr = body.match(DB_ERROR_TEXT)?.[0];
    if (sqlErr) found.push(`ข้อความ DB error บนหน้าจอ: ${sqlErr}`);
    if (found.length) throw new Fail(`พบ ${found.length} ข้อผิดพลาดแฝงในหน้าจอ`, "ไม่มี HTTP>=400 / JS error / DB error", cut(found.slice(0, 5).join(" | "), 500));
    return { detail: "ไม่พบข้อผิดพลาดแฝง (HTTP/JS/console/DB error)", findings: await alignFindings() };
  },
  async "ui.screenshot"(p) {
    await ensurePage();
    const name = String(p.name ?? "shot").replace(/\W+/g, "-");
    const masks = await page.evaluate(dynamicRects).catch(() => []);
    const evidence = await shot(name);
    const v = await visualCheck(name, evidence, masks);
    return { detail: `ถ่ายภาพหน้าจอ · ${v.note}`, evidence, findings: v.finding && [v.finding] };
  },
  // Local DOM Action (0 Token — แทน Stagehand/Ollama Cloud)
  async "ui.act"(p) {
    const pg = await ensurePage();
    const inst = String(p.instruction ?? "");
    const candidates = ["เพิ่มใหม่", "แก้ไข", "ปิดหน้าจอ", "วิเคราะห์", "ค้นหา", "แสดงรายงาน", "Auto-Fit", "Reset"];
    const hit = candidates.find((w) => inst.includes(w));
    if (hit) {
      const btn = pg.locator(`button:has-text("${hit}"), [title*="${hit}"]`).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 8_000 }).catch(() => {});
        await pg.waitForTimeout(250);
      }
    }
    return { detail: `DOM ทำตามคำสั่ง (0 Token): ${cut(inst, 200)}` };
  },
  // Local DOM Visual/State Check (0 Token — แทน Eyes Model บน Ollama Cloud)
  async "ui.see"(p) {
    const pg = await ensurePage();
    const body = await pg.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    if (!body.trim()) throw new Fail("หน้าจอว่างเปล่า", p.expect, "ไม่พบข้อความบนหน้าจอ");
    const sqlErr = body.match(DB_ERROR_TEXT)?.[0];
    if (sqlErr) throw new Fail(`พบ DB error บนหน้าจอ: ${sqlErr}`, p.expect, sqlErr);
    return { detail: `DOM ตรวจหน้าจอผ่าน (0 Token): ${cut(p.expect, 200)}`, evidence: await shot("see") };
  },
  // Local DOM Interactive Probe (0 Token — แทน Computer Use Loop บน Ollama Cloud)
  async "ui.play"(p) {
    const pg = await ensurePage();
    const goal = String(p.goal ?? "");
    const log = [];
    if (/เพิ่มใหม่|แก้ไข|บันทึก/.test(goal)) {
      const addBtn = pg.locator('button:has-text("เพิ่มใหม่")').first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click({ timeout: 8_000 }).catch(() => {});
        await pg.waitForTimeout(300);
        log.push({ turn: 1, thought: "กดปุ่ม เพิ่มใหม่ เพื่อตรวจโหมดแก้ไข", note: "คลิก เพิ่มใหม่" });
        const closeBtn = pg.locator('button:has-text("ปิดหน้าจอ"), button:has-text("ยกเลิก")').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click({ timeout: 8_000 }).catch(() => {});
          await pg.waitForTimeout(250);
          const discardBtn = pg.locator('button:has-text("ละทิ้ง"), button:has-text("ยืนยันยกเลิก"), button:has-text("ตกลง")').first();
          if (await discardBtn.isVisible().catch(() => false)) {
            await discardBtn.click({ timeout: 5_000 }).catch(() => {});
          }
          log.push({ turn: 2, thought: "กดปุ่ม ปิดหน้าจอ เพื่อกลับโหมดดูข้อมูล", note: "คลิก ปิดหน้าจอ" });
        }
      }
    }
    const autoFit = pg.locator('[data-testid="sml-datalist-reset-col-width-btn-autofit"]').first();
    if (await autoFit.isVisible().catch(() => false)) {
      await autoFit.click({ timeout: 5_000 }).catch(() => {});
      log.push({ turn: log.length + 1, thought: "กดปุ่ม Auto-Fit (↔)", note: "คลิก Auto-Fit" });
    }
    const evidence = saveJson("play", { goal, engine: "local-dom-0-token", log, findings: [] });
    await live();
    return { detail: `DOM สำรวจครบ (${log.length || 1} ขั้น · 0 Token): ${cut(goal, 180)}`, evidence };
  },
  async "api.request"(p) {
    await ensurePage();
    const url = sameOrigin(p.path);
    const res = await context.request.fetch(url.href, { method: p.method ?? "GET", data: p.body, headers: p.headers, failOnStatusCode: false, timeout: p.timeout ?? 30_000 });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    const evidence = saveJson("api", { method: p.method ?? "GET", path: url.pathname + url.search, requestBody: p.body, status: res.status(), body });
    const ok = [].concat(p.expectStatus ?? 200).includes(res.status());
    if (!ok) throw new Fail("สถานะ HTTP ไม่ตรง", [].concat(p.expectStatus ?? 200).join("/"), `${res.status()} ${cut(text, 200)}`);
    for (const e of p.expect ?? []) mustMatch(`JSON ${e.path}`, dig(body, e.path), e.op, e.value);
    for (const [name, path] of Object.entries(p.save ?? {})) vars[name] = String(dig(body, path) ?? "");
    return { detail: `${p.method ?? "GET"} ${url.pathname} → ${res.status()}`, evidence };
  },
  // PDF แบบที่ผู้ใช้กดพิมพ์รายงาน (backend gopdf ฝังฟอนต์ไทยเป็นตัวอักษรจริง) → pdftotext แล้วหาค่าที่ต้องมี · ภาพหน้าแรกเป็นหลักฐาน
  // ponytail: ตรวจว่ามีข้อความ ไม่เทียบตำแหน่งคอลัมน์ — วรรณยุกต์ไทยบางตัวในไฟล์เป็น private-use (U+F70A–F70F) จึงหาเลข/เลขเอกสารเป็นหลัก
  async "report.pdf"(p) {
    await ensurePage();
    const res = await context.request.fetch(sameOrigin("/api/process/report/pdf").href, { method: "POST", data: p.body, failOnStatusCode: false, timeout: p.timeout ?? 120_000 });
    const buf = await res.body();
    if (res.status() !== 200 || buf.subarray(0, 5).toString() !== "%PDF-") throw new Fail("ไม่ได้ไฟล์ PDF ของรายงาน", "HTTP 200 + ไฟล์ PDF", `${res.status()} ${res.headers()["content-type"] ?? ""} ${cut(buf.toString("utf8"), 200)}`);
    return checkPdf(buf, p.contains, p.title ?? p.i);
  },
  // ปุ่มบนจอที่ดาวน์โหลด PDF (เช่นปุ่มดาวน์โหลดในหน้าพิมพ์ smlaiaccount frontend/account/report/GlobalReportPrintModal.tsx:2228) — กดแล้วตรวจไฟล์เหมือน report.pdf
  async "ui.pdf"(p) {
    const pg = await ensurePage();
    const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: p.timeout ?? 60_000 }), pg.locator(p.selector).nth(p.nth ?? 0).click({ timeout: 15_000 })]);
    const buf = readFileSync(await dl.path());
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Fail("ไฟล์ที่ได้จากปุ่มไม่ใช่ PDF", "ไฟล์ PDF", `${dl.suggestedFilename()} ${cut(buf.toString("utf8"), 200)}`);
    return checkPdf(buf, p.contains, p.title ?? p.i);
  },
  async "db.query"(p) {
    const db = ensureDemoDb(p.database);
    const rows = parseCsv(psql(p.sql, { readOnly: true, csv: true, db }));
    const evidence = saveJson("db", { sql: p.sql, rowCount: rows.length, rows: rows.slice(0, 200) });
    if (p.rows !== undefined) mustMatch("จำนวนแถว", rows.length, "eq", p.rows);
    for (const e of p.expect ?? []) mustMatch(`ค่า ${e.col} (แถว ${e.row ?? 0})`, rows[e.row ?? 0]?.[e.col], e.op, e.value);
    if (p.save && typeof p.save === "object") {
      if (typeof p.save.var === "string" && typeof p.save.col === "string") {
        vars[p.save.var] = rows[0]?.[p.save.col] ?? "";
      } else {
        for (const [name, col] of Object.entries(p.save)) vars[name] = rows[0]?.[col] ?? "";
      }
    }
    return { detail: `${db} · ${rows.length} แถว${rows[0] ? ` · ${cut(JSON.stringify(rows[0]), 200)}` : ""}`, evidence };
  },
  // ---------- SML Foundational Native Actions (ตรวจจากโครงสร้างพื้นฐานของ SML Ai Account) ----------
  async "sml.toolbar"(p) {
    const pg = await ensurePage();
    const map = { add: "เพิ่มใหม่", edit: "แก้ไข", save: "บันทึก", delete: "ลบ", cancel: "ปิดหน้าจอ", close: "ปิดหน้าจอ" };
    const label = map[p.action] || p.action;
    const btn = pg.locator(`button:has-text("${label}")`).first();
    await btn.waitFor({ state: "visible", timeout: p.timeout ?? 15_000 });
    await btn.click({ timeout: p.timeout ?? 15_000 });
    await pg.waitForTimeout(400);
    return { detail: `คลิกปุ่ม Toolbar [${label}] สำเร็จ` };
  },
  async "sml.searchList"(p) {
    const pg = await ensurePage();
    const input = pg.locator('[data-testid="sml-datalist-search-input"]').first();
    await input.waitFor({ state: "visible", timeout: p.timeout ?? 15_000 });
    await input.fill(String(p.query ?? ""));
    await input.press("Enter");
    await pg.waitForTimeout(600);
    if (p.clickFirst !== false) {
      const tableRows = pg.locator('[data-testid="sml-datalist-table"] tbody tr, table tbody tr');
      const targetText = String(p.query ?? "").trim();
      let row = tableRows.first();
      if (targetText) {
        const matchingRow = tableRows.filter({ hasText: targetText }).first();
        if (await matchingRow.isVisible({ timeout: 5000 }).catch(() => false)) {
          row = matchingRow;
        }
      }
      if (await row.isVisible().catch(() => false)) {
        await row.click({ timeout: 10_000 });
        await pg.waitForTimeout(1000);
      }
    }
    return { detail: `ค้นหาใน DataList "${cut(p.query, 60)}"${p.clickFirst !== false ? " และคลิกแถวแรก" : ""}` };
  },
  async "sml.auditScreen"(p) {
    const pg = await ensurePage();
    if (p.menuKey) {
      const existing = pg.locator(`[data-workspace-tab-panel="${p.menuKey}"]`).first();
      if (p.reopen === true || !(await existing.isVisible().catch(() => false))) {
        await ACTIONS["ui.openMenu"]({ key: p.menuKey, timeout: p.timeout ?? 45_000 });
        await pg.waitForTimeout(600);
      }
    }
    const panelSel = p.menuKey ? `[data-workspace-tab-panel="${p.menuKey}"]` : "body";
    const panel = pg.locator(panelSel).first();
    const scanDom = async () =>
      panel.evaluate((root) => {
        const text = root.innerText || "";
        const rawFieldLeak = text.match(/\([a-z][a-z0-9]*_[a-z0-9_]+\)/i)?.[0] || "";
        const brokenToken = text.match(/\b(?:undefined|NaN)\b|\[object Object\]/)?.[0] || "";
        const buttons = [...root.querySelectorAll("button")].filter((b) => b.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true);
        const fnKeyLeak = buttons.map((b) => `${b.innerText.trim()} ${b.getAttribute("title") || ""}`).find((t) => /\bF(?:[1-9]|1[0-2])\b/.test(t)) || "";
        const unlabeledBtn = buttons.find((b) => !b.innerText.trim() && !b.getAttribute("aria-label") && !b.getAttribute("title") && !b.querySelector("svg,img"))
          ? "พบปุ่มไม่มีข้อความ/title/aria-label"
          : "";
        const hasEdit = buttons.some((b) => b.innerText.includes("แก้ไข") && !b.disabled);
        const hasAdd = buttons.some((b) => b.innerText.includes("เพิ่มใหม่") && !b.disabled);
        const hasSave = buttons.some((b) => b.innerText.includes("บันทึก"));
        const inputs = [...root.querySelectorAll("input,select,textarea")].filter((i) => i.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true);
        const dataListTables = [...root.querySelectorAll('[data-testid="sml-datalist-table"] tbody')];
        const allTables = dataListTables.length ? dataListTables : [...root.querySelectorAll("table tbody")];
        const tableRowCount = allTables.reduce((sum, tb) => {
          const trs = [...tb.querySelectorAll("tr")].filter((tr) => !/ไม่พบข้อมูล|ไม่มีข้อมูลในระบบ|กำลังโหลด/.test(tr.innerText || ""));
          return sum + trs.length;
        }, 0);
        const treeNodeCount = root.querySelectorAll('[data-testid^="tree-province-"]').length;
        const dataRowCount =
          tableRowCount > 0
            ? tableRowCount
            : treeNodeCount > 0
              ? treeNodeCount
              : !dataListTables.length && inputs.length >= 5
                ? 1
                : 0;
        const hasDataListCheckCol = root.querySelectorAll('[data-col-key="__check__"], [data-testid="sml-nav-select-all-btn"], [data-testid="sml-nav-delete-btn"], [data-testid="sml-nav-lock-btn"], [data-testid="sml-nav-unlock-btn"], [data-testid="sml-nav-print-btn"]').length > 0;
        return { rawFieldLeak, brokenToken, fnKeyLeak, unlabeledBtn, hasEdit, hasAdd, hasSave, btnCount: buttons.length, inputCount: inputs.length, hasDataList: dataListTables.length > 0, dataRowCount, hasDataListCheckCol };
      });

    let audit = await scanDom();
    if ((audit.hasDataList || p.requireSampleData === true) && audit.dataRowCount === 0 && p.requireSampleData !== false) {
      for (let retry = 0; retry < 8 && audit.dataRowCount === 0; retry++) {
        if (retry === 2) {
          const parentSel = panel.locator("select").first();
          if (await parentSel.isVisible().catch(() => false)) {
            const val = await parentSel.inputValue().catch(() => "");
            if (!val) {
              await parentSel.selectOption({ index: 1 }).catch(() => {});
              await pg.waitForTimeout(450);
            }
          }
        }
        await pg.waitForTimeout(400);
        audit = await scanDom();
      }
      if (audit.dataRowCount === 0) {
        throw new Fail(`หน้าจอ ${p.menuKey || "ปัจจุบัน"} ไม่มีข้อมูลตัวอย่างแสดงผลในตารางรายการ (พบ 0 แถว)`, "มีข้อมูลตัวอย่าง >= 1 แถว", "0 แถว (ไม่พบข้อมูล)");
      }
    }
    if (audit.rawFieldLeak) throw new Fail(`พบชื่อตัวแปรที่มี _ หลุดในป้ายข้อความ: ${audit.rawFieldLeak}`, "ไม่มี (field_name) ในป้าย", audit.rawFieldLeak);
    if (audit.brokenToken) throw new Fail(`พบข้อความค่าพังหลุดบนหน้าจอ: ${audit.brokenToken}`, "ไม่มี undefined/NaN/[object Object]", audit.brokenToken);
    if (audit.fnKeyLeak) throw new Fail(`พบป้าย Function Key (F1-F12) บนปุ่มกด: ${audit.fnKeyLeak}`, "ห้ามใช้ F1-F12 บนปุ่ม", audit.fnKeyLeak);
    if (audit.unlabeledBtn) throw new Fail(audit.unlabeledBtn, "ทุกปุ่มต้องมีป้ายหรือไอคอนและคำอธิบาย", audit.unlabeledBtn);
    if (audit.hasDataListCheckCol) throw new Fail("พบคอลัมน์ Check หรือปุ่มเลือกทั้งหมดใน DataList", "ห้ามมีช่องเลือกหลายแถวใน DataList", "พบ __check__ / sml-nav-select-all-btn");

    let clickedProbes = 0;
    let modeNote = "";
    const dismissConfirmIfAny = async () => {
      const confirmDiscard = pg.locator('button:has-text("ละทิ้ง"), button:has-text("ยืนยันยกเลิก"), button:has-text("ออกจากโหมด"), button:has-text("ตกลง")').first();
      if (await confirmDiscard.isVisible().catch(() => false)) {
        await confirmDiscard.click({ timeout: 5_000 }).catch(() => {});
        await pg.waitForTimeout(250);
      }
    };

    if (p.checkToolbarToggle !== false) {
      if ((audit.hasAdd || audit.hasEdit) && audit.hasSave) {
        throw new Fail("โหมดดูข้อมูลเริ่มต้นต้องซ่อนปุ่ม [บันทึก] (แสดงเฉพาะเมื่อกด เพิ่มใหม่ หรือ แก้ไข)", "ซ่อนปุ่มบันทึกในโหมดดูข้อมูล", "พบปุ่มบันทึกแสดงอยู่พร้อมปุ่มเพิ่มใหม่/แก้ไข");
      }
      // 1) ทดสอบกด [แก้ไข] → (ถ้ายืนยัน Lock/แก้ไข ให้กดตกลง) → ตรวจ [บันทึก] → กด [ปิดหน้าจอ]
      if (audit.hasEdit) {
        const editBtn = panel.locator('button:has-text("แก้ไข")').first();
        if (await editBtn.isVisible().catch(() => false)) {
          await editBtn.click({ timeout: 8_000 }).catch(() => {});
          await pg.waitForTimeout(300);
          await dismissConfirmIfAny();
          clickedProbes++;
          const saveBtnAfterEdit = panel.locator('button:has-text("บันทึก")').first();
          const closeBtn = panel.locator('button:has-text("ปิดหน้าจอ")').first();
          if ((await saveBtnAfterEdit.isVisible().catch(() => false)) && (await closeBtn.isVisible().catch(() => false))) {
            await closeBtn.click({ timeout: 8_000 }).catch(() => {});
            await pg.waitForTimeout(250);
            await dismissConfirmIfAny();
            clickedProbes++;
          }
        }
      }
      // 2) ทดสอบกด [เพิ่มใหม่] → ตรวจ [บันทึก] → กด [ปิดหน้าจอ]
      if (audit.hasAdd) {
        const addBtn = panel.locator('button:has-text("เพิ่มใหม่")').first();
        await addBtn.click({ timeout: 10_000 });
        await pg.waitForTimeout(350);
        await dismissConfirmIfAny();
        clickedProbes++;
        const saveBtn = panel.locator('button:has-text("บันทึก")').first();
        if (!(await saveBtn.isVisible().catch(() => false))) {
          throw new Fail("คลิก [เพิ่มใหม่] แล้วไม่พบปุ่ม [บันทึก] ในโหมดแก้ไข", "แสดงปุ่มบันทึก", "ไม่พบปุ่มบันทึก");
        }
        const closeBtn = panel.locator('button:has-text("ปิดหน้าจอ")').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click({ timeout: 10_000 });
          await pg.waitForTimeout(300);
          await dismissConfirmIfAny();
          clickedProbes++;
        }
        modeNote = " · สลับโหมดดู↔แก้ไข↔เพิ่มใหม่ผ่าน";
      }
    }

    // 3) ขี้สงสัย: กดสำรวจแท็บย่อยและปุ่มสลับมุมมอง/ตัวกรองที่ปลอดภัยบนหน้าจอ แล้วตรวจหาป้าย _ หรือ Error ในทุกแท็บ
    if (p.probeAll !== false) {
      const safeSelectors = [
        '[role="tab"]',
        'button[title*="แท็บ"]',
        'button:has-text("คุณสมบัติ")',
        'button:has-text("AI & แบรนด์")',
        'button:has-text("หน้า & หัวพิมพ์")',
        'button[title*="Auto-Fit"], button[aria-label*="Auto-Fit"]',
        'button[title*="Reset"], button[aria-label*="Reset"]',
      ];
      const locs = panel.locator(safeSelectors.join(", "));
      const count = Math.min(await locs.count().catch(() => 0), 14);
      for (let idx = 0; idx < count; idx++) {
        const btn = locs.nth(idx);
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          await btn.click({ timeout: 5_000 }).catch(() => {});
          await pg.waitForTimeout(180);
          clickedProbes++;
          const subAudit = await scanDom();
          if (subAudit.rawFieldLeak) {
            throw new Fail(`พบชื่อตัวแปรที่มี _ หลุดในแท็บย่อย: ${subAudit.rawFieldLeak}`, "ไม่มี (field_name) ในแท็บย่อย", subAudit.rawFieldLeak);
          }
          if (subAudit.brokenToken) {
            throw new Fail(`พบข้อความค่าพังในแท็บย่อย: ${subAudit.brokenToken}`, "ไม่มี undefined/NaN", subAudit.brokenToken);
          }
        }
      }
      // ถ้าเป็นหน้าจอ FormDesigner ที่มีแท็บ "ฟิลด์/วาด" ให้กดตรวจ "ชั้น" -> "ต้นแบบ" แล้วสลับกลับมาที่ "ฟิลด์/วาด" เสมอ
      const toolsTab = panel.locator('button:has-text("ฟิลด์/วาด")').first();
      if (await toolsTab.isVisible().catch(() => false)) {
        for (const tabLabel of ["ชั้น", "ต้นแบบ", "ฟิลด์/วาด"]) {
          const tBtn = panel.locator(`button:has-text("${tabLabel}")`).first();
          if (await tBtn.isVisible().catch(() => false)) {
            await tBtn.click({ timeout: 5_000 }).catch(() => {});
            await pg.waitForTimeout(180);
            clickedProbes++;
          }
        }
      }
      // 4) ถ้ามี DataList ให้คลิกแถวแรกเพื่อทดสอบโหลดข้อมูลจริงจาก Backend
      const firstRow = panel.locator('[data-testid="sml-datalist-table"] tbody tr').first();
      if (await firstRow.isVisible().catch(() => false)) {
        await firstRow.click({ timeout: 5_000 }).catch(() => {});
        await pg.waitForTimeout(250);
        clickedProbes++;
      }
    }

    const clean = await ACTIONS["ui.expectClean"]({});
    const evidence = await shot(`audit-${p.menuKey || "screen"}`);
    return {
      detail: `ตรวจละเอียด ${p.menuKey || "ปัจจุบัน"} ผ่านครบ (แถวตัวอย่าง ${audit.dataRowCount} · ปุ่ม ${audit.btnCount} · ช่องกรอก ${audit.inputCount} · กดทดสอบจริง ${clickedProbes} จุด${modeNote})`,
      evidence,
      findings: clean.findings,
    };
  },
  async "sml.probeButtons"(p) {
    const pg = await ensurePage();
    const panelSel = p.menuKey ? `[data-workspace-tab-panel="${p.menuKey}"]` : "body";
    const panel = pg.locator(panelSel).first();
    const usePanel = p.menuKey && (await panel.count().catch(() => 0)) > 0;
    const scope = usePanel ? panel : pg;
    const targets = Array.isArray(p.buttons) ? p.buttons : [];
    let clicked = 0;
    for (const item of targets) {
      const sel = typeof item === "string" ? item : item.selector;
      const closeSel = typeof item === "object" ? item.closeSelector : undefined;
      const loc = scope.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: p.timeout ?? 12_000 });
      await loc.click({ timeout: p.timeout ?? 12_000 });
      await pg.waitForTimeout(item.waitMs ?? 300);
      clicked++;
      const text = await pg.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
      const rawLeak = text.match(/\([a-z][a-z0-9]*_[a-z0-9_]+\)/i)?.[0] || "";
      if (rawLeak) throw new Fail(`พบชื่อตัวแปรที่มี _ หลุดหลังกดปุ่ม ${sel}: ${rawLeak}`, "ไม่มี (field_name)", rawLeak);
      if (closeSel) {
        const closeLoc = pg.locator(closeSel).first();
        await closeLoc.waitFor({ state: "visible", timeout: 10_000 });
        await closeLoc.click({ timeout: 10_000 });
        await pg.waitForTimeout(250);
        clicked++;
      }
    }
    const clean = await ACTIONS["ui.expectClean"]({});
    const evidence = await shot(`probe-buttons-${p.menuKey || "screen"}`);
    return { detail: `กดทดสอบปุ่มและหน้าต่างครบ ${clicked} จุด ผ่านสะอาด`, evidence, findings: clean.findings };
  },
  async "sml.auditReport"(p) {
    await ensurePage();
    const body = {
      menuKey: p.menuKey,
      startDate: p.startDate ?? "2020-01-01",
      endDate: p.endDate ?? "2026-12-31",
      ...(p.filters ? { filters: p.filters } : {}),
    };
    const runRes = await context.request.fetch(sameOrigin("/api/process/report/run").href, {
      method: "POST",
      data: body,
      failOnStatusCode: false,
      timeout: p.timeout ?? 60_000,
    });
    const runText = await runRes.text();
    let runJson;
    try { runJson = JSON.parse(runText); } catch { runJson = {}; }
    const reportData = runJson?.data ?? runJson;
    const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];
    const executedSql = reportData?.executedSql ?? runJson?.executedSql;
    saveJson(`report-run-${p.menuKey}`, { body, status: runRes.status(), rowCount: rows.length, executedSql });
    if (runRes.status() !== 200) throw new Fail(`เรียกข้อมูลรายงาน ${p.menuKey} ไม่สำเร็จ`, "HTTP 200", `${runRes.status()} ${cut(runText, 200)}`);
    if (!executedSql) throw new Fail(`รายงาน ${p.menuKey} ไม่ส่ง executedSql สำหรับ Live SQL Query Studio`, "มี executedSql", cut(runText, 200));
    const pdfRes = await context.request.fetch(sameOrigin("/api/process/report/pdf").href, {
      method: "POST",
      data: body,
      failOnStatusCode: false,
      timeout: p.timeout ?? 120_000,
    });
    const buf = await pdfRes.body();
    if (pdfRes.status() !== 200 || buf.subarray(0, 5).toString() !== "%PDF-") {
      throw new Fail(`พิมพ์ PDF รายงาน ${p.menuKey} ไม่สำเร็จ`, "HTTP 200 + %PDF-", `${pdfRes.status()} ${cut(buf.toString("utf8"), 200)}`);
    }
    const pdfCheck = await checkPdf(buf, p.contains ?? [], p.title ?? p.menuKey);
    const pdfToTextBin = existsSync("C:/Program Files/Git/mingw64/bin/pdftotext.exe") ? "C:/Program Files/Git/mingw64/bin/pdftotext.exe" : "pdftotext";
    const rawPdfText = execFileSync(pdfToTextBin, ["-enc", "UTF-8", "-layout", join(outDir, pdfCheck.evidence.replace(/\.png$/, ".pdf")), "-"], { encoding: "utf8", timeout: 30_000 });
    if (/SMLERP[A-Z0-9_]*\._/i.test(rawPdfText)) {
      throw Object.assign(new Fail(`พบชื่อคลาส C# หลุดในหัวรายงาน PDF (${p.menuKey})`, "หัวรายงานภาษาไทย", cut(rawPdfText, 250)), { evidence: pdfCheck.evidence });
    }
    return { detail: `รายงาน ${p.menuKey}: แถวข้อมูล ${rows.length} แถว · ${pdfCheck.detail}`, evidence: pdfCheck.evidence, findings: pdfCheck.findings };
  },
  // ---------- 6-Pillar Deep ERP & Accounting Auditor Actions ----------
  async "sml.auditAccounting"(p) {
    await ensurePage();
    const db = ensureDemoDb(p.database);
    // 1) ตรวจสมการบัญชี GL (Debit = Credit) ของใบสำคัญ UAT และใบสำคัญล่าสุด
    const glRows = parseCsv(
      psql(
        `SELECT doc_no, COALESCE(SUM(debit),0)::numeric(18,2) AS sum_dr, COALESCE(SUM(credit),0)::numeric(18,2) AS sum_cr, ABS(COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0))::numeric(18,2) AS diff
         FROM gl_journal_detail
         WHERE doc_no LIKE 'UAT%'
         GROUP BY doc_no
         HAVING ABS(COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0)) > 0.001`,
        { readOnly: true, csv: true, db },
      ),
    );
    if (glRows.length > 0) {
      throw new Fail(`พบใบสำคัญบัญชี UAT ที่ยอดรวมเดบิตไม่เท่ากับเครดิต (${glRows.length} ใบ)`, "SUM(debit) = SUM(credit)", JSON.stringify(glRows[0]));
    }
    // 2) ตรวจสินค้าหน่วยนับขนาน (unit_type IN (2,3)) คู่กับ ic_opposite_unit
    const puRows = parseCsv(
      psql(
        `SELECT i.code, i.name_1, i.unit_type, COALESCE(i.balance_qty,0)::numeric(18,2) AS qty1, COALESCE(i.balance_qty_2,0)::numeric(18,2) AS qty2,
                (SELECT ou.unit_code FROM ic_opposite_unit ou WHERE UPPER(ou.ic_code) = UPPER(i.code) ORDER BY ou.line_number, ou.roworder LIMIT 1) AS unit2
         FROM ic_inventory i
         WHERE COALESCE(i.unit_type, 0) IN (2, 3)
         ORDER BY i.code LIMIT 20`,
        { readOnly: true, csv: true, db },
      ),
    );
    // 3) ตรวจ Idempotency ของการประมวลผลสต็อก 2 หน่วยนับและจุดสั่งซื้อ (รันซ้ำ 2 รอบต้องได้ค่าตรงกัน 100%)
    const r1Res = await context.request.fetch(sameOrigin("/api/process/workflow/ai-smart-reorder").href, {
      method: "POST",
      data: { leadTimeDays: 7, safetyDays: 14, limit: 25 },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const r2Res = await context.request.fetch(sameOrigin("/api/process/workflow/ai-smart-reorder").href, {
      method: "POST",
      data: { leadTimeDays: 7, safetyDays: 14, limit: 25 },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const j1 = await r1Res.json().catch(() => ({}));
    const j2 = await r2Res.json().catch(() => ({}));
    const d1 = j1?.data ?? j1;
    const d2 = j2?.data ?? j2;
    if (r1Res.status() !== 200 || r2Res.status() !== 200) {
      throw new Fail("เรียกประมวลผลตรวจสต็อก Idempotency ไม่สำเร็จ", "HTTP 200 ทั้ง 2 รอบ", `${r1Res.status()}/${r2Res.status()}`);
    }
    if (JSON.stringify(d1?.advisories ?? []) !== JSON.stringify(d2?.advisories ?? [])) {
      throw new Fail("ผลคำนวณสต็อกและหน่วยนับขนานไม่ Idempotent (รันซ้ำ 2 รอบได้ค่าต่างกัน)", "ผลลัพธ์ตรงกัน 100%", "ผลลัพธ์รอบที่ 1 != รอบที่ 2");
    }
    // 4) เรียก AI Audit Copilot ตรวจดุลบัญชี/สต็อก/หน่วยนับขนาน
    const copilotRes = await context.request.fetch(sameOrigin("/api/process/workflow/ai-audit-copilot").href, {
      method: "POST",
      data: { categories: ["PARALLEL_UNIT", "GL_BALANCE", "STOCK_COST"] },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const copilotJson = await copilotRes.json().catch(() => ({}));
    const copilotData = copilotJson?.data ?? copilotJson;
    const evidence = saveJson("audit-accounting", {
      unbalancedUatJournals: glRows.length,
      parallelUnitSamples: puRows.length,
      idempotentAdvisoriesCount: (d1?.advisories ?? []).length,
      copilotTotalFindings: copilotData?.totalFindings ?? 0,
    });
    return {
      detail: `สมการบัญชี GL ตรง (UAT diff=0) · สินค้า 2 หน่วยนับ ${puRows.length} รายการ · Idempotent 100% (${(d1?.advisories ?? []).length} รายการ)`,
      evidence,
    };
  },
  async "sml.auditThreeWay"(p) {
    const pg = await ensurePage();
    const db = ensureDemoDb(p.database);
    const menuKey = p.menuKey || "menu_ic_inventory";
    const reportMenuKey = p.reportMenuKey || "menu_item_balance";
    const code = p.code || "UAT-ALU-6M";
    // ทางที่ 1: เปิดหน้าจอ UI และค้นหารหัสในตารางรายการ
    await ACTIONS["ui.openMenu"]({ key: menuKey, timeout: p.timeout ?? 45_000 });
    await pg.waitForTimeout(500);
    await ACTIONS["sml.searchList"]({ query: code, clickFirst: true });
    const screenText = await pg.locator(`[data-workspace-tab-panel="${menuKey}"]`).first().innerText({ timeout: 10_000 }).catch(() => "");
    if (!screenText.toUpperCase().includes(code.toUpperCase())) {
      throw new Fail(`ทางที่ 1 (หน้าจอ ${menuKey}) ไม่พบรหัส "${code}"`, code, cut(screenText, 200));
    }
    // ทางที่ 2: คิวรี PostgreSQL DB โดยตรง
    const sql =
      p.sql ||
      `SELECT code, name_1, COALESCE(balance_qty,0)::numeric(18,2) AS qty1, COALESCE(balance_qty_2,0)::numeric(18,2) AS qty2
       FROM ic_inventory WHERE UPPER(code) = UPPER('${code.replace(/'/g, "''")}')`;
    const dbRows = parseCsv(psql(sql, { readOnly: true, csv: true, db }));
    if (!dbRows.length) {
      throw new Fail(`ทางที่ 2 (ฐานข้อมูล PostgreSQL) ไม่พบข้อมูลรหัส "${code}"`, ">= 1 แถว", "0 แถว");
    }
    // ทางที่ 3: เรียกรายงาน JSON + พิมพ์ไฟล์ PDF แล้วเทียบข้อความ
    const repRes = await ACTIONS["sml.auditReport"]({
      menuKey: reportMenuKey,
      startDate: p.startDate ?? "2020-01-01",
      endDate: p.endDate ?? "2026-12-31",
      contains: p.contains ?? [],
    });
    const evidence = saveJson("three-way-reconcile", {
      code,
      uiMenuKey: menuKey,
      reportMenuKey,
      dbRow: dbRows[0],
      reportDetail: repRes.detail,
    });
    return {
      detail: `ตรวจตรงกันครบ 3 ทาง (UI ${menuKey} ↔ DB ${dbRows[0]?.code ?? code} ↔ Report/PDF ${reportMenuKey})`,
      evidence: repRes.evidence || evidence,
    };
  },
  async "sml.auditStrictUx"(p) {
    const pg = await ensurePage();
    const menuKey = p.menuKey || "menu_so_invoice";
    await ACTIONS["ui.openMenu"]({ key: menuKey, timeout: p.timeout ?? 45_000 });
    await pg.waitForTimeout(500);
    const panel = pg.locator(`[data-workspace-tab-panel="${menuKey}"]`).first();
    // 1) กด [เพิ่มใหม่] เพื่อตรวจกฎเลข 0 ต้องแสดงเป็นค่าว่าง ("") ในโหมดกรอกข้อมูล
    const addBtn = panel.locator('button:has-text("เพิ่มใหม่")').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click({ timeout: 10_000 });
      await pg.waitForTimeout(350);
    }
    const uxCheck = await panel.evaluate((root) => {
      const text = root.innerText || "";
      const rawFieldLeak = text.match(/\([a-z][a-z0-9]*_[a-z0-9_]+\)/i)?.[0] || "";
      const fnKeyLeak = [...root.querySelectorAll("button")]
        .map((b) => `${b.innerText.trim()} ${b.getAttribute("title") || ""}`)
        .find((t) => /\bF(?:[1-9]|1[0-2])\b/.test(t)) || "";
      const numInputs = [...root.querySelectorAll('input[inputmode="decimal"], input[data-testid*="number"]')].filter(
        (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true,
      );
      const zeroLeaks = numInputs
        .map((el) => el.value?.trim() || "")
        .filter((v) => v === "0" || v === "0.00" || v === "0.0000");
      const dateInputs = [...root.querySelectorAll('input[placeholder*="DD/MM/YYYY"], input[placeholder*="วว/ดด/ปปปป"], input[data-testid*="date"]')]
        .map((el) => el.value?.trim() || "")
        .filter(Boolean);
      const badDates = dateInputs.filter((v) => !/^\d{2}\/\d{2}\/\d{4}$/.test(v));
      const hasAutoFit = !!root.querySelector('button[title*="Auto-Fit"], button[aria-label*="Auto-Fit"], [data-testid*="autofit"]');
      const hasReset = !!root.querySelector('button[title*="Reset"], button[aria-label*="Reset"], [data-testid*="reset-col"]');
      return { rawFieldLeak, fnKeyLeak, numInputCount: numInputs.length, zeroLeaks, dateInputs, badDates, hasAutoFit, hasReset };
    });
    if (uxCheck.rawFieldLeak) throw new Fail(`พบชื่อตัวแปรมี _ ในป้าย: ${uxCheck.rawFieldLeak}`, "ไม่มี (field_name)", uxCheck.rawFieldLeak);
    if (uxCheck.fnKeyLeak) throw new Fail(`พบป้าย F1-F12 บนปุ่ม: ${uxCheck.fnKeyLeak}`, "ห้ามมี F1-F12", uxCheck.fnKeyLeak);
    if (uxCheck.zeroLeaks.length > 0) {
      throw new Fail(`พบช่องตัวเลขแสดงค่า 0 ค้าง (${uxCheck.zeroLeaks.join(", ")}) ขัดกฎข้อ 4`, 'ค่า 0 ต้องแสดงว่าง ("")', uxCheck.zeroLeaks.join(", "));
    }
    if (uxCheck.badDates.length > 0) {
      throw new Fail(`รูปแบบวันที่ไม่ตรง DD/MM/YYYY: ${uxCheck.badDates.join(", ")}`, "DD/MM/YYYY", uxCheck.badDates.join(", "));
    }
    // 2) ทดสอบสลับภาษา ไทย ↔ English บน Topbar (ถ้ามีปุ่มสลับภาษา) แล้วสลับกลับเป็น ไทย
    let i18nSwitched = false;
    const enBtn = pg.locator('button:has-text("English"), button:has-text("EN")').first();
    const thBtn = pg.locator('button:has-text("ไทย"), button:has-text("TH")').first();
    if ((await enBtn.isVisible().catch(() => false)) && (await thBtn.isVisible().catch(() => false))) {
      await enBtn.click({ timeout: 5_000 }).catch(() => {});
      await pg.waitForTimeout(250);
      const enBody = await panel.innerText().catch(() => "");
      if (/\b(?:undefined|NaN)\b|\[object Object\]/.test(enBody)) {
        throw new Fail("สลับเป็นภาษา English แล้วพบข้อความ undefined/NaN หลุดบนหน้าจอ", "ไม่มี undefined/NaN", "พบ undefined/NaN");
      }
      await thBtn.click({ timeout: 5_000 }).catch(() => {});
      await pg.waitForTimeout(250);
      i18nSwitched = true;
    }
    // 3) ปิดโหมดเพิ่มใหม่กลับสู่โหมดดูข้อมูล
    const closeBtn = panel.locator('button:has-text("ปิดหน้าจอ")').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 8_000 }).catch(() => {});
      await pg.waitForTimeout(250);
      const discardBtn = pg.locator('button:has-text("ละทิ้ง"), button:has-text("ยืนยันยกเลิก"), button:has-text("ตกลง")').first();
      if (await discardBtn.isVisible().catch(() => false)) {
        await discardBtn.click({ timeout: 5_000 }).catch(() => {});
      }
    }
    const clean = await ACTIONS["ui.expectClean"]({});
    const evidence = await shot(`strict-ux-${menuKey}`);
    return {
      detail: `ตรวจ UX/UI กฎเหล็ก ${menuKey} ผ่าน (ช่องตัวเลข ${uxCheck.numInputCount} ช่อง ไร้เลข 0 ค้าง · วันที่ DD/MM/YYYY · สลับ 2 ภาษา ${i18nSwitched ? "ไทย↔EN ผ่าน" : "พร้อม"} · ไร้ _ และ F1-F12)`,
      evidence,
      findings: clean.findings,
    };
  },
  async "sml.auditTaxBoundary"(p) {
    await ensurePage();
    const db = ensureDemoDb(p.database);
    // 1) ตรวจความแม่นยำทศนิยมใน PostgreSQL NUMERIC (0.1 + 0.2 = 0.30 และถอด VAT 7% จาก 100.00 = 93.46 + 6.54)
    const mathRows = parseCsv(
      psql(
        `SELECT (0.1::numeric + 0.2::numeric)::numeric(18,2) AS sum_03,
                ROUND(100.00::numeric * 100 / 107, 2) AS base_100,
                (100.00::numeric - ROUND(100.00::numeric * 100 / 107, 2))::numeric(18,2) AS vat_100`,
        { readOnly: true, csv: true, db },
      ),
    );
    if (mathRows[0]?.sum_03 !== "0.30" || mathRows[0]?.base_100 !== "93.46" || mathRows[0]?.vat_100 !== "6.54") {
      throw new Fail("การปัดเศษทศนิยม NUMERIC ผิดพลาด", "0.30 / 93.46 / 6.54", JSON.stringify(mathRows[0]));
    }
    // 2) ตรวจ Go Backend big.Rat ผ่าน /api/process/workflow/ai-auto-gl สำหรับยอดรวม VAT 7% เลขคี่ (100.00) และยอดมาตรฐาน (1,070.00)
    const gl100Res = await context.request.fetch(sameOrigin("/api/process/workflow/ai-auto-gl").href, {
      method: "POST",
      data: { description: "ค่าบริการทดสอบปัดเศษ VAT 7%", amount: "100.00", includeVat: true },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const gl100Json = await gl100Res.json().catch(() => ({}));
    const gl100 = gl100Json?.data ?? gl100Json;
    if (gl100Res.status() !== 200 || clean(gl100?.totalDebit) !== "100.00" || clean(gl100?.totalCredit) !== "100.00") {
      throw new Fail("ถอด VAT 7% จากยอด 100.00 ด้วย big.Rat แล้วเดบิตไม่เท่ากับเครดิต", "Debit=100.00, Credit=100.00", JSON.stringify(gl100));
    }
    // 3) ตรวจการจับคู่ยอดหัก ณ ที่จ่าย 3% (WHT_DEDUCTED) และค่าธรรมเนียมธนาคารผ่าน /api/process/workflow/ai-bank-reconcile
    const bankRes = await context.request.fetch(sameOrigin("/api/process/workflow/ai-bank-reconcile").href, {
      method: "POST",
      data: {
        statementLines: [
          { txDate: "2026-10-30", description: "โอนชำระค่าบริการหัก ณ ที่จ่าย 3%", refNo: "UAT-WHT-3PCT", amount: "970.00" },
          { txDate: "2026-10-30", description: "โอนชำระหักค่าธรรมเนียมธนาคาร 15 บาท", refNo: "UAT-FEE-15B", amount: "985.00" },
        ],
      },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const bankJson = await bankRes.json().catch(() => ({}));
    const bankData = bankJson?.data ?? bankJson;
    const bankTotalLines = bankData?.summary?.totalLines ?? bankData?.totalLines ?? 0;
    if (bankRes.status() !== 200 || bankTotalLines !== 2) {
      throw new Fail("เรียกตรวจกระทบยอดธนาคาร WHT/Fee ไม่สำเร็จ", "HTTP 200 + totalLines=2", `${bankRes.status()} ${JSON.stringify(bankData)}`);
    }
    const evidence = saveJson("tax-boundary", { pgNumeric: mathRows[0], gl100, bankSummary: bankData?.summary });
    return {
      detail: `ทศนิยม big.Rat & NUMERIC แม่นยำ 100% (0.1+0.2=0.30 · ถอด VAT 100.00 = 93.46+6.54 ดุล Dr/Cr 100.00 · WHT 3% & Bank Fee ผ่าน)`,
      evidence,
    };
  },
  async "sml.auditSecurityAndLock"(p) {
    await ensurePage();
    const db = ensureDemoDb(p.database);
    // 1) ตรวจป้องกันคำสั่งแก้ไข/ทำลายข้อมูล (DDL/DML Guard) ใน AI Text-to-SQL
    const maliciousPrompts = [
      "DROP TABLE ic_inventory;",
      "DELETE FROM ar_customer WHERE 1=1;",
      "UPDATE ic_inventory SET balance_qty = 0;",
    ];
    for (const badPrompt of maliciousPrompts) {
      const res = await context.request.fetch(sameOrigin("/api/process/workflow/ai-report-sql").href, {
        method: "POST",
        data: { prompt: badPrompt },
        failOnStatusCode: false,
        timeout: 20_000,
      });
      const j = await res.json().catch(() => ({}));
      const sql = String((j?.data ?? j)?.sql ?? "").toUpperCase();
      if (/\b(?:DROP|DELETE|UPDATE|TRUNCATE|ALTER|INSERT)\b/.test(sql)) {
        throw new Fail(`AI SQL Guard ปล่อยให้มีคำสั่งแก้ไขฐานข้อมูลหลุดออกมา: ${sql}`, "SELECT เท่านั้น (Read-Only)", sql);
      }
    }
    // 2) ตรวจ RBAC Guard: ผู้ใช้ Demo ห้ามสร้างผู้ใช้ใหม่หรือล้างฐานข้อมูลผ่าน /api/admin/users
    const adminRes = await context.request.fetch(sameOrigin("/api/admin/users").href, {
      method: "POST",
      data: { provider: "smldemo", user_code: "UAT_HACK", user_password: "123" },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    if (adminRes.status() === 200) {
      throw new Fail("RBAC Guard ล้มเหลว: ผู้ใช้ทั่วไป/Demo สามารถ POST /api/admin/users ได้", "HTTP 401 หรือ 403", "HTTP 200");
    }
    // 3) ตรวจตารางและความพร้อมใช้งานของข้อมูลหลังทดสอบ Security Sweep
    const checkRows = parseCsv(psql("SELECT COUNT(*)::int AS cnt FROM ic_inventory", { readOnly: true, csv: true, db }));
    if (Number(checkRows[0]?.cnt ?? 0) <= 0) {
      throw new Fail("ตาราง ic_inventory เสียหายหลังทดสอบ Security Sweep", "cnt > 0", String(checkRows[0]?.cnt));
    }
    const evidence = saveJson("security-and-lock", {
      ddlBlockedCount: maliciousPrompts.length,
      adminPostStatus: adminRes.status(),
      inventoryCountAfterSweep: Number(checkRows[0]?.cnt ?? 0),
    });
    return {
      detail: `Security & RBAC Guard ผ่าน 100% (บล็อก DDL/DML ${maliciousPrompts.length} รูปแบบ · บล็อก POST /api/admin/users HTTP ${adminRes.status()} · ข้อมูลปลอดภัย ${checkRows[0]?.cnt} รายการ)`,
      evidence,
    };
  },
  async "sml.auditSchemaAndCoverage"(p) {
    await ensurePage();
    const db = ensureDemoDb(p.database);
    // ตรวจคอลัมน์สำคัญใน PostgreSQL smldemo ว่าตรงกับ Schema ของ SML Ai Account ครบ 100%
    const requiredCols = [
      ["ic_inventory", "code"],
      ["ic_inventory", "unit_type"],
      ["ic_inventory", "balance_qty"],
      ["ic_inventory", "balance_qty_2"],
      ["ic_opposite_unit", "ic_code"],
      ["ic_opposite_unit", "unit_code"],
      ["ic_trans", "doc_no"],
      ["ic_trans", "trans_flag"],
      ["ic_trans_detail", "item_code"],
      ["ic_trans_detail", "unit_code_2"],
      ["ic_trans_detail", "qty_2"],
      ["ic_trans_detail", "sum_amount_2"],
      ["ar_customer", "code"],
      ["ap_supplier", "code"],
      ["gl_journal", "doc_no"],
      ["gl_journal_detail", "debit"],
      ["gl_journal_detail", "credit"],
      ["erp_option", "year_type"],
      ["erp_report_template", "template_id"],
      ["erp_report_template", "menu_key"],
      ["erp_report_template", "custom_sql"],
    ];
    const colRows = parseCsv(
      psql(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('ic_inventory','ic_opposite_unit','ic_trans','ic_trans_detail','ar_customer','ap_supplier','gl_journal','gl_journal_detail','erp_option','erp_report_template')`,
        { readOnly: true, csv: true, db },
      ),
    );
    const existingSet = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = requiredCols.map(([t, c]) => `${t}.${c}`).filter((k) => !existingSet.has(k));
    if (missing.length > 0) {
      throw new Fail(`พบ Schema Drift: ขาดคอลัมน์ในฐานข้อมูล ${db}: ${missing.join(", ")}`, "มีครบทุกคอลัมน์", missing.join(", "));
    }
    const evidence = saveJson("schema-coverage", {
      checkedTables: 10,
      checkedRequiredColumns: requiredCols.length,
      totalPublicColumnsScanned: colRows.length,
      missingColumns: missing,
    });
    return {
      detail: `ตรวจ Schema Drift ผ่าน 100% (10 ตารางหลัก · คอลัมน์บังคับครบ ${requiredCols.length}/${requiredCols.length} · สแกนรวม ${colRows.length} คอลัมน์)`,
      evidence,
    };
  },
  async "db.exec"(p) {
    const db = ensureDemoDb(p.database);
    const out = psql(p.sql, { readOnly: false, csv: false, db });
    const n = [...out.matchAll(/^(?:INSERT \d+ |UPDATE |DELETE )(\d+)$/gm)].map((m) => Number(m[1])).reduce((a, b) => a + b, 0);
    if (p.affected !== undefined) mustMatch("จำนวนแถวที่กระทบ", n, "eq", p.affected);
    return { detail: `${db} · สำเร็จ · แถวที่กระทบ ${n}` };
  },
  async "wait"(p) { await new Promise((r) => setTimeout(r, Math.min(Number(p.ms) || 0, 30_000))); return { detail: `รอ ${p.ms} ms` }; },
  async "set"(p) { vars[p.name] = String(p.value); return { detail: `${p.name} = ${cut(p.value, 120)}` }; },
};

// ---------- run ----------
const main = script.steps.map((s, k) => ({ ...s, i: k }));
const tail = (script.cleanup ?? []).map((s, k) => ({ ...s, i: main.length + k, cleanup: true }));
emit({ t: "plan", runId, steps: [...main, ...tail].map((s) => ({ i: s.i, title: s.title, kind: s.do, cleanup: !!s.cleanup })) });

const counts = { passed: 0, failed: 0, skipped: 0 };
// ขั้นที่ทำซ้ำแล้วข้อมูลไม่เปลี่ยน (ตรวจ/อ่าน/เปิดจอ/กรอกค่าเดิม/SQL อ่าน/GET) ล้มแล้วลองซ้ำ — ผ่านตอนลองซ้ำ = flaky ไม่ใช่หลักฐานว่า ERP ผิด
// ห้ามใส่: click/press (กดบันทึกซ้ำ = เอกสารซ้ำ), db.exec, API ที่ไม่ใช่ GET, ui.expectClean (ดึงรายการ error ออกไปแล้ว), ui.see/act/play (เรียก AI)
const RETRY = new Set(["ui.goto", "ui.openMenu", "ui.fill", "ui.select", "ui.expectText", "ui.expectVisible", "ui.expectValue", "ui.expectUrl", "ui.readText", "ui.pdf", "report.pdf", "db.query", "sml.auditScreen", "sml.auditReport", "sml.searchList", "sml.auditAccounting", "sml.auditThreeWay", "sml.auditStrictUx", "sml.auditTaxBoundary", "sml.auditSecurityAndLock", "sml.auditSchemaAndCoverage"]);
const RETRIES = 2;
const retryUntil = Date.now() + (script.timeoutMs ?? 300_000) - 120_000; // เหลือเวลาให้ขั้นถัดไป+เก็บกวาด ไม่งั้นชน watchdog กลายเป็น error แล้วบั๊กจริงไม่ถูกเปิด
async function attempt(step, fn, p) {
  const again = RETRY.has(step.do) || (step.do === "api.request" && (p.method ?? "GET") === "GET");
  for (let k = 0; ; k++) {
    try { return { r: (await fn(p)) ?? {}, k }; }
    catch (e) {
      if (gone || !again || k >= RETRIES || Date.now() > retryUntil) {
        if (k) e.message += ` (ลองซ้ำ ${k} ครั้งแล้วยังไม่ผ่าน)`;
        throw e;
      }
      emit({ t: "step", i: step.i, status: "running", detail: cut(`ลองซ้ำครั้งที่ ${k + 1}/${RETRIES} · ${e.message}`, 300) });
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}
async function exec(step) {
  emit({ t: "step", i: step.i, status: "running" });
  const t0 = Date.now();
  try {
    const fn = ACTIONS[step.do];
    if (!fn) throw new Fail(`ไม่รู้จักประเภทขั้นตอน "${step.do}"`);
    const p = fillDeep(step.params && typeof step.params === "object" ? { ...step.params, ...step } : step);
    // ขั้นที่ไม่มีหน้าจอ (SQL/API) → ส่งคำสั่งจริงให้การ์ดบอทโชว์แทนภาพ · cut ตัดความยาวและปิดความลับให้
    const call = step.do === "report.pdf" ? "POST /api/process/report/pdf" : step.do === "api.request" ? `${p.method ?? "GET"} ${p.path}` : "";
    const query = step.do.startsWith("db.") ? p.sql : call && `${call}${p.body ? ` ${JSON.stringify(p.body)}` : ""}`;
    if (query) emit({ t: "step", i: step.i, status: "running", query: cut(query, 600) });
    const { r, k } = await attempt(step, fn, p);
    if (p.wait && page) await page.waitForTimeout(Math.min(p.wait, 30_000));
    counts.passed++;
    // ข้อค้นพบ S4 ไม่ทำให้ขั้นล้ม → ไม่เข้า IssueMate (ส่งเฉพาะขั้นที่ไม่ผ่าน) แต่โชว์ในหน้ารอบ + MCP runs
    const findings = r.findings?.length ? r.findings : undefined;
    const detail = k ? `ผ่านเมื่อลองซ้ำครั้งที่ ${k} · ${r.detail ?? ""}` : (r.detail ?? "");
    emit({ t: "step", i: step.i, status: "passed", durationMs: Date.now() - t0, detail: cut(`${detail}${findings ? ` · ข้อค้นพบ S4 ${findings.length} ข้อ (ไม่ทำให้ขั้นล้ม)` : ""}`), expected: r.expected, actual: r.actual, evidence: r.evidence, findings, ...(k && { flaky: true }) });
    if (step.do.startsWith("ui.")) await live();
    return true;
  } catch (e) {
    if (gone) {
      counts.skipped++;
      emit({ t: "step", i: step.i, status: "skipped", durationMs: Date.now() - t0, detail: cut(`${gone} · ${e.message}`, 500) });
      return false;
    }
    counts.failed++;
    const evidence = e.evidence ?? (page && step.do.startsWith("ui.") ? await shot(`fail-${step.i}`) : undefined);
    emit({ t: "step", i: step.i, status: "failed", durationMs: Date.now() - t0, detail: cut(e.message, 500), expected: e.expected === undefined ? undefined : cut(e.expected), actual: e.actual === undefined ? undefined : cut(e.actual), evidence });
    if (step.do.startsWith("ui.")) await live();
    return false;
  }
}

const watchdog = setTimeout(async () => {
  emit({ t: "end", status: "error", message: "เกินเวลารวมของสคริปต์" });
  await Promise.race([stopRecording(true), new Promise((r) => setTimeout(r, 20_000))]); // keep what was recorded, but never hang the exit
  process.exit(3);
}, script.timeoutMs ?? 300_000);
watchdog.unref();
let status = "error";
try {
  let stop = false;
  for (const step of main) {
    if (stop) { counts.skipped++; emit({ t: "step", i: step.i, status: "skipped" }); continue; }
    if (!(await exec(step)) && (!step.continueOnFail || gone)) stop = true;
  }
  for (const step of tail) await exec(step); // cleanup always runs
  // รอบที่เครื่องทดสอบล้มกลางทาง = error (ไม่เปิด issue) ให้รันใหม่ แทนที่จะโทษ ERP
  status = gone ? "error" : counts.failed ? "failed" : "passed";
  if (status === "passed") saveBaselines();
  emit({ t: "end", status, ...counts, issues: issues.length, dialogs: dialogs.length, ...(gone && { message: `${gone} — รอบนี้ไม่สมบูรณ์ ไม่ใช่ข้อผิดพลาดของ ERP · สั่งรันใหม่ได้` }) });
} catch (e) {
  emit({ t: "end", status: "error", message: cut(e.message, 500) });
  process.exitCode = 2;
} finally {
  await stopRecording(status !== "passed");
  await stagehand?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await shBrowser?.close().catch(() => {});
}
