import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/usr/lib/node_modules/puppeteer-core');
const ROOT='/scratch/work/dust/dist';
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(4210,r));
const browser=await puppeteer.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:470,isMobile:true,hasTouch:true});
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error')logs.push('CONSOLE '+m.text());});
await page.goto('http://localhost:4210/',{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,2500));
await page.click('#btn-play');
await new Promise(r=>setTimeout(r,900));

const setPos = (x,z,yaw=0,pitch=0)=>page.evaluate(([x,z,yaw,pitch])=>{const p=window.__game.player;p.pos.set(x,0,z);p.yaw=yaw;p.pitch=pitch;},[x,z,yaw,pitch]);

await setPos(0,14);
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/scratch/work/v4_ak.png'});

await page.keyboard.press('Digit2');
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/v4_m4.png'});

await page.keyboard.press('Digit3');
await new Promise(r=>setTimeout(r,800));
await page.screenshot({path:'/scratch/work/v4_awp.png'});

// scope via touch button
const sb = await (await page.$('#btn-scope')).boundingBox();
await page.touchscreen.touchStart(sb.x+sb.width/2, sb.y+sb.height/2);
await new Promise(r=>setTimeout(r,900));
await page.screenshot({path:'/scratch/work/v4_scope.png'});
await page.touchscreen.touchEnd();
await new Promise(r=>setTimeout(r,400));

await page.keyboard.press('Digit4');
await new Promise(r=>setTimeout(r,700));
await page.screenshot({path:'/scratch/work/v4_usp.png'});

// body-part damage test (one shot per round, camera synced between)
const results = {};
for (const [name, y] of [['chest', 1.16], ['legs', 0.4], ['head', 1.7]]) {
  await page.evaluate(([y]) => {
    const g = window.__game;
    const bot = g.bots.bots[0];
    bot.pos.set(0, 0, 8); bot.group.position.copy(bot.pos); bot.hp = 100;
    g.player.pos.set(0, 0, 14);
    g.player.yaw = 0;
    g.player.pitch = Math.atan2((bot.pos.y + y) - (g.player.pos.y + 1.62), 6);
    g.weapon.equip('ak', true);
    g.weapon.mag = 30;
    g.weapon.cooldown = 0;
  }, [y]);
  await new Promise(r => setTimeout(r, 250));
  const hp = await page.evaluate(() => {
    const g = window.__game;
    const bot = g.bots.bots[0];
    const before = bot.hp;
    g.weapon.cooldown = 0;
    g.shoot();
    return { before, after: bot.hp };
  });
  results[name] = hp.before - hp.after;
}
console.log('DAMAGE', JSON.stringify(results));

// map views: pit and A platform
await setPos(19,3,0);
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/scratch/work/v4_pit.png'});
await setPos(17,-13,0);
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/scratch/work/v4_platform.png'});

const terr = await page.evaluate(()=>{
  const h = window.__game.map.heightAt;
  return { pit: h(25,0), plat: h(22,-19), bplat: h(-23,-18), mid: h(0,0) };
});
console.log('TERRAIN', JSON.stringify(terr));
console.log('LOGS', logs.slice(0,6).join('\n')||'(none)');
await browser.close(); server.close();
