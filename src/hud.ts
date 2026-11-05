import { settings } from './settings';

/** DOM HUD: modern glass panels, customisable crosshair, directional damage. */

export class HUD {
  private hp = document.getElementById('hp') as HTMLElement;
  private hpBar = document.getElementById('hpbar') as HTMLElement;
  private mag = document.getElementById('mag') as HTMLElement;
  private reserve = document.getElementById('reserve') as HTMLElement;
  private magBar = document.getElementById('magbar') as HTMLElement;
  private kills = document.getElementById('kills') as HTMLElement;
  private target = document.getElementById('target') as HTMLElement;
  private kbar = document.getElementById('kbar') as HTMLElement;
  private fps = document.getElementById('fps') as HTMLElement;
  private stats = document.getElementById('stats') as HTMLElement;
  private feedEl = document.getElementById('feed') as HTMLElement;
  private hitEl = document.getElementById('hitmarker') as HTMLElement;
  private dmgEl = document.getElementById('damage') as HTMLElement;
  private arrows = document.getElementById('dmg-arrows') as HTMLElement;
  private reloadEl = document.getElementById('reloading') as HTMLElement;
  private crosshair = document.getElementById('crosshair') as HTMLElement;
  private root = document.getElementById('hud') as HTMLElement;

  private last = { hp: -1, mag: -1, reserve: -1, kills: -1, fps: -1, reloading: false };
  private hitTimer = 0;
  private dmgTimer = 0;

  constructor() {
    this.crosshair.classList.add('xhair');
    this.applySettings();
  }

  applySettings(): void {
    const s = settings;
    this.root.style.setProperty('--hud-scale', String(s.hudScale));
    this.root.style.setProperty('--hud-color', s.hudColor);
    this.root.style.setProperty('--amber', s.hudColor);
    this.crosshair.dataset.style = s.crosshair;
    this.crosshair.style.setProperty('--ch-color', s.crosshairColor);
    this.crosshair.style.setProperty('--ch-size', `${s.crosshairSize}px`);
    this.crosshair.style.setProperty('--ch-gap', `${s.crosshairGap}px`);
    this.crosshair.style.setProperty('--ch-alpha', String(s.crosshairAlpha));
    this.crosshair.querySelector<HTMLElement>('.dot')!.style.display = s.crosshairDot ? 'block' : 'none';
    this.stats.style.display = s.showFps ? 'block' : 'none';
    this.target.textContent = String(s.targetKills);
  }

  setHealth(v: number): void {
    const n = Math.max(0, Math.round(v));
    if (n === this.last.hp) return;
    this.last.hp = n;
    this.hp.textContent = String(n);
    this.hpBar.style.width = `${n}%`;
    this.hpBar.style.background =
      n > 60
        ? 'linear-gradient(90deg,#7ce0a0,#3fd47e)'
        : n > 30
          ? 'linear-gradient(90deg,#ffd479,#f0a825)'
          : 'linear-gradient(90deg,#ff8a72,#e8341f)';
  }

  setAmmo(mag: number, reserve: number, reloading: boolean): void {
    if (mag !== this.last.mag) {
      this.last.mag = mag;
      this.mag.textContent = String(mag);
      this.mag.style.color = mag === 0 ? '#ff5a45' : mag <= 6 ? '#ffb545' : '#fff';
      this.magBar.style.width = `${(mag / 30) * 100}%`;
    }
    if (reserve !== this.last.reserve) {
      this.last.reserve = reserve;
      this.reserve.textContent = String(reserve);
    }
    if (reloading !== this.last.reloading) {
      this.last.reloading = reloading;
      this.reloadEl.classList.toggle('hidden', !reloading);
    }
  }

  setKills(n: number, target: number): void {
    if (n !== this.last.kills) {
      this.last.kills = n;
      this.kills.textContent = String(n);
      this.kbar.style.width = `${Math.min(100, (n / target) * 100)}%`;
    }
  }

  setFps(n: number): void {
    const r = Math.round(n);
    if (r === this.last.fps) return;
    this.last.fps = r;
    this.fps.textContent = `${r} FPS`;
  }

  setSpread(px: number): void {
    this.crosshair.style.setProperty('--ch-spread', `${Math.max(0, px).toFixed(1)}px`);
  }

  hit(kill: boolean): void {
    if (!settings.showHitmarker) return;
    this.hitEl.classList.add('on');
    this.hitEl.classList.toggle('kill', kill);
    this.hitTimer = kill ? 0.3 : 0.13;
  }

  damage(angleRad: number | null): void {
    if (settings.damageFlash) {
      this.dmgEl.style.opacity = '0.55';
      this.dmgTimer = 0.35;
    }
    if (settings.showDamageDir && angleRad !== null) {
      const el = document.createElement('i');
      el.style.setProperty('--rot', `${(angleRad * 180) / Math.PI}deg`);
      this.arrows.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }
  }

  feed(html: string): void {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.feedEl.prepend(d);
    while (this.feedEl.children.length > 4) this.feedEl.lastElementChild?.remove();
    setTimeout(() => d.remove(), 4200);
  }

  update(dt: number): void {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitEl.classList.remove('on', 'kill');
    }
    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) this.dmgEl.style.opacity = '0';
    }
  }

  reset(target: number): void {
    this.last = { hp: -1, mag: -1, reserve: -1, kills: -1, fps: -1, reloading: false };
    this.feedEl.innerHTML = '';
    this.arrows.innerHTML = '';
    this.target.textContent = String(target);
    this.kbar.style.width = '0%';
  }
}
