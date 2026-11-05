/** Tiny synthesised SFX — no audio files, keeps the APK small. */

export class SFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  private volume = 0.6;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  private burst(gain: number, dur: number, freq: number, q = 1, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !this.master || !this.noise || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain = 0.2, type: OscillatorType = 'square'): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind: 'rifle' | 'sniper' | 'pistol' = 'rifle'): void {
    if (kind === 'sniper') {
      this.burst(0.75, 0.26, 1700, 0.9);
      this.tone(90, 0.22, 0.26, 'sawtooth');
    } else if (kind === 'pistol') {
      this.burst(0.4, 0.09, 3200, 1.1);
      this.tone(220, 0.07, 0.13, 'square');
    } else {
      this.burst(0.55, 0.13, 2400, 0.8);
      this.tone(150, 0.1, 0.18, 'sawtooth');
    }
  }
  botShot(): void {
    this.burst(0.22, 0.11, 1500, 0.7);
  }
  hit(): void {
    this.tone(880, 0.05, 0.1, 'square');
  }
  kill(): void {
    this.tone(520, 0.09, 0.13, 'triangle');
    setTimeout(() => this.tone(760, 0.11, 0.11, 'triangle'), 70);
  }
  hurt(): void {
    this.burst(0.3, 0.2, 500, 0.6);
  }
  reload(): void {
    this.burst(0.2, 0.06, 3000, 2, 'bandpass');
    setTimeout(() => this.burst(0.25, 0.08, 1800, 2, 'bandpass'), 260);
  }
  empty(): void {
    this.burst(0.15, 0.04, 4000, 3, 'bandpass');
  }
}
