import * as THREE from 'three';

/** Low-poly AK viewmodel + ammo/recoil state. */

const FIRE_INTERVAL = 0.098;
const RELOAD_TIME = 2.05;
const MAG_SIZE = 30;

export class Weapon {
  mag = MAG_SIZE;
  reserve = 90;
  cooldown = 0;
  reloading = false;
  private reloadTimer = 0;
  kick = 0;
  recoilPitch = 0;
  group = new THREE.Group();
  private flash: THREE.Mesh;
  private flashTimer = 0;
  private basePos = new THREE.Vector3(0.3, -0.26, -0.82);
  private sway = 0;
  muzzleLocal = new THREE.Vector3(0, 0.015, -0.82);

  constructor() {
    const metal = new THREE.MeshLambertMaterial({ color: 0x2c2f34 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4626 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1c1f });

    const add = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };

    // receiver / dust cover
    add(0.075, 0.1, 0.46, 0, 0, -0.2, metal);
    add(0.06, 0.045, 0.34, 0, 0.062, -0.24, dark);
    // barrel + gas block
    add(0.036, 0.036, 0.4, 0, 0.012, -0.6, dark);
    add(0.05, 0.06, 0.12, 0, 0.02, -0.44, metal);
    // handguard
    add(0.07, 0.075, 0.26, 0, -0.01, -0.44, wood);
    // magazine (curved-ish)
    add(0.055, 0.19, 0.09, 0, -0.12, -0.14, wood);
    add(0.055, 0.08, 0.1, 0, -0.24, -0.1, dark);
    // stock
    add(0.055, 0.085, 0.22, 0, -0.02, 0.1, wood);
    // pistol grip
    add(0.05, 0.12, 0.07, 0, -0.11, 0.0, dark);
    // front sight
    add(0.02, 0.05, 0.02, 0, 0.06, -0.66, dark);

    this.group.position.copy(this.basePos);
    this.group.rotation.y = 0.03;
    this.group.scale.setScalar(0.8);

    // muzzle flash quad
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), flashMat);
    this.flash.position.copy(this.muzzleLocal);
    this.flash.visible = false;
    this.group.add(this.flash);
  }

  get canFire(): boolean {
    return !this.reloading && this.mag > 0 && this.cooldown <= 0;
  }

  fire(): void {
    if (!this.canFire) return;
    this.mag--;
    this.cooldown = FIRE_INTERVAL;
    this.kick = Math.min(1, this.kick + 0.55);
    this.recoilPitch += 0.009 + Math.random() * 0.006;
    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flashTimer = 0.045;
  }

  startReload(): void {
    if (this.reloading || this.mag === MAG_SIZE || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = RELOAD_TIME;
  }

  refill(): void {
    this.mag = MAG_SIZE;
    this.reserve = 90;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  update(dt: number, moving: boolean): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoilPitch *= Math.max(0, 1 - dt * 9);
    this.kick *= Math.max(0, 1 - dt * 8);

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

    // idle sway + recoil kick
    this.sway += dt * (moving ? 9 : 3);
    const swayX = Math.sin(this.sway) * (moving ? 0.012 : 0.004);
    const swayY = Math.cos(this.sway * 2) * (moving ? 0.008 : 0.003);
    const reloadDip = this.reloading ? -0.12 : 0;

    this.group.position.x = this.basePos.x + swayX;
    this.group.position.y = this.basePos.y + swayY + reloadDip - this.kick * 0.008;
    this.group.position.z = this.basePos.z + this.kick * 0.07;
    this.group.rotation.x = this.kick * 0.14 + (this.reloading ? 0.5 : 0);
    this.group.rotation.z = this.reloading ? -0.25 : 0;
  }
}
