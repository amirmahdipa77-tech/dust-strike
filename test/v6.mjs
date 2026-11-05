import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4220,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4220/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.screenshot({path:'/scratch/work/v6_menu.png'});

await page.click('#btn-competitive');
await new Promise(r=>setTimeout(r,1200));
await page.screenshot({path:'/scratch/work/v6_buy.png'});
const st1 = await page.evaluate(()=>({mode: window.__game.mode, phase: window.__game.rounds.phase, money: window.__game.rounds.money}));
console.log('AFTER START', JSON.stringify(st1));

// buy the AK
const bought = await page.evaluate(()=>{
  const items=[...document.querySelectorAll('.buyItem')];
  const ak = items.find(i=>i.textContent.includes('AK-47'));
  if (ak) ak.click();
  return { items: items.length, money: window.__game.rounds.money, weapon: window.__game.weapon.current };
});
console.log('BUY', JSON.stringify(bought));
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/scratch/work/v6_ingame.png'});

// force the round live (software rendering runs the sim slowly)
await page.evaluate(()=>{ const g=window.__game; g.rounds.phase='live'; g.rounds.timeLeft=115; document.getElementById('buy').classList.add('hidden'); });
await new Promise(r=>setTimeout(r,1200));
const st2 = await page.evaluate(()=>({phase: window.__game.rounds.phase, timer: Math.round(window.__game.rounds.timeLeft)}));
console.log('LIVE?', JSON.stringify(st2));

// go to A site and plant
await page.evaluate(()=>{ const p=window.__game.player; p.pos.set(17,0,-16); });
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/v6_site.png'});
const plantRes = await page.evaluate(async ()=>{
  const g = window.__game;
  const p = g.player;
  p.pos.set(17,0,-16);
  // hold plant for 4s of sim time
  for (let i = 0; i < 90; i++) g.rounds.plant(0.05, p.pos, true);
  return { planted: g.rounds.bombPlanted, site: g.rounds.bombSite, timer: Math.round(g.rounds.bombTimer) };
});
console.log('PLANT', JSON.stringify(plantRes));
await new Promise(r=>setTimeout(r,800));
await page.screenshot({path:'/scratch/work/v6_bomb.png'});

const hudState = await page.evaluate(()=>({
  bombVisible: !document.getElementById('bombBar').classList.contains('hidden'),
  bombTime: document.getElementById('bombTime').textContent,
  scoreT: document.getElementById('scoreT').textContent,
  roundNo: document.getElementById('roundNo').textContent,
}));
console.log('HUD', JSON.stringify(hudState));
console.log('LOGS', logs.slice(0,6).join('\n')||'(none)');
await browser.close(); server.close();
