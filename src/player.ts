import * as THREE from 'three';
import { groundHeightAt, resolveCollision, type Collider } from './collision';
import type { Input } from './input';

const GRAVITY = 20;
const JUMP_V = 6.7;
const WALK = 5.0;
const CROUCH_SPEED = 2.4;
const ACCEL_GROUND = 14;
const ACCEL_AIR = 3;

export class Player {
  pos = new THREE.Vector3(0, 0, 20);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  health = 100;
  alive = true;
  onGround = true;
  crouching = false;
  radius = 0.42;
  height = 1.8;

  private eyeStand = 1.62;
  private eyeCrouch = 1.05;
  private eyeCurrent = 1.62;
  private bobTime = 0;
  private bobOffset = 0;

  respawn(at: THREE.Vector3): void {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.alive = true;
    this.pitch = 0;
    this.yaw = 0;
    this.eyeCurrent = this.eyeStand;
    this.bobOffset = 0;
  }

  get eyeY(): number {
    return this.pos.y + this.eyeCurrent + this.bobOffset;
  }

  applyLook(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  update(dt: number, input: Input, colliders: Collider[]): void {
    this.crouching = input.crouching;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    let wishX = -sinY * input.moveY + cosY * input.moveX;
    let wishZ = -cosY * input.moveY - sinY * input.moveX;

    const wl = Math.hypot(wishX, wishZ);
    if (wl > 1) {
      wishX /= wl;
      wishZ /= wl;
    }

    const speed = this.crouching ? CROUCH_SPEED : WALK;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    const accel = (this.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
    this.vel.x += (targetX - this.vel.x) * Math.min(1, accel);
    this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel);

    if (input.consumeJump() && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    }

    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // horizontal collision, twice for stable corner resolution
    resolveCollision(this.pos, this.radius, this.height, colliders);
    resolveCollision(this.pos, this.radius, this.height, colliders);

    const ground = groundHeightAt(this.pos.x, this.pos.z, this.pos.y, colliders);
    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.pos.y < 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }

    // eye height + weapon bob
    const targetEye = this.crouching ? this.eyeCrouch : this.eyeStand;
    this.eyeCurrent += (targetEye - this.eyeCurrent) * Math.min(1, dt * 12);

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizSpeed > 0.4) {
      this.bobTime += dt * horizSpeed * 1.9;
      this.bobOffset = Math.sin(this.bobTime) * 0.028;
    } else {
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, dt * 8);
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  syncCamera(camera: THREE.PerspectiveCamera, recoilPitch: number): void {
    camera.position.set(this.pos.x, this.eyeY, this.pos.z);
    camera.rotation.set(this.pitch + recoilPitch, this.yaw, 0, 'YXZ');
  }
}
