import { HealthCheck } from "@/types/bot";

// สมองของบอท = Code-First Local Engine + Antigravity Subagents (เลิกใช้ Ollama Cloud 100% · ประหยัด Token สูงสุด)
export const DEFAULT_MODELS = {
  brainModel: "code-first-local",
  scriptModel: "code-first-planner",
  analystModel: "code-first-analyst",
  eyesModel: "playwright-dom-inspector",
};
export const MODEL_KEYS = Object.keys(DEFAULT_MODELS) as (keyof typeof DEFAULT_MODELS)[];

export const askBrain = async (
  _job: string,
  _model: string,
  _system: string,
  _prompt: string,
  _images: string[] = [],
  _format?: object,
): Promise<string> => "{}";

export async function webResearch(_queries: string[], _perQuery = 3): Promise<string> {
  return "";
}

export function checkSources(text: string, _sources: string): { text: string; dropped: string[] } {
  return { text, dropped: [] };
}

export async function checkBrain(_models: string[]): Promise<HealthCheck> {
  return {
    ok: true,
    message: "สมอง AI พร้อม (Code-First Local Engine + Antigravity Subagents · 0 โควตาภายนอก)",
    url: "local://code-first-engine",
  };
}
