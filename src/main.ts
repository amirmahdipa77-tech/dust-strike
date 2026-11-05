import * as THREE from 'three';
import './style.css';
import { buildMap, MAP_MIN, MAP_SIZE, CELL } from './map';
import { Player } from './player';
import { Input } from './input';
import { Weapon } from './weapon';
import { BotManager } from './bots';
import { NavGrid } from './nav';
import { HUD } from './hud';
import { SFX } from './audio';
import { SettingsUI } from './ui';
import { settings, onSettingsChange, resetSettings } from './settings';

type State = 'menu' | 'playing' | 'paused' | 'dead' | 'won' | 'settings';

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

const hemi = new THREE.HemisphereLight(0xfffaf0, 0xb3a486, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e2, 1.25);
sun.position.set(38, 62, 24);
scene.add(sun);

// gradient sky dome
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
scene.add(map.mesh);

// distant ground so the horizon is not empty
{
  const g = new THREE.PlaneGeometry(400, 400);
  g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    g,
    new THREE.MeshLambertMaterial({ color: 0xb59d74, fog: true }),
  );
  ground.position.y = -0.15;
  scene.add(ground);
}

const player = new Player();
const weapon = new Weapon();
camera.add(weapon.group);

const nav = new NavGrid({ grid: map.walkable, min: MAP_MIN, size: MAP_SIZE, cell: CELL });
const bots = new BotManager(scene, map.botSpawns, settings.botCount, nav);
let botMeshes = bots.meshes;

const hud = new HUD();
const sfx = new SFX();

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

function spawnSparks(at: THREE.Vector3, count = 5, color?: THREE.Color): void {
  void color;
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
const tracers = new TracerPool(scene, 12);

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
let lastLook = { x: 0, y: 0 };

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
  win: document.getElementById('win') as HTMLElement,
  winStats: document.getElementById('winstats') as HTMLElement,
  goalHint: document.getElementById('goalHint') as HTMLElement,
};

function show(node: HTMLElement, on: boolean): void {
  node.classList.toggle('hidden', !on);
}

function setState(s: State): void {
  state = s;
  show(el.hud, s === 'playing' || s === 'dead');
  show(el.touch, s === 'playing');
  show(el.start, s === 'menu');
  show(el.dead, s === 'dead');
  show(el.pause, s === 'paused');
  show(el.settings, s === 'settings');
  show(el.win, s === 'won');
  input.setEnabled(s === 'playing');
  if (s !== 'playing' && document.pointerLockElement === canvas) document.exitPointerLock?.();
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
  kills = 0;
  bots.setCount(settings.botCount);
  botMeshes = bots.meshes;
  hud.reset(settings.targetKills);
  hud.setKills(0, settings.targetKills);
  hud.setHealth(100);
  weapon.refill();
  player.respawn(map.playerSpawn);
  bots.reset(player.pos);
  el.goalHint.textContent = String(settings.targetKills);
  setState('playing');
}

function togglePause(): void {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') setState('playing');
}

// ---------------------------------------------------------------- settings wiring
const settingsUI = new SettingsUI(() => {
  applySettings();
  settingsUI.refreshAll();
});

function applySettings(): void {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  currentPR = basePR * settings.resolution;
  resize();
  hud.applySettings();
  sfx.setVolume(settings.masterVolume);
  input.joystickScale = settings.joystickScale;
  input.leftHanded = settings.leftHanded;
  document.body.classList.toggle('lefty', settings.leftHanded);
  if (bots.bots.length !== settings.botCount) {
    bots.setCount(settings.botCount);
    botMeshes = bots.meshes;
  }
}

onSettingsChange(() => applySettings());

