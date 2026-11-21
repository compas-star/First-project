// All sound is synthesized with WebAudio: engine, road, horn, doors and a little AM radio.
// After the built-in stations, the radio dial has real internet stations (see netradio.js).
import { NetRadio } from './netradio.js';
const STATIONS = [
  { label: 'OFF' },
  { label: 'KRTE 66AM', style: 'country' },
  { label: 'KDZT 99.1', style: 'desert' },
];

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.station = 1; this.step = 0;
    this.net = new NetRadio();
    // if you tuned to the internet stations while they were still being found, start the first one
    this.net.onReady = () => { const st = this.dial()[this.station]; if (st && st.online) this.net.play(st); };
  }
  // the whole dial: off, the two built-in stations, then the internet stations
  dial() {
    const n = this.net;
    const net = n.stations.length ? n.stations : [{ label: n.status === 'failed' ? 'NO NET RADIO' : 'SEARCHING..', placeholder: true }];
    return [...STATIONS, ...net];
  }

  init() {
    try { this.net.unlock(); } catch (e) { /* no internet radio then */ }
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
    this.roadF = ctx.createBiquadFilter(); this.roadF.type = 'lowpass'; this.roadF.frequency.value = 140; this.roadF.Q.value = 0.7;
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
    // ambience: looping filtered noise for rain, wind and wet tyres
    const amb = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(this.master); src.start(0, Math.random() * 1.8);
      return { f: fl, g };
    };
    this.rainHi = amb('highpass', 1100);      // the hiss of rain on the roof and glass
    this.rainLo = amb('lowpass', 420);        // and its heavier drumming
    this.wind = amb('bandpass', 380, 0.9);    // wind past the cab
    this.tyres = amb('highpass', 2600);       // tyres on a wet road
    this.env = null; this.nextBug = 0; this.nextBird = 0;
    this.nextNote = ctx.currentTime + 0.2;
    setInterval(() => this.schedule(), 40);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; this.net.setMuted(m); }
  radioLabel() {
    const st = this.dial()[this.station] || STATIONS[0];
    if (st.online) return this.net.state === 'tuning' ? 'TUNING...' : this.net.state === 'nosignal' ? 'NO SIGNAL' : st.label;
    return st.label;
  }
  // returns { label, off } for the on-screen message
  cycleRadio() {
    const dial = this.dial();
    this.station = (this.station + 1) % dial.length;
    const st = dial[this.station];
    if (st.online) this.net.play(st); else this.net.stop();
    if (this.ctx) this.noise(0.12, 1200, 0.02, this.radioIn);
    this.step = 0;
    return { label: st.online ? `${st.name} (ONLINE)` : st.label, off: this.station === 0 };
  }

  // paused: engine and road go quiet. radioPaused: the radio too (menus); defaults to the same
  update(speed, throttle, offroad, paused, radioPaused = paused) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = [0, 12, 25, 40, 55, 80];
    let g = 1; while (g < gears.length - 1 && speed > gears[g]) g++;
    const frac = (speed - gears[g - 1]) / (gears[g] - gears[g - 1]);
    this.rpm = speed < 0.5 ? 0.17 + throttle * 0.1 : 0.25 + frac * 0.45 + throttle * 0.08;
    const f = speed < 0.5 ? 34 : 40 + frac * 38 + g * 3;
    this.eng1.frequency.setTargetAtTime(f, t, 0.08);
    this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engF.frequency.setTargetAtTime(260 + throttle * 300 + speed * 3, t, 0.1);
    this.engG.gain.setTargetAtTime(paused ? 0 : 0.05 + throttle * 0.05, t, 0.1);
    this.roadG.gain.setTargetAtTime(paused ? 0 : Math.min(0.035, speed / 2000) + (offroad ? 0.06 : 0), t, 0.15);
    this.roadF.frequency.setTargetAtTime(offroad ? 220 : 90 + speed, t, 0.2);
    this.radioG.gain.setTargetAtTime(radioPaused ? 0 : 0.09, t, 0.1);
    if (paused && this.rainHi) { for (const a of [this.rainHi, this.rainLo, this.wind, this.tyres]) a.g.gain.setTargetAtTime(0, t, 0.2); this.env = null; }
    this.net.setPaused(radioPaused);
  }

  // weather and night sounds; called every frame while the world is drawn
  ambience(wx, sky, speed, paused) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = paused ? 0 : 1;
    const v = Math.min(1, speed / 65);
    this.env = paused ? null : { rain: wx.rain, snow: wx.snow, dust: wx.dust, night: sky.night, h: sky.h, speed };
    this.rainHi.g.gain.setTargetAtTime(on * wx.rain * 0.05, t, 0.5);
    this.rainLo.g.gain.setTargetAtTime(on * wx.rain * wx.rain * 0.07, t, 0.5);
    const gust = 0.75 + 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    this.wind.g.gain.setTargetAtTime(on * (0.003 + v * v * 0.02 + wx.dust * 0.06 * gust + wx.snow * 0.015 * gust + (wx.rain > 0.8 ? 0.015 * gust : 0)), t, 0.4);
    this.wind.f.frequency.setTargetAtTime(260 + v * 380 + wx.dust * 200 * gust, t, 0.6);
    this.tyres.g.gain.setTargetAtTime(on * wx.wet * v * 0.035, t, 0.3);
  }
  thunder(big) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 3 + big * 3;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(120 + big * 400, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + big * 0.45, t + 0.08 + (1 - big) * 0.5);
    g.gain.setTargetAtTime(0.12 + big * 0.1, t + 0.6, 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.1);
    if (big > 0.6) this.noise(0.35, 2200, 0.12, null, 'bandpass', 300);
  }
  whoosh(big, side) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.12 : 0.06, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    let out = g;
    if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, side)) * 0.7; g.connect(pn); out = pn; }
    s.connect(f); f.connect(g); out.connect(this.master); s.start(t, Math.random()); s.stop(t + 1);
  }
  wiper() { this.tone(85, 0.09, 0.035, 'sine'); this.noise(0.08, 700, 0.012, null, 'bandpass'); }

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
  beep() { this.tone(1050, 0.22, 0.05, 'square'); }
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
    this.nature();
    const st = STATIONS[this.station] || {};
    while (this.nextNote < this.ctx.currentTime + 0.15) {
      if (st.style) this.playStep(st.style, this.step, this.nextNote - this.ctx.currentTime);
      const bpm = st.style === 'desert' ? 72 : 104;
      this.nextNote += 60 / bpm / 2;
      this.step++;
    }
  }
  // single raindrops on the roof, crickets at night, birds in the morning
  nature() {
    const e = this.env; if (!e || this.muted) return;
    const now = this.ctx.currentTime, r = Math.random;
    if (e.rain > 0.05 && r() < e.rain * 0.9) this.noise(0.025, 1800 + r() * 4500, 0.008 + r() * e.rain * 0.025, null, 'bandpass');
    const calm = e.rain < 0.15 && e.snow < 0.2 && e.dust < 0.3;
    const quiet = Math.max(0.25, 1 - e.speed / 80);
    if (calm && e.night > 0.6 && now > this.nextBug) {
      this.nextBug = now + 0.5 + r() * 1.4;
      const f = 4100 + r() * 700, vol = 0.006 * quiet * (0.5 + r());
      for (let k = 0; k < 3; k++) this.tone(f, 0.028, vol, 'sine', null, k * 0.055);
    }
    if (calm && e.night < 0.2 && e.h > 5.8 && e.h < 9.5 && now > this.nextBird) {
      this.nextBird = now + 2 + r() * 6;
      const f = 2400 + r() * 1400, n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) this.tone(f * (1 + k * 0.04), 0.09, 0.008 * quiet, 'sine', null, k * 0.13, f * 1.35);
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
