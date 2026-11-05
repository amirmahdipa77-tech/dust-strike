import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4191,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:520,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4191/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));

// settings panel
await page.click('#btn-settings-start');
await new Promise(r=>setTimeout(r,500));
await page.screenshot({path:'/scratch/work/v2_settings1.png'});
await page.evaluate(()=>{ const t=[...document.querySelectorAll('.tab')].find(b=>b.textContent==='CROSSHAIR'); t && t.click(); });
await new Promise(r=>setTimeout(r,400));
await page.screenshot({path:'/scratch/work/v2_settings2.png'});
await page.click('#btn-settings-close');
await new Promise(r=>setTimeout(r,300));

// play
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,900));

// stand facing a bot in the open
await page.evaluate(()=>{
  const g=window.__game, p=g.player, b=g.bots.bots[0];
  b.pos.set(0,0,8.5); b.group.position.copy(b.pos);
  p.pos.set(0,0,13); p.yaw=0; p.pitch=-0.02;
});
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/scratch/work/v2_aim.png'});

// fire a burst via the fire button
const fb = await (await page.$('#btn-fire')).boundingBox();
await page.touchscreen.touchStart(fb.x+fb.width/2, fb.y+fb.height/2);
await new Promise(r=>setTimeout(r,450));
await page.screenshot({path:'/scratch/work/v2_firing.png'});
await new Promise(r=>setTimeout(r,900));
await page.touchscreen.touchEnd();
await new Promise(r=>setTimeout(r,300));
await page.screenshot({path:'/scratch/work/v2_afterfire.png'});

// reload animation
await page.evaluate(()=>{ window.__game.weapon.startReload(); });
await new Promise(r=>setTimeout(r,450));
await page.screenshot({path:'/scratch/work/v2_reload.png'});

const st = await page.evaluate(()=>({
  kills: window.__game.kills,
  botHp: window.__game.bots.bots[0].hp,
  mag: window.__game.weapon.mag,
  reloading: window.__game.weapon.reloading,
  hp: Math.round(window.__game.player.health),
}));
console.log('STATE', JSON.stringify(st));
console.log('LOGS', logs.slice(0,6).join('\n')||'(none)');
await browser.close(); server.close();
