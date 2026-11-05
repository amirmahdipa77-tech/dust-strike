import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4216,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4216/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,1200));
const views = [
  ['spawn', 0, 22, 0, 0],
  ['longdoors', 21, 18, 0, 0],
  ['longA', 22, 8, 0, 0],
  ['pit', 22, 4, 0.6, -0.1],
  ['asite', 18, -12, 0, 0],
  ['mid', 0, 10, 0, 0],
  ['tunnels', -19, 12, 0, 0],
  ['bsite', -18, -10, 0, 0],
  ['ct', 0, -24, Math.PI, 0],
];
for (const [name,x,z,yaw,pitch] of views) {
  await page.evaluate(([x,z,yaw,pitch])=>{const p=window.__game.player;p.pos.set(x,0,z);p.yaw=yaw;p.pitch=pitch;},[x,z,yaw,pitch]);
  await new Promise(r=>setTimeout(r,650));
  await page.screenshot({path:`/scratch/work/v5_${name}.png`});
}
console.log('LOGS', logs.slice(0,5).join('\n')||'(none)');
await browser.close(); server.close();
