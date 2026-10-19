# Draws the head from tools/head.ts: front, three-quarter and side, flat shaded.
# python3 tools/head.py in.json out.png
import json, sys, math
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1]))
V = [d['verts'][i:i + 3] for i in range(0, len(d['verts']), 3)]
T = [d['idx'][i:i + 3] for i in range(0, len(d['idx']), 3)]
L = (0.4, 0.5, 0.75); n = math.sqrt(sum(c * c for c in L)); L = tuple(c / n for c in L)
def view(yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    P = [(x * c + z * s, y, -x * s + z * c) for x, y, z in V]
    im = Image.new('RGB', (360, 420), (40, 40, 46)); dr = ImageDraw.Draw(im)
    tris = []
    for a, b, cc in T:
        A, B, C = P[a], P[b], P[cc]
        u = [B[i] - A[i] for i in range(3)]; v = [C[i] - A[i] for i in range(3)]
        nx = u[1] * v[2] - u[2] * v[1]; ny = u[2] * v[0] - u[0] * v[2]; nz = u[0] * v[1] - u[1] * v[0]
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        nx, ny, nz = nx / ln, ny / ln, nz / ln
        if nz <= 0: continue
        sh = max(0.15, nx * L[0] + ny * L[1] + nz * L[2])
        tris.append(((A[2] + B[2] + C[2]) / 3, [(180 + p[0] * 1300, 210 - p[1] * 1300) for p in (A, B, C)], sh))
    tris.sort(key=lambda t: t[0])
    for _, pts, sh in tris:
        col = tuple(int(k * sh) for k in (225, 190, 165))
        dr.polygon(pts, fill=col, outline=tuple(int(k * 0.85) for k in col))
    return im
out = Image.new('RGB', (1080, 420))
for i, yaw in enumerate([0, 0.6, 1.5708]): out.paste(view(yaw), (i * 360, 0))
out.save(sys.argv[2])
