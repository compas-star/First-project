// A little TV/VCR combo on the dashboard. Put in a "tape" (paste a YouTube link) and it plays
// with a worn VHS look: colour bleed, soft picture, scanlines, static, a tracking band and the
// green PLAY of an old VCR.
//
// A YouTube video can't be drawn into the game's canvas, so the player is a real YouTube
// embed laid exactly over the TV's screen (it ignores clicks and touches, so driving still
// works). The cockpit draws the TV's body; TV_SCREEN says where its screen is.
import { W, H } from './config.js';

// screen rectangles in game pixels, per cab
export const TV_SCREEN = { bus: { x: 318, y: 114, w: 68, h: 50 }, car: { x: 376, y: 112, w: 80, h: 60 } };
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
    // when there's no picture: full static and NO SIGNAL, like a VCR on the wrong channel
    const nosig = this.nosigEl = document.createElement('div');
    Object.assign(nosig.style, { position: 'absolute', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center', font: 'bold 34px monospace', color: '#f4f4f4', textShadow: '3px 3px 0 #000, 0 0 10px #000', letterSpacing: '3px' });
    nosig.textContent = 'NO SIGNAL';
    for (const el of [lines, noise, band, rim, osd, nosig]) { el.style.pointerEvents = 'none'; wrap.appendChild(el); }
    // the YouTube player reports how it's doing over postMessage
    addEventListener('message', e => this.fromPlayer(e));
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
    // in the cab, the driver's hand carries the tape over first (see main.js); otherwise straight in
    if (this.onInsert) this.onInsert(id); else this.insert(id);
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
    Object.assign(f.style, { position: 'absolute', inset: '0', width: PW + 'px', height: PH + 'px', border: '0', visibility: 'hidden', filter: 'saturate(1.45) contrast(1.18) brightness(1.06) sepia(0.14) blur(0.9px)' });
    f.addEventListener('load', () => {
      if (this.muted) this.cmd('mute');
      // ask the player to tell us about itself (it answers once its API is up)
      clearInterval(this.hello);
      let n = 0;
      this.hello = setInterval(() => {
        if (this.heard || !this.frame || ++n > 40) { clearInterval(this.hello); return; }
        this.frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      }, 250);
    });
    this.screen.appendChild(f);
    // static until the picture comes
    this.state = 'loading'; this.heard = false; this.wait = 0; this.readyT = null;
    this.setScreen();
  }
  eject() {
    if (this.frame) this.frame.remove();
    clearInterval(this.hello);
    this.frame = null; this.id = null; this.state = null;
  }

  // what the YouTube player says: its state, or an error (the video's owner may not allow it to
  // play outside YouTube, or it's private or gone). On an error the TV shows NO SIGNAL.
  fromPlayer(e) {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (!d || !d.event) return;
    this.heard = true;
    if (d.event === 'onError') {
      const code = +d.info;
      const why = code === 101 || code === 150 ? "THIS TAPE WON'T PLAY HERE - ITS OWNER ONLY ALLOWS IT ON YOUTUBE"
        : code === 100 ? 'THIS TAPE IS BLANK - THE VIDEO IS PRIVATE OR GONE'
          : code === 2 ? "THAT LINK ISN'T A VIDEO THE TV CAN PLAY" : 'THE TAPE IS CHEWED UP - THE VIDEO WOULD NOT PLAY';
      this.noSignal(why);
      return;
    }
    if (d.event === 'onReady' && this.state === 'loading') this.readyT = 0;
    const ps = d.event === 'onStateChange' ? +d.info : d.event === 'infoDelivery' && d.info ? d.info.playerState : undefined;
    if (ps === undefined) return;
    this.ps = ps;
    // 1 playing, 3 buffering: it's going
    if (ps === 1 || ps === 3) this.picture();
    // paused by itself (a phone holding back sound) while we want it playing: it needs a tap
    else if (ps === 2 && this.state === 'playing' && this.running && !this.selfPaused) this.needTap();
  }
  picture() {
    if (this.state === 'playing') return;
    this.state = 'playing'; this.osd = 4;
    this.setScreen();
  }
  // Phones (and some browsers) won't start a video with sound by itself: the first tap has to
  // land on the YouTube player. So the TV shows TAP TV and, just until it plays, lets taps through.
  needTap() {
    if (this.state === 'tap') return;
    this.state = 'tap';
    this.setScreen();
    this.onNote?.('TAP THE TV TO START THE TAPE');
  }
  noSignal(why) {
    if (this.state === 'nosignal') return;
    this.state = 'nosignal';
    this.setScreen();
    if (why) this.onNote?.(why);
  }
  setScreen() {
    const pic = this.state === 'playing' || this.state === 'tap';
    if (this.frame) this.frame.style.visibility = pic ? 'visible' : 'hidden';
    this.noise.style.opacity = pic ? '0.16' : '0.85';
    this.nosigEl.style.display = this.state === 'nosignal' ? 'flex' : 'none';
    // taps go to the player only while it's waiting for one; otherwise the TV ignores them
    const tap = this.state === 'tap';
    this.wrap.style.pointerEvents = tap ? 'auto' : 'none';
    if (this.frame) this.frame.style.pointerEvents = tap ? 'auto' : 'none';
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
      if (this.running !== undefined && this.id) { this.selfPaused = !running; this.cmd(running ? 'playVideo' : 'pauseVideo'); }
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
    // no word from the player at all (no internet, YouTube blocked): give up and show NO SIGNAL;
    // once it's ready, show the picture even if it hasn't said it's playing (autoplay may be held back)
    if (this.state === 'loading') {
      this.wait += dt;
      if (this.readyT !== null && (this.readyT += dt) > 1.5) this.needTap();
      else if (!this.heard && this.wait > 10) this.noSignal("NO SIGNAL - THE TV CAN'T REACH YOUTUBE");
    }
    this.osd = Math.max(0, this.osd - dt);
    this.tapBlink = (this.tapBlink || 0) + dt;
    this.osdEl.textContent = this.state === 'tap' ? (this.tapBlink % 1 < 0.6 ? 'TAP TV \u25B6' : '') : this.osd > 0 ? 'PLAY \u25B6' : '';
  }
}
