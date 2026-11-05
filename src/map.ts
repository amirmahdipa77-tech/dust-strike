import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from './collision';

/**
 * DUST — a grid-painted recreation of the classic dust2 layout.
 *
 * The floor plan is painted into a 1 m occupancy grid (zones below), then:
 *   - every solid cell that touches a walkable cell is greedy-meshed into
 *     walls, so geometry follows the layout exactly and stays tiny,
 *   - the floor is emitted per cell with a baked ambient-occlusion tint,
 *   - props (crates, containers, cars, doors) are dropped on top.
 * Result: one merged mesh for the whole level.
 */

export const CELL = 1;
export const MAP_MIN = -30;
export const MAP_SIZE = 60;
const WALL_H = 6.2;
const MAX = MAP_MIN + MAP_SIZE;

const C = {
  sand: 0xd9c6a3,
  sandDark: 0xc6b08b,
  stone: 0xdcc7a4,
  stoneLow: 0xc2ad8a,
  concrete: 0xa9a49a,
  concreteDark: 0x8e8a80,
  wood: 0x96652f,
  woodDark: 0x6b4420,
  metal: 0x4c525a,
  blue: 0x466d8c,
  rust: 0x8a4a34,
  barrel: 0x6f5a34,
};

export interface MapData {
  mesh: THREE.Mesh;
  colliders: Collider[];
  walkable: Uint8Array;
  botSpawns: THREE.Vector3[];
  playerSpawn: THREE.Vector3;
}

