/** Player progression: XP, levels and weapon unlocks (persisted). */

import type { WeaponId } from './weapons';

export interface Progress {
  xp: number;
  level: number;
  kills: number;
  rounds: number;
  plants: number;
  defuses: number;
  name: string;
}

const KEY = 'duststrike.progress.v1';
const XP_PER_LEVEL = 500;

export const UNLOCKS: Record<WeaponId, number> = {
  ak: 1,
  usp: 1,
  m4: 2,
  awp: 3,
};

export const progress: Progress = load();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        xp: Number(p.xp) || 0,
        level: Math.max(1, Number(p.level) || 1),
        kills: Number(p.kills) || 0,
        rounds: Number(p.rounds) || 0,
        plants: Number(p.plants) || 0,
        defuses: Number(p.defuses) || 0,
        name: typeof p.name === 'string' ? p.name : 'player',
      };
    }
  } catch {
    /* ignore */
  }
  return { xp: 0, level: 1, kills: 0, rounds: 0, plants: 0, defuses: 0, name: 'player' };
}

export function saveProgress(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}

export function levelFor(xp: number): number {
  return Math.min(30, 1 + Math.floor(xp / XP_PER_LEVEL));
}

export function xpInLevel(xp: number): { current: number; needed: number; pct: number } {
  const lvl = levelFor(xp);
  const base = (lvl - 1) * XP_PER_LEVEL;
  const current = Math.min(XP_PER_LEVEL, xp - base);
  return { current, needed: XP_PER_LEVEL, pct: (current / XP_PER_LEVEL) * 100 };
}

export function isUnlocked(id: WeaponId): boolean {
  return progress.level >= (UNLOCKS[id] ?? 1);
}

/** Adds XP, returns true when the player levelled up. */
export function addXp(amount: number): boolean {
  const before = levelFor(progress.xp);
  progress.xp += Math.max(0, Math.round(amount));
  const after = levelFor(progress.xp);
  progress.level = after;
  saveProgress();
  return after > before;
}

export function unlockedWeapons(): WeaponId[] {
  return (Object.keys(UNLOCKS) as WeaponId[]).filter(isUnlocked);
}
