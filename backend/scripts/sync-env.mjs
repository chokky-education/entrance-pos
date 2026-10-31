import fs from "node:fs";
import path from "node:path";

const srcPath = "d:/smlaiaccount/uat/openhands-swarm/.env.local";
const dstPath = "d:/domepos/backend/.env.local";

const envMap = {};
if (fs.existsSync(srcPath)) {
  const raw = fs.readFileSync(srcPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    envMap[key] = val;
  }
}

const pgHost = envMap.UAT_PG_HOST || "127.0.0.1";
const pgPort = envMap.UAT_PG_PORT || "5432";
const pgUser = envMap.UAT_PG_USER || "postgres";
const pgPass = envMap.UAT_PG_PASSWORD || "";

const outLines = [
  "# Auto-generated local environment for DOME Pos Backend (DO NOT COMMIT)",
  "HTTP_PORT=8085",
  "DB_PROVIDER=d1",
  "CLOUDFLARE_ACCOUNT_ID=" + (envMap.CLOUDFLARE_ACCOUNT_ID || ""),
  "CLOUDFLARE_D1_DATABASE_ID=" + (envMap.CLOUDFLARE_D1_DATABASE_ID || ""),
  "CLOUDFLARE_API_TOKEN=" + (envMap.CLOUDFLARE_API_TOKEN || ""),
  "R2_ACCOUNT_ID=" + (envMap.R2_ACCOUNT_ID || envMap.CLOUDFLARE_ACCOUNT_ID || ""),
  "R2_ACCESS_KEY_ID=" + (envMap.R2_ACCESS_KEY_ID || ""),
  "R2_SECRET_ACCESS_KEY=" + (envMap.R2_SECRET_ACCESS_KEY || ""),
  "R2_BUCKET_NAME=" + (envMap.R2_BUCKET_NAME || "domepos-media"),
  "R2_PUBLIC_URL=" + (envMap.R2_PUBLIC_URL || "https://r2.domepos.cloudflarestorage.com/domepos-media"),
  `PG_HOST=${pgHost}`,
  `PG_PORT=${pgPort}`,
  `PG_USER=${pgUser}`,
  `PG_PASSWORD=${pgPass}`,
  "PG_DATABASE=domepos",
  "PG_SSLMODE=disable",
  "",
];

fs.mkdirSync(path.dirname(dstPath), { recursive: true });
fs.writeFileSync(dstPath, outLines.join("\n"), "utf8");
console.log("Created d:/domepos/backend/.env.local successfully (PG_DATABASE=domepos, HTTP_PORT=8085)");
