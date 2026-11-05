/** DOM HUD: written only when a value actually changes. */

export class HUD {
  private hp = document.getElementById('hp') as HTMLElement;
  private hpBar = document.getElementById('hpbar') as HTMLElement;
  private mag = document.getElementById('mag') as HTMLElement;
  private reserve = document.getElementById('reserve') as HTMLElement;
  private kills = document.getElementById('kills') as HTMLElement;
  private fps = document.getElementById('fps') as HTMLElement;
  private feedEl = document.getElementById('feed') as HTMLElement;
  private hitEl = document.getElementById('hitmarker') as HTMLElement;
  private dmgEl = document.getElementById('damage') as HTMLElement;
  private reloadEl = document.getElementById('reloading') as HTMLElement;
  private crosshair = document.getElementById('crosshair') as HTMLElement;

  private last = { hp: -1, mag: -1, reserve: -1, kills: -1, fps: -1, reloading: false };
  private hitTimer = 0;
  private dmgTimer = 0;

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
    }
    if (reserve !== this.last.reserve) {
      this.last.reserve = reserve;
      this.reserve.textContent = `/ ${reserve}`;
    }
    if (reloading !== this.last.reloading) {
      this.last.reloading = reloading;
      this.reloadEl.classList.toggle('hidden', !reloading);
    }
  }

  setKills(n: number): void {
    if (n === this.last.kills) return;
    this.last.kills = n;
    this.kills.textContent = String(n);
  }

  setFps(n: number): void {
    const r = Math.round(n);
    if (r === this.last.fps) return;
    this.last.fps = r;
    this.fps.textContent = `${r} FPS`;
  }

  setSpread(px: number): void {
    this.crosshair.style.setProperty('--s', `${px}px`);
    const t = this.crosshair.querySelectorAll<HTMLElement>('.ch');
    if (t.length === 4) {
      t[0].style.transform = `translateY(${-px}px)`;
      t[1].style.transform = `translateY(${px}px)`;
      t[2].style.transform = `translateX(${-px}px)`;
      t[3].style.transform = `translateX(${px}px)`;
    }
  }

  hit(kill: boolean): void {
    this.hitEl.classList.add('on');
    this.hitEl.classList.toggle('kill', kill);
    this.hitTimer = kill ? 0.28 : 0.13;
  }

  damage(): void {
    this.dmgEl.style.opacity = '0.75';
    this.dmgTimer = 0.35;
  }

  feed(text: string): void {
    const d = document.createElement('div');
    d.innerHTML = text;
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

  reset(): void {
    this.last = { hp: -1, mag: -1, reserve: -1, kills: -1, fps: -1, reloading: false };
    this.feedEl.innerHTML = '';
  }
}
