"""Draw a recorded fight (tools/watch.ts) as contact sheets of stick figures, for Claude.

python3 tools/watch.py watch.json out.png [from_s] [to_s] [every_s] [view]
  view: side (default, across the line between the fighters), top, front (behind red).
Each cell: both fighters (red = 0, blue = 1) as thick segments, the floor, time, what
each is doing, and a flash where a blow landed in that cell's time.
"""
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
t1 = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
every = float(sys.argv[5]) if len(sys.argv) > 5 else 0.1
view = sys.argv[6] if len(sys.argv) > 6 else 'side'

data = json.load(open(src))
frames = [f for f in data['frames'] if t0 <= f['t'] <= t1]
pick, last = [], -1e9
for f in frames:
    if f['t'] - last >= every - 1e-6:
        pick.append(f)
        last = f['t']
pick = pick[:48]
if not pick:
    sys.exit('no frames in range')

W, H, S = 300, 300, 95  # cell size, pixels per meter
COLORS = [(240, 83, 62), (63, 167, 255)]
WIDTH = {'pelvis': 9, 'chest': 15, 'head': 18, 'lUpper': 6, 'rUpper': 6, 'lFore': 5, 'rFore': 5,
         'lThigh': 8, 'rThigh': 8, 'lShin': 6, 'rShin': 6}
ORDER = ['lThigh', 'lShin', 'lUpper', 'lFore', 'pelvis', 'chest', 'head', 'rThigh', 'rShin', 'rUpper', 'rFore']
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
except OSError:
    font = ImageFont.load_default()


def basis(f):
    """Camera axes for a frame: u across the screen, v up, d into the screen."""
    p0 = f['f'][0]['parts']['pelvis']
    p1 = f['f'][1]['parts']['pelvis']
    ax, az = (p1[0] + p1[3]) / 2 - (p0[0] + p0[3]) / 2, (p1[2] + p1[5]) / 2 - (p0[2] + p0[5]) / 2
    n = math.hypot(ax, az) or 1
    ax, az = ax / n, az / n
    cx = ((p0[0] + p0[3]) / 2 + (p1[0] + p1[3]) / 2) / 2
    cz = ((p0[2] + p0[5]) / 2 + (p1[2] + p1[5]) / 2) / 2
    return ax, az, cx, cz


def project(x, y, z, b):
    ax, az, cx, cz = b
    dx, dz = x - cx, z - cz
    if view == 'top':
        u, v = dx * ax + dz * az, -(dx * -az + dz * ax)
        return W / 2 + u * S, H / 2 + v * S
    if view == 'front':
        # Behind red, looking at blue: across = the side axis.
        u = dx * -az + dz * ax
        return W / 2 + u * S, H - 25 - y * S
    u = dx * ax + dz * az
    return W / 2 + u * S, H - 25 - y * S


cols = 6
rows = math.ceil(len(pick) / cols)
sheet = Image.new('RGB', (cols * W, rows * H), (14, 17, 24))
ev = data['events']
for i, f in enumerate(pick):
    cell = Image.new('RGB', (W, H), (22, 26, 36))
    d = ImageDraw.Draw(cell)
    b = basis(f)
    if view != 'top':
        d.line([(0, H - 25), (W, H - 25)], fill=(70, 76, 90), width=2)
    # Far fighter first so the near one is drawn over him.
    for k in (1, 0):
        g = f['f'][k]
        for name in ORDER:
            s = g['parts'][name]
            a = project(s[0], s[1], s[2], b)
            c = project(s[3], s[4], s[5], b)
            col = COLORS[k]
            if name.startswith('r'):
                col = tuple(min(255, int(x * 0.75 + 40)) for x in col)
            d.line([a, c], fill=col, width=WIDTH[name])
            if name == 'head':
                m = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
                d.ellipse([m[0] - 10, m[1] - 10, m[0] + 10, m[1] + 10], fill=COLORS[k])
    # Blows landed since the previous cell.
    prev = pick[i - 1]['t'] if i else f['t'] - every
    for e in ev:
        if prev < e['t'] <= f['t'] and e['type'] == 'hit':
            d.text((W / 2 - 40, 30 + 12 * (e['who'])), f"{'→ синему' if e['who'] else '→ красному'} {e.get('zone') or ''} {e.get('dmg') or ''}{' блок' if e.get('blocked') else ''}", fill=(242, 193, 78), font=font)
    d.text((4, 3), f"{f['t']:.2f}s", fill=(200, 200, 200), font=font)
    for k in (0, 1):
        g = f['f'][k]
        label = g['act'] or g['state']
        d.text((4, H - 20 + 0 if k == 0 else H - 20), '', fill=COLORS[k])
        d.text((4 if k == 0 else W / 2 + 2, H - 18), label[:24], fill=COLORS[k], font=font)
    sheet.paste(cell, ((i % cols) * W, (i // cols) * H))
sheet.save(out)
print(f'{len(pick)} cells {pick[0]["t"]:.2f}-{pick[-1]["t"]:.2f}s -> {out}; winner {data["winner"]} {data["reason"]}')
