// Sound, made on the spot with WebAudio (no files): blows by weight and where they land,
// blocks, swings, bodies hitting the floor, the bell, and a crowd that swells with the fight.
// Slow motion lowers the pitch.

const KEY = 'arena-sound-v1';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  /** Sounds started this frame: a flurry must not turn into noise. */
  private budget = 0;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* storage unavailable */
    }
    // Browsers start audio only after a tap or a key.
    const wake = () => {
      this.start();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 0.8 : 0, this.ctx.currentTime, 0.05);
    return this.enabled;
  }

  private start(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    // A gentle limiter so a big exchange does not clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // Two seconds of noise, reused by everything.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // Slightly pink: softer, more like air and bodies than hiss.
      b = 0.97 * b + 0.03 * w;
      d[i] = 0.6 * w + 4 * b;
    }
    // The crowd: a band of murmur, looped; its level follows the fight.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  /** Called once a frame: lets new sounds through, moves the crowd. */
  frame(excite: number, crowd: number, running: boolean): void {
    this.budget = 5;
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain || !this.crowdFilter) return;
    const level = running ? crowd * (0.035 + 0.16 * excite * excite) : 0;
    this.crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.25);
    this.crowdFilter.frequency.setTargetAtTime(600 + 900 * excite, ctx.currentTime, 0.3);
  }

  private ok(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || this.budget <= 0) return null;
    this.budget--;
    return this.ctx;
  }

  /** A burst of noise through a filter, with a quick attack and a decay. */
  private burst(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number, gain: number, decay: number, at = 0, sweepTo?: number): void {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  /** A falling sine: the body of a thud. */
  private thump(ctx: AudioContext, from: number, to: number, gain: number, decay: number, at = 0): void {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** A blow: a slap and a thud for the head, a deep thud for the body, a dull pat on the guard. */
  hit(dmg: number, zone: string, blocked: boolean, slow: number): void {
    const ctx = this.ok();
    if (!ctx) return;
    const p = Math.sqrt(Math.max(0.2, slow));
    const k = Math.min(1, dmg / 18);
    if (blocked) {
      this.burst(ctx, 'lowpass', 900 * p, 0.7, 0.25 + 0.25 * k, 0.09);
      this.thump(ctx, 140 * p, 70 * p, 0.25 + 0.2 * k, 0.08);
      return;
    }
    const head = zone.includes('голов');
    // The crack of the glove or the shin on skin.
    this.burst(ctx, 'bandpass', (head ? 2200 : 1300) * p, 0.9, 0.35 + 0.5 * k, 0.05 + 0.05 * k);
    // The weight behind it.
    this.thump(ctx, (head ? 160 : 110) * p, (head ? 60 : 45) * p, 0.35 + 0.6 * k, 0.12 + 0.18 * k);
    this.burst(ctx, 'lowpass', 500 * p, 0.7, 0.2 + 0.5 * k, 0.1 + 0.15 * k);
  }

  /** The air a blow moves; heavier blows whoosh lower and longer. */
  swing(power: number, slow: number): void {
    const ctx = this.ok();
    if (!ctx || Math.random() < 0.35) return;
    const p = Math.sqrt(Math.max(0.2, slow));
    const k = Math.min(1, power / 2.5);
    const len = (0.12 + 0.12 * k) / p;
    this.burst(ctx, 'bandpass', 700 * p, 1.4, 0.05 + 0.07 * k, len, 0.05, 2400 * p);
  }

  /** A body on the canvas. */
  land(power: number, slow: number): void {
    const ctx = this.ok();
    if (!ctx) return;
    const p = Math.sqrt(Math.max(0.2, slow));
    const k = Math.min(1, power / 10);
    this.thump(ctx, 90 * p, 38 * p, 0.4 + 0.5 * k, 0.25 + 0.2 * k);
    this.burst(ctx, 'lowpass', 400 * p, 0.6, 0.25 + 0.4 * k, 0.2 + 0.2 * k);
  }

  /** A crunch: a break, a liver shot. */
  crunch(slow: number): void {
    const ctx = this.ok();
    if (!ctx) return;
    const p = Math.sqrt(Math.max(0.2, slow));
    for (let i = 0; i < 4; i++) this.burst(ctx, 'highpass', 1800 * p, 0.8, 0.18, 0.03, i * 0.025);
    this.thump(ctx, 120 * p, 50 * p, 0.4, 0.2);
  }

  /** The bell: a few bright strokes. */
  bell(times = 1): void {
    const ctx = this.ok();
    if (!ctx) return;
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * 0.32;
      for (const [f, a] of [[880, 0.22], [1320, 0.1], [2210, 0.06]] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(a, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g).connect(this.master!);
        o.start(t);
        o.stop(t + 1.5);
      }
    }
  }

  /** The crowd goes up: an "ooh" on a big moment, a roar on a knockout. */
  roar(k: number): void {
    const ctx = this.ok();
    if (!ctx) return;
    this.burst(ctx, 'bandpass', 500, 0.5, 0.15 + 0.35 * k, 0.8 + 1.6 * k, 0, 900);
    this.burst(ctx, 'bandpass', 1100, 0.7, 0.08 + 0.2 * k, 0.6 + 1.4 * k, 0.05, 1500);
  }
}
