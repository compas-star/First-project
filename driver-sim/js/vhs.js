// A little TV/VCR combo on the dashboard. Put in a "tape" (paste a YouTube link) and it plays
// with a worn VHS look: colour bleed, soft picture, scanlines, static, a tracking band and the
// green PLAY of an old VCR.
//
// A YouTube video can't be drawn into the game's canvas, so the player is a real YouTube
// embed laid exactly over the TV's screen (it ignores clicks and touches, so driving still
// works). The cockpit draws the TV's body; TV_SCREEN says where its screen is.
import { W, H } from './config.js';

// screen rectangles in game pixels, per cab
export const TV_SCREEN = { bus: { x: 316, y: 121, w: 60, h: 45 }, car: { x: 390, y: 129, w: 60, h: 45 } };
const KEY = 'motherroad_vhs';
// the player is laid out at this size, then scaled down to the screen: YouTube wants a
// player of at least 200x200, and the scaling makes it look lower-res, which suits VHS
const PW = 320, PH = 240;

export function youtubeId(text) {
  const s = (text || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/|\/v\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export class VHS {
  constructor(canvas) {
    this.canvas = canvas;
    this.id = null; this.osd = 0; this.shown = false; this.muted = false;
    this.lastLink = '';
    try { this.lastLink = localStorage.getItem(KEY) || ''; } catch (e) { /* private mode */ }
    this.build();
  }
  get playing() { return !!this.id; }

  build() {
    // colour bleed: the red and blue channels shifted sideways, as on a worn tape
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="vhsBleed" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
      <feOffset in="r" dx="3" dy="0" result="ro"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
      <feOffset in="b" dx="-2" dy="0" result="bo"/>
      <feBlend in="ro" in2="g" mode="screen" result="rg"/>
      <feBlend in="rg" in2="bo" mode="screen"/>
    </filter>`;
    document.body.appendChild(svg);

    const wrap = this.wrap = document.createElement('div');
    wrap.id = 'vhs';
    Object.assign(wrap.style, {
      position: 'fixed', left: '0', top: '0', width: PW + 'px', height: PH + 'px', transformOrigin: '0 0',
      overflow: 'hidden', pointerEvents: 'none', display: 'none', background: '#000', borderRadius: '22px', zIndex: '1',
    });
    const screen = this.screen = document.createElement('div');
    Object.assign(screen.style, { position: 'absolute', inset: '0', filter: 'url(#vhsBleed)' });
    wrap.appendChild(screen);
    // scanlines, static, the tracking band, a dark rim and the VCR's on-screen display
    const lines = document.createElement('div');
    Object.assign(lines.style, { position: 'absolute', inset: '0', background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)' });
    const noise = this.noise = document.createElement('canvas');
    noise.width = 80; noise.height = 60;
    Object.assign(noise.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0.16', imageRendering: 'pixelated', mixBlendMode: 'screen' });
    this.nctx = noise.getContext('2d');
    const band = this.band = document.createElement('div');
    Object.assign(band.style, { position: 'absolute', left: '0', right: '0', height: '26px', background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.22) 40%, rgba(0,0,0,0.25) 60%, rgba(255,255,255,0))', mixBlendMode: 'screen' });
    const rim = document.createElement('div');
    Object.assign(rim.style, { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.6) 100%)', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.7)' });
    const osd = this.osdEl = document.createElement('div');
    Object.assign(osd.style, { position: 'absolute', left: '22px', top: '18px', font: 'bold 26px monospace', color: '#e8ffe8', textShadow: '2px 2px 0 #000, 0 0 6px #4f4', letterSpacing: '2px' });
    for (const el of [lines, noise, band, rim, osd]) wrap.appendChild(el);
    document.body.appendChild(wrap);
    this.bandY = 0;

    // the "put a tape in" box
    const dlg = this.dlg = document.createElement('div');
    dlg.id = 'vhsDialog';
    dlg.innerHTML = `<div class="vt">PUT IN A TAPE</div>
      <div class="vs">Paste a YouTube link. It plays on the little TV, VHS style.</div>
      <input id="vhsLink" type="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" spellcheck="false">
      <div class="ve" id="vhsErr"></div>
      <div class="vb"><button id="vhsPlay">PLAY</button><button id="vhsEject">EJECT</button><button id="vhsClose">CLOSE</button></div>`;
    document.body.appendChild(dlg);
    const st = document.createElement('style');
    st.textContent = `#vhsDialog { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 30; display: none;
        width: min(420px, 92vw); padding: 14px; background: #16120e; border: 3px solid #ffd36a; color: #f2e2b8; font: 14px monospace; box-shadow: 0 6px 30px #000; }
      #vhsDialog .vt { color: #ffd36a; font-weight: bold; font-size: 18px; margin-bottom: 6px; }
      #vhsDialog .vs { margin-bottom: 10px; opacity: 0.85; }
      #vhsDialog input { width: 100%; box-sizing: border-box; padding: 8px; font: 14px monospace; background: #000; color: #9aff8a; border: 2px solid #6a5a3a; }
      #vhsDialog .ve { color: #ff8a6a; min-height: 18px; margin: 6px 0; }
      #vhsDialog .vb { display: flex; gap: 8px; }
      #vhsDialog button { flex: 1; padding: 10px 0; font: bold 14px monospace; background: #3a2a14; color: #ffd36a; border: 2px solid #ffd36a; cursor: pointer; }
      #vhsDialog button:active { background: #6a4a1a; }`;
    document.head.appendChild(st);
    this.input = dlg.querySelector('#vhsLink');
    this.err = dlg.querySelector('#vhsErr');
    dlg.querySelector('#vhsPlay').onclick = () => this.submit();
    dlg.querySelector('#vhsEject').onclick = () => { this.eject(); this.close(); };
    dlg.querySelector('#vhsClose').onclick = () => this.close();
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  get dialogOpen() { return this.dlg.style.display === 'block'; }
  open() {
    this.dlg.style.display = 'block';
    this.input.value = this.lastLink;
    this.err.textContent = '';
    this.dlg.querySelector('#vhsEject').style.display = this.id ? '' : 'none';
    setTimeout(() => { this.input.focus(); this.input.select(); }, 30);
  }
  close() { this.dlg.style.display = 'none'; this.input.blur(); }
  submit() {
    const id = youtubeId(this.input.value);
    if (!id) { this.err.textContent = "That doesn't look like a YouTube link."; return; }
    this.lastLink = this.input.value.trim();
    try { localStorage.setItem(KEY, this.lastLink); } catch (e) { /* fine */ }
    this.insert(id);
    this.close();
  }

  insert(id) {
    this.eject();
    this.id = id;
    const f = this.frame = document.createElement('iframe');
    const q = new URLSearchParams({ autoplay: '1', controls: '0', modestbranding: '1', rel: '0', playsinline: '1', enablejsapi: '1', iv_load_policy: '3', loop: '1', playlist: id, fs: '0', disablekb: '1' });
    f.src = `https://www.youtube-nocookie.com/embed/${id}?${q}`;
    f.title = 'VHS tape';
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    Object.assign(f.style, { position: 'absolute', inset: '0', width: PW + 'px', height: PH + 'px', border: '0', filter: 'saturate(1.45) contrast(1.18) brightness(1.06) sepia(0.14) blur(0.9px)' });
    f.addEventListener('load', () => { if (this.muted) this.cmd('mute'); });
    this.screen.appendChild(f);
    this.osd = 4;
  }
  eject() {
    if (this.frame) this.frame.remove();
    this.frame = null; this.id = null;
  }
  // tell the YouTube player what to do (its iframe API, over postMessage)
  cmd(func) {
    if (!this.frame || !this.frame.contentWindow) return;
    this.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
  }
  setMuted(m) { this.muted = m; this.cmd(m ? 'mute' : 'unMute'); }

  // every frame: where the TV is on screen, and whether it should show
  update(dt, rect, visible, running) {
    if (this.running !== running) {
      // leaving the cab (trip over, menus): the tape pauses; back in the cab it plays on
      if (this.running !== undefined && this.id) this.cmd(running ? 'playVideo' : 'pauseVideo');
      this.running = running;
    }
    const show = !!(this.id && visible && rect);
    if (show !== this.shown) { this.wrap.style.display = show ? 'block' : 'none'; this.shown = show; }
    if (!show) return;
    const r = this.canvas.getBoundingClientRect();
    const k = r.width / W;
    const key = `${r.left},${r.top},${k},${rect.x},${rect.y}`;
    if (key !== this.posKey) {
      this.posKey = key;
      const s = rect.w * k / PW;
      this.wrap.style.transform = `translate(${r.left + rect.x * k}px, ${r.top + rect.y * k}px) scale(${s}, ${rect.h * k / PH})`;
    }
    // static, redrawn every other frame
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 2 === 0) {
      const c = this.nctx, img = c.createImageData(80, 60), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      c.putImageData(img, 0, 0);
    }
    this.bandY = (this.bandY + dt * 38) % (PH + 60);
    this.band.style.top = (this.bandY - 30) + 'px';
    this.osd = Math.max(0, this.osd - dt);
    this.osdEl.textContent = this.osd > 0 ? 'PLAY ▶' : '';
  }
}
