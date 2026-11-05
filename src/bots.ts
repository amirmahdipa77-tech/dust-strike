import * as THREE from 'three';
import { groundHeightAt, hasLineOfSight, resolveCollision, type Collider } from './collision';
import type { Player } from './player';
import type { NavGrid } from './nav';

const BOT_HP = 100;
const DEATH_TIME = 2.6;

const geo = {
  torso: new THREE.BoxGeometry(0.6, 0.76, 0.38),
  hips: new THREE.BoxGeometry(0.5, 0.3, 0.34),
  leg: new THREE.BoxGeometry(0.21, 0.78, 0.24),
  head: new THREE.BoxGeometry(0.26, 0.27, 0.26),
  helmet: new THREE.BoxGeometry(0.29, 0.13, 0.29),
  arm: new THREE.BoxGeometry(0.17, 0.52, 0.19),
  gun: new THREE.BoxGeometry(0.09, 0.12, 0.62),
};

const mat = {
  torso: new THREE.MeshLambertMaterial({ color: 0x4d4e39 }),
  hips: new THREE.MeshLambertMaterial({ color: 0x35362b }),
  leg: new THREE.MeshLambertMaterial({ color: 0x2f3026 }),
  head: new THREE.MeshLambertMaterial({ color: 0x9c7b52 }),
  helmet: new THREE.MeshLambertMaterial({ color: 0x3a3f33 }),
  arm: new THREE.MeshLambertMaterial({ color: 0x43442f }),
  gun: new THREE.MeshLambertMaterial({ color: 0x22252a }),
};

export class Bot {
  group = new THREE.Group();
  root = new THREE.Group();
  torso: THREE.Mesh;
  hips: THREE.Mesh;
  head: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  gun: THREE.Mesh;
  flash: THREE.Mesh;
  hitMeshes: THREE.Mesh[] = [];

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  hp = BOT_HP;
  alive = true;
  respawnTimer = 0;

  private yaw = 0;
  private targetYaw = 0;
  private fireCd = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private stuckTime = 0;
  private lastPos = new THREE.Vector3();
  private path: { x: number; z: number }[] = [];
  private pathTimer = 0;
  private walkPhase = 0;
  private deadT = 0;
  private flashTimer = 0;
  goal: { x: number; z: number } | null = null;
  private radius = 0.42;
  private height = 1.85;

  constructor(
    private spawns: THREE.Vector3[],
    private slot: number,
    private nav: NavGrid,
  ) {
    this.torso = new THREE.Mesh(geo.torso, mat.torso);
    this.torso.position.y = 1.16;

    this.hips = new THREE.Mesh(geo.hips, mat.hips);
    this.hips.position.y = 0.82;

    this.legL = new THREE.Mesh(geo.leg, mat.leg);
    this.legL.position.set(-0.13, 0.39, 0);
    this.legR = new THREE.Mesh(geo.leg, mat.leg);
    this.legR.position.set(0.13, 0.39, 0);

    this.head = new THREE.Mesh(geo.head, mat.head);
    this.head.position.y = 1.68;
    const helmet = new THREE.Mesh(geo.helmet, mat.helmet);
    helmet.position.y = 0.12;
    this.head.add(helmet);

    this.armL = new THREE.Mesh(geo.arm, mat.arm);
    this.armL.position.set(-0.36, 1.2, -0.12);
    this.armL.rotation.x = -0.9;
    this.armR = new THREE.Mesh(geo.arm, mat.arm);
    this.armR.position.set(0.34, 1.18, -0.05);
    this.armR.rotation.x = -1.05;

    this.gun = new THREE.Mesh(geo.gun, mat.gun);
    this.gun.position.set(0.2, 1.12, -0.42);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd68a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    this.flash.position.set(0.2, 1.14, -0.76);
    this.flash.visible = false;

    this.root.add(
      this.torso,
      this.hips,
      this.legL,
      this.legR,
      this.head,
      this.armL,
      this.armR,
      this.gun,
      this.flash,
    );
    this.group.add(this.root);

    this.torso.userData = { bot: this, part: 'chest' };
    this.hips.userData = { bot: this, part: 'stomach' };
    this.head.userData = { bot: this, part: 'head' };
    this.legL.userData = { bot: this, part: 'leg' };
    this.legR.userData = { bot: this, part: 'leg' };
    this.hitMeshes.push(this.torso, this.hips, this.head, this.legL, this.legR);

    this.group.visible = false;
  }

  get eyeY(): number {
    return this.pos.y + 1.6;
  }

