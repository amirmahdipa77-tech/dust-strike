import * as THREE from 'three';
import './style.css';
import { buildMap, MAP_MIN, MAP_SIZE, CELL } from './map';
import { Player } from './player';
import { Input } from './input';
import { Weapons, WEAPONS, BODY_MULT, type BodyPart, type WeaponId } from './weapons';
import { BotManager } from './bots';
import { NavGrid } from './nav';
import { HUD } from './hud';
import { SFX } from './audio';
import { SettingsUI, BuyMenu, BUY_OPTIONS } from './ui';
import { settings, onSettingsChange, resetSettings } from './settings';
import { Net } from './net';
import { Lobby } from './lobby';
import { RemotePlayers } from './remote';
import { Minimap } from './minimap';
import { impactTexture } from './textures';
import { Rounds, SITES } from './rounds';
import { progress, addXp, isUnlocked, levelFor, xpInLevel, saveProgress } from './progress';

type State = 'menu' | 'playing' | 'paused' | 'dead' | 'won' | 'settings' | 'lobby' | 'online';

const SENS_TOUCH = 0.0032;
const SENS_MOUSE = 0.0022;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  alpha: false,
});
const basePR = Math.min(window.devicePixelRatio || 1, 1.75);
let currentPR = basePR;
renderer.setPixelRatio(currentPR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY_HORIZON = new THREE.Color(0xe8d6b2);
scene.background = SKY_HORIZON;
scene.fog = new THREE.Fog(SKY_HORIZON, 42, 118);

const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xfffaf0, 0xc0b193, 1.35));

// warm fill lights for the enclosed tunnels and B site
for (const [x, y, z, intensity, dist] of [
  [-19, 3.4, 8, 14, 16],
  [-19, 3.4, -3, 12, 14],
  [-18, 3.2, -14, 12, 16],
  [0, 3.4, 0, 9, 14],
] as const) {
  const lamp = new THREE.PointLight(0xffd9a0, intensity, dist, 2);
  lamp.position.set(x, y, z);
  scene.add(lamp);
}
const sun = new THREE.DirectionalLight(0xfff6e2, 1.25);
sun.position.set(38, 62, 24);
scene.add(sun);

{
  const skyGeo = new THREE.SphereGeometry(200, 20, 14);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x87b0d8);
  const horizon = new THREE.Color(0xf0ddb6);
  const ground = new THREE.Color(0xc2a97f);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 200;
    if (t >= 0) c.copy(horizon).lerp(top, Math.min(1, Math.pow(t * 1.5, 0.75)));
    else c.copy(horizon).lerp(ground, Math.min(1, -t * 3));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.frustumCulled = false;
  scene.add(sky);
}

// ---------------------------------------------------------------- world
const map = buildMap();
for (const m of map.meshes) scene.add(m);

{
  const g = new THREE.PlaneGeometry(400, 400);
  g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xb59d74 }));
  ground.position.y = -2.6;
  scene.add(ground);
}

const player = new Player();
const weapon = new Weapons();

// the viewmodel lives in its own scene so it never clips into walls
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.01, 6);
viewScene.add(viewCamera);
viewScene.add(new THREE.HemisphereLight(0xfff8ee, 0xb8ab8e, 1.6));
const viewSun = new THREE.DirectionalLight(0xfff2d8, 1.5);
viewSun.position.set(0.6, 1.4, 0.8);
viewScene.add(viewSun);
viewCamera.add(weapon.group);

player.terrain = map.heightAt;

const nav = new NavGrid({ grid: map.walkable, min: MAP_MIN, size: MAP_SIZE, cell: CELL });
const bots = new BotManager(scene, map.botSpawns, settings.botCount, nav);
bots.terrain = map.heightAt;
let botMeshes = bots.meshes;

const remotes = new RemotePlayers(scene);
const net = new Net();

const hud = new HUD();
const sfx = new SFX();
const minimapEl = document.getElementById('minimap') as HTMLCanvasElement;
const minimap = new Minimap(minimapEl, map);
let minimapAccum = 0;

// ---------------------------------------------------------------- particles
const MAX_PARTICLES = 140;
const pGeo = new THREE.BufferGeometry();
const pPositions = new Float32Array(MAX_PARTICLES * 3);
const pVelocities = new Float32Array(MAX_PARTICLES * 3);
const pLives = new Float32Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) pPositions[i * 3 + 1] = -999;
pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
const particles = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    color: 0xe8d4aa,
    size: 0.085,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  }),
);
particles.frustumCulled = false;
scene.add(particles);
let pCursor = 0;

