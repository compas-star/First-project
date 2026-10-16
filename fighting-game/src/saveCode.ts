// Moving a game to another device or browser: everything the game keeps (career, combos,
// drawn strikes, memory, settings: every localStorage key starting with 'arena-') packed
// into one text code, СЕЙВ1: gzip + base64 (СЕЙВ0: plain, where the browser cannot gzip).

const PREFIX = 'arena-';

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** The whole save as a code. */
export async function exportSave(): Promise<string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) data[k] = localStorage.getItem(k) ?? '';
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, at: Date.now(), data }));
  if (typeof CompressionStream !== 'undefined') return 'СЕЙВ1:' + b64(await pipe(bytes, new CompressionStream('gzip')));
  return 'СЕЙВ0:' + b64(bytes);
}

/** Puts a code's save in place of this one. Returns an error, or null. */
export async function importSave(code: string): Promise<string | null> {
  const m = code.match(/СЕЙВ([01]):([A-Za-z0-9+/=\s]+)/);
  if (!m) return 'Это не код сохранения (он начинается с СЕЙВ1:)';
  try {
    let bytes = unb64(m[2].replace(/\s+/g, ''));
    if (m[1] === '1') {
      if (typeof DecompressionStream === 'undefined') return 'Этот браузер не умеет распаковывать код';
      bytes = await pipe(bytes, new DecompressionStream('gzip'));
    }
    const save = JSON.parse(new TextDecoder().decode(bytes)) as { v: number; data: Record<string, string> };
    if (!save.data || !save.data['arena-career-v1'] && !Object.keys(save.data).length) return 'Код пустой';
    // Replace, not merge: the other device's game as it was.
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(save.data)) if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
    return null;
  } catch {
    return 'Код повреждён: скопируй его целиком';
  }
}
