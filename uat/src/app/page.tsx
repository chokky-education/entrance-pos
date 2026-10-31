"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { BotConfig, HealthReport, ScriptRun, SwarmSettings, UatScript } from "@/types/bot";
import { call } from "@/lib/http";
import { Navbar } from "@/components/Navbar";
import { HeroStats } from "@/components/HeroStats";
import { BotCard } from "@/components/BotCard";
import { RunPanel } from "@/components/RunPanel";
import { BotConsoleModal } from "@/components/BotConsoleModal";
import { BroadcastModal } from "@/components/BroadcastModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ActivityFx } from "@/components/ActivityFx";
import { McpCard } from "@/components/McpCard";
import { DeliveryReport } from "@/components/DeliveryReport";
import { NightlyCard } from "@/components/NightlyCard";
import { E2eSuiteCard } from "@/components/E2eSuiteCard";
import { DeepAuditSuiteCard } from "@/components/DeepAuditSuiteCard";

type ScriptErr = { file: string; error: string };

export default function Home() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [runs, setRuns] = useState<ScriptRun[]>([]);
  const [scripts, setScripts] = useState<UatScript[]>([]);
  const [scriptErrors, setScriptErrors] = useState<ScriptErr[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [settings, setSettings] = useState<SwarmSettings | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [consoleBotId, setConsoleBotId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState<ScriptRun | null>(null); // รอบที่เปิดจากลิงก์ /?run=<id> (หน้าแนวโน้ม) — เก่าเกินกว่า /api/runs ส่งมาให้ก็ยังเปิดได้

  const [admin, setAdmin] = useState(false); // ผู้ดูแลเข้าสู่ระบบ Google แล้ว = เห็นปุ่มสั่งงานบนแถบบน
  const [quickCmd, setQuickCmd] = useState("");
  const [cmdSending, setCmdSending] = useState(false);
  const [webCommands, setWebCommands] = useState<{ id: string; prompt: string; status: string; createdAt: string; note?: string }[]>([]);
  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const [b, r, c] = await Promise.all([
        call<{ bots: BotConfig[] }>("/api/bots"),
        call<{ runs: ScriptRun[] }>("/api/runs"),
        call<{ commands: { id: string; prompt: string; status: string; createdAt: string; note?: string }[] }>("/api/swarm/broadcast").catch(() => ({ commands: [] })),
      ]);
      setBots(b.bots);
      setRuns(r.runs);
      setWebCommands(c.commands ?? []);
    } catch (e) {
      say(false, `โหลดข้อมูลไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  const submitQuickCommand = async (textOverride?: string) => {
    const cmd = (textOverride ?? quickCmd).trim();
    if (!cmd || cmdSending) return;
    setCmdSending(true);
    try {
      const d = await call<{ message?: string }>("/api/swarm/broadcast", { targetBotIds: [], prompt: cmd, taskTitle: cmd.slice(0, 40) });
      setQuickCmd("");
      say(true, d.message || "รับคำสั่งแล้ว — ส่งให้ Gemini วางแผนการทดสอบหลายหน้าจอพร้อมกัน");
      await refresh();
    } catch (e) {
      say(false, `สั่งงานไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setCmdSending(false);
    }
  };

  const loadScripts = useCallback(async () => {
    try {
      const d = await call<{ scripts: UatScript[]; errors: ScriptErr[] }>("/api/scripts");
      setScripts(d.scripts);
      setScriptErrors(d.errors);
    } catch (e) {
      say(false, `อ่านสคริปต์ไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  const checkHealth = useCallback(async () => {
    try {
      setHealth(await call<HealthReport>("/api/health"));
    } catch (e) {
      say(false, `ตรวจสถานะระบบไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("run");
    if (!id) return;
    setSelectedRunId(id);
    call<{ run: ScriptRun }>(`/api/runs/${encodeURIComponent(id)}`).then((d) => setPinned(d.run), () => {});
  }, []);

  useEffect(() => {
    refresh();
    loadScripts();
    checkHealth();
    call<{ settings: SwarmSettings }>("/api/settings").then((d) => setSettings(d.settings), () => {});
  }, [refresh, loadScripts, checkHealth]);

  const active = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const sending = runs.some((r) => r.issue?.status === "sending");
  useEffect(() => {
    const t = setInterval(refresh, active || sending ? 1500 : 5000);
    return () => clearInterval(t);
  }, [refresh, active, sending]);
  useEffect(() => {
    const t = setInterval(checkHealth, 30_000);
    return () => clearInterval(t);
  }, [checkHealth]);

  // เรียงตามลำดับการทำงานจริง: กำลังรัน → รอคิว → เพิ่งจบงานล่าสุด (แสดงผลล่าสุดของแต่ละสคริปต์ สูงสุดไม่เกิน 32 รายการ)
  const seenScripts = new Set<string>();
  const recentRuns = [...runs]
    .sort(
      (a, b) =>
        Number(b.status === "running") - Number(a.status === "running") ||
        Number(b.status === "queued") - Number(a.status === "queued") ||
        (b.finishedAt ?? b.startedAt ?? b.queuedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? a.queuedAt ?? ""),
    )
    .filter((r) => {
      if (r.status === "running" || r.status === "queued") return true;
      if (seenScripts.has(r.scriptId)) return false;
      seenScripts.add(r.scriptId);
      return true;
    })
    .slice(0, 32);

  const start = async (body: object) => {
    setBusy(true);
    try {
      const d = await call<{ runs: ScriptRun[]; unknown: string[] }>("/api/runs", body);
      say(true, `เข้าคิวแล้ว ${d.runs.length} สคริปต์${d.unknown?.length ? ` · ไม่พบ ${d.unknown.join(", ")}` : ""}`);
      if (d.runs[0]) setSelectedRunId(d.runs[0].id);
      await refresh();
    } catch (e) {
      say(false, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stopRun = async (id: string) => {
    try {
      await call(`/api/runs/${id}`, { action: "stop" });
      await refresh();
    } catch (e) {
      say(false, (e as Error).message);
    }
  };

  const sendIssue = async (id: string) => {
    say(true, "สมอง AI กำลังวิเคราะห์และเปิด issue ใน IssueMate…");
    setTimeout(refresh, 300);
    try {
      const { run } = await call<{ run: ScriptRun }>(`/api/runs/${id}`, { action: "issuemate" });
      const i = run.issue;
      say(i?.status !== "error", i?.status === "sent" ? `เปิด issue ${i.code} แล้ว` : i?.status === "duplicate" ? `ไม่ส่งซ้ำ — ${i.message}` : `ส่งไม่สำเร็จ: ${i?.message}`);
    } catch (e) {
      say(false, (e as Error).message);
    }
    await refresh();
  };

  // แสงตามเมาส์บนการ์ด .spot
  const onPointerMove = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".spot");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const gap = "gap-[clamp(1rem,1.6vw,2.25rem)]";
  return (
    <>
      <Navbar
        target={settings?.erpTargetUrl ?? ""}
        health={health}
        activeRuns={active}
        busy={busy || !scripts.length}
        onRunAll={() => start({ all: true })}
        onBroadcast={() => setBroadcastOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        admin={admin}
        onAdmin={setAdmin}
        onError={(m) => say(false, m)}
      />

      <main onPointerMove={onPointerMove} className="mx-auto w-full max-w-[170rem] space-y-[clamp(1.5rem,2.6vw,3.5rem)] px-[clamp(1rem,2.2vw,3.5rem)] py-[clamp(1.25rem,2.6vw,3.5rem)]">
        {admin && (
          <section className="spot glass rounded-3xl border border-cyan-400/25 p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="baseline-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 pulse-dot" />
                <h2 className="text-base font-bold text-white">ป้อนคำสั่งทดสอบ (ส่งให้ Gemini วางแผนการทดสอบหลายหน้าจอพร้อมกัน → ทดสอบ → แก้บั๊ก → ทดสอบซ้ำจนผ่าน 100%)</h2>
              </div>
              <span className="text-xs text-cyan-200/80">อ่านโครงสร้างโค้ดจริงสดจาก backend/ และ frontend/ เสมอ</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitQuickCommand();
              }}
              className="mt-3 flex flex-wrap items-center gap-2.5"
            >
              <input
                type="text"
                value={quickCmd}
                onChange={(e) => setQuickCmd(e.target.value)}
                placeholder="พิมพ์คำสั่งทดสอบที่นี่ เช่น ตรวจหน้าจอขาย ซื้อ สินค้า ประเภทภาษี ธนาคาร และสมการบัญชี GL พร้อมกัน..."
                className="min-w-[18rem] flex-1 rounded-2xl border border-white/15 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-slate-400 outline-none focus:border-cyan-300/60"
              />
              <button
                type="submit"
                disabled={!quickCmd.trim() || cmdSending}
                className="btn-primary baseline-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {cmdSending ? "กำลังส่งคำสั่ง…" : "สั่งวางแผนและทดสอบ"}
              </button>
            </form>
            {webCommands.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-slate-400">คำสั่งล่าสุด:</span>
                {webCommands.slice(0, 3).map((c) => (
                  <span key={c.id} className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 whitespace-normal break-words">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.status === "completed" ? "bg-emerald-400" : "bg-amber-400 pulse-dot"}`} />
                    <span className="font-medium text-white whitespace-normal break-words">{c.prompt}</span>
                    {c.note && <span className="text-emerald-300 whitespace-normal break-words">· {c.note}</span>}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        <E2eSuiteCard
          scripts={scripts}
          runs={runs}
          busy={busy}
          onRun={(scriptIds) => start({ scriptIds })}
          onOpenRun={setSelectedRunId}
        />

        <DeepAuditSuiteCard
          scripts={scripts}
          runs={runs}
          busy={busy}
          onRun={(scriptIds) => start({ scriptIds })}
          onOpenRun={setSelectedRunId}
        />
        <div className={`grid items-start ${gap} 2xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.42fr)]`}>
          <div className={`grid min-w-0 ${gap}`}>
            <section>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold">รายการทดสอบตามลำดับการทำงานล่าสุด ({recentRuns.length} รายการ · สูงสุดไม่เกิน 32)</h2>
                <p className="text-[0.8rem] text-slate-400">แสดงเฉพาะงานที่กำลังรันและเพิ่งรันล่าสุดตามลำดับเวลา · กดที่จอเพื่อดูทุกขั้นตอนและภาพหลักฐาน · ▶ รันสคริปต์นั้นซ้ำ</p>
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
                {recentRuns.map((r, i) => {
                  const b = bots.find((x) => x.id === r.botId) ?? bots.find((x) => x.role === r.module && x.lens === r.lens) ?? bots[0];
                  if (!b) return null;
                  return (
                    <BotCard
                      key={r.id}
                      i={i}
                      bot={b}
                      run={r}
                      queued={0}
                      scriptCount={1}
                      onRun={(scriptOrBotId) => start(scriptOrBotId.startsWith("bot-") ? { botIds: [scriptOrBotId] } : { scriptIds: [scriptOrBotId] })}
                      onOpen={setConsoleBotId}
                      onOpenRun={setSelectedRunId}
                    />
                  );
                })}
              </div>
            </section>
          </div>

          <div className="min-w-0 2xl:sticky 2xl:top-[5.5rem]">
            <RunPanel runs={pinned && !runs.some((r) => r.id === pinned.id) ? [...runs, pinned] : runs} selectedId={selectedRunId} onSelect={setSelectedRunId} onStop={stopRun} onIssue={sendIssue} issueMateUrl={health?.issuemate.url} />
          </div>
        </div>

        <HeroStats bots={bots} scripts={scripts} runs={runs} />
        <DeliveryReport runs={runs} onOpenRun={setSelectedRunId} />
        <NightlyCard runs={runs} onOpenRun={setSelectedRunId} />
        <McpCard admin={admin} say={say} />
      </main>

      <BotConsoleModal
        bot={bots.find((b) => b.id === consoleBotId) ?? null}
        scripts={scripts}
        runs={runs}
        busy={busy}
        onClose={() => setConsoleBotId(null)}
        onRun={(id) => start({ botIds: [id] })}
        onOpenRun={(id) => {
          setSelectedRunId(id);
          setConsoleBotId(null);
        }}
        onAsked={refresh}
      />
      <BroadcastModal open={broadcastOpen} bots={bots} onClose={() => setBroadcastOpen(false)} onSent={(ok, text) => (say(ok, text), refresh())} />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        health={health}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setSettings(s);
          say(true, "บันทึกการตั้งค่าเรียบร้อย");
          checkHealth();
        }}
        onRecheck={checkHealth}
        onReset={async () => {
          try {
            await call("/api/bots", { action: "reset" });
            say(true, "รีเซ็ตสถานะบอททั้งหมดแล้ว");
            await refresh();
          } catch (e) {
            say(false, (e as Error).message);
          }
        }}
      />

      <ActivityFx onActivity={refresh} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
          <div role="status" className={`rise glass flex max-w-[40rem] items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold ${toast.ok ? "text-emerald-100" : "text-rose-100"}`}>
            {toast.ok ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-300" /> : <TriangleAlert className="h-5 w-5 shrink-0 text-rose-300" />}
            {toast.text}
          </div>
        </div>
      )}
    </>
  );
}
