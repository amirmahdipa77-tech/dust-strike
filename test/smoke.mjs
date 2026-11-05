import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');

const ROOT = '/scratch/work/dust/dist';
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('nope');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(4173, r));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1280,720',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/scratch/work/shot_menu.png' });

// deploy
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: '/scratch/work/shot_game.png' });

// walk forward + look around
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 1600));
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.up('KeyW');
await page.screenshot({ path: '/scratch/work/shot_walk.png' });

const stats = await page.evaluate(() => {
  const t = (id) => document.getElementById(id)?.textContent?.trim();
  return {
    fps: t('fps'),
    hp: t('hp'),
    mag: t('mag'),
    kills: t('kills'),
    feed: document.getElementById('feed')?.textContent?.trim(),
    canvas: (() => {
      const c = document.getElementById('game');
      return c ? `${c.width}x${c.height}` : 'none';
    })(),
  };
});

// fire a burst
await page.mouse.move(640, 360);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 700));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/scratch/work/shot_fire.png' });

const after = await page.evaluate(() => ({
  mag: document.getElementById('mag')?.textContent?.trim(),
  fps: document.getElementById('fps')?.textContent?.trim(),
  hp: document.getElementById('hp')?.textContent?.trim(),
}));

console.log('STATS', JSON.stringify(stats));
console.log('AFTER', JSON.stringify(after));
console.log('LOGS', logs.slice(0, 25).join('\n') || '(none)');

await browser.close();
server.close();
