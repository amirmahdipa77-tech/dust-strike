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
  roll = 0;
  health = 100;
  alive = true;
  onGround = true;
  crouching = false;
  landed = false;
  deathTilt = 0;
  radius = 0.42;
  height = 1.8;
  terrain: (x: number, z: number) => number = () => 0;

  private eyeStand = 1.62;
  private eyeCrouch = 1.05;
  private eyeCurrent = 1.62;
  private bobTime = 0;
  private bobOffset = 0;
  private fallSpeed = 0;

  respawn(at: THREE.Vector3): void {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.alive = true;
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
    this.deathTilt = 0;
    this.eyeCurrent = this.eyeStand;
    this.bobOffset = 0;
    this.landed = false;
  }

  get eyeY(): number {
    return this.pos.y + this.eyeCurrent + this.bobOffset;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  applyLook(dx: number, dy: number, sensitivity: number, invertY = false): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= (invertY ? -dy : dy) * sensitivity;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  update(dt: number, input: Input, colliders: Collider[]): void {
    this.crouching = input.crouching;
    this.landed = false;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
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
    this.fallSpeed = Math.min(this.fallSpeed, this.vel.y);

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    resolveCollision(this.pos, this.radius, this.height, colliders);
    resolveCollision(this.pos, this.radius, this.height, colliders);

    const ground = groundHeightAt(this.pos.x, this.pos.z, this.pos.y, colliders, 0.45, this.terrain(this.pos.x, this.pos.z));
    const wasAir = !this.onGround;
    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      this.pos.y = ground;
      if (wasAir && this.fallSpeed < -4.5) this.landed = true;
      this.vel.y = 0;
      this.fallSpeed = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.pos.y < -4) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }

    const targetEye = this.crouching ? this.eyeCrouch : this.eyeStand;
    this.eyeCurrent += (targetEye - this.eyeCurrent) * Math.min(1, dt * 12);

    const horizSpeed = this.speed;
    if (this.onGround && horizSpeed > 0.4) {
      this.bobTime += dt * horizSpeed * 1.9;
      this.bobOffset = Math.sin(this.bobTime) * 0.026;
    } else {
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, dt * 8);
    }

    // strafing roll for a bit of camera life
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const lateral = this.vel.x * rightX + this.vel.z * rightZ;
    const targetRoll = THREE.MathUtils.clamp(-lateral * 0.006, -0.028, 0.028);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8);

    if (!this.alive) this.deathTilt = Math.min(1, this.deathTilt + dt * 1.6);
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

  syncCamera(camera: THREE.PerspectiveCamera, recoilPitch: number, shake = 0): void {
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 0.012 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 0.012 : 0;
    const deadRoll = this.deathTilt * 1.2;

    camera.position.set(this.pos.x, this.eyeY - this.deathTilt * 1.1, this.pos.z);
    camera.rotation.set(
      this.pitch + recoilPitch + shakeY,
      this.yaw + shakeX,
      this.roll + deadRoll,
      'YXZ',
    );
  }
}
