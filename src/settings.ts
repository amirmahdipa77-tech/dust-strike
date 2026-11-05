/** Player settings: persisted to localStorage, applied live. */

export type CrosshairStyle = 'cross' | 'dot' | 'circle' | 't' | 'x';

export interface Settings {
  // controls
  sensitivity: number; // 0.3 .. 2.5
  joystickScale: number; // 0.8 .. 1.5
  invertY: boolean;
  leftHanded: boolean;
  autoSprint: boolean;

  // view
  fov: number; // 60 .. 100
  crosshair: CrosshairStyle;
  crosshairColor: string;
  crosshairSize: number; // 3 .. 14
  crosshairGap: number; // 0 .. 12
  crosshairAlpha: number; // 0.2 .. 1
  crosshairDot: boolean;

  // hud
  hudScale: number; // 0.8 .. 1.35
  hudColor: string;
  showFps: boolean;
  showDamageDir: boolean;
  showHitmarker: boolean;
  damageFlash: boolean;
  showMinimap: boolean;

  // video / audio
  resolution: number; // 0.55 .. 1.0 (multiplier on device pixel ratio)
  masterVolume: number; // 0 .. 1
  botCount: number; // 2 .. 6
  targetKills: number; // 5 .. 30

  // multiplayer
  playerName: string;
  serverUrl: string;
}

export const DEFAULTS: Settings = {
  sensitivity: 1,
  joystickScale: 1,
  invertY: false,
  leftHanded: false,
  autoSprint: false,

  fov: 84,
  crosshair: 'cross',
  crosshairColor: '#8ef0b0',
  crosshairSize: 7,
  crosshairGap: 5,
  crosshairAlpha: 0.95,
  crosshairDot: true,

  hudScale: 1,
  hudColor: '#ffb545',
  showFps: true,
  showDamageDir: true,
  showHitmarker: true,
  damageFlash: true,
  showMinimap: true,

  resolution: 1,
  masterVolume: 0.6,
  botCount: 4,
  targetKills: 15,

  playerName: 'player',
  serverUrl: 'ws://localhost:8080/ws',
};

const KEY = 'duststrike.settings.v2';

function clampAll(s: Settings): Settings {
  const n = (v: number, lo: number, hi: number, d: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    sensitivity: n(s.sensitivity, 0.3, 2.5, 1),
    joystickScale: n(s.joystickScale, 0.8, 1.5, 1),
    invertY: !!s.invertY,
    leftHanded: !!s.leftHanded,
    autoSprint: !!s.autoSprint,
    fov: n(s.fov, 60, 100, 84),
    crosshair: (['cross', 'dot', 'circle', 't', 'x'] as CrosshairStyle[]).includes(s.crosshair)
      ? s.crosshair
      : 'cross',
    crosshairColor: /^#[0-9a-f]{6}$/i.test(s.crosshairColor) ? s.crosshairColor : '#8ef0b0',
    crosshairSize: n(s.crosshairSize, 3, 14, 7),
    crosshairGap: n(s.crosshairGap, 0, 12, 5),
    crosshairAlpha: n(s.crosshairAlpha, 0.2, 1, 0.95),
    crosshairDot: !!s.crosshairDot,
    hudScale: n(s.hudScale, 0.8, 1.35, 1),
    hudColor: /^#[0-9a-f]{6}$/i.test(s.hudColor) ? s.hudColor : '#ffb545',
    showFps: !!s.showFps,
    showDamageDir: !!s.showDamageDir,
    showHitmarker: !!s.showHitmarker,
    damageFlash: !!s.damageFlash,
    showMinimap: s.showMinimap !== false,
    resolution: n(s.resolution, 0.55, 1, 1),
    masterVolume: n(s.masterVolume, 0, 1, 0.6),
    botCount: Math.round(n(s.botCount, 2, 6, 4)),
    targetKills: Math.round(n(s.targetKills, 5, 30, 15)),
    playerName: typeof s.playerName === 'string' && s.playerName.trim() ? s.playerName.slice(0, 16) : 'player',
    serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl : 'ws://localhost:8080/ws',
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return clampAll({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = loadSettings();

const listeners = new Set<(s: Settings) => void>();

export function onSettingsChange(cb: (s: Settings) => void): void {
  listeners.add(cb);
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  Object.assign(settings, clampAll(settings));
  saveSettings();
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage might be unavailable */
  }
  for (const cb of listeners) cb(settings);
}

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}
