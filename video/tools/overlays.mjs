// Render text overlays (captions, chapter badges, title cards, window chrome) as transparent PNGs with
// Chromium so Thai shaping is correct. Input: overlays.json [{id, kind, ...}], output: PNGs + positions.
// usage: node overlays.mjs <spec.json> <outDir> <result.json>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('d:/domepos/uat/package.json');
const { chromium } = require('playwright');

const [specPath, outDir, resultPath] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const theme = spec.theme;
const W = 3840, H = 2160;
// DOME Pos logo, inlined so setContent() needs no file access
const LOGO = 'data:image/png;base64,' + fs.readFileSync('d:/domepos/frontend/public/logo.png').toString('base64');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&display=block" rel="stylesheet">`;
const baseCss = `*{box-sizing:border-box;margin:0;padding:0} html,body{background:transparent} body{width:${W}px;height:${H}px;position:relative;font-family:'Sarabun',sans-serif;-webkit-font-smoothing:antialiased}
:root{--p:${theme.primary};--p2:${theme.primary2 || theme.primary}}`;

function html(item) {
  switch (item.kind) {
    case 'caption':
      return `<div id="el" style="position:absolute;left:50%;bottom:${item.bottom ?? 48}px;transform:translateX(-50%);max-width:${item.maxWidth ?? 3100}px;width:max-content;
        background:rgba(14,12,16,.94);color:#fff;border-radius:30px;padding:26px 60px 30px;font:600 ${item.size ?? 70}px/1.45 'Sarabun';text-align:center;
        box-shadow:0 18px 50px rgba(0,0,0,.35), inset 0 2px 0 rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.10);overflow-wrap:anywhere">${esc(item.text)}</div>`;
    case 'chapter':
      return `<div id="el" style="position:absolute;left:${item.left ?? 480}px;top:${item.top ?? 30}px;display:flex;align-items:center;gap:26px;
        font:600 50px/1.3 'Prompt';color:#fff;background:rgba(18,15,20,.78);padding:10px 40px 10px 10px;border-radius:999px;
        box-shadow:0 14px 40px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.10)">
        <span style="background:var(--p);padding:14px 34px;border-radius:999px;box-shadow:0 10px 30px color-mix(in srgb,var(--p) 45%,transparent), inset 0 2px 0 rgba(255,255,255,.18)">${esc(item.badge)}</span>
        <span>${esc(item.title)}</span></div>`;
    case 'brand':
      return `<div id="el" style="position:absolute;right:${item.right ?? 480}px;top:${item.top ?? 34}px;display:flex;align-items:center;gap:20px;font:500 44px/1.3 'Prompt';color:rgba(255,255,255,.9);
        background:rgba(18,15,20,.72);padding:12px 36px 12px 14px;border-radius:999px;border:2px solid rgba(255,255,255,.10);box-shadow:0 14px 40px rgba(0,0,0,.3)">
        <span style="width:58px;height:58px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 55%,#000));display:grid;place-items:center;font:700 28px 'Prompt';color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)"><img src="${LOGO}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></span>${esc(item.text)}</div>`;
    case 'toast':
      return `<div id="el" style="position:absolute;right:${item.right ?? 540}px;top:${item.top ?? 290}px;display:flex;align-items:center;gap:30px;max-width:1500px;
        padding:30px 46px 30px 30px;border-radius:40px;background:rgba(6,32,25,.96);border:3px solid color-mix(in srgb,var(--p) 70%,transparent);
        box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 80px color-mix(in srgb,var(--p) 35%,transparent)">
        <span style="width:130px;height:130px;flex:none;border-radius:50%;display:grid;place-items:center;font:84px/1 'Segoe UI Emoji';background:rgba(255,255,255,.08)">${esc(item.emoji)}</span>
        <span style="display:flex;flex-direction:column;gap:10px"><span style="font:700 50px/1.2 'Prompt';color:#fff;display:flex;align-items:center;gap:20px">${esc(item.who)}</span>
          <span style="font:500 44px/1.35 'Sarabun';color:#c7f9e3">${esc(item.text)}</span></span></div>`;
    case 'keys':
      return `<div id="el" style="position:absolute;right:${item.right ?? 560}px;bottom:${item.bottom ?? 400}px;display:flex;align-items:center;gap:26px;font:700 74px/1 'Prompt';color:#fff">${item.keys.map((k) => `<span style="min-width:150px;height:150px;padding:0 44px;border-radius:30px;display:grid;place-items:center;background:linear-gradient(#3a3f47,#23272d);border:3px solid rgba(255,255,255,.22);box-shadow:0 14px 0 #121417,0 26px 50px rgba(0,0,0,.55),0 0 60px color-mix(in srgb,var(--p) 55%,transparent)">${esc(k)}</span>`).join('<span style="font-size:80px;opacity:.85;text-shadow:0 6px 20px rgba(0,0,0,.6)">+</span>')}</div>`;
    case 'chrome': {
      const w = item.width, h = item.height, r = item.radius;
      return `<div id="el" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:${r}px ${r}px 0 0;background:linear-gradient(#f3f1f4,#e7e4e9);
        border-bottom:${Math.round(h * 0.02)}px solid #d6d2d9;display:flex;align-items:center;padding:0 ${h * 0.45}px;gap:${h * 0.18}px">
        ${['#ff5f57', '#febc2e', '#28c840'].map((c) => `<span style="width:${h * 0.26}px;height:${h * 0.26}px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 ${h * 0.012}px rgba(0,0,0,.15)"></span>`).join('')}
        <div style="margin-left:${h * 0.6}px;flex:1;max-width:62%;height:${h * 0.58}px;border-radius:${h}px;background:#fff;display:flex;align-items:center;gap:${h * 0.16}px;padding:0 ${h * 0.32}px;
          font:500 ${h * 0.3}px/1 'Sarabun';color:#4a4550;box-shadow:inset 0 0 0 ${h * 0.012}px rgba(0,0,0,.10)">
          <svg width="${h * 0.26}" height="${h * 0.26}" viewBox="0 0 24 24" fill="none" stroke="#5f5a66" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
          <span>${esc(item.url)}</span></div></div>`;
    }
    case 'title': {
      const bullets = (item.bullets || []).map((b, i) => `<li style="display:flex;gap:30px;align-items:baseline;opacity:.95"><span style="min-width:84px;height:84px;border-radius:24px;background:color-mix(in srgb,var(--p) 85%,#fff 0%);display:grid;place-items:center;font:700 44px 'Prompt';color:#fff"><i style="width:26px;height:26px;border-radius:50%;background:#fff;display:block"></i></span><span>${esc(b)}</span></li>`).join('');
      return `<div id="el" style="position:absolute;inset:0;overflow:hidden;background:
          radial-gradient(1400px 900px at 16% 12%, color-mix(in srgb,var(--p) 70%,transparent), transparent 70%),
          radial-gradient(1600px 1000px at 92% 100%, color-mix(in srgb,var(--p) 45%,transparent), transparent 70%),
          linear-gradient(160deg,#1a171d,#121014);color:#fff;padding:120px 300px 300px;display:flex;flex-direction:column;justify-content:center">
        <div style="font:500 58px/1.3 'Prompt';color:rgba(255,255,255,.75);letter-spacing:2px">${esc(item.kicker || '')}</div>
        <div style="font:700 ${item.titleSize ?? 190}px/1.25 'Prompt';margin-top:30px;text-shadow:0 12px 40px rgba(0,0,0,.4)">${esc(item.title)}</div>
        <div style="font:500 70px/1.45 'Sarabun';color:rgba(255,255,255,.86);margin-top:34px;max-width:2800px">${esc(item.subtitle || '')}</div>
        <ul style="list-style:none;margin-top:90px;display:grid;grid-template-columns:1fr 1fr;gap:42px 120px;font:500 64px/1.4 'Sarabun';max-width:3200px">${bullets}</ul>
        <div style="position:absolute;left:300px;bottom:150px;display:flex;align-items:center;gap:28px;font:500 54px 'Prompt';color:rgba(255,255,255,.8)">
          <span style="width:96px;height:96px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 55%,#000));display:grid;place-items:center;font:700 44px 'Prompt';color:#fff"><img src="${LOGO}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></span>DOME Pos</div>
      </div>`;
    }
    default:
      throw new Error('unknown kind ' + item.kind);
  }
}

