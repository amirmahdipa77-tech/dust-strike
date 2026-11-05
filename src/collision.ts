// Axis-aligned box collision helpers. Everything in the map is a box,
// so AABB math keeps this tiny and fast on mobile CPUs.

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

/** Pushes a vertical capsule (feet at pos.y) out of every box it overlaps. */
export function resolveCollision(
  pos: { x: number; y: number; z: number },
  radius: number,
  height: number,
  boxes: Collider[],
): void {
  const yLow = pos.y + 0.4;
  const yHigh = pos.y + height - 0.05;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.maxY <= yLow || b.minY >= yHigh) continue;
    if (pos.x + radius < b.minX || pos.x - radius > b.maxX) continue;
    if (pos.z + radius < b.minZ || pos.z - radius > b.maxZ) continue;

    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;

    if (d2 > radius * radius) continue;

    if (d2 < 1e-7) {
      // Center is inside the box: eject along the shallowest axis.
      const left = pos.x - b.minX;
      const right = b.maxX - pos.x;
      const back = pos.z - b.minZ;
      const front = b.maxZ - pos.z;
      const m = Math.min(left, right, back, front);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === back) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    } else {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
}

/** Highest walkable surface under the given point (0 = sand). */
export function groundHeightAt(
  x: number,
  z: number,
  feetY: number,
  boxes: Collider[],
  stepUp = 0.45,
  base = 0,
): number {
  let h = base;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x < b.minX - 0.18 || x > b.maxX + 0.18) continue;
    if (z < b.minZ - 0.18 || z > b.maxZ + 0.18) continue;
    if (b.maxY > h && b.maxY <= feetY + stepUp) h = b.maxY;
  }
  return h;
}

/** Slab test. Returns distance along the ray, or Infinity when there is no hit. */
export function rayBoxes(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  boxes: Collider[],
  maxDist: number,
): number {
  let best = maxDist;
  const invX = 1 / (dx || 1e-9);
  const invY = 1 / (dy || 1e-9);
  const invZ = 1 / (dz || 1e-9);

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let t1 = (b.minX - ox) * invX;
    let t2 = (b.maxX - ox) * invX;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);

    t1 = (b.minY - oy) * invY;
    t2 = (b.maxY - oy) * invY;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));

    t1 = (b.minZ - oz) * invZ;
    t2 = (b.maxZ - oz) * invZ;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));

    if (tmax >= Math.max(tmin, 0) && tmin < best) best = Math.max(tmin, 0);
  }
  return best;
}

export function hasLineOfSight(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  boxes: Collider[],
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const hit = rayBoxes(ax, ay, az, dx / dist, dy / dist, dz / dist, boxes, dist);
  return hit >= dist - 0.15;
}