// ---------------------------------------------------------------- textures
function noiseTexture(size: number, base: [number, number, number], grain: number): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const a = 0.015 + Math.random() * 0.03;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(120,100,72,${a})` : `rgba(250,240,218,${a})`;
    const w = 20 + Math.random() * 60;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, 1 + Math.random() * 2);
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * grain;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.96));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.84));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- builder
class Builder {
  geos: THREE.BufferGeometry[] = [];
  colliders: Collider[] = [];

  private paintGeo(g: THREE.BufferGeometry, color: number, y0: number, y1: number): void {
    const c = new THREE.Color(color);
    const pos = g.attributes.position;
    const n = pos.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      // baked vertical gradient: darker towards the floor
      const t = Math.max(0, Math.min(1, (y - y0) / Math.max(0.001, y1 - y0)));
      const shade = 0.78 + 0.22 * Math.min(1, t * 2.2);
      arr[i * 3] = c.r * shade;
      arr[i * 3 + 1] = c.g * shade;
      arr[i * 3 + 2] = c.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  box(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y0: number,
    y1: number,
    color: number,
    solid = true,
    uvScale = 0.22,
  ): void {
    const w = Math.abs(x2 - x1);
    const d = Math.abs(z2 - z1);
    const h = Math.abs(y1 - y0);
    if (w <= 0.001 || d <= 0.001 || h <= 0.001) return;

    const g = new THREE.BoxGeometry(w, h, d);
    g.translate((x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2);

    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(
        i,
        (pos.getX(i) + pos.getZ(i)) * uvScale,
        pos.getY(i) * uvScale + pos.getZ(i) * 0.05,
      );
    }
    this.paintGeo(g, color, y0, y1);
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

  /** Crate with a darker band so it reads as a box, not a cube. */
  crate(cx: number, cz: number, size = 2, h = 1.0, y0 = 0): void {
    const s = size / 2;
    this.box(cx - s, cz - s, cx + s, cz + s, y0, y0 + h, C.wood, true, 0.5);
    this.box(cx - s, cz - s, cx + s, cz + s, y0, y0 + h * 0.18, C.woodDark, false, 0.5);
    this.box(cx - s, cz - s, cx + s, cz + s, y0 + h * 0.94, y0 + h, C.woodDark, false, 0.5);
  }

  stacked(cx: number, cz: number, size = 2): void {
    this.crate(cx, cz, size, 1.0, 0);
    this.crate(cx + 0.15, cz - 0.12, size * 0.8, 0.9, 1.0);
  }

  barrel(cx: number, cz: number, color = C.barrel): void {
    const g = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12, 1);
    g.translate(cx, 0.55, cz);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.4, pos.getY(i) * 0.4);
    }
    this.paintGeo(g, color, 0, 1.1);
    this.geos.push(g);
    this.colliders.push({
      minX: cx - 0.45,
      maxX: cx + 0.45,
      minZ: cz - 0.45,
      maxZ: cz + 0.45,
      minY: 0,
      maxY: 1.1,
    });
  }

  /** Wall with a doorway cut into it (used for mid doors / long doors). */
  doorWall(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    axis: 'x' | 'z',
    gapCenter: number,
    gapWidth: number,
    h = WALL_H,
    lintelFrom = 4.4,
  ): void {
    const g0 = gapCenter - gapWidth / 2;
    const g1 = gapCenter + gapWidth / 2;
    const hh = h - 0.04;
    if (axis === 'x') {
      this.box(x1, z1, g0, z2, 0, hh, C.stone, true);
      this.box(g1, z1, x2, z2, 0, hh, C.stone, true);
      this.box(g0, z1, g1, z2, lintelFrom, hh, C.stone, true);
    } else {
      this.box(x1, z1, x2, g0, 0, hh, C.stone, true);
      this.box(x1, g1, x2, z2, 0, hh, C.stone, true);
      this.box(x1, g0, x2, g1, lintelFrom, hh, C.stone, true);
    }
  }
}

// ---------------------------------------------------------------- layout
interface Zone {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  floor: number;
}

const ZONES: Zone[] = [
  // T side
  { x1: -8, z1: 19, x2: 8, z2: 28, floor: C.sand }, // T spawn
  { x1: -4, z1: 14, x2: 4, z2: 22, floor: C.sand }, // T -> mid
  { x1: 4, z1: 20, x2: 16, z2: 27, floor: C.sand }, // T -> long
  { x1: -18, z1: 21, x2: -4, z2: 27, floor: C.sand }, // T -> tunnels
  // Long
  { x1: 13, z1: 18, x2: 28, z2: 28, floor: C.sand }, // outside long
  { x1: 15, z1: 11, x2: 26, z2: 21, floor: C.sand }, // long doors
  { x1: 17, z1: -6, x2: 26, z2: 13, floor: C.sand }, // long A
  { x1: 16, z1: -11, x2: 26, z2: -4, floor: C.sandDark }, // A ramp
  // A site
  { x1: 8, z1: -22, x2: 26, z2: -9, floor: C.concrete },
  { x1: 5, z1: -27, x2: 13, z2: -20, floor: C.sand }, // CT -> A
  // Short / catwalk
  { x1: 2, z1: -12, x2: 10, z2: -4, floor: C.sand }, // short A
  { x1: 0, z1: -7, x2: 5, z2: -1, floor: C.sand }, // catwalk
  // Mid
  { x1: -4, z1: -16, x2: 4, z2: 17, floor: C.sand },
  { x1: -4, z1: -21, x2: 4, z2: -14, floor: C.sand }, // mid -> CT
  { x1: -14, z1: -9, x2: -2, z2: -2, floor: C.sandDark }, // mid -> B (lower tunnel)
  // B tunnels
  { x1: -22, z1: -7, x2: -15, z2: 7, floor: C.sandDark }, // B doors
  { x1: -22, z1: 5, x2: -15, z2: 24, floor: C.sandDark }, // upper tunnels
  // B site
  { x1: -26, z1: -21, x2: -9, z2: -4, floor: C.concrete },
  { x1: -14, z1: -27, x2: -5, z2: -19, floor: C.sand }, // CT -> B
  // CT spawn
  { x1: -9, z1: -28, x2: 9, z2: -19, floor: C.concrete },
];

export function buildMap(): MapData {
  const b = new Builder();
  const walkable = new Uint8Array(MAP_SIZE * MAP_SIZE);

  const cellOf = (v: number) => Math.floor(v - MAP_MIN);

  for (const z of ZONES) {
    const ix0 = Math.max(0, cellOf(z.x1));
    const ix1 = Math.min(MAP_SIZE - 1, cellOf(z.x2) - 1);
    const iz0 = Math.max(0, cellOf(z.z1));
    const iz1 = Math.min(MAP_SIZE - 1, cellOf(z.z2) - 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) walkable[iz * MAP_SIZE + ix] = 1;
    }
  }

  const solidAt = (ix: number, iz: number): boolean => {
    if (ix < 0 || iz < 0 || ix >= MAP_SIZE || iz >= MAP_SIZE) return true;
    return walkable[iz * MAP_SIZE + ix] === 0;
  };

  // ---- floor with baked AO ----------------------------------------
  const dist = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(255);
  const queue: number[] = [];
  for (let iz = 0; iz < MAP_SIZE; iz++) {
    for (let ix = 0; ix < MAP_SIZE; ix++) {
      if (solidAt(ix, iz)) {
        dist[iz * MAP_SIZE + ix] = 0;
        queue.push(iz * MAP_SIZE + ix);
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % MAP_SIZE;
    const cz = (cur - cx) / MAP_SIZE;
    const d = dist[cur];
    if (d >= 4) continue;
    const push = (nx: number, nz: number) => {
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) return;
      const ni = nz * MAP_SIZE + nx;
      if (dist[ni] > d + 1) {
        dist[ni] = d + 1;
        queue.push(ni);
      }
    };
    push(cx + 1, cz);
    push(cx - 1, cz);
    push(cx, cz + 1);
    push(cx, cz - 1);
  }

  const floorPos: number[] = [];
  const floorCol: number[] = [];
  const floorUv: number[] = [];
  const floorIdx: number[] = [];
  const zoneColor = (ix: number, iz: number): number => {
    const x = MAP_MIN + ix + 0.5;
    const z = MAP_MIN + iz + 0.5;
    for (const zn of ZONES) {
      if (x >= zn.x1 && x < zn.x2 && z >= zn.z1 && z < zn.z2) return zn.floor;
    }
    return C.sand;
  };

  const tmpColor = new THREE.Color();
  for (let iz = 0; iz < MAP_SIZE; iz++) {
    for (let ix = 0; ix < MAP_SIZE; ix++) {
      if (solidAt(ix, iz)) continue;
      const x0 = MAP_MIN + ix;
      const z0 = MAP_MIN + iz;
      const d = Math.min(4, dist[iz * MAP_SIZE + ix]);
      const ao = 0.8 + 0.05 * d;

      tmpColor.setHex(zoneColor(ix, iz)).multiplyScalar(ao * (0.97 + Math.random() * 0.06));

      const base = floorPos.length / 3;
      floorPos.push(x0, 0, z0, x0 + 1, 0, z0, x0 + 1, 0, z0 + 1, x0, 0, z0 + 1);
      for (let k = 0; k < 4; k++) floorCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
      floorUv.push(x0 * 0.24, z0 * 0.24, (x0 + 1) * 0.24, z0 * 0.24, (x0 + 1) * 0.24, (z0 + 1) * 0.24, x0 * 0.24, (z0 + 1) * 0.24);
      floorIdx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(floorCol, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(floorUv, 2));
  floorGeo.setIndex(floorIdx);
  floorGeo.computeVertexNormals();
  b.geos.push(floorGeo);

  // ---- greedy-meshed walls -----------------------------------------
  const candidate = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (let iz = 0; iz < MAP_SIZE; iz++) {
    for (let ix = 0; ix < MAP_SIZE; ix++) {
      if (!solidAt(ix, iz)) continue;
      if (!solidAt(ix + 1, iz) || !solidAt(ix - 1, iz) || !solidAt(ix, iz + 1) || !solidAt(ix, iz - 1)) {
        candidate[iz * MAP_SIZE + ix] = 1;
      }
    }
  }

  const used = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const isCand = (ix: number, iz: number) =>
    ix >= 0 && iz >= 0 && ix < MAP_SIZE && iz < MAP_SIZE && candidate[iz * MAP_SIZE + ix] === 1;

  for (let iz = 0; iz < MAP_SIZE; iz++) {
    for (let ix = 0; ix < MAP_SIZE; ix++) {
      if (!isCand(ix, iz) || used[iz * MAP_SIZE + ix]) continue;

      let w = 1;
      while (isCand(ix + w, iz) && !used[iz * MAP_SIZE + ix + w]) w++;

      let h = 1;
      outer: while (iz + h < MAP_SIZE) {
        for (let k = 0; k < w; k++) {
          if (!isCand(ix + k, iz + h) || used[(iz + h) * MAP_SIZE + ix + k]) break outer;
        }
        h++;
      }

      for (let dz = 0; dz < h; dz++) {
        for (let dx = 0; dx < w; dx++) used[(iz + dz) * MAP_SIZE + ix + dx] = 1;
      }

      const x1 = MAP_MIN + ix;
      const z1 = MAP_MIN + iz;
      const col = (ix + iz) % 7 === 0 ? C.stoneLow : C.stone;
      b.box(x1, z1, x1 + w, z1 + h, 0, WALL_H - 0.35, col, true, 0.2);
      b.box(x1, z1, x1 + w, z1 + h, WALL_H - 0.35, WALL_H, C.stoneLow, false, 0.2);
    }
  }

  // ---- long doors ---------------------------------------------------
  b.doorWall(15, 14, 26, 15.2, 'x', 20.5, 5, WALL_H, 4.6);
  // ---- mid doors ----------------------------------------------------
  b.doorWall(-4.4, 5, 4.4, 6.2, 'x', 0, 3.2, WALL_H, 4.8);
  // ---- B doors ------------------------------------------------------
  b.doorWall(-22, -0.6, -15, 0.6, 'x', -18.5, 3.4, WALL_H, 4.4);

  // ---- A site -------------------------------------------------------
  b.crate(15.5, -16.5, 2.2); // default
  b.stacked(19.5, -13.5, 2.2); // double stack
  b.crate(23.5, -19.5, 2.0); // goose
  b.box(21, -21.6, 25.4, -18.6, 0, 0.35, C.concreteDark);
  b.box(21.4, -21.6, 25.0, -19.0, 0.35, 0.7, C.concrete);
  b.barrel(11.5, -19.5);
  b.barrel(11.5, -18.4);
  b.box(8.4, -22.4, 9.6, -20.4, 0, 1.1, C.concreteDark); // site lip

  // ---- B site -------------------------------------------------------
  b.box(-26.4, -21.4, -21.4, -14.6, 0, 1.05, C.concreteDark); // back plat
  b.box(-21.4, -21.4, -20.6, -14.6, 0, 0.5, C.concrete); // plat step
  b.crate(-17, -12.5, 2.4); // big box
  b.crate(-13.4, -18.5, 2.0);
  b.stacked(-24, -10.5, 2.0);
  b.barrel(-11.5, -8);
  b.barrel(-12.5, -7.2);

  // ---- long ---------------------------------------------------------
  b.box(20, -1.2, 23.2, 1.4, 0, 1.35, C.metal); // the car
  b.box(20.2, -0.9, 23.0, 1.1, 1.35, 1.62, 0x3c424a, false);
  b.box(22, 5.6, 26.2, 9.6, 0, 2.7, C.blue); // blue container
  b.box(22, 5.6, 26.2, 9.6, 2.7, 2.82, 0x2c4762, false);
  b.crate(18, 9.5, 2.0);
  b.crate(24.6, -3.2, 1.9);
  b.box(17, 2.4, 18.2, 4.6, 0, 0.95, C.sandDark); // sandbag line

  // ---- mid ----------------------------------------------------------
  b.crate(2.4, -3.4, 1.9); // xbox
  b.crate(-2.8, 12, 1.7);
  b.box(-3.8, -12.5, -1.4, -11.4, 0, 0.9, C.concreteDark);

  // ---- catwalk / short ----------------------------------------------
  b.crate(6.5, -8.5, 1.7);
  b.box(2.2, -4.4, 3.0, -1.6, 0, 0.95, C.sandDark);

  // ---- tunnels ------------------------------------------------------
  b.crate(-19, 10, 1.9);
  b.crate(-16.5, 18, 1.7);
  b.barrel(-21, 15);
  b.barrel(-20.6, 16.2);
  b.crate(-19.5, 2, 1.8);

  // ---- CT spawn ------------------------------------------------------
  b.crate(-6.5, -25.5, 2.0);
  b.crate(5.5, -26, 2.0);
  b.box(-9.4, -22.6, -7.6, -21.4, 0, 1.1, C.concreteDark);

  // ---- T spawn -------------------------------------------------------
  b.crate(-5, 23.5, 2.0);
  b.crate(5.5, 25, 2.0);
  b.box(-2.6, 27.2, 2.6, 27.9, 0, 1.0, C.concreteDark);

  // ---- assemble -------------------------------------------------------
  const merged = mergeGeometries(b.geos, false)!;
  merged.computeBoundingSphere();
  b.geos.forEach((g) => g.dispose());

  const tex = noiseTexture(128, [206, 182, 141], 24);
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
  );
  mesh.frustumCulled = false;

  return {
    mesh,
    colliders: b.colliders,
    walkable,
    botSpawns: [
      new THREE.Vector3(0, 0, -24),
      new THREE.Vector3(7, 0, -25),
      new THREE.Vector3(-7, 0, -25),
      new THREE.Vector3(17, 0, -13),
      new THREE.Vector3(-17, 0, -12),
      new THREE.Vector3(20, 0, -23),
      new THREE.Vector3(-20, 0, -23),
    ],
    playerSpawn: new THREE.Vector3(0, 0, 24),
  };
}

export const MAP_BOUNDS = { min: MAP_MIN, max: MAX };
