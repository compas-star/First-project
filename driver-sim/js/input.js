// Keyboard + touch input. Exposes a simple polled state plus one-shot "pressed" events.
export const input = {
  gas: false, brake: false, left: false, right: false, horn: false,
  analogSteer: null, // set by dragging on the wheel (touch)
  pressed: new Set(), touch: false,
  take(k) { const h = this.pressed.has(k); this.pressed.delete(k); return h; },
};

const KEYMAP = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyH: 'horn',
};
const ONESHOT = {
  Space: 'action', KeyE: 'action', KeyC: 'cruise', KeyR: 'radio', KeyM: 'mute',
  KeyP: 'pause', Escape: 'pause', Enter: 'start', KeyL: 'lights',
};

export function initInput(canvas) {
  addEventListener('keydown', e => {
    if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (ONESHOT[e.code] && !e.repeat) { input.pressed.add(ONESHOT[e.code]); e.preventDefault(); }
    if (e.code === 'Space') input.pressed.add('start');
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
  addEventListener('blur', () => { for (const k of Object.values(KEYMAP)) input[k] = false; });

  // on-screen buttons
  const hold = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); input[key] = true; };
    const off = e => { e.preventDefault(); el.classList.remove('on'); input[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  };
  const tap = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); input.pressed.add(key); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 120); });
  };
  hold('tLeft', 'left'); hold('tRight', 'right'); hold('tGas', 'gas'); hold('tBrake', 'brake'); hold('tHorn', 'horn');
  tap('tCruise', 'cruise'); tap('tRadio', 'radio'); tap('tPause', 'pause'); tap('tAction', 'action'); tap('tMute', 'mute');

  // drag on the steering wheel to steer (analog)
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    input.pressed.add('start');
    if (e.pointerType !== 'mouse') input.touch = true;
    const r = canvas.getBoundingClientRect();
    const fy = (e.clientY - r.top) / r.height;
    if (fy > 0.6) { drag = { id: e.pointerId, x0: e.clientX, w: r.width }; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    input.analogSteer = Math.max(-1, Math.min(1, (e.clientX - drag.x0) / (drag.w * 0.22)));
  });
  const end = e => { if (drag && e.pointerId === drag.id) { drag = null; input.analogSteer = null; } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  addEventListener('touchstart', () => { input.touch = true; document.body.classList.add('touch'); }, { passive: true });
  document.addEventListener('contextmenu', e => e.preventDefault());
}
