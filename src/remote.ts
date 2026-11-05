import * as THREE from 'three';
import { Character } from './character';
import type { NetPlayer } from './net';

interface Entry {
  ch: Character;
  target: THREE.Vector3;
  targetYaw: number;
  speed: number;
  dead: boolean;
  lastPos: THREE.Vector3;
}

/** Renders other players and interpolates between server snapshots. */
export class RemotePlayers {
  private entries = new Map<string, Entry>();
  private scene: THREE.Scene;
  private meshList: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get meshes(): THREE.Mesh[] {
    return this.meshList;
  }

  private rebuildMeshList(): void {
    const out: THREE.Mesh[] = [];
    for (const e of this.entries.values()) out.push(...e.ch.hitMeshes);
    this.meshList = out;
  }

  sync(players: NetPlayer[], selfId: string): void {
    const seen = new Set<string>();

    for (const p of players) {
      if (p.id === selfId) continue;
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e) {
        const ch = new Character(p.team, p.id);
        ch.group.position.set(p.x, p.y, p.z);
        ch.group.rotation.y = p.yaw;
        this.scene.add(ch.group);
        e = {
          ch,
          target: new THREE.Vector3(p.x, p.y, p.z),
          targetYaw: p.yaw,
          speed: 0,
          dead: !p.alive,
          lastPos: new THREE.Vector3(p.x, p.y, p.z),
        };
        this.entries.set(p.id, e);
      }
      e.target.set(p.x, p.y, p.z);
      e.targetYaw = p.yaw;
      e.dead = !p.alive;
      e.speed = p.moving ? 3.6 : 0;
    }

    for (const [id, e] of [...this.entries]) {
      if (seen.has(id)) continue;
      this.scene.remove(e.ch.group);
      this.entries.delete(id);
    }
    this.rebuildMeshList();
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const e of this.entries.values()) {
      const pos = e.ch.group.position;
      e.lastPos.copy(pos);
      pos.lerp(e.target, k);

      let diff = e.targetYaw - e.ch.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.ch.group.rotation.y += diff * Math.min(1, dt * 12);

      const moved = e.lastPos.distanceTo(pos) / Math.max(dt, 0.001);
      e.ch.animate(dt, Math.min(moved, 6));
      e.ch.setDead(e.dead, dt);
      e.ch.group.visible = true;
    }
  }

  flash(id: string): void {
    this.entries.get(id)?.ch.muzzleFlash();
  }

  clear(): void {
    for (const e of this.entries.values()) this.scene.remove(e.ch.group);
    this.entries.clear();
    this.meshList = [];
  }

  get count(): number {
    return this.entries.size;
  }
}
