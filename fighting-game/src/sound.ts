// Sound, made on the spot with WebAudio (no files): blows by weight and where they land,
// blocks, swings, bodies hitting the floor, the bell, and a crowd that swells with the fight.
// Slow motion lowers the pitch.

const KEY = 'arena-sound-v1';

/** A short silent WAV (8 kHz, 0.1 s), built once. */
const SILENT_WAV = (() => {
  const n = 800;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o: number, t: string) => [...t].forEach((ch, i) => (buf[o + i] = ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  for (const x of buf) bin += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(bin);
})();

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  /** Deep rumble: brown noise, the raw stuff of a crowd. */
  private brown: AudioBuffer | null = null;
  /** Sounds started this frame: a flurry must not turn into noise. */
  private budget = 0;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* storage unavailable */
    }
    // Browsers start audio only after a tap or a key. Phones are picky about which tap
    // counts (iOS: touchend / click, not touchstart), and put the sound to sleep when the
    // app is hidden or a call comes ('interrupted'), so every tap wakes it again if needed.
    const wake = () => this.wake();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.wake();
    });
  }

  /** A silent <audio> playing on a loop: on iPhones it moves the page to the media audio
   *  channel, so the silent switch no longer mutes the game. */
  private keepAlive: HTMLAudioElement | null = null;

  private wake(): void {
    this.start();
    const ctx = this.ctx;
    if (!ctx || typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) return;
    // Newer iOS: say this page plays media, so the ring/silent switch does not mute it.
    const nav = navigator as unknown as { audioSession?: { type: string } };
    try {
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
      // Old iOS unlock: a one-sample buffer played inside the tap.
      try {
        const b = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* nothing */
      }
    }
    if (!this.keepAlive) {
      const el = document.createElement('audio');
      el.setAttribute('playsinline', '');
      el.loop = true;
      el.volume = 0.01;
      el.src = SILENT_WAV;
      this.keepAlive = el;
    }
    if (this.keepAlive.paused && this.enabled) void this.keepAlive.play().catch(() => {});
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 0.8 : 0, this.ctx.currentTime, 0.05);
    if (!this.enabled) this.keepAlive?.pause();
    else this.wake();
    return this.enabled;
  }

  /** Builds the sound graph; a test can hand in an offline context to measure it. */
  start(given?: BaseAudioContext): void {
    if (this.ctx && !given) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC && !given) return;
    const ctx = (given ?? new AC()) as AudioContext;
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
    // Brown noise: each sample a small step from the last, nearly all of it low.
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let x = 0;
    for (let i = 0; i < len; i++) {
      x = 0.985 * x + 0.06 * (Math.random() * 2 - 1);
      bd[i] = x;
    }
    // The crowd: a low murmur with two soft "voice" bands, no hiss on top. Two copies of the
    // loop at different speeds so it never repeats audibly. Its level follows the fight.
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'lowpass';
    this.crowdFilter.frequency.value = 650;
    this.crowdFilter.Q.value = 0.5;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const mix = ctx.createGain();
    for (const [rate, off] of [[1, 0], [0.83, 0.7]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      src.playbackRate.value = rate;
      src.connect(mix);
      src.start(0, off);
    }
    for (const [f, q, k] of [[320, 2.2, 0.9], [780, 2.8, 0.45]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = k;
      mix.connect(bp).connect(g).connect(this.crowdFilter);
    }
    this.crowdFilter.connect(this.crowdGain).connect(this.master);
  }

  /** Called once a frame: lets new sounds through, moves the crowd. */
  frame(excite: number, crowd: number, running: boolean): void {
    this.budget = 5;
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain || !this.crowdFilter) return;
    // Quiet in the background, louder (never over the blows) when the fight boils.
    const level = running ? crowd * (0.09 + 0.25 * excite * excite) : 0;
    this.crowdGain.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(550 + 450 * excite, ctx.currentTime, 0.4);
  }

  private ok(): AudioContext | null {
    const offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
    if (!this.enabled || !this.ctx || (this.ctx.state !== 'running' && !offline) || this.budget <= 0) return null;
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

  /** The mumble now playing (cutscene speech), to cut it off when the next line starts. */
  private talkGain: GainNode | null = null;

  /**
   * Speech as mumble (user: let them mumble in the cutscenes): a syllable per 2-3 letters,
   * a buzzing voice at `pitch` through two vowel formants, pauses at spaces and stops.
   * `tape` puts it through an old TV speaker (narrow band, wobble, hiss).
   */
  mumble(text: string, pitch: number, tape = false, maxDur = 6): void {
    const ctx = this.ctx;
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    if (!this.enabled || !ctx || (ctx.state !== 'running' && !offline)) return;
    this.hush();
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = tape ? 0.7 : 1;
    let tail: AudioNode = out;
    if (tape) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      out.connect(hp).connect(lp);
      tail = lp;
    }
    tail.connect(this.master!);
    this.talkGain = out;
    // Vowel formants (Hz): а, о, у, э, и.
    const VOW: [number, number][] = [[750, 1250], [500, 900], [350, 700], [550, 1750], [300, 2200]];
    const SYL = 0.095;
    let t = t0;
    const words = text.split(/\s+/).filter(Boolean);
    for (const w of words) {
      const n = Math.max(1, Math.min(4, Math.round(w.replace(/[^а-яёa-z]/gi, '').length / 2.6)));
      for (let i = 0; i < n && t - t0 < maxDur; i++) {
        const dur = SYL * (0.75 + Math.random() * 0.6);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const f0 = pitch * (0.88 + Math.random() * 0.3) * (i === n - 1 && /[?]$/.test(w) ? 1.25 : 1);
        o.frequency.setValueAtTime(f0, t);
        o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.15), t + dur);
        const v = VOW[Math.floor(Math.random() * VOW.length)];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
        g.gain.setValueAtTime(0.1, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        for (const [k, f] of v.entries()) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f * (0.95 + Math.random() * 0.1);
          bp.Q.value = 6;
          const fg = ctx.createGain();
          fg.gain.value = k ? 1.2 : 2.2;
          o.connect(bp).connect(fg).connect(g);
        }
        g.connect(out);
        o.start(t);
        o.stop(t + dur + 0.02);
        t += dur + 0.012;
      }
      t += /[.,!?…—:;]$/.test(w) ? 0.22 : 0.05;
    }
    if (tape) {
      // Hiss of the tape under the voice.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const g = ctx.createGain();
      g.gain.value = 0.012;
      src.connect(g).connect(out);
      src.start(t0, Math.random());
      src.stop(Math.min(t, t0 + maxDur) + 0.2);
    }
  }

  /** Cuts the mumble off (next line, the scene skipped). */
  hush(): void {
    if (!this.ctx || !this.talkGain) return;
    this.talkGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    const g = this.talkGain;
    setTimeout(() => g.disconnect(), 400);
    this.talkGain = null;
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
    if (!ctx || !this.brown) return;
    // Swells in, holds, dies away: a crowd, not a gust.
    const t = ctx.currentTime;
    const len = 1 + 2 * k;
    for (const [f, q, a] of [[300, 1.6, 1], [700, 2.2, 0.55]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 0.85, t);
      bp.frequency.linearRampToValueAtTime(f * (1 + 0.3 * k), t + len * 0.4);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a * 0.22 * (1 + 1.2 * k), t + 0.35);
      g.gain.setTargetAtTime(0.0001, t + len * 0.5, len * 0.25);
      src.connect(bp).connect(g).connect(this.master!);
      src.start(t, Math.random());
      src.stop(t + len + 1);
    }
  }
}
