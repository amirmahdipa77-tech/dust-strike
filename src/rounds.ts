/** Competitive round logic: freeze time, bomb plant/defuse, economy, match score. */

export type Side = 'T' | 'CT';
export type RoundPhase = 'freeze' | 'live' | 'ended' | 'over';

export interface SiteDef {
  name: 'A' | 'B';
  x: number;
  z: number;
  r: number;
}

export const SITES: SiteDef[] = [
  { name: 'A', x: 17, z: -16, r: 6.5 },
  { name: 'B', x: -19, z: -14, r: 6.5 },
];

const ROUND_TIME = 115;
const FREEZE_TIME = 6;
const BOMB_TIME = 40;
const PLANT_TIME = 3.2;
const DEFUSE_TIME = 7.5;
const ROUNDS_TO_WIN = 8;
const END_TIME = 4.5;

export interface RoundHooks {
  onRoundStart?: (round: number) => void;
  onRoundEnd?: (winner: Side, reason: string, scoreT: number, scoreCT: number) => void;
  onMatchEnd?: (winner: Side) => void;
  onPlant?: () => void;
  onExplode?: () => void;
  onDefuse?: () => void;
  onBeep?: (fast: boolean) => void;
  onPhase?: () => void;
}

export class Rounds {
  phase: RoundPhase = 'freeze';
  round = 1;
  scoreT = 0;
  scoreCT = 0;
  timeLeft = FREEZE_TIME;
  money = 800;

  bombPlanted = false;
  bombTimer = 0;
  bombSite: 'A' | 'B' | null = null;
  bombX = 0;
  bombZ = 0;
  plantProgress = 0;
  defuseProgress = 0;
  lastBeep = 0;

  private phaseTimer = 0;
  private lastWinner: Side | null = null;
  private lastReason = '';
  hooks: RoundHooks = {};

  resetMatch(): void {
    this.round = 1;
    this.scoreT = 0;
    this.scoreCT = 0;
    this.money = 800;
    this.phase = 'freeze';
    this.timeLeft = FREEZE_TIME;
    this.bombPlanted = false;
    this.bombTimer = 0;
    this.bombSite = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.lastWinner = null;
    this.hooks.onPhase?.();
    this.hooks.onRoundStart?.(this.round);
  }

  /** Which site the given position is inside (or null). */
  siteAt(x: number, z: number): 'A' | 'B' | null {
    for (const s of SITES) {
      if (Math.hypot(x - s.x, z - s.z) <= s.r) return s.name;
    }
    return null;
  }

  get roundTimer(): string {
    const t = Math.max(0, Math.ceil(this.timeLeft));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  /** Player holds the plant key. Returns true when the plant finished this tick. */
  plant(dt: number, playerPos: { x: number; z: number }, canPlant: boolean): boolean {
    if (this.phase !== 'live' || this.bombPlanted || !canPlant) {
      this.plantProgress = Math.max(0, this.plantProgress - dt * 2);
      return false;
    }
    const site = this.siteAt(playerPos.x, playerPos.z);
    if (!site) {
      this.plantProgress = Math.max(0, this.plantProgress - dt * 2);
      return false;
    }
    this.plantProgress += dt / PLANT_TIME;
    if (this.plantProgress >= 1) {
      this.plantProgress = 1;
      this.armBomb(playerPos, site);
      return true;
    }
    return false;
  }

  armBomb(pos: { x: number; z: number }, site: 'A' | 'B'): void {
    this.bombPlanted = true;
    this.bombTimer = BOMB_TIME;
    this.bombSite = site;
    this.bombX = pos.x;
    this.bombZ = pos.z;
    this.defuseProgress = 0;
    this.hooks.onPlant?.();
  }

  addMoney(v: number): void {
    this.money = Math.min(16000, this.money + v);
  }

  spend(v: number): boolean {
    if (this.money < v) return false;
    this.money -= v;
    return true;
  }

  endRound(winner: Side, reason: string): void {
    if (this.phase === 'ended' || this.phase === 'over') return;
    this.phase = 'ended';
    this.phaseTimer = END_TIME;
    this.lastWinner = winner;
    this.lastReason = reason;
    if (winner === 'T') this.scoreT++;
    else this.scoreCT++;

    this.addMoney(winner === 'T' ? 2200 : 1400);
    this.hooks.onRoundEnd?.(winner, reason, this.scoreT, this.scoreCT);
    this.hooks.onPhase?.();

    if (this.scoreT >= ROUNDS_TO_WIN || this.scoreCT >= ROUNDS_TO_WIN) {
      this.phase = 'over';
      this.hooks.onMatchEnd?.(this.scoreT > this.scoreCT ? 'T' : 'CT');
    }
  }

  tick(
    dt: number,
    ctx: {
      playerAlive: boolean;
      playerPos: { x: number; z: number };
      botsAlive: number;
      botOnBomb: boolean;
      botDefusing: boolean;
    },
  ): void {
    switch (this.phase) {
      case 'freeze': {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.phase = 'live';
          this.timeLeft = ROUND_TIME;
          this.hooks.onPhase?.();
        }
        break;
      }
      case 'live': {
        this.timeLeft -= dt;

        if (this.bombPlanted) {
          this.bombTimer -= dt;

          // bots defusing
          if (ctx.botOnBomb) {
            this.defuseProgress += dt / DEFUSE_TIME;
            if (this.defuseProgress >= 1) {
              this.hooks.onDefuse?.();
              this.endRound('CT', 'bomb defused');
              return;
            }
          } else {
            this.defuseProgress = Math.max(0, this.defuseProgress - dt * 0.6);
          }

          const beepRate = this.bombTimer < 10 ? 0.18 : this.bombTimer < 20 ? 0.5 : 1;
          this.lastBeep -= dt;
          if (this.lastBeep <= 0) {
            this.lastBeep = beepRate;
            this.hooks.onBeep?.(this.bombTimer < 10);
          }

          if (this.bombTimer <= 0) {
            this.hooks.onExplode?.();
            this.endRound('T', 'bomb exploded');
            return;
          }
        }

        if (ctx.botsAlive === 0) {
          this.endRound('T', 'enemy team eliminated');
          return;
        }
        if (!ctx.playerAlive && !this.bombPlanted) {
          this.endRound('CT', 'you were eliminated');
          return;
        }
        if (this.timeLeft <= 0) {
          this.endRound(this.bombPlanted ? 'T' : 'CT', 'time ran out');
        }
        break;
      }
      case 'ended': {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.startRound();
        break;
      }
      default:
        break;
    }
  }

  startRound(): void {
    this.round++;
    this.phase = 'freeze';
    this.timeLeft = FREEZE_TIME;
    this.bombPlanted = false;
    this.bombTimer = 0;
    this.bombSite = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.hooks.onRoundStart?.(this.round);
    this.hooks.onPhase?.();
  }

  get winner(): Side | null {
    return this.lastWinner;
  }

  get reason(): string {
    return this.lastReason;
  }
}
