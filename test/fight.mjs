import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');

const ROOT = '/scratch/work/dust/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 420, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });

await page.goto('http://localhost:4174/', { waitUntil: 'networkidle0' });
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));

// --- walk down mid toward CT
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 5000));
await page.keyboard.up('KeyW');
await page.screenshot({ path: '/scratch/work/shot_mid.png' });
const p1 = await page.evaluate(() => ({
  hp: document.getElementById('hp')?.textContent,
  mag: document.getElementById('mag')?.textContent,
  fps: document.getElementById('fps')?.textContent,
}));

// --- keep pushing and fight
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 3500));
await page.keyboard.up('KeyW');
await page.mouse.move(450, 210);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 1200));
await page.mouse.up();
await page.screenshot({ path: '/scratch/work/shot_fight.png' });

const p2 = await page.evaluate(() => ({
  hp: document.getElementById('hp')?.textContent,
  mag: document.getElementById('mag')?.textContent,
  kills: document.getElementById('kills')?.textContent,
  feed: document.getElementById('feed')?.textContent,
  dead: !document.getElementById('dead')?.classList.contains('hidden'),
  fps: document.getElementById('fps')?.textContent,
}));

// --- touch joystick test
const t0 = await page.evaluate(() => (window.__p = null, 'ok'));
await page.touchscreen.touchStart(180, 300);
await page.touchscreen.touchMove(180, 230);
await new Promise((r) => setTimeout(r, 900));
await page.touchscreen.touchEnd();
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/scratch/work/shot_touch.png' });

console.log('P1', JSON.stringify(p1));
console.log('P2', JSON.stringify(p2));
console.log('ERRORS', logs.join('\n') || '(none)');
await browser.close();
server.close();
