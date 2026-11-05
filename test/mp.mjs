import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');

// --- server
const srv = spawn('node', ['/scratch/work/dust/server/index.mjs'], { env: { ...process.env, PORT: '8090' }, stdio: 'pipe' });
srv.stdout.on('data', d => process.stdout.write('[server] ' + d));
await new Promise(r => setTimeout(r, 900));

// --- static host
const ROOT='/scratch/work/dust/dist';
const web=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>web.listen(4200,r));

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,env: cleanEnv,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--proxy-server=direct://','--proxy-bypass-list=*']});
const logs=[];
async function makeClient(name){
  const page=await browser.newPage();
  await page.setViewport({width:800,height:400});
  page.on('pageerror',e=>logs.push(`[${name}] PAGEERROR ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')logs.push(`[${name}] ${m.text()}`);});
  await page.goto('http://localhost:4200/',{waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,2200));
  await page.evaluate((n)=>{ localStorage.setItem('duststrike.settings.v2', JSON.stringify({...JSON.parse(localStorage.getItem('duststrike.settings.v2')||'{}'), playerName:n, serverUrl:'ws://localhost:8090/ws'})); }, name);
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,2000));
  return page;
}

const A = await makeClient('alpha');
const B = await makeClient('bravo');

// A creates a server
await A.click('#btn-multiplayer');
await new Promise(r=>setTimeout(r,1200));
await A.screenshot({path:'/scratch/work/mp_lobby.png'});
await A.evaluate(()=>{ const t=[...document.querySelectorAll('#lobbyTabs .tab')].find(b=>b.textContent.includes('CREATE')); t.click(); });
await new Promise(r=>setTimeout(r,400));
await A.screenshot({path:'/scratch/work/mp_create.png'});
await A.evaluate(()=>{ [...document.querySelectorAll('.panel.lobby .big')].find(b=>b.textContent.includes('CREATE')).click(); });
await new Promise(r=>setTimeout(r,1500));
const aState = await A.evaluate(()=>({ state: window.__game.state, room: window.__game.net.room?.id, players: window.__game.net.players.size }));
console.log('A after create', JSON.stringify(aState));

// B browses and joins
await B.click('#btn-multiplayer');
await new Promise(r=>setTimeout(r,1500));
await B.screenshot({path:'/scratch/work/mp_browse.png'});
const card = await B.evaluate(()=>{
  const c=document.querySelector('.roomCard'); if(!c) return null; const t=c.querySelector('.roomName').textContent; c.click(); return t;
});
console.log('B joined room card:', card);
await new Promise(r=>setTimeout(r,1800));

const both = await Promise.all([A,B].map(p=>p.evaluate(()=>({state:window.__game.state, players: window.__game.net.players.size, id: window.__game.net.id}))));
console.log('A', JSON.stringify(both[0]), 'B', JSON.stringify(both[1]));
await A.screenshot({path:'/scratch/work/mp_ingame.png'});

// put B in front of A and shoot
await A.evaluate(()=>{ const g=window.__game; g.player.pos.set(0,0,14); g.player.yaw=0; g.player.pitch=0; });
await B.evaluate(()=>{ const g=window.__game; g.player.pos.set(0,0,8); g.player.yaw=Math.PI; });
await new Promise(r=>setTimeout(r,900));
await A.screenshot({path:'/scratch/work/mp_aim.png'});
const dbg = await A.evaluate(()=>{
  const g = window.__game;
  const out = [];
  for (let i=0;i<3;i++) out.push(g.shoot());
  return {
    shots: out,
    meshes: g.remotes.meshes.length,
    remotes: [...g.net.players.values()].map(p=>[p.id,p.name,p.x.toFixed(1),p.z.toFixed(1),p.hp]),
    me: [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1), g.player.yaw],
  };
});
console.log('DEBUG', JSON.stringify(dbg));
await new Promise(r=>setTimeout(r,1200));
const after = await A.evaluate(()=>({ kills: [...window.__game.net.players.values()].map(p=>`${p.name}:${p.kills}/${p.deaths}/${p.hp}`) }));
console.log('AFTER SHOTS', JSON.stringify(after));
await A.screenshot({path:'/scratch/work/mp_fight.png'});
await A.evaluate(()=>{ document.getElementById('sbToggle').click(); });
await new Promise(r=>setTimeout(r,400));
await A.screenshot({path:'/scratch/work/mp_score.png'});

console.log('LOGS', logs.slice(0,10).join('\n')||'(none)');
await browser.close(); web.close(); srv.kill();
