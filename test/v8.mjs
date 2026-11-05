import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4240,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4240/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2600));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,1100));
for (const [name,x,z,yaw,pitch] of [['long',21,10,0,-0.02],['tunnel',-19,6,0,0],['bsite',-18,-10,0,-0.05],['mid',0,10,0,0],['pit',24,4,0.4,-0.2]]) {
  await page.evaluate(([x,z,yaw,pitch])=>{const p=window.__game.player;p.pos.set(x,0,z);p.yaw=yaw;p.pitch=pitch;},[x,z,yaw,pitch]);
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({path:`/scratch/work/v8_${name}.png`});
}
// shoot a wall to see decals
await page.evaluate(()=>{const g=window.__game;const p=g.player;p.pos.set(0,0,8);p.yaw=0.5;p.pitch=0;g.weapon.equip('ak',true);});
await new Promise(r=>setTimeout(r,600));
await page.evaluate(()=>{const g=window.__game;for(let i=0;i<6;i++){g.weapon.cooldown=0;g.weapon.mag=30;g.shoot();}});
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/v8_decals.png'});
console.log('LOGS', logs.slice(0,5).join('\n')||'(none)');
await browser.close(); server.close();
