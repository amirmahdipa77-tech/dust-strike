import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4231,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4231/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,1000));
const views = [
  ['pit', 21, 2, 0.9, -0.25],
  ['pit2', 26, 3, 2.6, -0.2],
  ['steps', 9, -13, 0, -0.2],
  ['goose', 10, -14, 0, -0.15],
  ['wallclose', 0, 14, 0.7, 0.05],
  ['corner', 18, -8, 2.2, -0.1],
];
for (const [name,x,z,yaw,pitch] of views) {
  await page.evaluate(([x,z,yaw,pitch])=>{const p=window.__game.player;p.pos.set(x,0,z);p.yaw=yaw;p.pitch=pitch;},[x,z,yaw,pitch]);
  await new Promise(r=>setTimeout(r,650));
  await page.screenshot({path:`/scratch/work/v7_${name}.png`});
}
// weapon against a wall (clipping test)
await page.evaluate(()=>{const p=window.__game.player;p.pos.set(0,0,6.2);p.yaw=0;p.pitch=0;});
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/v7_clip.png'});
console.log('LOGS', logs.slice(0,5).join('\n')||'(none)');
await browser.close(); server.close();
