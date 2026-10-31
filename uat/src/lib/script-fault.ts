import { ScriptRun, StepResult } from "@/types/bot";
import menuList from "./erp-menus.json";

const OWN_ERROR = /^(psql ผิดพลาด|ไม่มีตัวแปร \{\{)|^AI ทำไม่จบใน \d+ ตา/;
const PREP = new Set(["set", "ui.demoLogin", "ui.expectClean", "db.query"]);
const MENUS = new Set(menuList.map(([key]) => key));

function ownFault(s: StepResult, steps: StepResult[]) {
  const d = s.detail ?? "";
  if (OWN_ERROR.test(d)) return true;
  if (s.kind === "db.query" && s.actual === "0" && steps.every((p) => p.i >= s.i || PREP.has(p.kind))) return true;
  if (s.kind === "api.request" && /^(404 <!DOCTYPE|405\b|400 .*กรุณาระบุ)/i.test(s.actual ?? "")) return true;
  const menu = s.kind === "ui.openMenu" ? /^เมนู (\S+) ไม่เปิด/.exec(d)?.[1] : undefined;
  return !!menu && !MENUS.has(menu);
}

export function scriptFault(run: ScriptRun) {
  const failed = run.steps.filter((s) => s.status === "failed" && !s.cleanup);
  return failed.length > 0 && failed.every((s) => ownFault(s, run.steps)) ? failed[0] : undefined;
}

export const DESIGN = `- ช่องตัวเลขแสดงศูนย์เป็นช่องว่าง
- ปุ่ม toolbar ของจออยู่ใน div ใต้ header และเป็นระบบ 2 โหมด (View Mode ↔ Edit Mode)
- ตารางรายการ (datalist) มีปุ่ม Auto-Fit (↔), Reset (↺) และปรับคอลัมน์`;

// เลิกใช้ Ollama Cloud Triage — เปิด ticket ทันทีเมื่อไม่ผ่านตามกฎลุงจืด (0 Token)
export async function aiTriage(_run: ScriptRun, _outDir: string, _model: string): Promise<string | undefined> {
  return undefined;
}
