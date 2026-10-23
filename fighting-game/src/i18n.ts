// English (user: the Russian audience is smaller). The game's logic keeps its Russian strings;
// what reaches the screen is translated: every text node and title/placeholder in the page is
// looked up as it appears (a MutationObserver), first as a whole, then by patterns for strings
// built from parts (numbers, names). Untranslated Cyrillic is collected in `__i18nMissing` for
// tests. Dictionaries: i18nEn.ts. Language: localStorage `arena-lang-v1`, else the phone's.
import { EN, EN_RX } from './i18nEn';

export type Lang = 'ru' | 'en';

export const lang: Lang = (() => {
  try {
    const s = localStorage.getItem('arena-lang-v1');
    if (s === 'ru' || s === 'en') return s;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : 'ru';
  return /^(ru|uk|be|kk)/i.test(nav) ? 'ru' : 'en';
})();

export function setLang(l: Lang): void {
  try {
    localStorage.setItem('arena-lang-v1', l);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

const CYR = /[А-Яа-яЁё]/;
const cache = new Map<string, string>();
const missing = new Set<string>();
(globalThis as unknown as { __i18nMissing: Set<string> }).__i18nMissing = missing;

/** A Russian string as the player should see it. */
export function tr(s: string): string {
  if (lang === 'ru' || !CYR.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const out = translate(s);
  if (cache.size > 4000) cache.clear();
  cache.set(s, out);
  return out;
}

function translate(s: string): string {
  // Keep the spaces around it (text nodes next to <b> etc.).
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const core = m[2].replace(/\s+/g, ' ');
  let t = EN[core];
  if (t === undefined) {
    for (const [rx, to] of EN_RX) {
      const r = rx.exec(core);
      if (!r) continue;
      t = typeof to === 'function' ? to(...r.slice(1).map((x) => (x === undefined ? '' : tr(x)))) : to.replace(/\$(\d)/g, (_, i) => tr(r[Number(i)] ?? ''));
      break;
    }
  }
  if (t === undefined) {
    // Several sentences: each on its own.
    // (no look-behind: old iPhones cannot parse it)
    const parts = core.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
    if (parts.length > 1) t = parts.map((p) => tr(p)).join(' ');
  }
  if (t === undefined) {
    if (CYR.test(core)) missing.add(core);
    return s;
  }
  return m[1] + t + m[3];
}

const ATTRS = ['title', 'placeholder', 'aria-label'];

function walk(n: Node): void {
  if (n.nodeType === 3) {
    const v = n.nodeValue;
    if (v && CYR.test(v)) {
      const t = tr(v);
      if (t !== v) n.nodeValue = t;
    }
    return;
  }
  if (n.nodeType !== 1) return;
  const el = n as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA') return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && CYR.test(v)) {
      const t = tr(v);
      if (t !== v) el.setAttribute(a, t);
    }
  }
  for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
}

/** Translates the page now and everything added or changed later. */
export function startTranslation(): void {
  if (lang === 'ru') return;
  document.documentElement.lang = 'en';
  document.title = tr(document.title);
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
