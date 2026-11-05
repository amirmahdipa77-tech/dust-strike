import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4192,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:900,height:430,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
await page.goto('http://localhost:4192/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));

const nav = await page.evaluate(()=>{
  const g=window.__game, n=g.nav;
  const pts = {
    tSpawn:[0,24], ctSpawn:[0,-24], aSite:[16,-14], bSite:[-17,-12],
    long:[20,8], mid:[0,0], tunnels:[-18,14], short:[6,-8]
  };
  const out={};
  for (const [k,v] of Object.entries(pts)) out[k] = n.findPath(0,24,v[0],v[1]).length;
  return out;
});
console.log('PATHS from T spawn:', JSON.stringify(nav));

// settings apply test
const res = await page.evaluate(()=>{
  const g=window.__game;
  const set = (k,v) => { const el = document.querySelector(`[data-key="${k}"]`); void el; };
  // directly poke the settings module through the UI controls
  document.getElementById('btn-settings-start').click();
  return true;
});
await new Promise(r=>setTimeout(r,400));
// click CIRCLE chip
await page.evaluate(()=>{ const t=[...document.querySelectorAll('.tab')].find(b=>b.textContent==='CROSSHAIR'); t.click(); });
await new Promise(r=>setTimeout(r,300));
await page.evaluate(()=>{ const b=[...document.querySelectorAll('.chip')].find(c=>c.textContent==='CIRCLE'); b.click(); });
await new Promise(r=>setTimeout(r,300));
const applied = await page.evaluate(()=>({
  style: document.getElementById('crosshair').dataset.style,
  stored: JSON.parse(localStorage.getItem('duststrike.settings.v2')).crosshair,
}));
console.log('SETTINGS APPLIED', JSON.stringify(applied));
await page.click('#btn-settings-close');
await new Promise(r=>setTimeout(r,300));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,1200));
await page.screenshot({path:'/scratch/work/v2_circle.png'});

const info = await page.evaluate(()=>{
  const r = window.__game;
  return { calls: window.__renderInfo ? window.__renderInfo() : null };
});
console.log('LOGS', logs.join('\n')||'(none)');
await browser.close(); server.close();
