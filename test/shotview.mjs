import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4183,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:960,height:430,isMobile:true,hasTouch:true});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://localhost:4183/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,600));
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  p.pos.set(-2, 0, 14);
  p.yaw = 0; p.pitch = -0.02;
  const spots = [[-1, 6], [1.5, 2], [-2.5, 1]];
  g.bots.bots.forEach((b, i) => {
    if (spots[i]) { b.pos.set(spots[i][0], 0, spots[i][1]); b.group.position.copy(b.pos); b.group.rotation.y = Math.PI; }
  });
});
await new Promise(r=>setTimeout(r,900));
await page.screenshot({path:'/scratch/work/shot4_bots.png'});
// long A view
await page.evaluate(() => {
  const g = window.__game; const p = g.player;
  p.pos.set(19, 0, 8); p.yaw = 0; p.pitch = 0;
});
await new Promise(r=>setTimeout(r,800));
await page.screenshot({path:'/scratch/work/shot4_long.png'});
// A site view
await page.evaluate(() => {
  const g = window.__game; const p = g.player;
  p.pos.set(19, 0, -6); p.yaw = 0; p.pitch = -0.05;
});
await new Promise(r=>setTimeout(r,800));
await page.screenshot({path:'/scratch/work/shot4_site.png'});
await browser.close(); server.close();
