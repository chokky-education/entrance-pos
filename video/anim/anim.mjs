// Render the full-screen motion-graphics scenes listed in render/timeline.json (tl.anims) to JPEG frames.
// Frame i of anim k = stage seeked to i/fps -> render/anim/aKK-<stage>/fNNNNN.jpg (3840x2160). render.py composites them.
// usage: node anim/anim.mjs <project_dir> [--pages 4]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('d:/domepos/uat/package.json');
const { chromium } = require('playwright');

const proj = path.resolve(process.argv[2] || '.');
const pagesN = Number(process.argv[process.argv.indexOf('--pages') + 1]) || 4;
const tl = JSON.parse(fs.readFileSync(path.join(proj, 'render/timeline.json'), 'utf8'));
const stageUrl = 'file:///' + path.join(proj, 'anim/stages.html').replace(/\\/g, '/');
const htmlStamp = fs.statSync(path.join(proj, 'anim/stages.html')).mtimeMs;
const browser = await chromium.launch({ channel: 'chrome' }); // headless shell of the uat Playwright is not installed

const jobs = [];
tl.anims.forEach((an, k) => {
  const dir = path.join(proj, 'render/anim', `a${String(k).padStart(2, '0')}-${an.stage}`);
  const n = Math.ceil((an.t1 - an.t0) * tl.fps);
  const meta = JSON.stringify({ stage: an.stage, n, cues: an.cues, vars: tl.vars, htmlStamp });
  const metaPath = path.join(dir, 'meta.json');
  if (fs.existsSync(metaPath) && fs.readFileSync(metaPath, 'utf8') === meta && fs.existsSync(path.join(dir, `f${String(n - 1).padStart(5, '0')}.jpg`))) {
    console.log('cached', path.basename(dir));
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const per = Math.ceil(n / pagesN);
  for (let p = 0; p < pagesN; p++) jobs.push({ an, dir, f0: p * per, f1: Math.min(n, (p + 1) * per), metaPath, meta, last: p === pagesN - 1 });
});

async function run(job) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(stageUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(([s, c, v]) => window.__init(s, c, v), [job.an.stage, job.an.cues, tl.vars || {}]);
  if (missing.length && job.f0 === 0) console.warn(`  ${job.an.stage}: cues missing in narration -> ${missing.join(', ')}`);
  for (let i = job.f0; i < job.f1; i++) {
    await page.evaluate((t) => window.__seek(t), i / tl.fps);
    await page.screenshot({ path: path.join(job.dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
  }
  await page.close();
}

const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: pagesN }, async () => {
  while (next < jobs.length) await run(jobs[next++]);
}));
for (const j of jobs) if (j.last) fs.writeFileSync(j.metaPath, j.meta);
await browser.close();
console.log(`anim frames done: ${jobs.length} jobs in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
