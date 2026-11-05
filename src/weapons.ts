import * as THREE from 'three';

/** Multi-weapon viewmodel: AK-47, M4A1, AWP, USP — with recoil, reload, switch and scope. */

export type WeaponId = 'ak' | 'm4' | 'awp' | 'usp';
export type BodyPart = 'head' | 'chest' | 'stomach' | 'leg';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: number;
  kind: 'rifle' | 'sniper' | 'pistol';
  dmg: number;
  rpm: number;
  mag: number;
  reserve: number;
  reloadTime: number;
  spread: number;
  moveSpread: number;
  recoil: number;
  auto: boolean;
  zoomFov?: number;
  moveMul: number;
  sound: 'rifle' | 'sniper' | 'pistol';
  body: number;
  accent: number;
  wood: boolean;
  scope: boolean;
  modelLen: number;
  pistol: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ak: {
    id: 'ak', name: 'AK-47', slot: 1, kind: 'rifle', dmg: 36, rpm: 600, mag: 30, reserve: 90,
    reloadTime: 2.15, spread: 0.0034, moveSpread: 0.0022, recoil: 0.0105, auto: true, moveMul: 1,
    sound: 'rifle', body: 0x2a2d33, accent: 0x7a4f28, wood: true, scope: false, modelLen: 1, pistol: false,
  },
  m4: {
    id: 'm4', name: 'M4A1', slot: 2, kind: 'rifle', dmg: 33, rpm: 666, mag: 30, reserve: 90,
    reloadTime: 2.0, spread: 0.0029, moveSpread: 0.0019, recoil: 0.0082, auto: true, moveMul: 1,
    sound: 'rifle', body: 0x23262b, accent: 0x2f3540, wood: false, scope: false, modelLen: 1, pistol: false,
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 3, kind: 'sniper', dmg: 115, rpm: 41, mag: 10, reserve: 30,
    reloadTime: 3.4, spread: 0.0006, moveSpread: 0.012, recoil: 0.055, auto: false, zoomFov: 22,
    moveMul: 0.82, sound: 'sniper', body: 0x1f3324, accent: 0x27412c, wood: false, scope: true,
    modelLen: 1.35, pistol: false,
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 4, kind: 'pistol', dmg: 26, rpm: 400, mag: 12, reserve: 48,
    reloadTime: 1.75, spread: 0.0045, moveSpread: 0.003, recoil: 0.009, auto: false, moveMul: 1.04,
    sound: 'pistol', body: 0x22262b, accent: 0x2b3038, wood: false, scope: false, modelLen: 0.55,
    pistol: true,
  },
};

export const BODY_MULT: Record<BodyPart, number> = {
  head: 4,
  chest: 1,
  stomach: 1.25,
  leg: 0.72,
};

interface Frame {
  dt: number;
  speed: number;
  onGround: boolean;
  crouch: boolean;
  lookDX: number;
  lookDY: number;
  landed: boolean;
}

interface Shell {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

interface Model {
  group: THREE.Group;
  mag: THREE.Mesh | null;
  bolt: THREE.Mesh | null;
  flash: THREE.Mesh;
  muzzle: THREE.Vector3;
  base: THREE.Vector3;
  scale: number;
}

export class Weapons {
  group = new THREE.Group();
  current: WeaponId = 'ak';
  zoom = false;

  mag = 30;
  reserve = 90;
  cooldown = 0;
  reloading = false;
  kick = 0;
  recoilPitch = 0;
  shake = 0;
  switching = 0;

  private ammo: Record<WeaponId, { mag: number; reserve: number }> = {
    ak: { mag: 30, reserve: 90 },
    m4: { mag: 30, reserve: 90 },
    awp: { mag: 10, reserve: 30 },
    usp: { mag: 12, reserve: 48 },
  };
  private models = new Map<WeaponId, Model>();
  private reloadTimer = 0;
  private flashTimer = 0;
  private shells: Shell[] = [];
  private shellCursor = 0;
  private bobPhase = 0;
  private sway = new THREE.Vector2();
  private swayTarget = new THREE.Vector2();
  private landDip = 0;
  private shotIndex = 0;
  private idle = 0;

  constructor() {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const m = buildModel(WEAPONS[id]);
      m.group.visible = false;
      this.group.add(m.group);
      this.models.set(id, m);
    }
    this.equip('ak', true);

    const shellGeo = new THREE.BoxGeometry(0.016, 0.016, 0.045);
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.shells.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }

  get def(): WeaponDef {
    return WEAPONS[this.current];
  }

  get model(): Model {
    return this.models.get(this.current)!;
  }

  get muzzleLocal(): THREE.Vector3 {
    return this.model.muzzle;
  }

