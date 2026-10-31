import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getLiveBlueprint } from "@/lib/sml-foundation";
import { loadScripts } from "@/lib/uat-scripts";
import { listRuns } from "@/lib/uat-runs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bp = getLiveBlueprint();
    const { scripts } = loadScripts();
    const runs = listRuns(200);

    const coveredMenus = new Set<string>();
    const coveredApis = new Set<string>();
    const actionCounts: Record<string, number> = {};

    for (const sc of scripts) {
      try {
        const raw = JSON.parse(readFileSync(sc.file, "utf8"));
        const steps = [...(raw.steps ?? []), ...(raw.cleanup ?? [])];
        for (const st of steps) {
          const kind = String(st?.do ?? "");
          actionCounts[kind] = (actionCounts[kind] ?? 0) + 1;
          const mk = st?.menuKey || st?.key || st?.params?.menuKey || st?.params?.key;
          if (typeof mk === "string" && mk.trim()) coveredMenus.add(mk.trim());
          const rk = st?.reportMenuKey || st?.params?.reportMenuKey;
          if (typeof rk === "string" && rk.trim()) coveredMenus.add(rk.trim());
          const pth = st?.path || st?.params?.path;
          if (typeof pth === "string" && pth.trim()) coveredApis.add(pth.split("?")[0].trim());
        }
      } catch {
        /* ignore */
      }
    }

    const totalMenus = bp.validMenuKeys.size;
    const e2eCount = scripts.filter((s) => s.lens === "e2e").length;
    const deepAuditScripts = scripts.filter((s) => s.id.startsWith("uat-deep-audit-"));
    const passedRuns = runs.filter((r) => r.status === "passed").length;

    return NextResponse.json({
      ok: true,
      blueprint: {
        totalMenus,
        masterSchemas: bp.masterSchemas.length,
        transMenus: bp.transMenus.length,
        apiRoutes: bp.apiRoutes.length,
        backendProcessRoutes: bp.backendProcessRoutes.length,
      },
      coverage: {
        totalScripts: scripts.length,
        e2eScripts: e2eCount,
        deepAuditScripts: deepAuditScripts.length,
        coveredMenuCount: coveredMenus.size,
        coveredApiCount: coveredApis.size,
        passedRunsCount: passedRuns,
        actionCounts,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
