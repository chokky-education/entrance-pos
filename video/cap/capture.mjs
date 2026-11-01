// Record the real DOME Pos screens for the tutorial video: screenshots per UI state + action metadata -> capture.json.
// usage: node video/cap/capture.mjs   (backend :8085 + frontend :3005 must run)
// ponytail: local only — it creates real bills (normal local sales); the edited menu price is restored at the end.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('d:/domepos/uat/package.json');
const { chromium } = require('playwright');

const ROOT = 'd:/domepos/video';
const BASE = 'http://localhost:3005';
const W = 1600, H = 900, DSF = 2.7; // 4320x2430 shots = content box (2880x1620) at render supersample 1.5
const EDIT_CODE = 'CAFE-ESP-02', EDIT_PRICE = '89';

fs.rmSync(`${ROOT}/shots`, { recursive: true, force: true });
fs.mkdirSync(`${ROOT}/shots`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
await ctx.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    // dev-only Next.js badge + a leftover hand-typed test menu (DOME-01) in the local DB are not part of the product
    st.textContent = 'nextjs-portal{display:none!important}[data-testid="pos-starter-item-DOME-01"],tr:has([data-testid="pos-manage-edit-DOME-01"]){display:none!important}';
    document.head.appendChild(st);
  });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errs.push(`http ${r.status()} ${r.request().method()} ${r.url()}`); });

const scenes = {};
let S = null, n = 0;
const scene = (id) => { S = scenes[id] = []; console.log('== scene', id); };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const add = (a) => { S.push(clean(a)); return a; };
const sleep = (ms) => page.waitForTimeout(ms);
const tid = (id) => page.getByTestId(id);

async function snap(tag) {
  const name = `${String(++n).padStart(3, '0')}-${tag}`;
  await page.screenshot({ path: `${ROOT}/shots/${name}.png`, animations: 'disabled' });
  return `shots/${name}.png`;
}
async function ctr(loc) {
  if (Array.isArray(loc)) return loc;
  const l = loc.first();
  await l.waitFor({ state: 'visible', timeout: 15000 });
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
}
const moveTo = (p) => page.mouse.move(p[0], p[1], { steps: 8 });
async function shot(tag, o = {}) { return add({ act: 'shot', src: await snap(tag), mark: o.mark, fade: o.fade }); }
async function zoom(center, z, mark, o = {}) { add({ act: 'zoom', center: await ctr(center), z, mark, dur: o.dur, bias: o.bias }); }
const unzoom = (mark, dur) => add({ act: 'unzoom', mark, dur });
async function hover(loc, tag, o = {}) {
  const p = await ctr(loc);
  await moveTo(p);
  await sleep(o.wait ?? 450);
  return add({ act: 'hover', pos: p, src: o.noShot ? undefined : await snap(tag), mark: o.mark, kind: o.kind ?? 'hand' });
}
async function click(loc, tag, o = {}) {
  const p = await ctr(loc);
  await moveTo(p);
  await sleep(300);
  const hsrc = o.hoverShot === false ? undefined : await snap(tag + '-h');
  await page.mouse.click(p[0], p[1]);
  if (o.waitFor) await o.waitFor();
  await sleep(o.wait ?? 900);
  return add({ act: 'click', pos: p, src: hsrc, after: await snap(tag), mark: o.mark, kind: o.kind ?? 'hand', fade: o.fade });
}
// native <select>: the open dropdown never shows in a screenshot, so record hover -> chosen value
async function pick(loc, value, tag, o = {}) {
  const p = await ctr(loc);
  await moveTo(p);
  await sleep(300);
  const hsrc = await snap(tag + '-h');
  await loc.first().selectOption(value);
  await sleep(o.wait ?? 700);
  return add({ act: 'click', pos: p, src: hsrc, after: await snap(tag), mark: o.mark, kind: 'hand' });
}
async function type(loc, text, tag, o = {}) {
  const p = await ctr(loc);
  await moveTo(p);
  await sleep(250);
  if (o.noClick) await loc.first().focus();
  else await page.mouse.click(p[0], p[1]);
  if (o.selectAll) await page.keyboard.press('Control+a');
  await sleep(350);
  const after = await snap(tag + '-0');
  const frames = [];
  for (const ch of [...text]) {
    await page.keyboard.type(ch);
    await sleep(o.charWait ?? 60);
    frames.push(await snap(tag));
  }
  if (o.settle) { await sleep(o.settle); frames.push(await snap(tag + '-done')); }
  return add({ act: 'type', pos: p, after, frames, mark: o.mark, kind: 'arrow', step: o.step ?? 0.09, click: o.noClick ? false : undefined });
}
// keyboard shortcut: keycap overlay in the video + the screen after the press
async function keys(labels, doIt, tag, o = {}) {
  await doIt();
  await sleep(o.wait ?? 900);
  return add({ act: 'key', keys: labels, after: await snap(tag), mark: o.mark });
}
// mouse-wheel scroll recorded frame by frame; pos = where the wheel turns (the scrolling panel)
async function scrollFrames(pos, dy, steps, tag, mark) {
  await moveTo(pos);
  const frames = [];
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(110);
    frames.push(await snap(tag));
  }
  return add({ act: 'frames', frames, step: 0.07, fade: 0, mark });
}
// wheel-scroll until loc's top sits near y=top (no silent jump)
async function reveal(loc, pos, tag, o = {}) {
  const l = loc.first();
  await l.waitFor({ state: 'attached' });
  const b = await l.boundingBox();
  const dy = Math.round(b.y - (o.top ?? 150));
  if (Math.abs(dy) < 40) return;
  await scrollFrames(pos, dy, o.steps ?? 8, tag, o.mark);
}