  get canFire(): boolean {
    return !this.reloading && !this.switching && this.mag > 0 && this.cooldown <= 0;
  }

  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.def.reloadTime : 0;
  }

  equip(id: WeaponId, instant = false): void {
    if (id === this.current && !instant) return;
    this.ammo[this.current] = { mag: this.mag, reserve: this.reserve };
    this.current = id;
    const a = this.ammo[id];
    this.mag = a.mag;
    this.reserve = a.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0.18;
    this.zoom = false;
    this.shotIndex = 0;
    this.switching = instant ? 0 : 0.42;

    for (const [mid, m] of this.models) m.group.visible = mid === id;
  }

  cycle(dir: number): void {
    const ids = Object.keys(WEAPONS) as WeaponId[];
    const i = ids.indexOf(this.current);
    const next = ids[(i + dir + ids.length) % ids.length];
    this.equip(next);
  }

  setZoom(on: boolean): void {
    if (!this.def.scope) return;
    this.zoom = on;
  }

  fire(): boolean {
    if (!this.canFire) return false;
    this.mag--;
    this.cooldown = 60 / this.def.rpm;
    this.kick = Math.min(1.3, this.kick + (this.def.kind === 'sniper' ? 1.4 : 0.85));

    const p = 0.7 + Math.random() * 0.6;
    this.recoilPitch += this.def.recoil * p;
    this.shake = Math.min(1, this.shake + (this.def.kind === 'sniper' ? 0.9 : 0.45));
    this.shotIndex++;

    const m = this.model;
    m.flash.visible = true;
    (m.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    m.flash.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.6;
    m.flash.scale.set(s, s, s);
    this.flashTimer = 0.05;

    if (this.def.kind !== 'sniper') this.ejectShell();
    return true;
  }

  private ejectShell(): void {
    const s = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;
    s.mesh.visible = true;
    s.mesh.position.set(0.06, 0.03, -0.16);
    s.mesh.rotation.set(0, 0, 0);
    s.vel.set(0.9 + Math.random() * 0.4, 0.7 + Math.random() * 0.4, 0.25);
    s.spin.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    s.life = 0.55;
  }

  startReload(): void {
    if (this.reloading || this.switching || this.mag >= this.def.mag || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    this.shotIndex = 0;
    this.zoom = false;
  }

  refill(): void {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.switching = 0;
  }

  update(f: Frame): void {
    const dt = f.dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoilPitch *= Math.max(0, 1 - dt * 8);
    this.kick *= Math.max(0, 1 - dt * 11);
    this.shake *= Math.max(0, 1 - dt * 7);
    this.idle += dt;
    if (this.switching > 0) this.switching = Math.max(0, this.switching - dt);

    const m = this.model;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) m.flash.visible = false;
    }

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }

    this.swayTarget.x = THREE.MathUtils.clamp(-f.lookDX * 0.0009, -0.03, 0.03);
    this.swayTarget.y = THREE.MathUtils.clamp(f.lookDY * 0.0009, -0.03, 0.03);
    this.sway.x += (this.swayTarget.x - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (this.swayTarget.y - this.sway.y) * Math.min(1, dt * 9);

    const moveT = Math.min(1, f.speed / 5);
    if (f.onGround && f.speed > 0.5) this.bobPhase += dt * (6.2 + moveT * 3.4);
    const bobX = Math.sin(this.bobPhase) * 0.011 * moveT;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.009 * moveT;

    if (f.landed) this.landDip = 1;
    this.landDip *= Math.max(0, 1 - dt * 7);

    let rl = 0;
    let tilt = 0;
    let roll = 0;
    if (this.reloading) {
      const p = this.reloadProgress;
      rl = Math.sin(Math.min(1, p * 1.05) * Math.PI);
      tilt = rl * 0.85;
      roll = rl * 0.42;

      if (m.mag) {
        if (p > 0.16 && p < 0.46) {
          const k = (p - 0.16) / 0.3;
          m.mag.position.y = -0.13 - k * 0.34;
          m.mag.rotation.x = -0.12 - k * 0.5;
          m.mag.visible = k < 0.95;
        } else if (p >= 0.46 && p < 0.56) {
          m.mag.visible = false;
        } else if (p >= 0.56 && p < 0.8) {
          const k = (p - 0.56) / 0.24;
          m.mag.visible = true;
          m.mag.position.y = -0.47 + k * 0.34;
          m.mag.rotation.x = -0.62 + k * 0.5;
        } else {
          m.mag.visible = true;
          m.mag.position.y = -0.13;
          m.mag.rotation.x = -0.12;
        }
      }
      if (m.bolt) {
        if (p > 0.82 && p < 0.98) {
          const k = (p - 0.82) / 0.16;
          m.bolt.position.z = -0.18 + Math.sin(k * Math.PI) * 0.07;
        } else {
          m.bolt.position.z = -0.18;
        }
      }
    } else if (m.mag) {
      m.mag.visible = true;
      m.mag.position.y = -0.13;
      m.mag.rotation.x = -0.12;
      if (m.bolt) m.bolt.position.z = -0.18;
    }

    // weapon switch: dip down and come back up
    const sw = this.switching > 0 ? Math.sin((this.switching / 0.42) * Math.PI) : 0;

    const breathe = Math.sin(this.idle * 1.6) * 0.0022;
    const crouchDrop = f.crouch ? 0.02 : 0;

    m.group.position.set(
      m.base.x + bobX + this.sway.x,
      m.base.y + bobY + breathe + this.sway.y - this.landDip * 0.05 - crouchDrop - rl * 0.1 - sw * 0.28,
      m.base.z + this.kick * (this.def.kind === 'sniper' ? 0.09 : 0.055) + rl * 0.06,
    );
    m.group.rotation.set(
      this.kick * (this.def.kind === 'sniper' ? 0.32 : 0.2) + tilt + this.sway.y * 0.6 + sw * 0.5,
      m.group.rotation.y * 0 + -0.06 + this.sway.x * 1.2,
      roll + this.sway.x * 1.6,
    );

    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 4.5 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
    }
  }
}