// ---------------------------------------------------------------- combat
const tmpDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function playerShoot(): { fired: boolean; hit: string | null } {
  if (!player.alive || state !== 'playing') return { fired: false, hit: null };
  if (weapon.reloading) return { fired: false, hit: null };
  if (!weapon.canFire) {
    if (weapon.mag === 0) sfx.empty();
    return { fired: false, hit: null };
  }

  weapon.fire();
  sfx.shot();

  const origin = camera.position.clone();
  camera.getWorldDirection(tmpDir);
  const spread =
    0.003 + Math.min(0.028, player.speed * 0.0021) + (player.onGround ? 0 : 0.018);
  tmpDir.x += (Math.random() - 0.5) * spread;
  tmpDir.y += (Math.random() - 0.5) * spread;
  tmpDir.z += (Math.random() - 0.5) * spread;
  tmpDir.normalize();

  raycaster.set(origin, tmpDir);
  const hits = raycaster.intersectObjects([map.mesh, ...botMeshes], false);

  let end: THREE.Vector3;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    const ud = hit.object.userData as { bot?: any; part?: string };
    if (ud && ud.bot) {
      const head = ud.part === 'head';
      const killed = ud.bot.takeDamage(head ? 120 : 34);
      hud.hit(killed);
      sfx.hit();
      spawnSparks(end, 3);
      if (killed) {
        kills++;
        hud.setKills(kills, settings.targetKills);
        hud.feed(`<b>YOU</b>&nbsp; AK-47&nbsp; ${head ? 'HEADSHOT' : 'ELIMINATED'}`);
        sfx.kill();
        if (kills >= settings.targetKills) {
          el.winStats.textContent = `${kills} kills · ${Math.round(player.health)} HP left`;
          setState('won');
        }
      }
    } else {
      spawnSparks(end, 4);
    }
  } else {
    end = origin.clone().addScaledVector(tmpDir, 80);
  }

  const muzzle = weapon.group.localToWorld(weapon.muzzleLocal.clone());
  tracers.fire(muzzle, end);

  return { fired: true, hit: hits.length > 0 ? 'hit' : null };
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
      deadTimer = 3.2;
      setState('dead');
      hud.feed(`<b>BOT</b>&nbsp; AK-47&nbsp; YOU`);
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

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  const realNow = performance.now();
  const realDt = (realNow - lastRealT) / 1000;
  lastRealT = realNow;
  fpsAccum += realDt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsValue = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
    hud.setFps(fpsValue);
    if (state === 'playing' && fpsValue < 40 && currentPR > basePR * 0.62) {
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

  if (state === 'menu') {
    updateMenuCamera(dt);
  } else if (state === 'playing') {
    const look = input.consumeLook();
    lastLook = look;
    const sens = ('ontouchstart' in window ? SENS_TOUCH : SENS_MOUSE) * settings.sensitivity;
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

    player.syncCamera(camera, weapon.recoilPitch, weapon.shake);
    camera.updateMatrixWorld(true);

    bots.update(dt, player, map.colliders, onBotShoot);

    hud.setHealth(player.health);
    hud.setAmmo(weapon.mag, weapon.reserve, weapon.reloading);
    hud.setSpread(2 + weapon.kick * 8 + Math.min(7, player.speed * 0.85));
  } else if (state === 'dead') {
    deadTimer -= dt;
    el.deadTimer.textContent = String(Math.max(0, Math.ceil(deadTimer)));
    player.update(dt, input, map.colliders);
    player.syncCamera(camera, 0, 0);
    weapon.update({ dt, speed: 0, onGround: true, crouch: false, lookDX: 0, lookDY: 0, landed: false });
    bots.update(dt, player, map.colliders, onBotShoot);
    if (deadTimer <= 0) {
      weapon.refill();
      player.respawn(map.playerSpawn);
      hud.setHealth(100);
      setState('playing');
    }
  } else if (state === 'won' || state === 'paused' || state === 'settings') {
    weapon.group.visible = false;
  }

  if (state !== 'menu') {
    tracers.update(dt);
    updateParticles(dt);
    motes.rotation.y += dt * 0.006;
    hud.update(dt);
  }

  renderer.render(scene, camera);
  void lastLook;
}

// ---------------------------------------------------------------- wiring
document.getElementById('btn-play')?.addEventListener('click', startMatch);
document.getElementById('btn-resume')?.addEventListener('click', () => setState('playing'));
document.getElementById('btn-restart')?.addEventListener('click', startMatch);
document.getElementById('btn-again')?.addEventListener('click', startMatch);
document.getElementById('btn-settings-start')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-pause')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-win')?.addEventListener('click', openSettings);
document.getElementById('btn-settings-close')?.addEventListener('click', closeSettings);
document.getElementById('btn-settings-reset')?.addEventListener('click', () => {
  resetSettings();
  settingsUI.render();
  applySettings();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') setState('paused');
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// perf probe (used by the automated tests)
(window as any).__renderInfo = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
});

// debug hook for automated tests
(window as any).__game = {
  player,
  weapon,
  bots,
  nav,
  map,
  shoot: playerShoot,
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
setState('menu');
animate();
