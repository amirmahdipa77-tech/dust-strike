import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4190,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4190/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2600));
await page.screenshot({path:'/scratch/work/v2_menu.png'});

await page.click('#btn-play');
await new Promise(r=>setTimeout(r,1200));
await page.screenshot({path:'/scratch/work/v2_spawn.png'});

const views = [
  ['mid', 0, 12, 0, 0],
  ['long', 20, 16, 0, 0],
  ['asite', 16, -12, 0, 0],
  ['bsite', -17, -10, 0, 0],
  ['ct', 0, -22, Math.PI, 0],
];
for (const [name, x, z, yaw, pitch] of views) {
  await page.evaluate(([x,z,yaw,pitch]) => {
    const g = window.__game; const p = g.player;
    p.pos.set(x, 0, z); p.yaw = yaw; p.pitch = pitch;
  }, [x,z,yaw,pitch]);
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({path:`/scratch/work/v2_${name}.png`});
}
console.log('LOGS', logs.slice(0,8).join('\n')||'(none)');
const info = await page.evaluate(()=>({fps:document.getElementById('fps')?.textContent, colliders: window.__game.map.colliders.length}));
console.log('INFO', JSON.stringify(info));
await browser.close(); server.close();
