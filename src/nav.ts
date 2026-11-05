import type { Collider } from './collision';

export interface NavOptions {
  colliders?: Collider[];
  /** Pre-built walkability grid (1 = walkable), e.g. straight from the map. */
  grid?: Uint8Array;
  min?: number;
  max?: number;
  size?: number;
  cell?: number;
  radius?: number;
}

/**
 * Coarse A* navigation grid. The map is a box soup, so a 1.5 m grid over the
 * playable square is tiny (about 1k cells) and costs almost nothing per frame.
 */
export class NavGrid {
  readonly cell: number;
  readonly size: number;
  readonly min: number;
  readonly walkable: Uint8Array;

  constructor(opts: NavOptions) {
    this.cell = opts.cell ?? 1;
    this.min = opts.min ?? -24.5;
    this.size = opts.size ?? Math.ceil(((opts.max ?? 24.5) - this.min) / this.cell);

    if (opts.grid) {
      this.walkable = new Uint8Array(opts.grid);
      return;
    }

    this.walkable = new Uint8Array(this.size * this.size).fill(1);
    const colliders = opts.colliders ?? [];
    const radius = opts.radius ?? 0.5;

    // A cell is walkable when its centre is clear of every solid box.
    for (let iz = 0; iz < this.size; iz++) {
      const z = this.min + (iz + 0.5) * this.cell;
      for (let ix = 0; ix < this.size; ix++) {
        const x = this.min + (ix + 0.5) * this.cell;
        for (const c of colliders) {
          if (c.maxY - c.minY < 0.5) continue; // kerbs are walkable
          if (c.minY > 1.5) continue; // overhead
          if (
            x > c.minX - radius &&
            x < c.maxX + radius &&
            z > c.minZ - radius &&
            z < c.maxZ + radius
          ) {
            this.walkable[iz * this.size + ix] = 0;
            break;
          }
        }
      }
    }
  }

  private ix(x: number): number {
    return Math.max(0, Math.min(this.size - 1, Math.floor((x - this.min) / this.cell)));
  }

  private center(i: number): number {
    return this.min + (i + 0.5) * this.cell;
  }

  isWalkable(ix: number, iz: number): boolean {
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return false;
    return this.walkable[iz * this.size + ix] === 1;
  }

  /** Nearest walkable cell to a world position (spiral search). */
  private nearestWalkable(ix: number, iz: number): [number, number] | null {
    if (this.isWalkable(ix, iz)) return [ix, iz];
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.isWalkable(ix + dx, iz + dz)) return [ix + dx, iz + dz];
        }
      }
    }
    return null;
  }

  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] {
    const start = this.nearestWalkable(this.ix(sx), this.ix(sz));
    const goal = this.nearestWalkable(this.ix(tx), this.ix(tz));
    if (!start || !goal) return [];

    const n = this.size * this.size;
    const startIdx = start[1] * this.size + start[0];
    const goalIdx = goal[1] * this.size + goal[0];
    if (startIdx === goalIdx) return [];

    const gScore = new Float32Array(n).fill(Infinity);
    const fScore = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [startIdx];

    gScore[startIdx] = 0;
    const hx = (i: number) => Math.abs((i % this.size) - goal[0]);
    const hz = (i: number) => Math.abs(Math.floor(i / this.size) - goal[1]);
    fScore[startIdx] = hx(startIdx) + hz(startIdx);

    let guard = 0;
    while (open.length > 0 && guard++ < 4000) {
      // pick the lowest f (linear scan is fine for ~1k nodes)
      let bestAt = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bestAt]]) bestAt = i;
      const current = open.splice(bestAt, 1)[0];
      if (current === goalIdx) break;
      closed[current] = 1;

      const cx = current % this.size;
      const cz = Math.floor(current / this.size);

      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.isWalkable(nx, nz)) continue;
          if (dx && dz && (!this.isWalkable(cx + dx, cz) || !this.isWalkable(cx, cz + dz))) continue;

          const ni = nz * this.size + nx;
          if (closed[ni]) continue;
          const step = dx && dz ? 1.414 : 1;
          const tentative = gScore[current] + step;
          if (tentative < gScore[ni]) {
            gScore[ni] = tentative;
            cameFrom[ni] = current;
            fScore[ni] = tentative + hx(ni) + hz(ni);
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }

    if (cameFrom[goalIdx] === -1) return [];

    const path: { x: number; z: number }[] = [];
    let cur = goalIdx;
    while (cur !== startIdx && cur !== -1) {
      path.push({ x: this.center(cur % this.size), z: this.center(Math.floor(cur / this.size)) });
      cur = cameFrom[cur];
    }
    path.reverse();
    return path;
  }
}