function spawnSparks(at: THREE.Vector3, count = 5): void {
  for (let i = 0; i < count; i++) {
    const idx = pCursor;
    pCursor = (pCursor + 1) % MAX_PARTICLES;
    pPositions[idx * 3] = at.x;
    pPositions[idx * 3 + 1] = at.y;
    pPositions[idx * 3 + 2] = at.z;
    pVelocities[idx * 3] = (Math.random() - 0.5) * 3.6;
    pVelocities[idx * 3 + 1] = Math.random() * 2.8;
    pVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 3.6;
    pLives[idx] = 0.3 + Math.random() * 0.3;
  }
}

function updateParticles(dt: number): void {
  let dirty = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLives[i] <= 0) continue;
    pLives[i] -= dt;
    pVelocities[i * 3 + 1] -= 7 * dt;
    pPositions[i * 3] += pVelocities[i * 3] * dt;
    pPositions[i * 3 + 1] += pVelocities[i * 3 + 1] * dt;
    pPositions[i * 3 + 2] += pVelocities[i * 3 + 2] * dt;
    if (pLives[i] <= 0) pPositions[i * 3 + 1] = -999;
    dirty = true;
  }
  if (dirty) (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

// ---------------------------------------------------------------- tracers
class TracerPool {
  private lines: { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number }[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffe9b0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const line = new THREE.Line(g, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.lines.push({ line, mat, life: 0 });
    }
  }

  fire(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.lines[this.cursor];
    this.cursor = (this.cursor + 1) % this.lines.length;
    const attr = t.line.geometry.attributes.position as THREE.BufferAttribute;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.life = 0.05;
    t.line.visible = true;
    t.mat.opacity = 0.9;
  }

  update(dt: number): void {
    for (const t of this.lines) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / 0.05) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
}
const tracers = new TracerPool(scene, 14);

// ---------------------------------------------------------------- bullet holes
class DecalPool {
  private items: { mesh: THREE.Mesh; life: number }[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.PlaneGeometry(0.22, 0.22);
    const mat = new THREE.MeshBasicMaterial({
      map: impactTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 0 });
    }
  }

  place(point: THREE.Vector3, normal: THREE.Vector3): void {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.mesh.position.copy(point).addScaledVector(normal, 0.012);
    item.mesh.lookAt(point.clone().add(normal));
    item.mesh.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.8 + Math.random() * 0.5;
    item.mesh.scale.set(s, s, s);
    item.mesh.visible = true;
    item.life = 25;
  }

  update(dt: number): void {
    for (const i of this.items) {
      if (i.life <= 0) continue;
      i.life -= dt;
      if (i.life <= 0) i.mesh.visible = false;
    }
  }
}
const decals = new DecalPool(scene, 24);

// ---------------------------------------------------------------- dust motes
const moteCount = 300;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(moteCount * 3);
for (let i = 0; i < moteCount; i++) {
  motePos[i * 3] = (Math.random() - 0.5) * 64;
  motePos[i * 3 + 1] = Math.random() * 14;
  motePos[i * 3 + 2] = (Math.random() - 0.5) * 64;
}
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(
  moteGeo,
  new THREE.PointsMaterial({
    color: 0xf6e6c2,
    size: 0.06,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }),
);
motes.frustumCulled = false;
scene.add(motes);

// ---------------------------------------------------------------- state
let state: State = 'menu';
let prevState: State = 'menu';
let kills = 0;
let deadTimer = 0;
let menuAngle = 0;
let online = false;
let mode: 'dm' | 'comp' = 'dm';
const rounds = new Rounds();
let inputAccum = 0;
let scoreboardOpen = false;

const input = new Input(canvas, () => togglePause());
const raycaster = new THREE.Raycaster();
raycaster.far = 140;