  spawn(playerPos: THREE.Vector3): void {
    const sorted = [...this.spawns].sort(
      (a, b) => b.distanceToSquared(playerPos) - a.distanceToSquared(playerPos),
    );
    const best = sorted[this.slot % sorted.length];
    this.pos.copy(best);
    this.pos.x += (Math.random() - 0.5) * 1.6;
    this.pos.z += (Math.random() - 0.5) * 1.6;
    this.vel.set(0, 0, 0);
    this.hp = BOT_HP;
    this.alive = true;
    this.deadT = 0;
    this.group.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.fireCd = 0.7 + Math.random() * 0.8;
    this.stuckTime = 0;
    this.lastPos.copy(this.pos);
    this.path = [];
    this.pathTimer = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.deadT = 0;
      this.respawnTimer = DEATH_TIME + 1.2;
      return true;
    }
    return false;
  }

  update(
    dt: number,
    player: Player,
    colliders: Collider[],
    onShoot: (from: THREE.Vector3, to: THREE.Vector3) => void,
    terrain: (x: number, z: number) => number = () => 0,
  ): void {
    if (!this.alive) {
      this.deadT = Math.min(1, this.deadT + dt * 2.4);
      const t = this.deadT;
      this.root.rotation.x = -t * 1.45;
      this.root.position.y = -t * 0.35;
      this.flash.visible = false;
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.group.visible = false;
        this.spawn(player.pos);
      }
      return;
    }

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const los =
      player.alive &&
      dist < 48 &&
      hasLineOfSight(
        this.pos.x,
        this.eyeY,
        this.pos.z,
        player.pos.x,
        player.eyeY,
        player.pos.z,
        colliders,
      );

    // --- movement -------------------------------------------------
    let mx = 0;
    let mz = 0;
    if (los) {
      if (dist > 15) {
        mx = dx / dist;
        mz = dz / dist;
      } else if (dist < 6.5) {
        mx = -dx / dist;
        mz = -dz / dist;
      } else {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeDir *= -1;
          this.strafeTimer = 0.8 + Math.random() * 1.2;
        }
        mx = (-dz / dist) * this.strafeDir;
        mz = (dx / dist) * this.strafeDir;
      }
    } else {
      const tx = this.goal ? this.goal.x : player.pos.x;
      const tz = this.goal ? this.goal.z : player.pos.z;
      this.pathTimer -= dt;
      if (this.pathTimer <= 0 || this.path.length === 0) {
        this.path = this.nav.findPath(this.pos.x, this.pos.z, tx, tz);
        this.pathTimer = 0.9 + Math.random() * 0.6;
      }
      if (this.goal && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.2) {
        this.path.length = 0;
      }
      while (
        this.path.length > 0 &&
        Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.9
      ) {
        this.path.shift();
      }
      const wp = this.path[0];
      if (wp) {
        const wd = Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) || 1;
        mx = (wp.x - this.pos.x) / wd;
        mz = (wp.z - this.pos.z) / wd;
      }
    }
    if (los) this.path.length = 0;

    if (this.stuckTime > 0) {
      this.stuckTime -= dt;
      mx = Math.sin(this.strafeDir * 2.1) * 0.9;
      mz = Math.cos(this.strafeDir * 2.1) * 0.9;
    }

    const speed = los ? 3.4 : 4.3;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * 8);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * 8);
    this.vel.y -= 20 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    resolveCollision(this.pos, this.radius, this.height, colliders);

    const ground = groundHeightAt(this.pos.x, this.pos.z, this.pos.y, colliders, 0.45, terrain(this.pos.x, this.pos.z));
    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      this.pos.y = ground;
      this.vel.y = 0;
    }

    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    if (moved < 0.006 && Math.hypot(mx, mz) > 0.3) {
      if (this.stuckTime <= 0) {
        this.stuckTime = 0.7;
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
    }
    this.lastPos.copy(this.pos);

    // --- animation -------------------------------------------------
    const moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * (2.2 + moveSpeed * 1.9);
    const swing = Math.min(1, moveSpeed / 3) * 0.7;
    this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
    this.torso.position.y = 1.16 + Math.abs(Math.cos(this.walkPhase)) * 0.02 * swing;

    this.targetYaw = Math.atan2(dx, dz);
    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 7);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }

    // --- shooting -------------------------------------------------
    this.fireCd -= dt;
    if (los && player.alive && dist < 34 && this.fireCd <= 0) {
      this.fireCd = 0.55 + Math.random() * 0.75;
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
      this.flashTimer = 0.06;

      const from = new THREE.Vector3(this.pos.x, this.eyeY - 0.1, this.pos.z);
      const accuracy = Math.max(0.16, 0.62 - dist * 0.015);
      const hit = Math.random() < accuracy;
      const to = new THREE.Vector3(player.pos.x, player.eyeY, player.pos.z);
      if (!hit) {
        to.x += (Math.random() - 0.5) * 2.4;
        to.y += (Math.random() - 0.5) * 1.6;
        to.z += (Math.random() - 0.5) * 2.4;
      }
      onShoot(from, to);
    }
  }
}

export class BotManager {
  bots: Bot[] = [];
  private scene: THREE.Scene;
  private spawns: THREE.Vector3[];
  private nav: NavGrid;
  terrain: (x: number, z: number) => number = () => 0;
  bombTarget: { x: number; z: number } | null = null;

  constructor(scene: THREE.Scene, spawns: THREE.Vector3[], count: number, nav: NavGrid) {
    this.scene = scene;
    this.spawns = spawns;
    this.nav = nav;
    this.setCount(count);
  }

  get meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.bots) out.push(...b.hitMeshes);
    return out;
  }

  get aliveCount(): number {
    return this.bots.filter((b) => b.alive).length;
  }

  setCount(count: number): void {
    while (this.bots.length > count) {
      const b = this.bots.pop()!;
      this.scene.remove(b.group);
    }
    while (this.bots.length < count) {
      const b = new Bot(this.spawns, this.bots.length, this.nav);
      this.scene.add(b.group);
      this.bots.push(b);
    }
  }

  reset(playerPos: THREE.Vector3): void {
    this.bots.forEach((b, i) => {
      b.spawn(playerPos);
      b.group.position.x += i * 0.6;
    });
  }

  update(
    dt: number,
    player: Player,
    colliders: Collider[],
    onShoot: (from: THREE.Vector3, to: THREE.Vector3) => void,
  ): void {
    for (const b of this.bots) b.goal = this.bombTarget;
    for (const b of this.bots) b.update(dt, player, colliders, onShoot, this.terrain);

    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.3) {
          const push = ((1.3 - d) / d) * 0.5;
          a.pos.x -= dx * push;
          a.pos.z -= dz * push;
          b.pos.x += dx * push;
          b.pos.z += dz * push;
          a.group.position.copy(a.pos);
          b.group.position.copy(b.pos);
        }
      }
    }
  }
}
