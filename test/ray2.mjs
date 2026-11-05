import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4182,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:800,height:400});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://localhost:4182/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,800));

const aim = () => page.evaluate(() => {
  const g = window.__game;
  const bot = g.bots.bots[0];
  const p = g.player;
  bot.pos.set(0, 0, 5);
  bot.group.position.copy(bot.pos);
  p.pos.set(0, 0, 11);
  const dx = bot.pos.x - p.pos.x, dz = bot.pos.z - p.pos.z;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(bot.pos.y + 1.2 - (p.pos.y + 1.62), Math.hypot(dx, dz));
  return { botHp: bot.hp, alive: bot.alive };
});

await aim();
await new Promise(r=>setTimeout(r,400));
const shots = [];
for (let i = 0; i < 5; i++) {
  const r = await page.evaluate(() => window.__game.shoot());
  shots.push(r);
  await new Promise(r=>setTimeout(r,220));
}
const final = await page.evaluate(() => ({
  botHp: window.__game.bots.bots[0].hp,
  alive: window.__game.bots.bots[0].alive,
  kills: window.__game.kills,
  mag: window.__game.weapon.mag,
}));
console.log('SHOTS', JSON.stringify(shots));
console.log('FINAL', JSON.stringify(final));
await browser.close(); server.close();