const el = {
  hud: document.getElementById('hud') as HTMLElement,
  touch: document.getElementById('touch') as HTMLElement,
  start: document.getElementById('start') as HTMLElement,
  dead: document.getElementById('dead') as HTMLElement,
  deadTimer: document.getElementById('deadtimer') as HTMLElement,
  pause: document.getElementById('pause') as HTMLElement,
  settings: document.getElementById('settings') as HTMLElement,
  lobby: document.getElementById('lobby') as HTMLElement,
  win: document.getElementById('win') as HTMLElement,
  winStats: document.getElementById('winstats') as HTMLElement,
  goalHint: document.getElementById('goalHint') as HTMLElement,
  scoreboard: document.getElementById('scoreboard') as HTMLElement,
  sbRoom: document.getElementById('sbRoom') as HTMLElement,
  sbMeta: document.getElementById('sbMeta') as HTMLElement,
  sbRows: document.getElementById('sbRows') as HTMLElement,
  netInfo: document.getElementById('netInfo') as HTMLElement,
  sbToggle: document.getElementById('sbToggle') as HTMLElement,
  leave: document.getElementById('btn-leave') as HTMLElement,
  useBtn: document.getElementById('btn-use') as HTMLElement,
  buyPauseBtn: document.getElementById('btn-buy-pause') as HTMLElement,
  pcLevel: document.getElementById('pcLevel') as HTMLElement,
  pcName: document.getElementById('pcName') as HTMLElement,
  pcXpBar: document.getElementById('pcXpBar') as HTMLElement,
  pcXpText: document.getElementById('pcXpText') as HTMLElement,
};

function show(node: HTMLElement, on: boolean): void {
  node.classList.toggle('hidden', !on);
}

function setState(s: State): void {
  state = s;
  const inGame = s === 'playing' || s === 'online' || s === 'dead';
  show(el.hud, inGame);
  show(el.touch, s === 'playing' || s === 'online');
  show(el.start, s === 'menu');
  show(el.dead, s === 'dead');
  show(el.pause, s === 'paused');
  show(el.settings, s === 'settings');
  show(el.lobby, s === 'lobby');
  show(el.win, s === 'won');
  show(el.sbToggle, s === 'online');
  show(el.useBtn, s === 'playing' && mode === 'comp');
  show(el.buyPauseBtn, s === 'paused' && mode === 'comp');
  hud.showMoney(mode === 'comp' && (s === 'playing' || s === 'dead'));
  show(minimapEl, settings.showMinimap && (s === 'playing' || s === 'online' || s === 'dead'));
  show(el.leave, s === 'paused' && online);
  show(el.netInfo, s === 'online');
  if (s !== 'online') {
    scoreboardOpen = false;
    show(el.scoreboard, false);
  }
  input.setEnabled(s === 'playing' || s === 'online');
  if (s !== 'playing' && s !== 'online' && document.pointerLockElement === canvas) {
    document.exitPointerLock?.();
  }
}

function openSettings(): void {
  prevState = state === 'settings' ? prevState : state;
  setState('settings');
}

function closeSettings(): void {
  setState(prevState === 'settings' ? 'menu' : prevState);
}

function startMatch(): void {
  sfx.init();
  online = false;
  kills = 0;
  bots.setCount(settings.botCount);
  botMeshes = bots.meshes;
  remotes.clear();
  hud.reset(settings.targetKills);
  hud.setKills(0, settings.targetKills);
  hud.setHealth(100);
  weapon.refill();
  player.respawn(map.playerSpawn);
  bots.reset(player.pos);
  el.goalHint.textContent = String(settings.targetKills);
  hud.setRound(false, 0, 0, 0, '');
  hud.showMoney(false);
  hud.setBomb(false, 0, 0);
  hud.setPlant(0);
  show(el.useBtn, false);
  setState('playing');
}

function togglePause(): void {
  if (state === 'playing' || state === 'online') setState('paused');
  else if (state === 'paused') setState(online ? 'online' : 'playing');
}

// ---------------------------------------------------------------- multiplayer
const lobby = new Lobby(net, () => undefined, () => setState('menu'));

net.onJoined = (spawn) => {
  sfx.init();
  online = true;
  kills = 0;
  bots.setCount(0);
  botMeshes = [];
  remotes.clear();
  hud.reset(net.room?.kills ?? settings.targetKills);
  hud.setKills(0, net.room?.kills ?? settings.targetKills);
  hud.setHealth(100);
  weapon.refill();
  player.respawn(new THREE.Vector3(spawn.x, 0, spawn.z));
  player.yaw = spawn.yaw;
  setState('online');
  hud.feed(`<b>JOINED</b> ${net.room?.name ?? ''} · code ${net.room?.id ?? ''}`);
};

