import { getSmlFoundationGuide } from "./sml-foundation";

export type Tool = { name: string; description?: string; inputSchema?: unknown };

const SML_BRAIN_MCP_URL = process.env.SML_BRAIN_MCP_URL || "https://brain.smlwork.com/mcp";
let brainCatalog: { at: number; tools: Tool[] } | undefined;

async function callBrainMcpRpc(method: string, params: object, timeoutMs = 15_000): Promise<any> {
  const res = await fetch(SML_BRAIN_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) {
    throw new Error(`SML Brain MCP ตอบ ${j?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return j.result;
}

export async function smlTools(): Promise<Tool[] | undefined> {
  if (brainCatalog && Date.now() - brainCatalog.at < 10 * 60_000) return brainCatalog.tools;
  const tools = (await callBrainMcpRpc("tools/list", {}).catch(() => undefined))?.tools;
  if (!Array.isArray(tools)) return undefined;
  brainCatalog = { at: Date.now(), tools };
  return tools;
}

export async function smlCall(name: string, args: object): Promise<string> {
  const a = (args ?? {}) as Record<string, any>;
  const normArgs =
    name === "ask_brain"
      ? { question: String(a.question ?? a.query ?? "").slice(0, 500) }
      : name === "search_brain"
        ? { query: String(a.query ?? a.question ?? "").slice(0, 300), ...(typeof a.limit === "number" ? { limit: a.limit } : {}) }
        : args;
  const r = await callBrainMcpRpc("tools/call", { name, arguments: normArgs });
  const text = ((r?.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");
  if (r?.isError) throw new Error(`SML Brain MCP: ${text.slice(0, 200)}`);
  return text;
}

const ctxCache = new Map<string, Promise<string>>();

// ใช้คู่มือโครงสร้างโค้ดจริงในเครื่อง + ค้น SML Brain MCP (https://brain.smlwork.com/mcp)
export async function smlContext(task: string): Promise<string> {
  const base = getSmlFoundationGuide();
  const q = String(task || "").trim().slice(0, 500);
  if (q.length < 2) return base;
  if (ctxCache.size > 50) ctxCache.clear();
  if (!ctxCache.has(q)) {
    ctxCache.set(
      q,
      smlCall("ask_brain", { question: q })
        .then((brainText) => (brainText.trim() ? `${base}\n\n=== ความรู้จาก SML Brain MCP (${SML_BRAIN_MCP_URL}) ===\n${brainText.trim()}` : base))
        .catch(() => base),
    );
  }
  return ctxCache.get(q)!;
}

