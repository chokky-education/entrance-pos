"use client";

import React, { useEffect, useState } from "react";
import { Play, ShieldCheck, CircleCheck, CircleX, Loader2, Database, Calculator, Layers, Sparkles, Lock, GitCompare } from "lucide-react";
import { ScriptRun, UatScript } from "@/types/bot";
import { fmtAgo } from "@/lib/format";

interface Props {
  scripts: UatScript[];
  runs: ScriptRun[];
  busy: boolean;
  onRun: (scriptIds: string[]) => void;
  onOpenRun: (runId: string) => void;
}

interface CoverageSummary {
  blueprint: {
    totalMenus: number;
    masterSchemas: number;
    transMenus: number;
    apiRoutes: number;
    backendProcessRoutes: number;
  };
  coverage: {
    totalScripts: number;
    e2eScripts: number;
    deepAuditScripts: number;
    coveredMenuCount: number;
    coveredApiCount: number;
    passedRunsCount: number;
  };
}

const DEEP_AUDIT_PILLARS: {
  id: string;
  pillarNo: number;
  badge: string;
  actionTag: string;
  accent: string;
  icon: "accounting" | "threeway" | "ux" | "tax" | "security" | "schema";
  checkpoints: string[];
}[] = [
  {
    id: "uat-deep-audit-01-accounting-integrity",
    pillarNo: 1,
    badge: "สมการบัญชี & สต็อก Idempotent",
    actionTag: "sml.auditAccounting",
    accent: "#10b981",
    icon: "accounting",
    checkpoints: ["SUM(debit) = SUM(credit)", "สต็อก 2 หน่วยนับ (unit_type 2,3)", "รันซ้ำ 2 รอบได้ค่าเดิม 100%"],
  },
  {
    id: "uat-deep-audit-02-three-way-reconcile",
    pillarNo: 2,
    badge: "ตรวจตรงกัน 3 ทาง (UI ↔ DB ↔ PDF)",
    actionTag: "sml.auditThreeWay",
    accent: "#06b6d4",
    icon: "threeway",
    checkpoints: ["หน้าจอ UI DataList/Form", "ตารางจริงใน PostgreSQL", "JSON รายงาน + ไฟล์ PDF"],
  },
  {
    id: "uat-deep-audit-03-strict-ux-rules",
    pillarNo: 3,
    badge: "กฎเหล็ก UX/UI มาตรฐาน SML",
    actionTag: "sml.auditStrictUx",
    accent: "#f59e0b",
    icon: "ux",
    checkpoints: ['เลข 0 แสดงว่าง ("")', "ไร้ _ และ F1-F12 · ตาราง Auto-Fit", "สลับ 2 ภาษา ไทย↔EN & พ.ศ./ค.ศ."],
  },
  {
    id: "uat-deep-audit-04-tax-decimal-boundary",
    pillarNo: 4,
    badge: "ทศนิยม big.Rat & ภาษี VAT/WHT",
    actionTag: "sml.auditTaxBoundary",
    accent: "#a855f7",
    icon: "tax",
    checkpoints: ["0.1 + 0.2 = 0.30 (NUMERIC)", "ถอด VAT 7% ยอด 100 = 93.46 + 6.54", "หัก ณ ที่จ่าย 3% & ค่าธรรมเนียมธนาคาร"],
  },
  {
    id: "uat-deep-audit-05-security-rbac-lock",
    pillarNo: 5,
    badge: "ความปลอดภัย API, RBAC & SQL Guard",
    actionTag: "sml.auditSecurityAndLock",
    accent: "#ef4444",
    icon: "security",
    checkpoints: ["บล็อก DDL/DML ใน AI SQL 100%", "RBAC บล็อกสิทธิ์ /api/admin/users", "ป้องกัน SQL Injection ใน DataList"],
  },
  {
    id: "uat-deep-audit-06-schema-coverage-drift",
    pillarNo: 6,
    badge: "ตรวจ Schema Drift & ความครอบคลุม",
    actionTag: "sml.auditSchemaAndCoverage",
    accent: "#3b82f6",
    icon: "schema",
    checkpoints: ["เทียบ 10 ตารางหลักกับ PostgreSQL", "ตรวจคอลัมน์หน่วยนับขนานครบ 100%", "ตรวจ Live Blueprint Menu & API"],
  },
];

