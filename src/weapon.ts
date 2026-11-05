import * as THREE from 'three';

/** AK-style viewmodel with hands, recoil, reload choreography and shell ejection. */

const FIRE_INTERVAL = 0.098;
const RELOAD_TIME = 2.15;
export const MAG_SIZE = 30;

const RECOIL_PATTERN = [0.9, 0.75, 0.62, 0.55, 0.7, 0.85, 0.6, 0.5];

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

export class Weapon {
  mag = MAG_SIZE;
  reserve = 90;
  cooldown = 0;
  reloading = false;
  kick = 0;
  recoilPitch = 0;
  shake = 0;
  group = new THREE.Group();

  private reloadTimer = 0;
  private flashTimer = 0;
  private flash: THREE.Mesh;
  private magMesh: THREE.Mesh;
  private bolt: THREE.Mesh;
  private shells: Shell[] = [];
  private shellCursor = 0;

  private basePos = new THREE.Vector3(0.3, -0.29, -0.9);
  private bobPhase = 0;
  private sway = new THREE.Vector2();
  private swayTarget = new THREE.Vector2();
  private landDip = 0;
  private shotIndex = 0;
  private idle = 0;

  muzzleLocal = new THREE.Vector3(0, 0.02, -0.8);

  constructor() {
    const metal = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x3c4149 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a4f28 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x16181b });
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
      parent: THREE.Object3D = this.group,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // receiver + dust cover
    add(0.075, 0.115, 0.44, 0, 0, -0.16, metal);
    add(0.062, 0.045, 0.34, 0, 0.075, -0.18, steel);
    add(0.05, 0.03, 0.1, 0, 0.055, -0.02, dark);
    // barrel, gas tube, front sight
    add(0.034, 0.034, 0.46, 0, 0.022, -0.55, dark);
    add(0.03, 0.028, 0.22, 0, 0.062, -0.42, steel);
    add(0.022, 0.07, 0.022, 0, 0.085, -0.7, dark);
    add(0.03, 0.03, 0.06, 0, 0.02, -0.77, metal);
    // wooden handguard + stock
    add(0.078, 0.085, 0.3, 0, 0.004, -0.42, wood);
    add(0.055, 0.095, 0.28, 0, -0.012, 0.2, wood);
    add(0.06, 0.06, 0.05, 0, -0.02, 0.34, dark);
    // pistol grip
    add(0.052, 0.14, 0.075, 0, -0.115, 0.03, dark);

    // magazine (animated separately)
    this.magMesh = add(0.056, 0.2, 0.1, 0, -0.13, -0.1, wood);
    this.magMesh.rotation.x = -0.12;
    add(0.058, 0.09, 0.105, 0, -0.24, -0.13, dark, this.magMesh);

    // charging handle
    this.bolt = add(0.035, 0.028, 0.05, 0.048, 0.03, -0.18, steel);

    // hands + short forearms
    add(0.072, 0.095, 0.13, 0.004, -0.145, 0.045, glove);
    const rArm = add(0.078, 0.078, 0.19, 0.03, -0.235, 0.17, sleeve);
    rArm.rotation.x = 0.5;
    add(0.082, 0.088, 0.135, -0.004, -0.038, -0.43, glove);
    const lArm = add(0.074, 0.074, 0.2, 0.01, -0.115, -0.3, sleeve);
    lArm.rotation.x = -0.45;

    // muzzle flash
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd68a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
    this.flash.position.copy(this.muzzleLocal);
    this.flash.visible = false;
    this.group.add(this.flash);

    // shell casings
    const shellGeo = new THREE.BoxGeometry(0.016, 0.016, 0.045);
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      this.group.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }

    this.group.position.copy(this.basePos);
    this.group.rotation.y = 0.15;
    this.group.scale.setScalar(0.95);
  }

  get canFire(): boolean {
    return !this.reloading && this.mag > 0 && this.cooldown <= 0;
  }

  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / RELOAD_TIME : 0;
  }

  fire(): void {
    if (!this.canFire) return;
    this.mag--;
    this.cooldown = FIRE_INTERVAL;
    this.kick = Math.min(1.2, this.kick + 0.85);

    const p = RECOIL_PATTERN[this.shotIndex % RECOIL_PATTERN.length];
    this.shotIndex++;
    this.recoilPitch += 0.0075 * p + Math.random() * 0.0035;
    this.shake = Math.min(1, this.shake + 0.5);

    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, s);
    this.flashTimer = 0.045;

    this.ejectShell();
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
    if (this.reloading || this.mag === MAG_SIZE || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = RELOAD_TIME;
    this.shotIndex = 0;
  }

  refill(): void {
    this.mag = MAG_SIZE;
    this.reserve = 90;
    this.reloading = false;
    this.reloadTimer = 0;
    this.shotIndex = 0;
  }

  update(f: Frame): void {
    const dt = f.dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoilPitch *= Math.max(0, 1 - dt * 8);
    this.kick *= Math.max(0, 1 - dt * 11);
    this.shake *= Math.max(0, 1 - dt * 7);
    this.idle += dt;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = MAG_SIZE - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }

    // --- sway follows the look delta with inertia
    this.swayTarget.x = THREE.MathUtils.clamp(-f.lookDX * 0.0009, -0.03, 0.03);
    this.swayTarget.y = THREE.MathUtils.clamp(f.lookDY * 0.0009, -0.03, 0.03);
    this.sway.x += (this.swayTarget.x - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (this.swayTarget.y - this.sway.y) * Math.min(1, dt * 9);

    // --- bob
    const moveT = Math.min(1, f.speed / 5);
    if (f.onGround && f.speed > 0.5) this.bobPhase += dt * (6.2 + moveT * 3.4);
    const bobX = Math.sin(this.bobPhase) * 0.011 * moveT;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.009 * moveT;

    // --- landing dip
    if (f.landed) this.landDip = 1;
    this.landDip *= Math.max(0, 1 - dt * 7);

    // --- reload choreography
    let rl = 0;
    let tilt = 0;
    let roll = 0;
    if (this.reloading) {
      const p = this.reloadProgress;
      rl = Math.sin(Math.min(1, p * 1.05) * Math.PI);
      tilt = rl * 0.85;
      roll = rl * 0.42;

      if (p > 0.16 && p < 0.46) {
        const k = (p - 0.16) / 0.3;
        this.magMesh.position.y = -0.13 - k * 0.34;
        this.magMesh.rotation.x = -0.12 - k * 0.5;
        this.magMesh.visible = k < 0.95;
      } else if (p >= 0.46 && p < 0.56) {
        this.magMesh.visible = false;
      } else if (p >= 0.56 && p < 0.8) {
        const k = (p - 0.56) / 0.24;
        this.magMesh.visible = true;
        this.magMesh.position.y = -0.47 + k * 0.34;
        this.magMesh.rotation.x = -0.62 + k * 0.5;
      } else {
        this.magMesh.visible = true;
        this.magMesh.position.y = -0.13;
        this.magMesh.rotation.x = -0.12;
      }

      if (p > 0.82 && p < 0.98) {
        const k = (p - 0.82) / 0.16;
        this.bolt.position.z = -0.18 + Math.sin(k * Math.PI) * 0.07;
      } else {
        this.bolt.position.z = -0.18;
      }
    } else {
      this.magMesh.visible = true;
      this.magMesh.position.y = -0.13;
      this.magMesh.rotation.x = -0.12;
      this.bolt.position.z = -0.18;
    }

    // --- compose transforms
    const breathe = Math.sin(this.idle * 1.6) * 0.0022;
    const crouchDrop = f.crouch ? 0.02 : 0;

    this.group.position.set(
      this.basePos.x + bobX + this.sway.x,
      this.basePos.y + bobY + breathe + this.sway.y - this.landDip * 0.05 - crouchDrop - rl * 0.1,
      this.basePos.z + this.kick * 0.055 + rl * 0.06,
    );
    this.group.rotation.set(
      this.kick * 0.2 + tilt + this.sway.y * 0.6,
      0.15 + this.sway.x * 1.2,
      roll + this.sway.x * 1.6,
    );

    // --- shells
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
