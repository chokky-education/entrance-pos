// ถ่ายหน้าจอจริงทุกแท็บของ DOME Pos สำหรับ README
// รัน: node docs/capture-screenshots.mjs [baseUrl]   (ค่าเริ่มต้น http://localhost:3005)
// ponytail: ถ่ายบนเครื่อง local เท่านั้น เพราะสคริปต์นี้สร้างบิลจริงลงฐาน
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const require = createRequire("d:/domepos/uat/package.json");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:3005";
const outDir = "d:/domepos/docs/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
// ซ่อนปุ่ม dev ของ Next.js ไม่ให้ติดในภาพ
await page.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "nextjs-portal{display:none!important}";
    document.head.appendChild(st);
  });
});
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const settle = (ms = 1400) => page.waitForTimeout(ms);

async function shot(name, { keepScroll = false } = {}) {
  if (!keepScroll)
    await page.evaluate(() => document.querySelectorAll("*").forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }));
  await settle();
  const png = `${outDir}/${name}.png`;
  await page.screenshot({ path: png });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", "82", `${outDir}/${name}.webp`]);
  rmSync(png);
  console.log("saved", name);
}

await page.goto(base + "/", { waitUntil: "load" });
await tid("pos-starter-cafe-screen").waitFor();
await tid("pos-starter-clear-cart-btn").click();
await tid("pos-starter-channel-DINE_IN").click();
await tid("pos-starter-table-select").selectOption("B1");
await tid("pos-starter-cat-coffee").click();
await tid("pos-starter-sweet-หวาน 50%").first().click();
await tid("pos-starter-addon-select").first().selectOption("EXTRA_SHOT");
await tid("pos-starter-item-CAFE-ESP-01").click();
await tid("pos-starter-addon-select").first().selectOption("NONE");
await tid("pos-starter-cat-all").click().catch(() => {});
await tid("pos-starter-item-BEER-IPA-01").click();
await tid("pos-starter-item-CAFE-BAK-01").click();
await shot("01-pos-order");

await tid("pos-starter-hold-btn").click();
await tid("pos-starter-tab-tables").click();
await tid("pos-starter-table-card-B1").waitFor();
await shot("02-tables");

await tid("pos-starter-recall-B1").click();
await tid("pos-starter-paymethod-promptpay").click();
await shot("03-payment");

await tid("pos-starter-confirm-pay-btn").click();
await tid("pos-starter-receipt-modal").waitFor();
await shot("04-receipt");
await tid("pos-starter-close-receipt-btn").click();

await tid("pos-starter-tab-kds").click();
await tid("pos-starter-kds-view").waitFor();
await shot("05-kds");

await tid("pos-starter-tab-reports").click();
await tid("pos-starter-kpi-total-sales").waitFor();
await shot("06-reports");

await tid("pos-starter-tab-manage").click();
await shot("07-manage-cloudflare");

await page.getByText("จัดการรายการสินค้า & รูปภาพเมนู").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
await shot("08-manage-products", { keepScroll: true });

await browser.close();
