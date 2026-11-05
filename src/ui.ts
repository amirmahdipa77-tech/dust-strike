import { settings, updateSetting, resetSettings, saveSettings, type Settings } from './settings';

/** Settings panel: tabs, sliders, switches, chips — built once, values live-updated. */

type Key = keyof Settings;
type Refresher = () => void;

const COLORS = ['#8ef0b0', '#ffffff', '#ffb545', '#ff5a45', '#5ad1ff', '#c78bff'];

export class SettingsUI {
  private tabsEl = document.getElementById('settingsTabs') as HTMLElement;
  private bodyEl = document.getElementById('settingsBody') as HTMLElement;
  private refreshers: Refresher[] = [];
  private activeTab = 'gameplay';
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.buildTabs();
    this.render();
  }

  private buildTabs(): void {
    const tabs: { id: string; label: string }[] = [
      { id: 'gameplay', label: 'GAMEPLAY' },
      { id: 'crosshair', label: 'CROSSHAIR' },
      { id: 'hud', label: 'HUD' },
      { id: 'video', label: 'VIDEO' },
      { id: 'audio', label: 'AUDIO' },
    ];
    this.tabsEl.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'tab' + (t.id === this.activeTab ? ' active' : '');
      b.textContent = t.label;
      b.onclick = () => {
        this.activeTab = t.id;
        this.buildTabs();
        this.render();
      };
      this.tabsEl.appendChild(b);
    }
  }

  private row(label: string, hint: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('div');
    const l = document.createElement('div');
    l.className = 'rowLabel';
    l.textContent = label;
    left.appendChild(l);
    if (hint) {
      const h = document.createElement('div');
      h.className = 'rowHint';
      h.textContent = hint;
      left.appendChild(h);
    }
    row.appendChild(left);
    return row;
  }

  private slider(
    label: string,
    hint: string,
    key: Key,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
  ): void {
    const row = this.row(label, hint);
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const value = document.createElement('div');
    value.className = 'rowValue';

    const paint = () => {
      const v = settings[key] as number;
      input.value = String(v);
      value.textContent = fmt(v);
      const pct = ((v - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    };

    input.oninput = () => {
      updateSetting(key, Number(input.value) as never);
      paint();
      this.onChange();
    };

    paint();
    right.append(input, value);
    row.appendChild(right);
    this.bodyEl.appendChild(row);
    this.refreshers.push(paint);
  }

  private toggle(label: string, hint: string, key: Key): void {
    const row = this.row(label, hint);
    const sw = document.createElement('div');
    sw.className = 'switch';
    const paint = () => sw.classList.toggle('on', Boolean(settings[key]));
    sw.onclick = () => {
      updateSetting(key, !settings[key] as never);
      paint();
      this.onChange();
    };
    paint();
    row.appendChild(sw);
    this.bodyEl.appendChild(row);
    this.refreshers.push(paint);
  }

  private chips(label: string, hint: string, key: Key, opts: { v: string; t: string }[]): void {
    const row = this.row(label, hint);
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    const buttons: HTMLButtonElement[] = [];
    const paint = () => {
      buttons.forEach((b, i) => b.classList.toggle('active', opts[i].v === settings[key]));
    };
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = o.t;
      b.onclick = () => {
        updateSetting(key, o.v as never);
        paint();
        this.onChange();
      };
      buttons.push(b);
      wrap.appendChild(b);
    }
    paint();
    row.appendChild(wrap);
    this.bodyEl.appendChild(row);
    this.refreshers.push(paint);
  }

  private swatches(label: string, hint: string, key: Key): void {
    const row = this.row(label, hint);
    const wrap = document.createElement('div');
    wrap.className = 'swatches';
    const dots: HTMLElement[] = [];
    const paint = () => {
      dots.forEach((d, i) => {
        d.classList.toggle('active', COLORS[i] === settings[key]);
        d.style.color = COLORS[i];
      });
    };
    for (const c of COLORS) {
      const d = document.createElement('div');
      d.className = 'swatch';
      d.style.background = c;
      d.onclick = () => {
        updateSetting(key, c as never);
        paint();
        this.onChange();
      };
      dots.push(d);
      wrap.appendChild(d);
    }
    paint();
    row.appendChild(wrap);
    this.bodyEl.appendChild(row);
    this.refreshers.push(paint);
  }

  private header(text: string): void {
    const h = document.createElement('div');
    h.className = 'tag';
    h.style.margin = '12px 0 2px';
    h.textContent = text;
    this.bodyEl.appendChild(h);
  }

  render(): void {
    this.bodyEl.innerHTML = '';
    this.refreshers = [];

    if (this.activeTab === 'gameplay') {
      this.slider('Look sensitivity', 'How far the view turns per swipe', 'sensitivity', 0.3, 2.5, 0.05, (v) => `${v.toFixed(2)}x`);
      this.slider('Joystick size', 'Thumbstick travel radius', 'joystickScale', 0.8, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`);
      this.slider('Field of view', 'Wider sees more, costs a little fps', 'fov', 60, 100, 1, (v) => `${v}°`);
      this.header('MATCH');
      this.slider('Bots', 'Enemies on the map', 'botCount', 2, 6, 1, (v) => String(v));
      this.slider('Kills to win', 'Score needed for victory', 'targetKills', 5, 30, 1, (v) => String(v));
      this.toggle('Invert look Y', 'Flip vertical aim', 'invertY');
      this.toggle('Left-handed', 'Swap stick and buttons', 'leftHanded');
    }

    if (this.activeTab === 'crosshair') {
      this.chips('Style', 'Shape of the reticle', 'crosshair', [
        { v: 'cross', t: 'CROSS' },
        { v: 't', t: 'T' },
        { v: 'dot', t: 'DOT' },
        { v: 'circle', t: 'CIRCLE' },
        { v: 'x', t: 'X' },
      ]);
      this.swatches('Colour', 'Reticle tint', 'crosshairColor');
      this.slider('Size', 'Length of each line', 'crosshairSize', 3, 14, 1, (v) => `${v}px`);
      this.slider('Gap', 'Space in the middle', 'crosshairGap', 0, 12, 1, (v) => `${v}px`);
      this.slider('Opacity', 'Reticle transparency', 'crosshairAlpha', 0.2, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
      this.toggle('Centre dot', 'Small dot in the middle', 'crosshairDot');

      const prev = document.createElement('div');
      prev.className = 'preview';
      prev.innerHTML = '<div id="xPreview" style="position:relative;width:0;height:0"></div>';
      this.bodyEl.appendChild(prev);
      const mount = () => {
        const box = document.getElementById('xPreview');
        if (!box) return;
        const ch = document.getElementById('crosshair');
        if (!ch) return;
        const clone = ch.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        box.innerHTML = '';
        box.appendChild(clone);
      };
      mount();
      this.refreshers.push(mount);
    }

    if (this.activeTab === 'hud') {
      this.slider('HUD scale', 'Overall size of the overlay', 'hudScale', 0.8, 1.35, 0.05, (v) => `${Math.round(v * 100)}%`);
      this.swatches('Accent colour', 'Kill counter, ammo bar, highlights', 'hudColor');
      this.toggle('Show FPS', 'Frame counter top-left', 'showFps');
      this.toggle('Hitmarker', 'Flash when a bullet lands', 'showHitmarker');
      this.toggle('Damage flash', 'Red vignette when hit', 'damageFlash');
      this.toggle('Damage direction', 'Arc showing where fire came from', 'showDamageDir');
      this.toggle('Radar', 'Top-down minimap in the corner', 'showMinimap');
    }

    if (this.activeTab === 'video') {
      this.slider('Render scale', 'Lower = faster on weak phones', 'resolution', 0.55, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
      this.chips('Quality hint', 'Pick what fits your device', 'resolution', [
        { v: '0.6', t: 'FAST' },
        { v: '0.8', t: 'BALANCED' },
        { v: '1', t: 'SHARP' },
      ]);
    }

    if (this.activeTab === 'audio') {
      this.slider('Master volume', 'Gunfire and impacts', 'masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    }
  }

  refreshAll(): void {
    for (const r of this.refreshers) r();
  }
}

export function wireSettingsPanel(ui: SettingsUI): void {
  const close = () => {
    saveSettings();
    document.getElementById('settings')?.classList.add('hidden');
  };
  document.getElementById('btn-settings-close')?.addEventListener('click', close);
  document.getElementById('btn-settings-reset')?.addEventListener('click', () => {
    resetSettings();
    ui.render();
  });
  void ui;
}
