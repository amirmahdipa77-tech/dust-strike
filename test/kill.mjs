import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4180,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:960,height:430,isMobile:true,hasTouch:true});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://localhost:4180/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,800));

// stand in front of a bot, facing it
const setup = await page.evaluate(() => {
  const g = window.__game;
  const bot = g.bots.bots[0];
  const p = g.player;
  p.pos.set(bot.pos.x, 0, bot.pos.z + 7);
  const dx = bot.pos.x - p.pos.x, dz = bot.pos.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx, -dz);
  const dy = bot.pos.y + 1.2 - (p.pos.y + 1.62);
  p.pitch = Math.atan2(dy, d);
  return { botHp: bot.hp, dist: d, yaw: p.yaw, pitch: p.pitch };
});
console.log('SETUP', JSON.stringify(setup));
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/shot3_aim.png'});

// hold fire
const fb = await (await page.$('#btn-fire')).boundingBox();
await page.touchscreen.touchStart(fb.x+fb.width/2, fb.y+fb.height/2);
await new Promise(r=>setTimeout(r,2500));
await page.touchscreen.touchEnd();
await new Promise(r=>setTimeout(r,600));

const after = await page.evaluate(() => {
  const g = window.__game;
  return {
    kills: g.kills,
    mag: g.weapon.mag,
    botHp: g.bots.bots[0].hp,
    botAlive: g.bots.bots[0].alive,
    hp: Math.round(g.player.health),
    feed: document.getElementById('feed')?.textContent,
    hudKills: document.getElementById('kills')?.textContent,
  };
});
console.log('AFTER', JSON.stringify(after));
await page.screenshot({path:'/scratch/work/shot3_after.png'});
await browser.close(); server.close();
