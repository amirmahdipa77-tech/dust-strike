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
await new Promise((r) => server.listen(4175, r));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 380, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));

await page.goto('http://localhost:4175/', { waitUntil: 'networkidle0' });
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 600));

const pos = () => page.evaluate(() => {
  const g = window.__game;
  return {
    p: [g.player.pos.x.toFixed(2), g.player.pos.y.toFixed(2), g.player.pos.z.toFixed(2)],
    hp: Math.round(g.player.health),
    mag: g.weapon.mag,
    bots: g.bots.bots.map((b) => [b.alive, b.pos.x.toFixed(1), b.pos.z.toFixed(1)]),
    state: g.state,
    kills: g.kills,
  };
});

console.log('T0', JSON.stringify(await pos()));
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 3000));
console.log('T3s walking', JSON.stringify(await pos()));
await page.keyboard.up('KeyW');

// fire at whatever is ahead via the touch fire button
const fireBtn = await page.$('#btn-fire');
const box = await fireBtn.boundingBox();
await page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 900));
await page.touchscreen.touchEnd();
console.log('after fire', JSON.stringify(await pos()));
await page.screenshot({ path: '/scratch/work/shot2_fire.png' });

// let the bots come to us
for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  console.log(`T+${(i + 1) * 4}s`, JSON.stringify(await pos()));
}
await page.screenshot({ path: '/scratch/work/shot2_bots.png' });
console.log('ERRORS', logs.join('\n') || '(none)');
await browser.close();
server.close();
