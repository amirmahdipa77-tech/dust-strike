import * as THREE from 'three';

/** Procedural desert textures — no image files, everything drawn on canvas. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return [cv, cv.getContext('2d')!];
}

function finish(cv: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function grain(ctx: CanvasRenderingContext2D, size: number, amount: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.96));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.82));
  }
  ctx.putImageData(img, 0, 0);
}

/** Warm desert sand with pebbles and soft patches. */
export function sandTexture(size = 256): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = '#d3bd97';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 18 + Math.random() * 48;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = Math.random() > 0.5;
    g.addColorStop(0, warm ? 'rgba(226,206,166,0.35)' : 'rgba(168,142,102,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = Math.random() * 1.8 + 0.4;
    const v = Math.random();
    ctx.fillStyle =
      v > 0.82
        ? 'rgba(120,98,70,0.5)'
        : v > 0.55
          ? 'rgba(160,134,98,0.35)'
          : 'rgba(238,224,196,0.35)';
    ctx.fillRect(x, y, s, s);
  }

  // pebbles
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1.4 + Math.random() * 2.2;
    ctx.fillStyle = 'rgba(96,80,58,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(226,212,182,0.4)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  grain(ctx, size, 20);
  return finish(cv);
}

/** Cream plaster with hairline cracks and chipped patches — the dust2 wall look. */
export function plasterTexture(size = 256): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = '#d8c8a6';
  ctx.fillRect(0, 0, size, size);

  // wide tonal patches
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(232,219,190,0.3)' : 'rgba(176,152,116,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // chipped plaster revealing darker render
  for (let i = 0; i < 7; i++) {
    const cx = 30 + Math.random() * (size - 60);
    const cy = 30 + Math.random() * (size - 60);
    const pts: [number, number][] = [];
    const n = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = 5 + Math.random() * 13;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    ctx.beginPath();
    pts.forEach(([x, y], i2) => (i2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,124,92,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,98,72,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // hairline cracks
  for (let i = 0; i < 9; i++) {
    let x = 24 + Math.random() * (size - 48);
    let y = 24 + Math.random() * (size - 48);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 5 + Math.floor(Math.random() * 6);
    for (let k = 0; k < steps; k++) {
      x += (Math.random() - 0.5) * 18;
      y += (Math.random() - 0.3) * 16;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(120,98,72,${0.18 + Math.random() * 0.18})`;
    ctx.lineWidth = 0.8 + Math.random() * 0.6;
    ctx.stroke();
  }

  grain(ctx, size, 16);
  return finish(cv);
}

/** Cut-stone masonry for tunnels and platforms. */
export function stoneTexture(size = 256): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = '#9d8f74';
  ctx.fillRect(0, 0, size, size);

  const rowH = 32;
  for (let row = 0; row * rowH < size; row++) {
    const y = row * rowH;
    let x = row % 2 === 0 ? 0 : -24;
    while (x < size) {
      const w = 36 + Math.random() * 30;
      const tone = 150 + Math.random() * 45;
      ctx.fillStyle = `rgb(${tone | 0},${(tone * 0.93) | 0},${(tone * 0.78) | 0})`;
      ctx.fillRect(x + 1.5, y + 1.5, w - 3, rowH - 3);
      // subtle inner shading
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 1.5, y + 1.5, w - 3, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x + 1.5, y + rowH - 5, w - 3, 3);
      x += w;
    }
  }

  grain(ctx, size, 22);
  return finish(cv);
}

/** Planked wood for crates. */
export function woodTexture(size = 256): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = '#8a5c2c';
  ctx.fillRect(0, 0, size, size);

  const planks = 4;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    const tone = 120 + Math.random() * 30;
    ctx.fillStyle = `rgb(${tone | 0},${(tone * 0.66) | 0},${(tone * 0.36) | 0})`;
    ctx.fillRect(0, y + 1, size, ph - 2);

    // grain streaks
    for (let k = 0; k < 26; k++) {
      const gy = y + 2 + Math.random() * (ph - 4);
      ctx.strokeStyle = `rgba(${60 + Math.random() * 40},${34 + Math.random() * 24},16,${0.12 + Math.random() * 0.2})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, gy + Math.sin(x * 0.05 + i) * 1.6);
      }
      ctx.stroke();
    }

    // plank gap
    ctx.fillStyle = 'rgba(48,28,12,0.65)';
    ctx.fillRect(0, y, size, 2);
  }

  // nails
  for (let i = 0; i < 8; i++) {
    const x = 12 + Math.random() * (size - 24);
    const y = 10 + Math.random() * (size - 20);
    ctx.fillStyle = 'rgba(40,34,28,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,214,200,0.35)';
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  grain(ctx, size, 14);
  return finish(cv);
}

/** Rusted, scratched steel for barrels, cars and containers. */
export function metalTexture(size = 256, base = '#5b6169'): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // rust blooms
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(138,74,44,${0.35 + Math.random() * 0.35})`);
    g.addColorStop(0.7, 'rgba(112,62,38,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // scratches
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 6 + Math.random() * 30;
    const a = Math.random() * Math.PI;
    ctx.strokeStyle = `rgba(220,220,225,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  grain(ctx, size, 18);
  return finish(cv);
}

/** Corrugated blue shipping container. */
export function containerTexture(size = 256): THREE.Texture {
  const [cv, ctx] = canvas(size);
  ctx.fillStyle = '#4a7398';
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, size);
  }

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 5 + Math.random() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(140,78,46,${0.3 + Math.random() * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  grain(ctx, size, 14);
  return finish(cv);
}

/** Soft round sprite used for bullet holes / dust. */
export function impactTexture(size = 64): THREE.Texture {
  const [cv, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(24,18,12,0.95)');
  g.addColorStop(0.45, 'rgba(48,38,26,0.7)');
  g.addColorStop(1, 'rgba(60,48,34,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
