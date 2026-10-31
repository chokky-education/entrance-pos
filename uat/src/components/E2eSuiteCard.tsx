"use client";

import React from "react";
import { ArrowRight, CheckCircle2, Database, Eye, Play, Workflow } from "lucide-react";
import { ScriptRun, UatScript } from "@/types/bot";
import { MODULES } from "@/lib/swarm-data";
import { fmtSpan, fmtTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

interface E2eSuiteCardProps {
  scripts: UatScript[];
  runs: ScriptRun[];
  busy: boolean;
  onRun: (scriptIds: string[]) => void;
  onOpenRun: (runId: string) => void;
}

const FLOW_STAGES: Record<string, string[]> = {
  "pos-starter-cafe-beer-ui-e2e": [
    "1. เปิดหน้าเว็บโหมดเจ้าของคนเดียว (/)",
    "2. เลือกโต๊ะ B1 + ความหวาน 50% + เพิ่มช็อต",
    "3. สั่งกาแฟสด + คราฟต์เบียร์ + ครัวซองต์ (400฿)",
    "4. พักบิลลงโต๊ะ B1 → ดึงบิลชำระ QR PromptPay",
    "5. ตรวจใบเสร็จย่อ/สติกเกอร์แก้ว + KDS + รายงานปิดกะ",
  ],
  "pos-e2e-api-db-gl-report": [
    "1. Bootstrap เครื่อง POS-01 & ตรวจ ThaiFi Wallet",
    "2. บันทึกบิลขาย POST /api/pos/bills (370.00฿)",
    "3. ตรวจ pos_bill_inbox + ic_trans + cb_trans",
    "4. ตรวจสมุดรายวัน GL (Dr = Cr = 370.00฿ ดุลเป๊ะ)",
    "5. ทดสอบ Restore/Sync & ยกเลิกบิล /api/pos/shift",
  ],
  "pos-data-reconcile-and-promo-audit": [
    "1. ตรวจรหัสเครื่อง pos_id (POS-01) & คลังสินค้า",
    "2. ตรวจค่าเริ่มต้น posconfig (VAT 7.00%)",
    "3. ตรวจสูตรโปรโมชั่น pos_promotions & แต้มสะสม",
    "4. กระทบยอดบัญชี GL ทุกบิลขาย POS (gl_diff = 0.00)",
    "5. กระทบยอด ic_trans เทียบ cb_trans (mismatch = 0)",
  ],
};

export const E2eSuiteCard: React.FC<E2eSuiteCardProps> = ({ scripts, runs, busy, onRun, onOpenRun }) => {
  const e2eScripts = scripts.filter((s) => s.lens === "e2e" || s.id.startsWith("pos-") || s.id.startsWith("uat-e2e-"));
  if (!e2eScripts.length) return null;

  const latestByScript = new Map<string, ScriptRun>();
  for (const r of runs) {
    if (!e2eScripts.some((s) => s.id === r.scriptId)) continue;
    const prev = latestByScript.get(r.scriptId);
    const prevTs = prev?.finishedAt ?? prev?.startedAt ?? prev?.queuedAt ?? "";
    const curTs = r.finishedAt ?? r.startedAt ?? r.queuedAt ?? "";
    if (!prev || curTs >= prevTs) {
      latestByScript.set(r.scriptId, r);
    }
  }

  const passedCount = e2eScripts.filter((s) => latestByScript.get(s.id)?.status === "passed").length;
  const runningCount = e2eScripts.filter((s) => {
    const st = latestByScript.get(s.id)?.status;
    return st === "running" || st === "queued";
  }).length;
  const totalSteps = e2eScripts.reduce((sum, s) => sum + s.stepCount, 0);

  return (
    <section data-testid="e2e-suite-section" className="glass spot rounded-3xl border border-cyan-400/25 p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <Workflow className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="whitespace-normal break-words text-xl font-extrabold leading-snug text-white">
                ระบบทดสอบ E2E ครบวงจร (End-to-End Business Workflow Suite)
              </h2>
              <p className="mt-0.5 whitespace-normal break-words text-[0.82rem] leading-relaxed text-slate-300">
                จำลองการทำงานจริงข้ามระบบตั้งแต่ต้นน้ำถึงปลายน้ำ (ซื้อ → สต็อก 2 หน่วยนับ → ขาย → บัญชี GL → รายงาน PDF → AI Copilot) พร้อมตรวจฐานข้อมูล PostgreSQL ทุกขั้นตอน
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs">
            <span className="font-semibold text-cyan-300">ทั้งหมด {e2eScripts.length} ชุด</span>
            <span className="text-slate-600">·</span>
            <span className="font-semibold text-emerald-300">ผ่านครบวงจร {passedCount}/{e2eScripts.length}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">รวม {totalSteps} ขั้นตอน</span>
            {runningCount > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-semibold text-amber-300">กำลังรัน {runningCount} ชุด</span>
              </>
            )}
          </div>

          <button
            data-testid="run-all-e2e-btn"
            onClick={() => onRun(e2eScripts.map((s) => s.id))}
            disabled={busy || runningCount > 0}
            className="btn-primary baseline-center gap-2 rounded-2xl px-4 py-2.5 text-[0.82rem] font-bold text-white disabled:opacity-40"
          >
            <Play className="h-4 w-4 fill-current" />
            รัน E2E ครบวงจรทั้งหมด ({e2eScripts.length} ชุด)
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {e2eScripts.map((s, idx) => {
          const mod = MODULES.find((m) => m.role === s.module);
          const last = latestByScript.get(s.id);
          const stages = FLOW_STAGES[s.id] ?? [];
          const isRunning = last?.status === "running" || last?.status === "queued";
          const doneSteps = last ? last.steps.filter((st) => st.status === "passed").length : 0;

          return (
            <article
              key={s.id}
              data-testid={`e2e-card-${s.id}`}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-300/35"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
                      <span className="rounded-full bg-cyan-400/15 px-2.5 py-0.5 font-bold text-cyan-200">
                        E2E #{idx + 1} · ครบวงจร
                      </span>
                      {mod && (
                        <span
                          className="rounded-full px-2.5 py-0.5 font-semibold"
                          style={{ background: `${mod.accent}22`, color: mod.accent }}
                        >
                          {mod.roleTitle.replace(/^UAT /, "")}
                        </span>
                      )}
                      <span className="rounded-full border border-rose-400/30 bg-rose-500/15 px-2 py-0.5 font-bold text-rose-200">
                        {s.severityOnFail}
                      </span>
                      <span className="font-mono text-slate-400">{s.id}</span>
                    </div>

                    <h3 className="mt-2 whitespace-normal break-words text-[0.95rem] font-bold leading-snug text-white">
                      {s.title}
                    </h3>
                    <p className="mt-1 whitespace-normal break-words text-[0.78rem] leading-relaxed text-slate-300">
                      {s.description}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {last ? (
                      <StatusBadge status={last.status} />
                    ) : (
                      <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[0.7rem] text-slate-400">
                        พร้อมรัน
                      </span>
                    )}
                  </div>
                </div>

                {stages.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/30 p-3">
                    <div className="mb-1.5 text-[0.7rem] font-semibold text-cyan-200/90">
                      ลำดับขั้นตอน Flow การทดสอบ E2E ข้ามระบบ:
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem]">
                      {stages.map((st, stIdx) => (
                        <React.Fragment key={st}>
                          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 whitespace-normal break-words text-slate-200">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                            <span>{st}</span>
                          </span>
                          {stIdx < stages.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-slate-500" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[0.74rem]">
                <div className="flex flex-wrap items-center gap-3 text-slate-300">
                  <span className="font-semibold text-emerald-300">
                    {last ? `ผ่าน ${doneSteps}/${s.stepCount} ขั้น` : `${s.stepCount} ขั้นตอน`}
                  </span>
                  {s.usesDb && (
                    <span className="baseline-center gap-1 text-cyan-300">
                      <Database className="h-3.5 w-3.5" />
                      ตรวจ PostgreSQL & API
                    </span>
                  )}
                  {last && (
                    <span className="text-slate-400">
                      รอบ {last.id} · {fmtTime(last.finishedAt ?? last.startedAt)} ({fmtSpan(last.startedAt, last.finishedAt)})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {last && (
                    <button
                      onClick={() => onOpenRun(last.id)}
                      className="baseline-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[0.74rem] font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      ดูผลทุกขั้นตอน
                    </button>
                  )}
                  <button
                    data-testid={`run-e2e-${s.id}`}
                    onClick={() => onRun([s.id])}
                    disabled={busy || isRunning}
                    className="baseline-center gap-1.5 rounded-xl bg-cyan-400/15 px-3.5 py-1.5 text-[0.75rem] font-bold text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-40"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    รัน E2E ชุดนี้
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
