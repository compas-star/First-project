// Turns a "Записать бой" code (БОЙ1:/БОЙ0:) the player sent into the watch.json format,
// so tools/watch.py can draw it. run.sh replay <code-file> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const raw = readFileSync(process.argv[2], 'utf8').trim();
const out = process.argv[3] ?? 'replay.json';
const m = raw.match(/БОЙ([01]):([A-Za-z0-9+/=\s]+)/);
if (!m) throw new Error('no БОЙ code in the file');
let bytes = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
if (m[1] === '1') bytes = gunzipSync(bytes);
const data = JSON.parse(bytes.toString('utf8')) as {
  fps: number; parts: string[]; note: string; names: string[]; styles: string[]; map: string;
  frames: [number, number[], number[], string[]][]; hits: { t: number; who: number; zone: string; dmg: number; blocked: boolean }[];
};
const prev: number[][] = [[], []];
const frames = data.frames.map(([t, d0, d1, act]) => ({
  t,
  f: [d0, d1].map((d, k) => {
    const abs = d.map((x, i) => x + (prev[k][i] ?? 0));
    prev[k] = abs;
    const parts: Record<string, number[]> = {};
    data.parts.forEach((p, j) => (parts[p] = abs.slice(j * 6, j * 6 + 6).map((x) => x / 100)));
    const a = act[k] ?? '';
    return { parts, act: a, state: a === 'down' || a === 'ko' || a === 'ground' ? a : 'ok', thought: '' };
  }),
}));
writeFileSync(out, JSON.stringify({
  preset: `${data.names.join(' vs ')} (${data.styles.join('/')}, ${data.map})`,
  names: data.names, winner: null, reason: data.note ?? '',
  frames, events: data.hits.map((h) => ({ ...h, type: 'hit' })),
}));
console.log(`${frames.length} frames ${frames[0]?.t}-${frames[frames.length - 1]?.t}s, ${data.hits.length} hits; note: ${data.note || '-'} -> ${out}`);