function PillarIcon({ kind, className }: { kind: string; className?: string }) {
  switch (kind) {
    case "accounting":
      return <Calculator className={className} />;
    case "threeway":
      return <GitCompare className={className} />;
    case "ux":
      return <Sparkles className={className} />;
    case "tax":
      return <Layers className={className} />;
    case "security":
      return <Lock className={className} />;
    default:
      return <Database className={className} />;
  }
}

export const DeepAuditSuiteCard: React.FC<Props> = ({ scripts, runs, busy, onRun, onOpenRun }) => {
  const [cov, setCov] = useState<CoverageSummary | null>(null);

  useEffect(() => {
    fetch("/api/coverage")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setCov(d);
      })
      .catch(() => {});
  }, [runs.length, scripts.length]);

  const deepScripts = DEEP_AUDIT_PILLARS.map((p) => ({
    ...p,
    script: scripts.find((s) => s.id === p.id),
  })).filter((x) => !!x.script);

  if (!deepScripts.length) return null;

  const latestByScript = new Map<string, ScriptRun>();
  for (const r of runs) {
    if (!deepScripts.some((s) => s.id === r.scriptId)) continue;
    const prev = latestByScript.get(r.scriptId);
    if (!prev || (prev.queuedAt ?? "") < (r.queuedAt ?? "")) {
      latestByScript.set(r.scriptId, r);
    }
  }

  const passedCount = deepScripts.filter((s) => latestByScript.get(s.id)?.status === "passed").length;
  const runningCount = deepScripts.filter((s) => {
    const st = latestByScript.get(s.id)?.status;
    return st === "running" || st === "queued";
  }).length;
  const failedCount = deepScripts.filter((s) => {
    const st = latestByScript.get(s.id)?.status;
    return st === "failed" || st === "error";
  }).length;

  return (
    <section
      data-testid="deep-audit-suite-card"
      className="glass spot relative overflow-hidden rounded-3xl border border-emerald-400/25 p-5 sm:p-6 shadow-xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white whitespace-normal break-words">
                  ระบบตรวจสอบเชิงลึก 6 มิติ (6-Pillar Deep ERP & Accounting Auditor)
                </h2>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[0.7rem] font-bold text-emerald-200 ring-1 ring-emerald-300/30">
                  {passedCount}/{deepScripts.length} มิติผ่านครบ
                </span>
                {runningCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[0.7rem] font-bold text-amber-200">
                    <Loader2 className="h-3 w-3 animate-spin" /> กำลังตรวจ {runningCount} มิติ
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[0.7rem] font-bold text-rose-200">
                    ไม่ผ่าน {failedCount} มิติ
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-300 whitespace-normal break-words leading-relaxed">
                ตรวจสอบความถูกต้องระดับโปรแกรมบัญชีมาตรฐาน SML Ai Account: สมการบัญชี Dr=Cr & สต็อก 2 หน่วยนับ · ความตรงกัน 3 ทาง (UI ↔ DB ↔ PDF) · กฎเหล็ก UX/UI · ทศนิยม big.Rat & ภาษี VAT/WHT · ความปลอดภัย RBAC/SQL Guard · และตรวจ Schema Drift สดกับ PostgreSQL
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-testid="run-all-deep-audit-btn"
          disabled={busy || runningCount > 0}
          onClick={() => onRun(deepScripts.map((s) => s.id))}
          className="btn-primary baseline-center shrink-0 gap-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>รันตรวจเชิงลึกครบทั้ง {deepScripts.length} มิติ</span>
        </button>
      </div>

      {cov && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">เมนูใน Live Blueprint</div>
            <div className="mt-0.5 text-base font-extrabold text-white">{cov.blueprint.totalMenus} เมนู</div>
            <div className="text-[0.65rem] text-emerald-300">Master {cov.blueprint.masterSchemas} · Trans {cov.blueprint.transMenus}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">เมนูที่มีบอทตรวจแล้ว</div>
            <div className="mt-0.5 text-base font-extrabold text-cyan-300">{cov.coverage.coveredMenuCount} หน้าจอ/รายงาน</div>
            <div className="text-[0.65rem] text-slate-400">จากคลังสคริปต์ {cov.coverage.totalScripts} ชุด</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">API Routes ในระบบ</div>
            <div className="mt-0.5 text-base font-extrabold text-violet-300">{cov.blueprint.apiRoutes} Routes</div>
            <div className="text-[0.65rem] text-slate-400">Go Process {cov.blueprint.backendProcessRoutes} จุด</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">ชุดทดสอบ E2E ครบวงจร</div>
            <div className="mt-0.5 text-base font-extrabold text-amber-300">{cov.coverage.e2eScripts} สายงาน</div>
            <div className="text-[0.65rem] text-slate-400">ซื้อ · ขาย · 2 หน่วยนับ · AI</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">ชุดตรวจเชิงลึก 6 มิติ</div>
            <div className="mt-0.5 text-base font-extrabold text-emerald-300">{cov.coverage.deepAuditScripts} ระบบ</div>
            <div className="text-[0.65rem] text-slate-400">6 Native Audit Engines</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5">
            <div className="text-[0.68rem] text-slate-400">Schema Drift (PostgreSQL)</div>
            <div className="mt-0.5 text-base font-extrabold text-emerald-400">0 คอลัมน์ขาด</div>
            <div className="text-[0.65rem] text-slate-400">ตรงกับ domepos 100%</div>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {deepScripts.map((item) => {
          const sc = item.script!;
          const r = latestByScript.get(sc.id);
          const isRunning = r?.status === "running" || r?.status === "queued";
          const isPassed = r?.status === "passed";
          const isFailed = r?.status === "failed" || r?.status === "error";

          return (
            <div
              key={sc.id}
              data-testid={`deep-audit-card-${sc.id}`}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-emerald-400/40 hover:bg-white/[0.05]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      style={{ backgroundColor: `${item.accent}22`, color: item.accent }}
                    >
                      <PillarIcon kind={item.icon} className="h-4 w-4" />
                    </span>
                    <span
                      className="inline-block rounded-lg px-2 py-0.5 text-[0.68rem] font-bold"
                      style={{ backgroundColor: `${item.accent}22`, color: item.accent }}
                    >
                      มิติที่ {item.pillarNo} · {item.badge}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.68rem] font-bold text-amber-200">
                        <Loader2 className="h-3 w-3 animate-spin" /> กำลังรัน
                      </span>
                    ) : isPassed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[0.68rem] font-bold text-emerald-300">
                        <CircleCheck className="h-3.5 w-3.5" /> ผ่าน {r.passed}/{r.steps.length || sc.stepCount} ขั้น
                      </span>
                    ) : isFailed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[0.68rem] font-bold text-rose-300">
                        <CircleX className="h-3.5 w-3.5" /> ไม่ผ่าน {r?.failed ?? 1} ขั้น
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.68rem] text-slate-400">
                        พร้อมรัน ({sc.stepCount} ขั้น)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => r && onOpenRun(r.id)}
                  disabled={!r}
                  className="mt-2 block w-full text-left"
                >
                  <h3 className="text-sm font-bold leading-snug text-slate-100 whitespace-normal break-words">
                    {sc.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400 whitespace-normal break-words">
                    {sc.description}
                  </p>
                </button>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 font-mono text-[0.65rem] text-emerald-200">
                    {item.actionTag}
                  </span>
                  {item.checkpoints.map((cp, idx) => (
                    <span
                      key={idx}
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[0.66rem] font-medium text-slate-200 whitespace-normal break-words"
                    >
                      ✓ {cp}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[0.7rem]">
                <div className="min-w-0 flex-1 text-slate-400 whitespace-normal break-words">
                  {r ? (
                    <button
                      type="button"
                      onClick={() => onOpenRun(r.id)}
                      className="text-left text-cyan-300 hover:underline whitespace-normal break-words"
                    >
                      รอบล่าสุด {r.id} · {fmtAgo(r.finishedAt ?? r.startedAt ?? r.queuedAt)}
                    </button>
                  ) : (
                    <span>{sc.id}</span>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`run-deep-audit-${sc.id}`}
                  disabled={busy || isRunning}
                  onClick={() => onRun([sc.id])}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>รันมิตินี้</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