const vars = {};
const bootItems = async () => (await (await page.request.get(`${BASE}/api/pos/bootstrap`)).json()).items || [];
let original = null;
try {
  original = (await bootItems()).find((i) => i.code === EDIT_CODE);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await tid('pos-starter-cafe-screen').waitFor();
  await tid('pos-starter-clear-cart-btn').click();
  await tid('pos-starter-cat-all').click();
  await page.mouse.move(W / 2, H / 2);
  await sleep(1500);

  // ---------- 1. overview ----------
  scene('overview');
  await shot('pos');
  await hover(tid('pos-starter-tab-tables'), 'tabs', { mark: 'tabs' });
  await hover(tid('pos-starter-item-CAFE-ESP-03'), 'grid', { mark: 'grid', kind: 'hand' });
  await hover(tid('pos-starter-cat-beer'), 'cats', { mark: 'cats' });
  await hover(tid('pos-starter-net-total'), 'cart', { mark: 'cart', kind: 'arrow' });

  // ---------- 2. order with options ----------
  scene('order');
  await click(tid('pos-starter-channel-DINE_IN'), 'dinein', { mark: 'ch' });
  await pick(tid('pos-starter-table-select'), 'B1', 'table', { mark: 'tbl' });
  await click(tid('pos-starter-cat-coffee'), 'coffee', { mark: 'cat' });
  await click(tid('pos-starter-sweet-หวาน 50%'), 'sweet', { mark: 'sweet' });
  await pick(tid('pos-starter-addon-select'), 'EXTRA_SHOT', 'addon', { mark: 'addon' });
  await click(tid('pos-starter-item-CAFE-ESP-01'), 'add-ame', { mark: 'item', wait: 1100 });
  await zoom(page.getByText('อเมริกาโน่เย็น คั่วกลาง').last(), 1.7, 'zcart');
  await hover(page.getByText('อเมริกาโน่เย็น คั่วกลาง').last(), 'cartline', { kind: 'arrow', noShot: true });
  unzoom();
  await tid('pos-starter-addon-select').first().selectOption('NONE'); // next cards without the extra shot

  // ---------- 3. keyboard search ----------
  scene('search');
  await click(tid('pos-starter-cat-all'), 'all');
  await keys(['F2'], () => page.keyboard.press('F2'), 'f2', { mark: 'f2' });
  await type(page.getByPlaceholder('สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า (F2)...'), 'ครัวซองต์', 'q1', { mark: 'type', noClick: true });
  await click(tid('pos-starter-item-CAFE-BAK-01'), 'add-bak', { mark: 'hit' });
  await type(page.getByPlaceholder('สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า (F2)...'), 'IPA', 'q2', { mark: 'beer', selectAll: true });
  await click(tid('pos-starter-item-BEER-IPA-01'), 'add-ipa', { mark: 'pick' });
  await zoom(tid('pos-starter-net-total'), 1.6, 'total');
  await hover(tid('pos-starter-net-total'), 'total', { kind: 'arrow', noShot: true });
  unzoom();
  await page.getByPlaceholder('สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า (F2)...').fill('');
  await sleep(600);

  // ---------- 4. hold to table ----------
  scene('hold');
  await shot('cart-full');
  await click(tid('pos-starter-hold-btn'), 'held', { mark: 'hold', wait: 1300 });
  await click(tid('pos-starter-tab-tables'), 'tables', { mark: 'tab', waitFor: () => tid('pos-starter-table-card-B1').waitFor() });
  await zoom(tid('pos-starter-table-card-B1'), 1.8, 'z');
  await hover(tid('pos-starter-table-card-B1'), 'b1', { kind: 'arrow', noShot: true });
  unzoom('zones');
  await hover(tid('pos-starter-table-card-G2'), 'garden', { kind: 'arrow' });

  // ---------- 5. recall + pay with F9 ----------
  scene('pay');
  await click(tid('pos-starter-recall-B1'), 'recall', { mark: 'recall', wait: 1300 });
  await click(tid('pos-starter-paymethod-promptpay'), 'promptpay', { mark: 'pm' });
  await page.mouse.move(W * 0.4, H * 0.5, { steps: 6 });
  await keys(['F9'], async () => { await page.keyboard.press('F9'); await tid('pos-starter-receipt-modal').waitFor(); }, 'paid', { mark: 'f9', wait: 1500 });
  const modalText = await tid('pos-starter-receipt-modal').innerText();
  vars.q1 = (modalText.match(/คิวรับเครื่องดื่ม:\s*(\S+)/) || [])[1];
  console.log('  queue', vars.q1);

  // ---------- 6. receipt ----------
  scene('receipt');
  await zoom(page.getByText(/คิวรับเครื่องดื่ม:/).first(), 1.7, 'rc');
  await hover(page.getByText(/คิวรับเครื่องดื่ม:/).first(), 'queue', { kind: 'arrow', noShot: true });
  await zoom(tid('pos-starter-receipt-points-minted'), 1.8, 'pts');
  await hover(tid('pos-starter-receipt-points-minted'), 'pts', { kind: 'arrow', noShot: true });
  await zoom(page.getByText(/สติกเกอร์แปะแก้วบาริสต้า/).first(), 1.6, 'stk', { bias: 0.25 });
  await hover(page.getByText(/สติกเกอร์แปะแก้วบาริสต้า/).first(), 'stk', { kind: 'arrow', noShot: true });
  unzoom('close');
  await click(tid('pos-starter-close-receipt-btn'), 'closed', { mark: 'close' });

  // ---------- 7. quick cash sale ----------
  scene('quick');
  await click(tid('pos-starter-channel-TAKEAWAY'), 'takeaway', { mark: 'ch' });
  await click(tid('pos-starter-item-CAFE-ESP-02'), 'add-latte', { mark: 'item' });
  await click(tid('pos-starter-quick-cash-btn'), 'quick', { mark: 'quick', waitFor: () => tid('pos-starter-receipt-modal').waitFor(), wait: 1500 });
  await hover(page.getByText(/คิวรับเครื่องดื่ม:/).first(), 'quick-rc', { mark: 'rc', kind: 'arrow' });
  await click(tid('pos-starter-close-receipt-btn'), 'quick-closed');

  // ---------- 8. KDS ----------
  scene('kds');
  await click(tid('pos-starter-tab-kds'), 'kds', { waitFor: () => tid('pos-starter-kds-view').waitFor() });
  const card = tid(`pos-starter-kds-card-${vars.q1}`);
  await zoom(card, 1.5, 'z');
  await hover(card, 'card', { kind: 'arrow', noShot: true });
  await click(card.getByText('ชงเสร็จ/พร้อมเสิร์ฟ'), 'ready', { mark: 'ready' });
  await click(card.getByText('เรียกคิวเสียงไทย'), 'call', { mark: 'call' });
  await click(card.getByText('เสิร์ฟครบแล้ว'), 'served', { mark: 'served' });
  unzoom();

  // ---------- 9. reports + close shift (the shift always starts open on page load) ----------
  scene('reports');
  await click(tid('pos-starter-tab-reports'), 'reports', { waitFor: () => tid('pos-starter-kpi-total-sales').waitFor() });
  await zoom(tid('pos-starter-kpi-total-sales'), 1.6, 'kpi');
  await hover(tid('pos-starter-kpi-total-sales'), 'kpi', { kind: 'arrow', noShot: true });
  unzoom('cat');
  await hover(page.getByText('หมวดหมู่สินค้า').first(), 'cat', { mark: 'cat', kind: 'arrow' });
  await hover(page.getByText('ช่องทางรับชำระเงิน').first(), 'paych', { mark: 'pay', kind: 'arrow' });
  const rv = await tid('pos-starter-reports-view').boundingBox();
  const inReports = [Math.round(rv.x + rv.width / 2), Math.round(Math.min(rv.y + rv.height * 0.6, H - 120))];
  await reveal(tid('pos-starter-bills-table'), inReports, 'scroll-bills', { mark: 'bills', top: 120 });
  await hover(page.locator('[data-testid^="pos-starter-cancel-"]').first(), 'cancel', { mark: 'act' });
  await reveal(tid('pos-starter-toggle-shift-btn'), inReports, 'scroll-top', { top: 200 });
  await click(tid('pos-starter-toggle-shift-btn'), 'shift-closed', { mark: 'shift', wait: 1200 });
  await hover(tid('pos-starter-print-zreport-btn'), 'zreport', { mark: 'zr' });

  // ---------- 10. manage menu ----------
  scene('manage');
  await click(tid('pos-starter-tab-manage'), 'manage', { waitFor: () => tid('pos-starter-manage-view').waitFor(), wait: 1200 });
  const mv = await tid('pos-starter-manage-view').boundingBox();
  const inManage = [Math.round(mv.x + mv.width / 2), Math.round(Math.min(mv.y + mv.height * 0.55, H - 140))];
  await reveal(page.getByText('จัดการรายการสินค้า & รูปภาพเมนู').first(), inManage, 'scroll-menu', { mark: 'scroll', top: 110, steps: 10 });
  await type(page.getByPlaceholder('ค้นหารหัส / ชื่อสินค้า...'), 'ลาเต้', 'msearch', { mark: 'type', settle: 500 });
  await zoom(tid(`pos-manage-edit-${EDIT_CODE}`), 1.6, 'edit');
  await click(tid(`pos-manage-edit-${EDIT_CODE}`), 'edit', { mark: 'edit' });
  const priceInput = tid('pos-manage-items-table').locator('input[inputmode="decimal"]');
  await type(priceInput, EDIT_PRICE, 'price', { mark: 'price', selectAll: true });
  await click(tid('pos-manage-items-table').getByRole('button', { name: 'บันทึก' }), 'saved', { mark: 'save', wait: 1400 });
  await hover(tid('pos-manage-add-item-btn'), 'addbtn', { mark: 'add' });
  unzoom();

  // ---------- 11. cloud sync settings ----------
  scene('cloud');
  await reveal(tid('pos-cf-account-id-input'), inManage, 'scroll-cloud', { mark: 'top', top: 260, steps: 10 });
  await hover(tid('pos-cf-account-id-input'), 'acc', { kind: 'arrow' });
  await zoom(tid('pos-cf-d1-id-input'), 1.3, 'fields');
  await hover(tid('pos-cf-d1-id-input'), 'd1', { mark: 'fields', kind: 'arrow' });
  await hover(tid('pos-cf-autosync-30s-btn'), 'autosync', { mark: 'auto' });
  await hover(tid('pos-cf-save-sync-btn'), 'syncnow', { mark: 'sync' });
  unzoom();
} finally {
  // put the edited menu back exactly as it was, through the same API the manage screen uses
  if (original) {
    const r = await page.request.post(`${BASE}/api/pos/shift`, { data: { action: 'upsert_item', item_code: original.code, barcode: original.barcode, name: original.name,
      category: original.category, unit_code: original.unit_code, retail_price: original.price, image_url: original.image_url } });
    const now = (await bootItems()).find((i) => i.code === EDIT_CODE);
    console.log('menu restored:', r.status(), now?.price, now?.image_url === original.image_url);
  }
  fs.writeFileSync(`${ROOT}/capture.json`, JSON.stringify({ css_size: [W, H], primary: '#b5651d', url_display: 'domepos.mysmebox.com', vars, scenes }, null, 1));
  await browser.close();
  console.log('shots', n, '| errors', errs.length);
  for (const e of errs.slice(0, 15)) console.log('  ', e);
}
