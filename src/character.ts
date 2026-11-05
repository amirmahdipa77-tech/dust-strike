import * as THREE from 'three';

/** Shared low-poly soldier model used by remote players. */

const geo = {
  torso: new THREE.BoxGeometry(0.6, 0.76, 0.38),
  hips: new THREE.BoxGeometry(0.5, 0.3, 0.34),
  leg: new THREE.BoxGeometry(0.21, 0.78, 0.24),
  head: new THREE.BoxGeometry(0.26, 0.27, 0.26),
  helmet: new THREE.BoxGeometry(0.29, 0.13, 0.29),
  arm: new THREE.BoxGeometry(0.17, 0.52, 0.19),
  gun: new THREE.BoxGeometry(0.09, 0.12, 0.62),
  flash: new THREE.PlaneGeometry(0.32, 0.32),
};

const PALETTE = {
  T: { torso: 0x5b4b32, hips: 0x40372a, leg: 0x38312a, arm: 0x50432f, helmet: 0x2f2a22 },
  CT: { torso: 0x2f3f52, hips: 0x27323f, leg: 0x243039, arm: 0x2c3b4a, helmet: 0x1e2831 },
};

const matCache = new Map<string, THREE.MeshLambertMaterial>();
function mat(key: string, color: number): THREE.MeshLambertMaterial {
  const k = `${key}_${color}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(k, m);
  }
  return m;
}

const gunMat = new THREE.MeshLambertMaterial({ color: 0x23262b });
const skinMat = new THREE.MeshLambertMaterial({ color: 0x9c7b52 });
const flashMat = new THREE.MeshBasicMaterial({
  color: 0xffd68a,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export class Character {
  group = new THREE.Group();
  root = new THREE.Group();
  torso: THREE.Mesh;
  hips: THREE.Mesh;
  head: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  gun: THREE.Mesh;
  flash: THREE.Mesh;
  hitMeshes: THREE.Mesh[] = [];

  private walkPhase = 0;
  private flashTimer = 0;
  private deadT = 0;

  constructor(team: 'T' | 'CT', id: string) {
    const pal = PALETTE[team] ?? PALETTE.T;

    this.torso = new THREE.Mesh(geo.torso, mat('torso', pal.torso));
    this.torso.position.y = 1.16;

    this.hips = new THREE.Mesh(geo.hips, mat('hips', pal.hips));
    this.hips.position.y = 0.82;

    this.legL = new THREE.Mesh(geo.leg, mat('leg', pal.leg));
    this.legL.position.set(-0.13, 0.39, 0);
    this.legR = new THREE.Mesh(geo.leg, mat('leg', pal.leg));
    this.legR.position.set(0.13, 0.39, 0);

    this.head = new THREE.Mesh(geo.head, skinMat);
    this.head.position.y = 1.68;
    const helmet = new THREE.Mesh(geo.helmet, mat('helmet', pal.helmet));
    helmet.position.y = 0.12;
    this.head.add(helmet);

    const armL = new THREE.Mesh(geo.arm, mat('arm', pal.arm));
    armL.position.set(-0.36, 1.2, -0.12);
    armL.rotation.x = -0.9;
    const armR = new THREE.Mesh(geo.arm, mat('arm', pal.arm));
    armR.position.set(0.34, 1.18, -0.05);
    armR.rotation.x = -1.05;

    this.gun = new THREE.Mesh(geo.gun, gunMat);
    this.gun.position.set(0.2, 1.12, -0.42);

    this.flash = new THREE.Mesh(geo.flash, flashMat.clone());
    this.flash.position.set(0.2, 1.14, -0.76);
    this.flash.visible = false;

    this.root.add(this.torso, this.hips, this.legL, this.legR, this.head, armL, armR, this.gun, this.flash);
    this.group.add(this.root);

    const parts: [THREE.Mesh, string][] = [
      [this.torso, 'chest'],
      [this.hips, 'stomach'],
      [this.head, 'head'],
      [this.legL, 'leg'],
      [this.legR, 'leg'],
    ];
    for (const [mesh, part] of parts) {
      mesh.userData = { remoteId: id, part };
      this.hitMeshes.push(mesh);
    }
  }

  setDead(dead: boolean, dt: number): void {
    if (dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.4);
      this.root.rotation.x = -this.deadT * 1.45;
      this.root.position.y = -this.deadT * 0.35;
    } else if (this.deadT !== 0) {
      this.deadT = 0;
      this.root.rotation.set(0, 0, 0);
      this.root.position.set(0, 0, 0);
    }
  }

  animate(dt: number, speed: number): void {
    this.walkPhase += dt * (2.2 + speed * 1.9);
    const swing = Math.min(1, speed / 3) * 0.7;
    this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
    this.torso.position.y = 1.16 + Math.abs(Math.cos(this.walkPhase)) * 0.02 * swing;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
  }

  muzzleFlash(): void {
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.flashTimer = 0.06;
  }
}
