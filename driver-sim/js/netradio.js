// Real internet radio: finds live trucker and country stations through the public Radio Browser
// directory (radio-browser.info) and plays them in an <audio> element. Nothing about the player
// is sent anywhere: the directory only gets the search terms below.
const HOSTS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
// trucker stations first, then US country and Americana
const SEARCHES = [
  { tag: 'trucker', n: 3 }, { tag: 'truckers', n: 3 }, { tag: 'trucking', n: 2 },
  { tag: 'classic country', cc: 'US', n: 3 }, { tag: 'country', cc: 'US', n: 3 }, { tag: 'americana', cc: 'US', n: 2 },
];
const GOOD_CODECS = /^(MP3|AAC|AAC\+|OGG)$/i;

// Only characters the game's pixel font can draw.
export const clean = name => String(name).toUpperCase().replace(/[^A-Z0-9 .,:'&!/-]/g, ' ').replace(/\s+/g, ' ').trim();

async function getJSON(path) {
  for (const host of HOSTS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      const res = await fetch(host + path, { signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) return { data: await res.json(), host };
    } catch (e) { /* try the next mirror */ }
  }
  return null;
}

// A tiny silent WAV, played once from a tap so phones let us start streams later.
function silentWav() {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = ''; for (const x of b) bin += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(bin);
}

export class NetRadio {
  constructor() {
    this.stations = []; this.status = 'idle';   // idle | loading | ready | failed
    this.playing = null; this.state = 'off';     // off | tuning | on | nosignal
    this.el = null; this.host = null; this.muted = false; this.paused = false;
  }
  // called from the first tap or key press
  unlock() {
    if (this.el) return;
    const el = this.el = document.createElement('audio');
    el.preload = 'none';
    el.addEventListener('playing', () => { if (this.playing) this.state = 'on'; });
    el.addEventListener('waiting', () => { if (this.playing && this.state === 'on') this.state = 'tuning'; });
    el.addEventListener('error', () => { if (this.playing) this.state = 'nosignal'; });
    try { el.src = silentWav(); const pr = el.play(); if (pr) pr.catch(() => {}); } catch (e) { /* fine */ }
    this.load();
  }
  async load() {
    if (this.status !== 'idle') return;
    this.status = 'loading';
    const seen = new Set(), out = [];
    for (const s of SEARCHES) {
      const q = new URLSearchParams({ tag: s.tag, hidebroken: 'true', is_https: 'true', order: 'clickcount', reverse: 'true', limit: String(s.n * 5) });
      if (s.cc) q.set('countrycode', s.cc);
      const r = await getJSON(`/json/stations/search?${q}`);
      if (!r) continue;
      this.host = r.host;
      let took = 0;
      for (const st of r.data) {
        const url = st.url_resolved || st.url;
        const name = clean(st.name);
        if (took >= s.n || !url || !url.startsWith('https://') || !name || !GOOD_CODECS.test(st.codec || '')) continue;
        if (seen.has(name) || seen.has(st.stationuuid)) continue;
        seen.add(name); seen.add(st.stationuuid);
        out.push({ name, label: name.slice(0, 12), url, uuid: st.stationuuid, online: true });
        took++;
      }
    }
    this.stations = out;
    this.status = out.length ? 'ready' : 'failed';
    if (this.onReady) this.onReady();
  }
  play(st) {
    if (!this.el) return;
    this.playing = st; this.state = 'tuning';
    this.el.src = st.url;
    this.apply();
    const pr = this.el.play();
    if (pr) pr.catch(() => { if (this.playing === st) this.state = 'nosignal'; });
    // the directory counts plays, which keeps good stations near the top
    if (this.host && st.uuid) fetch(`${this.host}/json/url/${st.uuid}`).catch(() => {});
  }
  stop() {
    this.playing = null; this.state = 'off';
    if (!this.el) return;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
  apply() { if (this.el) { this.el.muted = this.muted || this.paused; this.el.volume = 0.7; } }
  setPaused(p) { if (p !== this.paused) { this.paused = p; this.apply(); } }
  setMuted(m) { this.muted = m; this.apply(); }
}
