// All sound is synthesized with WebAudio: engine, road, horn, doors and a little AM radio.
const STATIONS = [
  { label: 'OFF' },
  { label: 'KRTE 66AM', style: 'country' },
  { label: 'KDZT 99.1', style: 'desert' },
];

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.station = 1; this.step = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // engine
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 320;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    const e2g = ctx.createGain(); e2g.gain.value = 0.5;
    this.eng1.connect(this.engF); this.eng2.connect(e2g); e2g.connect(this.engF);
    this.engF.connect(this.engG); this.engG.connect(this.master);
    this.eng1.start(); this.eng2.start();
    // road noise
    this.road = ctx.createBufferSource(); this.road.buffer = nb; this.road.loop = true;
    this.roadF = ctx.createBiquadFilter(); this.roadF.type = 'bandpass'; this.roadF.frequency.value = 500; this.roadF.Q.value = 0.6;
    this.roadG = ctx.createGain(); this.roadG.gain.value = 0;
    this.road.connect(this.roadF); this.roadF.connect(this.roadG); this.roadG.connect(this.master); this.road.start();
    // horn
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1400;
    for (const f of [311, 370]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.hornG); this.hornG.connect(this.master);
    // radio chain: small, tinny speaker
    this.radioG = ctx.createGain(); this.radioG.gain.value = 0.09;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.radioIn = hp; hp.connect(lp); lp.connect(this.radioG); this.radioG.connect(this.master);
    this.nextNote = ctx.currentTime + 0.2;
    setInterval(() => this.schedule(), 40);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  radioLabel() { return STATIONS[this.station].label; }
  cycleRadio() {
    this.station = (this.station + 1) % STATIONS.length;
    this.noise(0.25, 1800, 0.05, this.radioIn);
    this.step = 0;
    return STATIONS[this.station];
  }

  update(speed, throttle, offroad, paused) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = [0, 12, 25, 40, 55, 80];
    let g = 1; while (g < gears.length - 1 && speed > gears[g]) g++;
    const frac = (speed - gears[g - 1]) / (gears[g] - gears[g - 1]);
    const f = speed < 0.5 ? 34 : 40 + frac * 38 + g * 3;
    this.eng1.frequency.setTargetAtTime(f, t, 0.08);
    this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engF.frequency.setTargetAtTime(260 + throttle * 300 + speed * 3, t, 0.1);
    this.engG.gain.setTargetAtTime(paused ? 0 : 0.05 + throttle * 0.05, t, 0.1);
    this.roadG.gain.setTargetAtTime(paused ? 0 : Math.min(0.06, speed / 1100) + (offroad ? 0.08 : 0), t, 0.1);
    this.roadF.frequency.setTargetAtTime(offroad ? 180 : 500, t, 0.1);
    this.radioG.gain.setTargetAtTime(paused ? 0 : 0.09, t, 0.1);
  }

  horn(on) { if (this.ctx) this.hornG.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.02); }

  noise(dur, freq, vol, dest, type = 'bandpass', sweep) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', dest, when = 0, slide) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  door() { this.noise(0.7, 2500, 0.12, null, 'bandpass', 600); this.tone(70, 0.2, 0.15, 'sine', null, 0.55); }
  bell() { this.tone(1320, 0.5, 0.08, 'sine'); this.tone(1320, 0.5, 0.08, 'sine', null, 0.35); }
  bump(big) { this.noise(big ? 0.6 : 0.25, 160, big ? 0.5 : 0.25, null, 'lowpass'); this.tone(90, 0.3, big ? 0.3 : 0.15, 'sine', null, 0, 40); }
  step1() { this.tone(180 + Math.random() * 40, 0.06, 0.05, 'triangle'); }
  pump() { this.noise(0.3, 300, 0.03, null, 'lowpass'); }
  honk(v = 1) {
    if (!this.ctx) return;
    this.tone(415, 0.35, 0.05 * v, 'square', null, 0); this.tone(523, 0.35, 0.04 * v, 'square', null, 0);
  }
  chime() { [660, 880, 990].forEach((f, i) => this.tone(f, 0.4, 0.06, 'triangle', null, i * 0.12)); }

  // ---------- generative radio ----------
  schedule() {
    if (!this.ctx) return;
    const st = STATIONS[this.station];
    while (this.nextNote < this.ctx.currentTime + 0.15) {
      if (st.style) this.playStep(st.style, this.step, this.nextNote - this.ctx.currentTime);
      const bpm = st.style === 'desert' ? 72 : 104;
      this.nextNote += 60 / bpm / 2;
      this.step++;
    }
  }
  playStep(style, step, when) {
    const out = this.radioIn;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    if (when < 0) return;
    if (style === 'country') {
      const prog = [43, 48, 50, 43]; // G C D G
      const root = prog[Math.floor(step / 16) % 4];
      const beat = step % 8;
      if (beat === 0) this.tone(mtof(root - 12), 0.35, 0.5, 'triangle', out, when);
      if (beat === 4) this.tone(mtof(root - 5), 0.35, 0.45, 'triangle', out, when);
      if (beat === 2 || beat === 6) [0, 4, 7].forEach(i => this.tone(mtof(root + 12 + i), 0.12, 0.08, 'square', out, when));
      if (Math.random() < 0.55) {
        const pent = [0, 2, 4, 7, 9, 12, 14];
        this.mel = (this.mel ?? 3) + Math.floor(Math.random() * 3) - 1;
        this.mel = Math.max(0, Math.min(pent.length - 1, this.mel));
        this.tone(mtof(root + 24 + pent[this.mel]), 0.22, 0.12, 'square', out, when, mtof(root + 24 + pent[this.mel]) * 0.995);
      }
      if (beat % 2 === 0) this.noise(0.04, 6000, 0.05, out, 'highpass');
    } else {
      const prog = [57, 53, 48, 55]; // Am F C G
      const root = prog[Math.floor(step / 16) % 4];
      if (step % 16 === 0) [0, 3, 7, 12].forEach(i => this.tone(mtof(root + i - 12 + (i === 3 && root !== 57 ? 1 : 0)), 3.6, 0.07, 'sine', out, when));
      if (step % 4 === 0 && Math.random() < 0.6) {
        const sc = [0, 3, 5, 7, 10, 12];
        this.tone(mtof(root + 12 + sc[Math.floor(Math.random() * sc.length)]), 1.2, 0.09, 'sine', out, when);
      }
    }
  }
}
