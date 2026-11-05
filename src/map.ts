import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from './collision';

/**
 * A compact, dust2-inspired layout built entirely from boxes.
 * Three lanes (Long A / Mid / B tunnels) between two spawn bands,
 * two bomb sites, crates for cover. One merged mesh = one draw call.
 */

const STONE = 0xd3bc93;
const STONE_DARK = 0xa8946c;
const STONE_LIGHT = 0xdcc79c;
const WOOD = 0x8a5a2b;
const WOOD_DARK = 0x6d4520;
const METAL = 0x6c727b;
const CONCRETE = 0xa9a49a;

const WALL_H = 7;

export interface MapData {
  mesh: THREE.Mesh;
  ground: THREE.Mesh;
  colliders: Collider[];
  botSpawns: THREE.Vector3[];
  playerSpawn: THREE.Vector3;
}

class Builder {
  geos: THREE.BufferGeometry[] = [];
  colliders: Collider[] = [];

  /** Axis-aligned box from corner (x1,z1) to (x2,z2), vertical range y0..y1. */
  box(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y0: number,
    y1: number,
    color: number,
    solid = true,
  ): void {
    const w = Math.abs(x2 - x1);
    const d = Math.abs(z2 - z1);
    const h = Math.abs(y1 - y0);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const cy = (y0 + y1) / 2;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);

    // World-space planar UVs so the sand texture keeps a constant scale.
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      uv.setXY(i, (px + pz) * 0.22, py * 0.22);
    }
    uv.needsUpdate = true;

    this.paint(g, color);
    this.geos.push(g);

    if (solid) {
      this.colliders.push({
        minX: Math.min(x1, x2),
        maxX: Math.max(x1, x2),
        minZ: Math.min(z1, z2),
        maxZ: Math.max(z1, z2),
        minY: Math.min(y0, y1),
        maxY: Math.max(y0, y1),
      });
    }
  }

  paint(g: THREE.BufferGeometry, color: number): void {
    const c = new THREE.Color(color);
    const tint = 0.93 + Math.random() * 0.14;
    c.multiplyScalar(tint);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  /** Wall with a dark base band and a light cornice, so it reads as masonry. */
  wall(x1: number, z1: number, x2: number, z2: number, h = WALL_H): void {
    this.box(x1, z1, x2, z2, 0, 0.9, STONE_DARK);
    this.box(x1, z1, x2, z2, 0.9, h - 0.35, STONE);
    this.box(x1, z1, x2, z2, h - 0.35, h, STONE_LIGHT);
  }

  /** Solid building block (thick, no interior). */
  block(x1: number, z1: number, x2: number, z2: number, h = WALL_H): void {
    this.box(x1, z1, x2, z2, 0, 0.9, STONE_DARK);
    this.box(x1, z1, x2, z2, 0.9, h - 0.3, STONE);
    this.box(x1, z1, x2, z2, h - 0.3, h, STONE_LIGHT);
  }

  crate(cx: number, cz: number, size = 1.9, h = 0.95, y0 = 0): void {
    const s = size / 2;
    this.box(cx - s, cz - s, cx + s, cz + s, y0, y0 + h, WOOD);
    // top trim
    this.box(cx - s, cz - s, cx + s, cz + s, y0 + h - 0.06, y0 + h, WOOD_DARK, false);
  }

  stackedCrate(cx: number, cz: number, size = 1.9): void {
    this.crate(cx, cz, size, 0.95, 0);
    this.crate(cx + 0.12, cz - 0.1, size * 0.86, 0.9, 0.95);
  }

  barrel(cx: number, cz: number): void {
    const g = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10, 1);
    g.translate(cx, 0.525, cz);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.3, pos.getY(i) * 0.3);
    }
    this.paint(g, 0x7a5c34);
    this.geos.push(g);
    this.colliders.push({
      minX: cx - 0.42,
      maxX: cx + 0.42,
      minZ: cz - 0.42,
      maxZ: cz + 0.42,
      minY: 0,
      maxY: 1.05,
    });
  }

  /** Open doorway frame: two jambs + a lintel over a gap. */
  doorway(cx: number, cz: number, axis: 'x' | 'z', gap: number, h = 4.2): void {
    const t = 0.7;
    if (axis === 'x') {
      this.box(cx - gap / 2 - t, cz - 0.5, cx - gap / 2, cz + 0.5, 0, h, STONE_DARK);
      this.box(cx + gap / 2, cz - 0.5, cx + gap / 2 + t, cz + 0.5, 0, h, STONE_DARK);
      this.box(cx - gap / 2 - t, cz - 0.5, cx + gap / 2 + t, cz + 0.5, h, h + 1.1, STONE, false);
    } else {
      this.box(cx - 0.5, cz - gap / 2 - t, cx + 0.5, cz - gap / 2, 0, h, STONE_DARK);
      this.box(cx - 0.5, cz + gap / 2, cx + 0.5, cz + gap / 2 + t, 0, h, STONE_DARK);
      this.box(cx - 0.5, cz - gap / 2 - t, cx + 0.5, cz + gap / 2 + t, h, h + 1.1, STONE, false);
    }
  }
}

function makeSandTexture(): THREE.Texture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;

  // base sand tone
  ctx.fillStyle = '#cdb68d';
  ctx.fillRect(0, 0, size, size);

  // soft sandstone strata
  for (let y = 0; y < size; y += 4) {
    const a = 0.03 + Math.random() * 0.07;
    const dark = Math.random() > 0.5;
    ctx.fillStyle = dark ? `rgba(120,96,62,${a})` : `rgba(236,220,188,${a})`;
    ctx.fillRect(0, y, size, 2 + Math.random() * 3);
  }

  // grain
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.95));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