// ---------------------------------------------------------------- models
function buildModel(def: WeaponDef): Model {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.body });
  const accentMat = new THREE.MeshLambertMaterial({ color: def.accent });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const glove = new THREE.MeshLambertMaterial({ color: 0x2b2a26 });
  const sleeve = new THREE.MeshLambertMaterial({ color: 0x4a4534 });

  const add = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    parent: THREE.Object3D = g,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  let mag: THREE.Mesh | null = null;
  let bolt: THREE.Mesh | null = null;
  let muzzleZ = -0.8;

  if (def.pistol) {
    add(0.07, 0.1, 0.3, 0, 0, -0.1, bodyMat);
    add(0.05, 0.05, 0.22, 0, 0.06, -0.14, accentMat);
    add(0.04, 0.04, 0.12, 0, 0.005, -0.3, darkMat);
    add(0.055, 0.16, 0.09, 0, -0.13, 0.02, darkMat);
    mag = add(0.045, 0.09, 0.07, 0, -0.12, 0.02, accentMat);
    add(0.07, 0.09, 0.12, 0.004, -0.13, 0.06, glove);
    muzzleZ = -0.36;
  } else {
    const len = def.modelLen;
    add(0.075, 0.115, 0.44, 0, 0, -0.16, bodyMat);
    add(0.062, 0.045, 0.34, 0, 0.075, -0.18, accentMat);
    add(0.05, 0.03, 0.1, 0, 0.055, -0.02, darkMat);
    add(0.034, 0.034, 0.46 * len, 0, 0.022, -0.55 * len, darkMat);
    add(0.03, 0.028, 0.22, 0, 0.062, -0.42, accentMat);
    add(0.022, 0.07, 0.022, 0, 0.085, -0.7 * len, darkMat);
    add(0.03, 0.03, 0.06, 0, 0.02, -0.77 * len, bodyMat);
    add(0.078, 0.085, 0.3, 0, 0.004, -0.42, def.wood ? accentMat : bodyMat);
    add(0.055, 0.095, 0.28, 0, -0.012, 0.2, def.wood ? accentMat : bodyMat);
    add(0.06, 0.06, 0.05, 0, -0.02, 0.34, darkMat);
    add(0.052, 0.14, 0.075, 0, -0.115, 0.03, darkMat);

    mag = add(0.056, 0.2, 0.1, 0, -0.13, -0.1, def.wood ? accentMat : bodyMat);
    mag.rotation.x = -0.12;
    add(0.058, 0.09, 0.105, 0, -0.24, -0.13, darkMat, mag);

    bolt = add(0.035, 0.028, 0.05, 0.048, 0.03, -0.18, accentMat);

    if (def.scope) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.34, 12), darkMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.14, -0.2);
      g.add(tube);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 12), new THREE.MeshLambertMaterial({ color: 0x101820 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.14, -0.38);
      g.add(lens);
      add(0.03, 0.06, 0.04, 0, 0.09, -0.06, darkMat);
      add(0.03, 0.06, 0.04, 0, 0.09, -0.34, darkMat);
      // bipod hint
      add(0.02, 0.12, 0.02, -0.05, -0.05, -0.62 * def.modelLen, darkMat);
      add(0.02, 0.12, 0.02, 0.05, -0.05, -0.62 * def.modelLen, darkMat);
    }

    // hands
    add(0.072, 0.095, 0.13, 0.004, -0.145, 0.045, glove);
    const rArm = add(0.078, 0.078, 0.19, 0.03, -0.235, 0.17, sleeve);
    rArm.rotation.x = 0.5;
    add(0.082, 0.088, 0.135, -0.004, -0.038, -0.43, glove);
    const lArm = add(0.074, 0.074, 0.2, 0.01, -0.115, -0.3, sleeve);
    lArm.rotation.x = -0.45;

    muzzleZ = -0.8 * len;
  }

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd68a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(def.kind === 'sniper' ? 0.44 : 0.34, def.kind === 'sniper' ? 0.44 : 0.34), flashMat);
  flash.position.set(0, 0.02, muzzleZ);
  flash.visible = false;
  g.add(flash);

  const base = def.pistol
    ? new THREE.Vector3(0.26, -0.24, -0.72)
    : new THREE.Vector3(0.3, -0.29, -0.9);
  const scale = def.pistol ? 1.05 : 0.95;

  g.position.copy(base);
  g.rotation.y = -0.06;
  g.scale.setScalar(scale);

  return {
    group: g,
    mag,
    bolt,
    flash,
    muzzle: new THREE.Vector3(0, 0.02, muzzleZ),
    base,
    scale,
  };
}
