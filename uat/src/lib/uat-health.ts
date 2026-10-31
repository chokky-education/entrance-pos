import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HealthCheck as Check, HealthReport } from "@/types/bot";
import { checkBrain, MODEL_KEYS } from "./brain";
import { checkIssueMate } from "./issuemate";
import { loadSharedDbConfig } from "./sml-foundation";
import { getSettings } from "./swarm-store";

const run = promisify(execFile);

const cut = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 220);

async function ping(url: string, label: string): Promise<Check> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    return { ok: res.status < 500, message: `${label}ตอบกลับ HTTP ${res.status}` };
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return { ok: false, message: `เชื่อมต่อ${label}ไม่ได้ (${cause?.code ?? cause?.message ?? (e as Error).message})` };
  }
}

export const psqlRead = (sql: string, timeout = 8000) => psql(sql, { timeout });

export async function psql(sql: string, { db, write = false, timeout = 8000 }: { db?: string; write?: boolean; timeout?: number } = {}): Promise<string> {
  const e = process.env;
  const cfg = loadSharedDbConfig();
  const targetDb = db || cfg.database;
  const { stdout } = await run(e.UAT_PSQL || "C:/Program Files/PostgreSQL/18/bin/psql.exe", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql], {
    timeout,
    maxBuffer: 4 << 20,
    env: {
      ...e,
      PGHOST: cfg.host,
      PGPORT: cfg.port,
      PGUSER: cfg.user,
      PGPASSWORD: cfg.password,
      PGDATABASE: targetDb,
      PGOPTIONS: write ? "" : "-c default_transaction_read_only=on",
    },
  });
  return stdout;
}

async function checkDb(): Promise<Check> {
  const cfg = loadSharedDbConfig();
  if (!cfg.host || !cfg.user || !cfg.database) {
    return { ok: false, message: "ยังไม่ได้ตั้ง UAT_PG_HOST / UAT_PG_USER / UAT_PG_DATABASE ใน .env.local" };
  }
  try {
    const db = (await psqlRead("select current_database()")).trim();
    const allow = (process.env.UAT_PG_ALLOW_DB || "domepos,uat_domepos").split(",").map((x) => x.trim());
    return allow.includes(db)
      ? { ok: true, message: `ต่อฐานข้อมูล ${db} (${cfg.host}:${cfg.port}) สำเร็จ` }
      : { ok: false, message: `ต่ออยู่กับฐาน "${db}" ซึ่งไม่อยู่ในรายการที่อนุญาต (${allow.join(", ")}) — ตัวรันจะปฏิเสธทุกขั้นตอน db.*` };
  } catch (err) {
    return { ok: false, message: `ต่อฐานข้อมูลไม่ได้: ${cut(String((err as { stderr?: string }).stderr || (err as Error).message))}`.replaceAll(cfg.password || "\u0000", "***") };
  }
}

export async function checkAll(): Promise<HealthReport> {
  const s = getSettings();
  const [erp, db, brain, issuemate] = await Promise.all([ping(s.erpTargetUrl, "เว็บ DOME Pos "), checkDb(), checkBrain(MODEL_KEYS.map((k) => s[k])), checkIssueMate()]);
  return { erp: { ...erp, url: s.erpTargetUrl }, db, brain, issuemate, timestamp: new Date().toISOString() };
}
