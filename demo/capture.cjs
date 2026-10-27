// Deterministic capture: replaces the physics Worker with recorded telemetry and steps the
// game's own render loop with a fake clock, one screenshot per video frame.
// Usage: node demo/capture.cjs <outDir> <width> <height> [startFrame endFrame step]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [outDir, W, H, a, b, st] = process.argv.slice(2);
const width = +W, height = +H;
const frames = JSON.parse(fs.readFileSync(path.join(__dirname, 'frames.json'), 'utf8'));
const start = a ? +a : 0, end = b ? +b : frames.length, step = st ? +st : 1;
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.addInitScript(() => {
    let now = 1000;
    performance.now = () => now;
    let queue = [];
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    window.__tick = (dtMs) => { now += dtMs; const q = queue; queue = []; for (const cb of q) cb(now); };
    window.Worker = class { constructor() { window.__w = this; } postMessage() {} terminate() {} addEventListener() {} };
    window.__feed = (tel) => window.__w && window.__w.onmessage && window.__w.onmessage({ data: { type: 'telemetry', telemetry: tel, paused: false, timescale: 1 } });
  });
  await page.addStyleTag({ content: '' }).catch(() => {});
  await page.goto('http://127.0.0.1:5173/?scenario=demo', { waitUntil: 'load' });
  await page.addStyleTag({ content: '#stats,#corner,#coach,#help,#coffee,#home{display:none!important}' });
  await page.waitForFunction(() => window.__w && window.__w.onmessage, null, { timeout: 30000 });
  // warm up: a few frames so textures/terrain build before the first captured frame
  for (let i = 0; i < 3; i++) { await page.evaluate((t) => { window.__feed(t); window.__tick(33.3); }, frames[0].tel); }
  const t0 = Date.now();
  let pressed = new Set();
  for (let i = 0; i < end; i += 1) {
    const f = frames[i];
    for (const k of f.keys) await page.keyboard.press(k === 'KeyC' ? 'c' : k);
    const te = Date.now(); await page.evaluate((t) => { window.__feed(t); window.__tick(1000 / 30); }, f.tel); if (process.env.DBG) console.log(i, "eval", Date.now() - te, "keys", f.keys.join());
    if (i >= start && (i - start) % step === 0) {
      const file = path.join(outDir, `f${String(i).padStart(5, '0')}.jpg`);
      if (!fs.existsSync(file)) {
        for (let tries = 0; ; tries++) {
          try { await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: 90000 }); break; }
          catch (e) { console.log('screenshot retry', i, tries); if (tries >= 3) throw e; }
        }
      }
      if (i % 25 === 0) console.log(`frame ${i}/${end} ${(Date.now() - t0) / 1000 | 0}s`);
    }
  }
  await browser.close();
})();