net.onPlayers = () => {
  remotes.sync([...net.players.values()], net.id);
  const self = net.players.get(net.id);
  if (self) {
    hud.setHealth(self.hp);
    hud.setKills(self.kills, net.room?.kills ?? settings.targetKills);
    if (!self.alive && state === 'online') {
      setState('dead');
      deadTimer = 3;
    }
    if (self.alive && state === 'dead') {
      setState('online');
    }
  }
  const count = net.players.size;
  el.netInfo.textContent = `${count} PLAYER${count === 1 ? '' : 'S'} · ${net.ping}ms`;
  if (scoreboardOpen) renderScoreboard();
};

net.onShot = (msg) => {
  const from = new THREE.Vector3(msg.from.x, msg.from.y, msg.from.z);
  const to = new THREE.Vector3(msg.to.x, msg.to.y, msg.to.z);
  if (msg.by !== net.id) {
    tracers.fire(from, to);
    remotes.flash(msg.by);
    sfx.botShot();
  }
};

net.onDamage = (msg) => {
  if (msg.target === net.id) {
    hud.damage(null);
    sfx.hurt();
  }
  if (msg.by === net.id) {
    hud.hit(false);
    sfx.hit();
  }
};

net.onKill = (msg) => {
  const killer = net.players.get(msg.killer);
  const victim = net.players.get(msg.victim);
  if (msg.killer === net.id) {
    hud.hit(true);
    sfx.kill();
    hud.feed(`<b>YOU</b>&nbsp; ${msg.head ? 'HEADSHOT' : 'ELIMINATED'} ${victim?.name ?? ''}`);
  } else if (msg.victim === net.id) {
    hud.feed(`<b>${killer?.name ?? ''}</b>&nbsp; ELIMINATED YOU`);
  } else {
    hud.feed(`<b>${killer?.name ?? ''}</b> → ${victim?.name ?? ''}`);
  }
};

net.onRespawn = (spawn) => {
  weapon.refill();
  player.respawn(new THREE.Vector3(spawn.x, 0, spawn.z));
  player.yaw = spawn.yaw;
  hud.setHealth(100);
  if (state === 'dead') setState('online');
};

net.onMatchOver = (msg) => {
  el.winStats.textContent = `${msg.name} reached ${msg.kills} kills`;
  setState('won');
};

net.onStatus = () => {
  lobby.refreshStatus();
  if (net.status === 'error' && online) {
    online = false;
    setState('menu');
    hud.feed(`<b>DISCONNECTED</b> ${net.lastError}`);
  }
};

function leaveServer(): void {
  net.leaveRoom();
  net.close();
  online = false;
  remotes.clear();
  setState('menu');
}