export function buildMap(): MapData {
  const b = new Builder();
  const HALF = 25;

  // ---- outer shell -------------------------------------------------
  b.wall(-HALF, -HALF, HALF, -HALF + 1); // north
  b.wall(-HALF, HALF - 1, HALF, HALF); // south
  b.wall(-HALF, -HALF, -HALF + 1, HALF); // west
  b.wall(HALF - 1, -HALF, HALF, HALF); // east

  // ---- lane blocks -------------------------------------------------
  // East block between Mid and Long A, split by the short-A connector.
  b.block(5, -16, 13, -12);
  b.block(5, -8, 13, 16);
  // West block between B tunnels and Mid, split by the upper connector.
  b.block(-13, -16, -5, 6);
  b.block(-13, 10, -5, 16);

  // ---- mid doors ---------------------------------------------------
  b.box(-4, -0.55, -1.6, 0.55, 0, WALL_H, STONE);
  b.box(1.6, -0.55, 4, 0.55, 0, WALL_H, STONE);
  b.box(-1.6, -0.55, 1.6, 0.55, 3.4, WALL_H, STONE, false);
  b.box(-4.1, -0.75, -1.5, 0.75, 0, 0.9, STONE_DARK, false);
  b.box(1.5, -0.75, 4.1, 0.75, 0, 0.9, STONE_DARK, false);

  // ---- A site (north-east) ----------------------------------------
  b.crate(16.5, -14, 2.1);
  b.crate(20.5, -13.5, 2.1);
  b.stackedCrate(17.6, -11.2, 1.8);
  b.crate(22, -15.5, 1.7);
  b.doorway(19.5, -9.5, 'x', 3.4);

  // ---- Long A props ------------------------------------------------
  b.box(14.6, 1.6, 17.6, 3.6, 0, 2.6, 0x3f6382); // blue container
  b.box(14.6, 1.6, 17.6, 3.6, 2.6, 2.72, 0x2f4c66, false);
  b.box(18.4, 4.4, 21.6, 6.2, 0, 1.35, METAL); // the car
  b.box(18.6, 4.6, 21.4, 6.0, 1.35, 1.6, 0x565c66, false);
  b.crate(15.4, 11.5, 2.0);
  b.barrel(22.6, 12.4);
  b.barrel(22.6, 13.6);

  // ---- B site (north-west) ----------------------------------------
  b.box(-22.4, -11.6, -19.8, -9.4, 0, 2.5, 0x3f6382); // container
  b.box(-22.4, -11.6, -19.8, -9.4, 2.5, 2.62, 0x2f4c66, false);
  b.crate(-17.2, -14.2, 2.1);
  b.crate(-21, -13, 2.1);
  b.stackedCrate(-18.6, -11, 1.8);
  b.barrel(-15.3, -11.6);
  b.barrel(-14.4, -12.6);
  b.box(-22.4, -16, -14.4, -15.2, 0, 1.0, CONCRETE); // low site wall

  // ---- B tunnels props --------------------------------------------
  b.crate(-21.5, 3.5, 2.0);
  b.crate(-16.5, -2.5, 1.7);
  b.barrel(-22.8, -6);

  // ---- Mid props ---------------------------------------------------
  b.crate(2.6, -6.5, 1.7);
  b.crate(-2.4, 8.5, 1.7);
  b.box(-3.6, -12.5, -1.2, -11.3, 0, 0.95, CONCRETE); // mid low cover

  // ---- Short A connector ------------------------------------------
  b.crate(9, -10, 1.7);

  // ---- Upper tunnels connector ------------------------------------
  b.crate(-9.5, 8.2, 1.7);

  // ---- spawns ------------------------------------------------------
  b.crate(7.5, 19.5, 2.0);
  b.crate(-7.5, 20.5, 2.0);
  b.box(-3, 22.4, 3, 23.2, 0, 1.0, CONCRETE);
  b.crate(-6.5, -20.5, 2.0);
  b.crate(6.5, -21, 2.0);
  b.box(-14.5, -20.4, -8.5, -19.6, 0, 1.2, CONCRETE);
  b.box(8.5, -20.4, 14.5, -19.6, 0, 1.2, CONCRETE);

  // ---- assemble ----------------------------------------------------
  const merged = mergeGeometries(b.geos, false)!;
  merged.computeBoundingSphere();
  b.geos.forEach((g) => g.dispose());

  const sand = makeSandTexture();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: sand });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.frustumCulled = false;

  // ground
  const groundTex = makeSandTexture();
  groundTex.repeat.set(1, 1);
  const gg = new THREE.PlaneGeometry(90, 90, 1, 1);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  const guv = gg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) {
    guv.setXY(i, (gp.getX(i) + gp.getZ(i)) * 0.22, gp.getZ(i) * 0.22);
  }
  const ground = new THREE.Mesh(
    gg,
    new THREE.MeshLambertMaterial({ map: groundTex, color: 0xbda57c }),
  );
  ground.position.y = 0;

  const botSpawns = [
    new THREE.Vector3(0, 0, -20),
    new THREE.Vector3(18, 0, -19),
    new THREE.Vector3(-18, 0, -19),
    new THREE.Vector3(10, 0, -21),
    new THREE.Vector3(-10, 0, -21),
    new THREE.Vector3(0, 0, -22),
  ];

  return {
    mesh,
    ground,
    colliders: b.colliders,
    botSpawns,
    playerSpawn: new THREE.Vector3(0, 0, 20),
  };
}
