import * as THREE from 'three';
import { groundHeightAt, hasLineOfSight, resolveCollision, type Collider } from './collision';
import type { Player } from './player';
import type { NavGrid } from './nav';

const BOT_HP = 100;

const torsoGeo = new THREE.BoxGeometry(0.62, 0.78, 0.4);
const legsGeo = new THREE.BoxGeometry(0.46, 0.74, 0.34);
const headGeo = new THREE.BoxGeometry(0.27, 0.29, 0.27);

const torsoMat = new THREE.MeshLambertMaterial({ color: 0x4a4b38 });
const legsMat = new THREE.MeshLambertMaterial({ color: 0x33342a });
const headMat = new THREE.MeshLambertMaterial({ color: 0x8d6b47 });

export class Bot {
  group = new THREE.Group();
  torso: THREE.Mesh;
  legs: THREE.Mesh;
  head: THREE.Mesh;
  hitMeshes: THREE.Mesh[] = [];

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  hp = BOT_HP;
  alive = true;
  respawnTimer = 0;

  private fireCd = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private stuckTime = 0;
  private lastPos = new THREE.Vector3();
  private path: { x: number; z: number }[] = [];
  private pathTimer = 0;
  private radius = 0.42;
  private height = 1.85;

  constructor(
    private spawns: THREE.Vector3[],
    private slot: number,
    private nav: NavGrid,
  ) {
    this.torso = new THREE.Mesh(torsoGeo, torsoMat);
    this.torso.position.y = 1.16;
    this.legs = new THREE.Mesh(legsGeo, legsMat);
    this.legs.position.y = 0.37;
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.68;

    this.torso.userData = { bot: this, part: 'body' };
    this.legs.userData = { bot: this, part: 'body' };
    this.head.userData = { bot: this, part: 'head' };

    this.group.add(this.torso, this.legs, this.head);
    this.hitMeshes.push(this.torso, this.legs, this.head);
    this.group.visible = false;
  }

  get eyeY(): number {
    return this.pos.y + 1.6;
  }

  spawn(playerPos: THREE.Vector3): void {
    // farthest spawns first, then hand out different ones per bot slot
    const sorted = [...this.spawns].sort(
      (a, b) => b.distanceToSquared(playerPos) - a.distanceToSquared(playerPos),
    );
    const best = sorted[this.slot % sorted.length];
    this.pos.copy(best);
    this.pos.x += (Math.random() - 0.5) * 2.5;
    this.pos.z += (Math.random() - 0.5) * 2.5;
    this.vel.set(0, 0, 0);
    this.hp = BOT_HP;
    this.alive = true;
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.fireCd = 0.6 + Math.random();
    this.stuckTime = 0;
    this.lastPos.copy(this.pos);
    this.path = [];
    this.pathTimer = 0;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.respawnTimer = 3.5;
      return true;
    }
    return false;
  }

  update(
    dt: number,
    player: Player,
    colliders: Collider[],
    onShoot: (from: THREE.Vector3, to: THREE.Vector3) => void,
  ): void {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawn(player.pos);
      return;
    }

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const los =
      player.alive &&
      dist < 48 &&
      hasLineOfSight(this.pos.x, this.eyeY, this.pos.z, player.pos.x, player.eyeY, player.pos.z, colliders);

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
      this.pathTimer -= dt;
      if (this.pathTimer <= 0 || this.path.length === 0) {
        this.path = this.nav.findPath(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
        this.pathTimer = 0.9 + Math.random() * 0.6;
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

    const ground = groundHeightAt(this.pos.x, this.pos.z, this.pos.y, colliders);
    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      this.pos.y = ground;
      this.vel.y = 0;
    }

    // stuck detection
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    if (moved < 0.006 && Math.hypot(mx, mz) > 0.3) {
      if (this.stuckTime <= 0) {
        this.stuckTime = 0.7;
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
    }
    this.lastPos.copy(this.pos);

    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(dx, dz);

    // --- shooting -------------------------------------------------
    this.fireCd -= dt;
    if (los && player.alive && dist < 34 && this.fireCd <= 0) {
      this.fireCd = 0.55 + Math.random() * 0.75;
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

  constructor(scene: THREE.Scene, spawns: THREE.Vector3[], count: number, nav: NavGrid) {
    for (let i = 0; i < count; i++) {
      const bot = new Bot(spawns, i, nav);
      scene.add(bot.group);
      this.bots.push(bot);
    }
  }

  get meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.bots) out.push(...b.hitMeshes);
    return out;
  }

  get aliveCount(): number {
    return this.bots.filter((b) => b.alive).length;
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
    for (const b of this.bots) b.update(dt, player, colliders, onShoot);

    // keep bots from standing inside each other
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