function renderScoreboard(): void {
  if (!net.room) return;
  el.sbRoom.textContent = `${net.room.name} · ${net.room.id}`;
  el.sbMeta.textContent = `${net.players.size} / ${net.room.max} · ${net.room.kills} kills to win`;
  const rows = [...net.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  el.sbRows.innerHTML = '';
  for (const p of rows) {
    const row = document.createElement('div');
    row.className = 'sbRow' + (p.id === net.id ? ' me' : '') + (p.alive ? '' : ' dead');
    row.innerHTML = `<div><span class="sbTeam ${p.team}">${p.team}</span>${escapeHtml(p.name)}</div>
      <div class="k">${p.kills}</div><div class="d">${p.deaths}</div>`;
    el.sbRows.appendChild(row);
  }
}

function toggleScoreboard(): void {
  if (state !== 'online') return;
  scoreboardOpen = !scoreboardOpen;
  show(el.scoreboard, scoreboardOpen);
  if (scoreboardOpen) renderScoreboard();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ---------------------------------------------------------------- competitive
let buyOpen = false;

function updateProfileCard(): void {
  const xp = xpInLevel(progress.xp);
  el.pcLevel.textContent = String(progress.level);
  el.pcName.textContent = progress.name;
  el.pcXpBar.style.width = `${xp.pct}%`;
  el.pcXpText.textContent = `${xp.current} / ${xp.needed} XP · LV ${progress.level}`;
}

function grantXp(amount: number): void {
  const before = progress.level;
  const levelled = addXp(amount);
  if (levelled) {
    const unlocked = progress.level === 2 ? 'M4A1 UNLOCKED' : progress.level === 3 ? 'AWP UNLOCKED' : 'KEEP GOING';
    hud.banner(`LEVEL ${progress.level}`, unlocked, 3000);
    sfx.kill();
  }
  void before;
  updateProfileCard();
}

const buy = new BuyMenu(
  (id) => {
    const opt = BUY_OPTIONS.find((o) => o.id === id);
    if (!opt) return;
    if (!rounds.spend(opt.price)) return;
    if (id === 'ammo') {
      weapon.refill();
    } else {
      weapon.equip(id as WeaponId, true);
    }
    buy.close();
  },
  () => {
    buyOpen = false;
    input.setEnabled(state === 'playing' || state === 'online');
  },
);

function openBuy(): void {
  if (mode !== 'comp' || rounds.phase !== 'freeze') return;
  buyOpen = true;
  buy.open(rounds.money, weapon.current, progress.level);
  input.setEnabled(false);
}

function closeBuy(): void {
  if (buyOpen) buy.close();
}

function spawnRound(): void {
  weapon.refill();
  weapon.equip('usp', true);
  player.respawn(map.playerSpawn);
  player.health = 100;
  hud.setHealth(100);
  bots.reset(player.pos);
  bots.bombTarget = null;
  remotes.clear();
}

function startCompetitive(): void {
  sfx.init();
  mode = 'comp';
  online = false;
  kills = 0;
  bots.setCount(Math.max(3, settings.botCount));
  botMeshes = bots.meshes;
  remotes.clear();
  rounds.resetMatch();
  hud.reset(0);
  hud.showMoney(true);
  show(el.useBtn, true);
  spawnRound();
  setState('playing');
  hud.banner(`ROUND ${rounds.round}`, 'buy time · press B', 2600);
}

rounds.hooks = {
  onRoundStart: (n) => {
    spawnRound();
    hud.banner(`ROUND ${n}`, rounds.scoreT + ' : ' + rounds.scoreCT, 2000);
    if (mode === 'comp') setTimeout(() => openBuy(), 260);
  },
  onRoundEnd: (winner, reason, sT, sCT) => {
    hud.banner(winner === 'T' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN', reason, 3200);
    hud.feed(`<b>${winner}</b> · ${reason} · ${sT}:${sCT}`);
  },
  onMatchEnd: (winner) => {
    el.winStats.textContent = `${winner === 'T' ? 'Terrorists' : 'Counter-Terrorists'} won · ${rounds.scoreT}:${rounds.scoreCT}`;
    setState('won');
    grantXp(150);
  },
  onPlant: () => {
    sfx.beep(true);
    hud.banner('BOMB PLANTED', 'defend it for 40 seconds', 2200);
    grantXp(60);
  },
  onExplode: () => {
    sfx.hurt();
    hud.banner('BOMB EXPLODED', '', 2400);
  },
  onDefuse: () => {
    hud.banner('BOMB DEFUSED', '', 2200);
  },
  onBeep: (fast) => sfx.beep(fast),
};

// ---------------------------------------------------------------- settings
const settingsUI = new SettingsUI(() => {
  applySettings();
  settingsUI.refreshAll();
});

function applySettings(): void {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  viewCamera.fov = settings.fov;
  viewCamera.updateProjectionMatrix();
  currentPR = basePR * settings.resolution;
  resize();
  hud.applySettings();
  sfx.setVolume(settings.masterVolume);
  input.joystickScale = settings.joystickScale;
  input.leftHanded = settings.leftHanded;
  document.body.classList.toggle('lefty', settings.leftHanded);
  show(minimapEl, settings.showMinimap && (state === 'playing' || state === 'online' || state === 'dead'));
  if (!online && bots.bots.length !== settings.botCount) {
    bots.setCount(settings.botCount);
    botMeshes = bots.meshes;
  }
}

onSettingsChange(() => applySettings());

// ---------------------------------------------------------------- combat
const tmpDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function playerShoot(): { fired: boolean; hit: string | null } {
  if (!player.alive) return { fired: false, hit: null };
  if (state !== 'playing' && state !== 'online') return { fired: false, hit: null };
  if (mode === 'comp' && rounds.phase !== 'live') return { fired: false, hit: null };
  if (weapon.reloading) return { fired: false, hit: null };
  if (!weapon.canFire) {
    if (weapon.mag === 0) sfx.empty();
    return { fired: false, hit: null };
  }

  const def = weapon.def;
  weapon.fire();
  sfx.shot(def.sound);

  const origin = camera.position.clone();
  camera.getWorldDirection(tmpDir);
  const movePenalty = Math.min(0.03, player.speed * def.moveSpread);
  const spread =
    (weapon.zoom ? def.spread * 0.35 : def.spread) +
    movePenalty +
    (player.onGround ? 0 : 0.02);
  tmpDir.x += (Math.random() - 0.5) * spread;
  tmpDir.y += (Math.random() - 0.5) * spread;
  tmpDir.z += (Math.random() - 0.5) * spread;
  tmpDir.normalize();

  raycaster.set(origin, tmpDir);
  const targets = online ? [...map.meshes, ...remotes.meshes] : [...map.meshes, ...botMeshes];
  const hits = raycaster.intersectObjects(targets, false);

  let end: THREE.Vector3;
  let hitId: string | null = null;
  let part: BodyPart | null = null;
  let dmg = 0;

  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    const ud = hit.object.userData as { bot?: any; remoteId?: string; part?: BodyPart };

    if (ud?.part) {
      part = ud.part;
      dmg = Math.round(def.dmg * BODY_MULT[part]);
    }

    if (ud?.bot) {
      const killed = ud.bot.takeDamage(dmg);
      hud.hit(killed);
      hud.partHit(part === 'head' ? 'HEADSHOT' : part === 'stomach' ? 'STOMACH' : part === 'leg' ? 'LEGS' : 'CHEST');
      sfx.hit();
      spawnSparks(end, 3);
      if (killed) {
        kills++;
        if (mode === 'comp') {
          rounds.addMoney(600);
          grantXp(25);
        }
        hud.setKills(kills, settings.targetKills);
        hud.feed(`<b>YOU</b>&nbsp; ${def.name}&nbsp; ${part === 'head' ? 'HEADSHOT' : 'ELIMINATED'}`);
        sfx.kill();
        if (kills >= settings.targetKills) {
          el.winStats.textContent = `${kills} kills · ${Math.round(player.health)} HP left`;
          setState('won');
        }
      }
    } else if (ud?.remoteId && online) {
      hitId = ud.remoteId;
      hud.partHit(part === 'head' ? 'HEADSHOT' : part === 'stomach' ? 'STOMACH' : part === 'leg' ? 'LEGS' : 'CHEST');
      spawnSparks(end, 3);
    } else {
      spawnSparks(end, 4);
      if (hit.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        decals.place(end, n);
      }
    }
  } else {
    end = origin.clone().addScaledVector(tmpDir, 80);
  }

  const muzzle = weapon.muzzleLocal.clone().multiplyScalar(weapon.model.scale).add(weapon.model.base);
  camera.localToWorld(muzzle);
  tracers.fire(muzzle, end);

  if (online) {
    net.sendShot(hitId, { x: end.x, y: end.y, z: end.z }, hitId ? dmg : 0, part === 'head');
  }

  return { fired: true, hit: hitId };
}

function damageAngle(from: THREE.Vector3): number {
  const dx = from.x - player.pos.x;
  const dz = from.z - player.pos.z;
  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);
  const right = dx * cosY - dz * sinY;
  const forward = -dx * sinY - dz * cosY;
  return Math.atan2(right, forward);
}

function onBotShoot(from: THREE.Vector3, to: THREE.Vector3): void {
  tracers.fire(from, to);
  sfx.botShot();
  if (!player.alive) return;

  const eye = tmpVec.set(player.pos.x, player.eyeY, player.pos.z);
  if (to.distanceTo(eye) < 0.22) {
    const dmg = 5 + Math.random() * 6;
    const died = player.takeDamage(dmg);
    hud.damage(damageAngle(from));
    sfx.hurt();
    hud.setHealth(player.health);
    if (died) {
      if (mode === 'comp') {
        hud.banner('ELIMINATED', 'round continues', 2600);
      } else {
        deadTimer = 3.2;
        setState('dead');
        hud.feed(`<b>BOT</b>&nbsp; AK-47&nbsp; YOU`);
      }
    }
  }
}

// ---------------------------------------------------------------- loop
let lastT = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let fpsValue = 60;
let slowTime = 0;
let lastRealT = performance.now();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewCamera.aspect = w / h;
  viewCamera.fov = camera.fov;
  viewCamera.updateProjectionMatrix();
  renderer.setPixelRatio(currentPR);
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 140));

