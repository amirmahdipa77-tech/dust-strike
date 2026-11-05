import type { MapData } from './map';
import { MAP_MIN, MAP_SIZE, CELL } from './map';

/** Top-down radar drawn straight from the map occupancy grid. */

export interface Blip {
  x: number;
  z: number;
  color: string;
  size?: number;
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private pxPerM: number;
  private size: number;

  constructor(
    private canvas: HTMLCanvasElement,
    map: MapData,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = canvas.clientWidth || 150;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    this.ctx.scale(dpr, dpr);
    this.size = cssSize;
    this.pxPerM = cssSize / (MAP_SIZE * CELL);

    this.base = document.createElement('canvas');
    this.base.width = canvas.width;
    this.base.height = canvas.height;
    const b = this.base.getContext('2d')!;
    b.scale(dpr, dpr);
    this.paintBase(b, map, cssSize);
  }

  private paintBase(ctx: CanvasRenderingContext2D, map: MapData, size: number): void {
    const s = this.pxPerM;
    ctx.clearRect(0, 0, size, size);

    // walkable cells
    for (let iz = 0; iz < MAP_SIZE; iz++) {
      for (let ix = 0; ix < MAP_SIZE; ix++) {
        if (!map.walkable[iz * MAP_SIZE + ix]) continue;
        const h = map.heightAt(MAP_MIN + ix + 0.5, MAP_MIN + iz + 0.5);
        ctx.fillStyle = h > 0.4 ? 'rgba(214,186,138,0.55)' : h < -0.4 ? 'rgba(120,96,64,0.6)' : 'rgba(196,168,122,0.42)';
        ctx.fillRect((ix * CELL) * s, (iz * CELL) * s, s * CELL + 0.5, s * CELL + 0.5);
      }
    }

    // outline
    ctx.strokeStyle = 'rgba(255,181,69,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  draw(px: number, pz: number, yaw: number, blips: Blip[]): void {
    const ctx = this.ctx;
    const s = this.pxPerM;
    const w = this.size;
    ctx.clearRect(0, 0, w, w);
    ctx.drawImage(this.base, 0, 0, w, w);

    const toX = (x: number) => (x - MAP_MIN) * s;
    const toY = (z: number) => (z - MAP_MIN) * s;

    for (const b of blips) {
      ctx.beginPath();
      ctx.fillStyle = b.color;
      ctx.arc(toX(b.x), toY(b.z), b.size ?? 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // self arrow
    const x = toX(px);
    const y = toY(pz);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3.4, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.restore();
  }
}
