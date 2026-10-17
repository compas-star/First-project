// A copy of the whole game kept on claude.ai under the viewer's own account (the artifact's
// `db` capability, private per person: data/users/<id>/save). Browser storage can be wiped
// (cleared data, private tabs, another browser); this copy comes back. Outside claude.ai,
// or signed out, everything here is a quiet no-op.
import { exportSave, importSave } from './saveCode';

type Snap = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void> };

let ref: DocRef | null = null;
let ready: Promise<boolean> | null = null;
let dirty = false;
let writing = false;
let lastWrite = 0;
/** When the cloud copy was last written (ms), as far as this page knows. */
export let cloudAt = 0;
export let cloudState: 'off' | 'on' | 'error' = 'off';

/** Connects to the store once; true if this view can keep a cloud copy. */
export function cloudInit(): Promise<boolean> {
  ready ??= (async () => {
    try {
      const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
      if (!c?.use) return false;
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
        { doc(p: string): DocRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      ref = db.doc(`data/users/${id}/save`);
      const s = await ref.get();
      cloudAt = s.exists ? Number(s.data()?.at ?? 0) : 0;
      cloudState = 'on';
      return true;
    } catch {
      cloudState = 'error';
      return false;
    }
  })();
  return ready;
}

/** The game changed: a copy goes up soon (at most every 20 s). */
export function cloudDirty(): void {
  dirty = true;
}

/** Writes now if anything changed. */
export async function cloudFlush(force = false): Promise<boolean> {
  if (!ref || writing || (!dirty && !force)) return false;
  writing = true;
  dirty = false;
  try {
    const code = await exportSave();
    const at = Date.now();
    await ref.set({ code, at });
    cloudAt = at;
    lastWrite = at;
    cloudState = 'on';
    return true;
  } catch {
    dirty = true;
    cloudState = 'error';
    return false;
  } finally {
    writing = false;
  }
}

/** The cloud copy's code and time, or null. */
export async function cloudRead(): Promise<{ code: string; at: number } | null> {
  if (!(await cloudInit()) || !ref) return null;
  try {
    const s = await ref.get();
    const d = s.exists ? s.data() : undefined;
    return d && typeof d.code === 'string' ? { code: d.code, at: Number(d.at ?? 0) } : null;
  } catch {
    return null;
  }
}

/** Puts the cloud copy in place of this browser's game. */
export async function cloudRestore(): Promise<string | null> {
  const s = await cloudRead();
  if (!s) return 'В облаке пока нет сохранения';
  return importSave(s.code);
}

/** Starts the background copying; `hasLocal` false = this browser has no game yet. */
export async function cloudStart(hasLocal: boolean, restored: () => void): Promise<void> {
  if (!(await cloudInit())) return;
  // A fresh browser (cleared, another device) but a game in the cloud: bring it back.
  if (!hasLocal) {
    const s = await cloudRead();
    if (s && !(await importSave(s.code))) restored();
  } else if (!cloudAt) dirty = true;
  setInterval(() => {
    if (dirty && Date.now() - lastWrite > 20000) void cloudFlush();
  }, 5000);
  // Leaving the page: whatever changed goes up now (combos and settings too, not only the career).
  const now = () => {
    if (dirty || Date.now() - lastWrite > 60000) void cloudFlush(true);
  };
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') now();
  });
}