function updateMenuCamera(dt: number): void {
  menuAngle += dt * 0.1;
  camera.position.set(Math.sin(menuAngle) * 22 + 4, 12, Math.cos(menuAngle) * 22 - 6);
  camera.lookAt(2, 1.2, -4);
  weapon.group.visible = false;
}

function stepCombat(dt: number): void {
  // weapon switching
  if (input.switchRequest !== null) {
    const wanted = Object.values(WEAPONS).find((w) => w.slot === input.switchRequest);
    if (wanted) weapon.equip(wanted.id as WeaponId);
    input.switchRequest = null;
  }
  if (input.cycleRequest !== 0) {
    weapon.cycle(input.cycleRequest);
    input.cycleRequest = 0;
  }

  // scope
  const wantZoom = weapon.def.scope && input.zoomHeld && !weapon.reloading && player.alive;
  weapon.setZoom(wantZoom);
  const targetFov = weapon.zoom ? weapon.def.zoomFov ?? settings.fov : settings.fov;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 15);
    camera.updateProjectionMatrix();
  }
  weapon.group.visible = !weapon.zoom;
  hud.setScope(weapon.zoom);

  const look = input.consumeLook();
  const sensMul = weapon.zoom ? 0.42 : 1;
  const sens = ('ontouchstart' in window ? SENS_TOUCH : SENS_MOUSE) * settings.sensitivity * sensMul;
  player.applyLook(look.x, look.y, sens, settings.invertY);

  input.sample();
  player.update(dt, input, map.colliders);

  weapon.update({
    dt,
    speed: player.speed,
    onGround: player.onGround,
    crouch: player.crouching,
    lookDX: look.x,
    lookDY: look.y,
    landed: player.landed,
  });
  weapon.group.visible = true;

  if (input.consumeReload()) weapon.startReload();
  if (input.firing) playerShoot();

  player.syncCamera(camera, weapon.recoilPitch, weapon.shake, dt);
  camera.updateMatrixWorld(true);

  hud.setAmmo(weapon.mag, weapon.reserve, weapon.reloading);
  hud.setWeaponSlot(weapon.def.slot);
  hud.setWeaponName(weapon.def.name);
  hud.setScopeAmmo(weapon.mag, weapon.reserve);

  minimapAccum += dt;
  if (minimapAccum > 0.08 && settings.showMinimap) {
    minimapAccum = 0;
    const blips = online
      ? [...net.players.values()]
          .filter((p) => p.id !== net.id && p.alive)
          .map((p) => ({ x: p.x, z: p.z, color: p.team === 'T' ? '#e0a75a' : '#7ab0e0' }))
      : bots.bots
          .filter((b) => b.alive)
          .map((b) => ({ x: b.pos.x, z: b.pos.z, color: '#ff5a45' }));
    minimap.draw(player.pos.x, player.pos.z, player.yaw, blips);
  }
  show(minimapEl, settings.showMinimap && (state === 'playing' || state === 'online'));
  hud.setSpread(2 + weapon.kick * 8 + Math.min(7, player.speed * 0.85));
}

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  const realDt = (now - lastRealT) / 1000;
  lastRealT = now;
  fpsAccum += realDt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsValue = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
    hud.setFps(fpsValue);
    if ((state === 'playing' || state === 'online') && fpsValue < 40 && currentPR > basePR * 0.62) {
      slowTime += 0.5;
      if (slowTime > 2) {
        currentPR = Math.max(basePR * 0.6, currentPR - 0.22);
        resize();
        slowTime = 0;
      }
    } else {
      slowTime = 0;
    }
  }

  if (state === 'menu' || state === 'lobby') {
    updateMenuCamera(dt);
  } else if (state === 'playing' || state === 'online') {
    stepCombat(dt);

    if (online) {
      remotes.update(dt);
      hud.setHealth(net.players.get(net.id)?.hp ?? player.health);
      inputAccum += dt;
      if (inputAccum >= 0.05) {
        inputAccum = 0;
        net.sendInput(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.pitch, player.speed > 0.6);
      }
    } else {
      if (mode === 'comp') {
        const botOnBomb =
          rounds.bombPlanted &&
          bots.bots.some(
            (b) => b.alive && Math.hypot(b.pos.x - rounds.bombX, b.pos.z - rounds.bombZ) < 1.6,
          );
        bots.bombTarget = rounds.bombPlanted ? { x: rounds.bombX, z: rounds.bombZ } : null;

        rounds.tick(dt, {
          playerAlive: player.alive,
          playerPos: player.pos,
          botsAlive: bots.aliveCount,
          botOnBomb,
          botDefusing: botOnBomb,
        });

        if (rounds.phase === 'live' && !rounds.bombPlanted && input.useHeld && player.alive) {
          rounds.plant(dt, player.pos, true);
        }
        if (input.buyPressed) {
          input.buyPressed = false;
          if (rounds.phase === 'freeze') {
            if (buyOpen) closeBuy();
            else openBuy();
          }
        }
        if (rounds.phase !== 'freeze' && buyOpen) closeBuy();

        hud.setRound(true, rounds.scoreT, rounds.scoreCT, rounds.round, rounds.roundTimer);
        hud.setBomb(rounds.bombPlanted, rounds.bombTimer, rounds.defuseProgress);
        hud.setPlant(rounds.plantProgress);
        hud.setMoney(rounds.money);
      } else {
        hud.setRound(false, 0, 0, 0, '');
      }

      bots.update(dt, player, map.colliders, onBotShoot);
      hud.setHealth(player.health);
    }
  } else if (state === 'dead') {
    deadTimer -= dt;
    el.deadTimer.textContent = String(Math.max(0, Math.ceil(deadTimer)));
    player.update(dt, input, map.colliders);
    player.syncCamera(camera, 0, 0, dt);
    weapon.update({ dt, speed: 0, onGround: true, crouch: false, lookDX: 0, lookDY: 0, landed: false });
    if (!online) {
      bots.update(dt, player, map.colliders, onBotShoot);
      if (deadTimer <= 0) {
        weapon.refill();
        player.respawn(map.playerSpawn);
        hud.setHealth(100);
        setState('playing');
      }
    } else {
      remotes.update(dt);
    }
  } else if (state === 'won' || state === 'paused' || state === 'settings') {
    weapon.group.visible = false;
    hud.setScope(false);
    if (online) remotes.update(dt);
  }

  if (state !== 'menu' && state !== 'lobby') {
    tracers.update(dt);
    decals.update(dt);
    updateParticles(dt);
    motes.rotation.y += dt * 0.006;
    hud.update(dt);
  }

  renderer.autoClear = false;
  renderer.clear();
  renderer.render(scene, camera);
  if (weapon.group.visible) {
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
  }
}