const browser = await chromium.launch({ channel: 'chrome' }); // headless shell of the uat Playwright is not installed
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const results = {};
for (const item of spec.items) {
  const w = item.kind === 'chrome' ? item.width : W;
  const h = item.kind === 'chrome' ? item.height : H;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8">${fontLink}<style>${baseCss}</style></head><body style="width:${w}px;height:${h}px">${html(item)}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const el = page.locator('#el');
  const box = await el.boundingBox();
  const out = path.join(outDir, `${item.id}.png`);
  if (item.kind === 'title' || item.kind === 'chrome') {
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    results[item.id] = { src: out, pos: [0, 0], size: [w, h] };
  } else {
    // pad for shadows
    const pad = 60;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(W, box.width + pad * 2), height: Math.min(H, box.height + pad * 2) };
    clip.width = Math.min(clip.width, W - clip.x); clip.height = Math.min(clip.height, H - clip.y);
    await page.screenshot({ path: out, omitBackground: true, clip });
    results[item.id] = { src: out, pos: [Math.round(clip.x), Math.round(clip.y)], size: [Math.round(clip.width), Math.round(clip.height)], lines: Math.round(box.height / ((item.size ?? 70) * 1.45)) };
  }
}
await browser.close();
fs.writeFileSync(resultPath, JSON.stringify(results, null, 1));
console.log('rendered', Object.keys(results).length, 'overlays');