// ---------------------------------------------------------------- wiring
document.getElementById('btn-play')?.addEventListener('click', startMatch);
document.getElementById('btn-competitive')?.addEventListener('click', startCompetitive);
document.getElementById('btn-buy-pause')?.addEventListener('click', () => openBuy());
document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
  setState('lobby');
  lobby.show();
});
document.getElementById('btn-resume')?.addEventListener('click', () => setState(online ? 'online' : 'playing'));
document.getElementById('btn-restart')?.addEventListener('click', () => (online ? leaveServer() : startMatch()));
document.getElementById('btn-leave')?.addEventListener('click', leaveServer);
document.getElementById('btn-again')?.addEventListener('click', () => (online ? leaveServer() : startMatch()));
document.getElementById('btn-settings-start')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-pause')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-win')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-close')?.addEventListener('click', closeSettings);
document.getElementById('btn-settings-reset')?.addEventListener('click', () => {
  resetSettings();
  settingsUI.render();
  applySettings();
});
el.sbToggle.addEventListener('click', toggleScoreboard);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (!scoreboardOpen) toggleScoreboard();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab' && scoreboardOpen) toggleScoreboard();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'playing' || state === 'online')) setState('paused');
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

(window as any).__renderInfo = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
});

(window as any).__game = {
  player,
  weapon,
  bots,
  nav,
  map,
  net,
  remotes,
  rounds,
  get mode() {
    return mode;
  },
  openBuy,
  shoot: playerShoot,
  startMatch,
  get state() {
    return state;
  },
  get kills() {
    return kills;
  },
};

bots.reset(map.playerSpawn);
player.respawn(map.playerSpawn);
applySettings();
el.goalHint.textContent = String(settings.targetKills);
updateProfileCard();
setState('menu');
animate();
