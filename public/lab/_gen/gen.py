"""Generate all 9 AHoosh service visuals. Frames -> PNG sequence for videos,
single PNG for images. ffmpeg encoding handled by encode.sh.
Usage: python3 gen.py <which>   where which in {svc1,svc2,svc5,svc8,svc3,svc4,svc6,svc7,svc9,all}
"""
import sys, os, math
import numpy as np
from PIL import Image
import brand as B

OUT = os.environ.get("OUT")
TMP = "/tmp/ahoosh_frames"
os.makedirs(TMP, exist_ok=True)

VID_W, VID_H = 720, 480
IMG_W, IMG_H = 1000, 680
FPS = 24
SECS = 5
NFR = FPS * SECS  # 120 frames

SS = B.SS


def vcanvas():
    return VID_W * SS, VID_H * SS

def icanvas():
    return IMG_W * SS, IMG_H * SS


# ============================================================ VIDEO 1: svc1 neural constellation
def svc1():
    w, h = vcanvas()
    rng = np.random.default_rng(11)
    N = 14
    # place nodes with margins, blue-noise-ish
    pts = []
    while len(pts) < N:
        p = np.array([rng.uniform(0.10, 0.90) * w, rng.uniform(0.14, 0.86) * h])
        if all(np.hypot(*(p - q)) > 0.16 * h for q in pts):
            pts.append(p)
    pts = np.array(pts)
    # edges: connect each node to 1-2 nearest neighbours
    edges = set()
    for i in range(N):
        d = np.hypot(*(pts - pts[i]).T)
        order = np.argsort(d)
        for j in order[1:3]:
            edges.add(tuple(sorted((i, int(j)))))
    edges = list(edges)
    frames = []
    for f in range(NFR):
        p = f / NFR
        buf = cached_bg(w, h, 11, 0.45)
        # slow parallax drift (loops via sin)
        ox = math.sin(2 * math.pi * p) * 7 * SS
        oy = math.cos(2 * math.pi * p) * 5 * SS
        P = pts + np.array([ox, oy])
        # pulse travels the graph: a moving brightness focus along node index
        focus = (p * N) % N
        # edges
        for (i, j) in edges:
            # base faint line
            B.add_line(buf, P[i], P[j], 1.1 * SS, B.GOLD * 0.5, 0.22)
            # brighten if near the travelling pulse
            nodephase = min(abs(i - focus), abs(j - focus), N - abs(i - focus), N - abs(j - focus))
            glow = max(0.0, 1.0 - nodephase / 2.2)
            if glow > 0:
                B.add_line(buf, P[i], P[j], 1.6 * SS, B.GOLD_LT, 0.55 * glow)
        # nodes
        for k in range(N):
            nodephase = min(abs(k - focus), N - abs(k - focus))
            glow = max(0.0, 1.0 - nodephase / 1.6)
            B.add_glow_dot(buf, P[k][0], P[k][1], 9 * SS * (1 + 0.5 * glow), B.GOLD, 0.30 + 0.5 * glow)
            B.add_disc(buf, P[k][0], P[k][1], 2.4 * SS, B.GOLD_HI, 0.7 + 0.4 * glow, softness=1.6 * SS)
        frames.append(B.finalize(buf, VID_W, VID_H))
    return frames


# ============================================================ VIDEO 2: svc2 radar sweep
def svc2():
    w, h = vcanvas()
    rng = np.random.default_rng(22)
    cx, cy = w * 0.5, h * 0.52
    R = 0.40 * h
    # faint dotted grid (world-ish): rings + scattered dots
    blips = [(cx + math.cos(a) * r, cy + math.sin(a) * r, a)
             for a, r in [(0.7, 0.7*R), (2.4, 0.5*R), (4.1, 0.82*R), (5.4, 0.35*R)]]
    frames = []
    for f in range(NFR):
        p = f / NFR
        buf = cached_bg(w, h, 22, 0.4)
        # static faint grid: concentric rings
        for rr in (0.33, 0.66, 1.0):
            B.add_ring(buf, cx, cy, R * rr, 0.8 * SS, B.GOLD * 0.5, 0.10)
        # crosshair faint lines
        B.add_line(buf, (cx - R, cy), (cx + R, cy), 0.8 * SS, B.GOLD * 0.5, 0.07)
        B.add_line(buf, (cx, cy - R), (cx, cy + R), 0.8 * SS, B.GOLD * 0.5, 0.07)
        # dotted world points (static low dots)
        rng2 = np.random.default_rng(99)
        for _ in range(70):
            a = rng2.uniform(0, 2*math.pi); rr = rng2.uniform(0.1, 1.0) * R
            dx, dy = cx + math.cos(a)*rr, cy + math.sin(a)*rr
            B.add_disc(buf, dx, dy, 1.0 * SS, B.GOLD * 0.6, 0.10, softness=1.2*SS)
        # sweep wedge rotating, loops exactly (full turn over the clip)
        sweep = -math.pi/2 + p * 2 * math.pi
        B.add_wedge(buf, cx, cy, R * 1.02, sweep, 0.55, B.GOLD, 0.42)
        # leading edge bright line
        ex, ey = cx + math.cos(sweep) * R, cy + math.sin(sweep) * R
        B.add_line(buf, (cx, cy), (ex, ey), 1.4 * SS, B.GOLD_LT, 0.5)
        # blips brighten as sweep passes
        for bx, by, ba in blips:
            da = (sweep - ba + math.pi) % (2*math.pi) - math.pi
            glow = max(0.0, 1.0 - abs(da) / 0.9)
            B.add_glow_dot(buf, bx, by, 10 * SS, B.GOLD_LT, 0.15 + 0.7 * glow)
            B.add_disc(buf, bx, by, 2.0 * SS, B.GOLD_HI, 0.3 + 0.6 * glow, softness=1.4*SS)
        # center hub
        B.add_glow_dot(buf, cx, cy, 7 * SS, B.GOLD, 0.4)
        B.add_disc(buf, cx, cy, 2.2 * SS, B.GOLD_HI, 0.8, softness=1.5*SS)
        frames.append(B.finalize(buf, VID_W, VID_H))
    return frames


# ============================================================ VIDEO 5: svc5 chart line
def svc5():
    w, h = vcanvas()
    left, right = 0.12 * w, 0.90 * w
    base = 0.78 * h
    top = 0.26 * h
    # target curve points (gently rising with soft wiggle)
    xs = np.linspace(left, right, 60)
    tnorm = (xs - left) / (right - left)
    ys = base - (tnorm ** 0.85) * (base - top) - np.sin(tnorm * 6.2) * 0.03 * h
    frames = []
    for f in range(NFR):
        p = f / NFR
        buf = cached_bg(w, h, 55, 0.4)
        # baseline grid
        for gy in np.linspace(top, base, 5):
            B.add_line(buf, (left, gy), (right, gy), 0.7 * SS, B.GOLD * 0.5, 0.06)
        for gx in np.linspace(left, right, 7):
            B.add_line(buf, (gx, top), (gx, base), 0.7 * SS, B.GOLD * 0.5, 0.04)
        B.add_line(buf, (left, base), (right, base), 1.0 * SS, B.GOLD, 0.18)
        # soft bars (a few), gently breathing
        nb = 6
        for bi in range(nb):
            bx = left + (bi + 0.5) / nb * (right - left)
            bh = (0.18 + 0.10 * math.sin(bi * 1.3 + B.ease_loop(p) * 1.2)) * (base - top)
            B.add_line(buf, (bx, base), (bx, base - bh), 9 * SS, B.GOLD * 0.7, 0.12)
        # drawing line: reveal grows then holds (loop: draw 0..1 over first 70%, hold)
        draw = min(1.0, p / 0.62)
        # ease the wrap: at end fade the head glow back so last~first
        nshow = max(2, int(draw * len(xs)))
        pts = list(zip(xs[:nshow], ys[:nshow]))
        B.add_polyline(buf, pts, 2.0 * SS, B.GOLD_LT, 0.5)
        B.add_polyline(buf, pts, 1.0 * SS, B.GOLD_HI, 0.5)
        # head node
        if nshow >= 1:
            hx, hy = xs[nshow-1], ys[nshow-1]
            headglow = 1.0 if p < 0.62 else max(0.0, 1.0 - (p-0.62)/0.38)
            B.add_glow_dot(buf, hx, hy, 9 * SS, B.GOLD_LT, 0.5 * headglow + 0.2)
            B.add_disc(buf, hx, hy, 2.2 * SS, B.GOLD_HI, 0.8, softness=1.5*SS)
        # data-stream of dots drifting along baseline, loops
        for di in range(10):
            dp = (p + di / 10.0) % 1.0
            dx = left + dp * (right - left)
            B.add_disc(buf, dx, base + 6 * SS, 1.3 * SS, B.GOLD, 0.12, softness=1.3*SS)
        frames.append(B.finalize(buf, VID_W, VID_H))
    return frames


# ============================================================ VIDEO 8: svc8 automation pipeline
def svc8():
    w, h = vcanvas()
    # 3 curved paths left->right
    def path(cy_off, amp, phase):
        xs = np.linspace(0.06 * w, 0.94 * w, 120)
        t = (xs - xs[0]) / (xs[-1] - xs[0])
        ys = h * cy_off + np.sin(t * math.pi * 1.6 + phase) * amp * h
        return list(zip(xs, ys))
    paths = [path(0.38, 0.10, 0.0), path(0.55, -0.08, 1.0), path(0.50, 0.04, 2.2)]
    frames = []
    for f in range(NFR):
        p = f / NFR
        buf = cached_bg(w, h, 88, 0.42)
        for pi, pth in enumerate(paths):
            # faint track
            B.add_polyline(buf, pth, 1.4 * SS, B.GOLD * 0.5, 0.16)
            # particles flowing along (loop seamlessly: offset by p)
            npart = 7
            for k in range(npart):
                tp = (p + k / npart + pi * 0.13) % 1.0
                idx = tp * (len(pth) - 1)
                i0 = int(idx); frac = idx - i0
                i1 = min(i0 + 1, len(pth) - 1)
                x = pth[i0][0] * (1 - frac) + pth[i1][0] * frac
                y = pth[i0][1] * (1 - frac) + pth[i1][1] * frac
                # brightness fade in/out at ends
                edge = min(tp, 1 - tp) * 6
                a = min(1.0, edge)
                B.add_glow_dot(buf, x, y, 7 * SS, B.GOLD_LT, 0.32 * a)
                B.add_disc(buf, x, y, 1.8 * SS, B.GOLD_HI, 0.7 * a, softness=1.4*SS)
            # connection nodes at path junctions
        # a couple of hub nodes where paths cross-ish
        for hx, hy in [(0.30*w, 0.46*h), (0.62*w, 0.50*h)]:
            B.add_glow_dot(buf, hx, hy, 8 * SS, B.GOLD, 0.22)
            B.add_disc(buf, hx, hy, 2.2 * SS, B.GOLD_HI, 0.7, softness=1.5*SS)
        frames.append(B.finalize(buf, VID_W, VID_H))
    return frames


# ============================================================ IMAGES
def svc3():  # business model / strategy grid — interlocking blocks
    w, h = icanvas()
    buf = B.background(w, h, seed=33, gold_haze=0.5)
    cx, cy = w * 0.5, h * 0.5
    # isometric interlocking rectangles in thin gold linework
    blocks = [
        (0.34, 0.30, 0.20, 0.16), (0.52, 0.26, 0.16, 0.13),
        (0.30, 0.50, 0.16, 0.16), (0.48, 0.50, 0.22, 0.18),
        (0.62, 0.46, 0.14, 0.20),
    ]
    for bi, (bx, by, bw, bh) in enumerate(blocks):
        x0, y0 = bx * w, by * h
        x1, y1 = (bx + bw) * w, (by + bh) * h
        corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
        inten = 0.46 if bi in (1, 3) else 0.36   # one or two "lead" blocks brighter
        B.add_polyline(buf, corners, 1.4 * SS, B.GOLD, inten)
        # inner subtle fill via faint cross line
        B.add_line(buf, (x0, y0), (x1, y1), 0.8 * SS, B.GOLD * 0.5, 0.07)
        # corner nodes
        for cxn, cyn in corners[:4]:
            B.add_disc(buf, cxn, cyn, 2.2 * SS, B.GOLD_HI, 0.6, softness=1.5*SS)
    # connecting lines between blocks (strategy links)
    B.add_line(buf, (0.44*w, 0.38*h), (0.59*w, 0.56*h), 1.1 * SS, B.GOLD_LT, 0.30)
    B.add_line(buf, (0.40*w, 0.58*h), (0.56*w, 0.34*h), 1.1 * SS, B.GOLD_LT, 0.22)
    B.add_glow_dot(buf, 0.5*w, 0.46*h, 46 * SS, B.GOLD, 0.07)
    return B.finalize(buf, IMG_W, IMG_H)


def svc4():  # operations — interlocking gears / flow lines
    w, h = icanvas()
    buf = B.background(w, h, seed=44, gold_haze=0.48)
    def gear(cx, cy, R, teeth, intensity):
        # ring
        B.add_ring(buf, cx, cy, R, 1.4 * SS, B.GOLD, intensity)
        B.add_ring(buf, cx, cy, R * 0.42, 1.0 * SS, B.GOLD * 0.8, intensity * 0.7)
        for t in range(teeth):
            a = t / teeth * 2 * math.pi
            x0 = cx + math.cos(a) * R
            y0 = cy + math.sin(a) * R
            x1 = cx + math.cos(a) * (R * 1.16)
            y1 = cy + math.sin(a) * (R * 1.16)
            B.add_line(buf, (x0, y0), (x1, y1), 2.2 * SS, B.GOLD, intensity)
        B.add_glow_dot(buf, cx, cy, R * 0.5, B.GOLD, 0.08)
        B.add_disc(buf, cx, cy, 2.4 * SS, B.GOLD_HI, 0.7, softness=1.6*SS)
    gear(0.40 * w, 0.46 * h, 0.16 * h, 12, 0.32)
    gear(0.585 * w, 0.58 * h, 0.11 * h, 10, 0.30)
    gear(0.64 * w, 0.34 * h, 0.075 * h, 8, 0.26)
    # streamlined flow lines threading through
    xs = np.linspace(0.10 * w, 0.90 * w, 80)
    t = (xs - xs[0]) / (xs[-1] - xs[0])
    for off, amp in [(0.74, 0.05), (0.80, 0.03)]:
        ys = h * off + np.sin(t * math.pi * 2) * amp * h
        B.add_polyline(buf, list(zip(xs, ys)), 1.2 * SS, B.GOLD_LT, 0.20)
    return B.finalize(buf, IMG_W, IMG_H)


def svc6():  # digital presence — browser/wireframe + gauge
    w, h = icanvas()
    buf = B.background(w, h, seed=66, gold_haze=0.46)
    # browser frame
    bx0, by0 = 0.20 * w, 0.24 * h
    bx1, by1 = 0.80 * w, 0.74 * h
    frame = [(bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1), (bx0, by0)]
    B.add_polyline(buf, frame, 1.6 * SS, B.GOLD, 0.34)
    # top bar
    barY = by0 + 0.06 * h
    B.add_line(buf, (bx0, barY), (bx1, barY), 1.0 * SS, B.GOLD * 0.8, 0.22)
    for i in range(3):  # traffic dots
        B.add_disc(buf, bx0 + (0.022 + i*0.022) * w, by0 + 0.03 * h, 3.0 * SS, B.GOLD_LT, 0.5, softness=1.6*SS)
    # url pill
    B.add_polyline(buf, [(bx0+0.12*w, by0+0.018*h),(bx1-0.06*w, by0+0.018*h),
                         (bx1-0.06*w, by0+0.045*h),(bx0+0.12*w, by0+0.045*h),(bx0+0.12*w, by0+0.018*h)],
                   0.9*SS, B.GOLD*0.7, 0.14)
    # content wireframe lines
    cy = barY + 0.05 * h
    for i in range(4):
        ly = cy + i * 0.07 * h
        wlen = (0.5 - 0.06*i)
        B.add_line(buf, (bx0+0.05*w, ly), (bx0 + wlen*w, ly), 1.0 * SS, B.GOLD * 0.6, 0.12)
    # SEO speed gauge (arc) bottom-right inside
    gx, gy, gR = bx1 - 0.14 * w, by1 - 0.12 * h, 0.085 * h
    B.add_ring(buf, gx, gy, gR, 1.6 * SS, B.GOLD * 0.6, 0.16, a0=math.radians(140), a1=math.radians(400))
    # gauge value arc (bright, ~75%)
    B.add_ring(buf, gx, gy, gR, 2.0 * SS, B.GOLD_LT, 0.40, a0=math.radians(140), a1=math.radians(140+0.75*260))
    # needle
    na = math.radians(140 + 0.75 * 260)
    B.add_line(buf, (gx, gy), (gx + math.cos(na)*gR*0.9, gy + math.sin(na)*gR*0.9), 1.6*SS, B.GOLD_HI, 0.5)
    B.add_disc(buf, gx, gy, 2.2*SS, B.GOLD_HI, 0.8, softness=1.5*SS)
    return B.finalize(buf, IMG_W, IMG_H)


def svc7():  # content / thought leadership — document text-lines + cursor
    w, h = icanvas()
    buf = B.background(w, h, seed=77, gold_haze=0.46)
    # page frame, slightly portrait, centered-left
    px0, py0 = 0.30 * w, 0.18 * h
    px1, py1 = 0.70 * w, 0.82 * h
    page = [(px0, py0), (px1, py0), (px1, py1), (px0, py1), (px0, py0)]
    B.add_polyline(buf, page, 1.4 * SS, B.GOLD * 0.8, 0.24)
    # heading line (brighter, shorter)
    B.add_line(buf, (px0+0.04*w, py0+0.07*h), (px0+0.22*w, py0+0.07*h), 3.0*SS, B.GOLD, 0.40)
    # body text-lines (thin, varying length)
    rng = np.random.default_rng(7)
    y = py0 + 0.14 * h
    for i in range(11):
        ll = rng.uniform(0.20, 0.34)
        B.add_line(buf, (px0+0.04*w, y), (px0 + (0.04+ll)*w, y), 1.0 * SS, B.GOLD_LT, 0.16)
        y += 0.045 * h
    # quill / cursor accent: a bright caret near a line + a thin diagonal quill stroke
    cax, cay = px0 + 0.30 * w, py0 + 0.45 * h
    B.add_line(buf, (cax, cay-0.02*h), (cax, cay+0.02*h), 1.6*SS, B.GOLD_HI, 0.6)  # caret
    # quill: elegant tapered diagonal stroke top-right (nib -> feather)
    qx0, qy0 = px1 - 0.02*w, py0 - 0.02*h          # nib (touches page)
    qx1, qy1 = px1 + 0.12*w, py0 - 0.18*h          # feather tip
    B.add_polyline(buf, [(qx0, qy0), (qx1, qy1)], 2.2*SS, B.GOLD_LT, 0.34)
    # faint feather barbs
    for s in (0.30, 0.48, 0.66):
        bxp = qx0 + (qx1-qx0)*s; byp = qy0 + (qy1-qy0)*s
        B.add_line(buf, (bxp, byp), (bxp + 0.03*w, byp + 0.005*h), 1.0*SS, B.GOLD*0.7, 0.12)
    B.add_glow_dot(buf, qx0, qy0, 9*SS, B.GOLD, 0.30)
    B.add_disc(buf, qx0, qy0, 2.0*SS, B.GOLD_HI, 0.7, softness=1.4*SS)
    return B.finalize(buf, IMG_W, IMG_H)


def svc9():  # persian market — globe with longitude arcs + connections
    w, h = icanvas()
    buf = B.background(w, h, seed=91, gold_haze=0.5)
    cx, cy = w * 0.5, h * 0.5
    R = 0.34 * h
    # outer globe ring
    B.add_ring(buf, cx, cy, R, 1.6 * SS, B.GOLD, 0.30)
    # longitude arcs (ellipses of varying width)
    for k in range(-3, 4):
        ew = abs(k) / 3.0  # 0 center -> 1 edge
        rx = R * (1 - ew * 0.0)  # keep R
        rxx = R * math.cos(k * math.radians(28))
        # draw an ellipse outline as polyline
        ts = np.linspace(0, 2*math.pi, 90)
        pts = [(cx + rxx * math.sin(t), cy + R * math.cos(t)) for t in ts]
        B.add_polyline(buf, pts, 0.9 * SS, B.GOLD * 0.6, 0.10)
    # latitude rings (horizontal thin ellipses across the sphere)
    for k in range(-2, 3):
        lat = k * math.radians(26)
        ry = R * math.sin(lat)            # vertical offset of this latitude band
        rw = R * math.cos(lat)            # horizontal radius at this latitude
        ts = np.linspace(0, 2*math.pi, 90)
        pts = [(cx + rw * math.cos(t), cy - ry + R * 0.16 * math.sin(lat) * math.sin(t)) for t in ts]
        B.add_polyline(buf, pts, 0.8 * SS, B.GOLD * 0.55, 0.08)
    # two highlighted nodes (Tehran <-> Belgrade) on the sphere
    def sphere_pt(lon, lat):
        # lon,lat in radians; orthographic
        x = cx + R * math.cos(lat) * math.sin(lon)
        y = cy - R * math.sin(lat)
        return x, y
    tehran = sphere_pt(math.radians(22), math.radians(18))
    belgrade = sphere_pt(math.radians(-12), math.radians(30))
    # connection great-circle-ish arc (quadratic through a lifted midpoint)
    mx = (tehran[0] + belgrade[0]) / 2
    my = (tehran[1] + belgrade[1]) / 2 - 0.14 * h
    ts = np.linspace(0, 1, 60)
    arc = [((1-t)**2*tehran[0] + 2*(1-t)*t*mx + t**2*belgrade[0],
            (1-t)**2*tehran[1] + 2*(1-t)*t*my + t**2*belgrade[1]) for t in ts]
    B.add_polyline(buf, arc, 1.4 * SS, B.GOLD_LT, 0.32)
    for nx, ny in (tehran, belgrade):
        B.add_glow_dot(buf, nx, ny, 11 * SS, B.GOLD_LT, 0.4)
        B.add_disc(buf, nx, ny, 2.6 * SS, B.GOLD_HI, 0.9, softness=1.6*SS)
    # soft inner glow
    B.add_glow_dot(buf, cx, cy, R * 0.9, B.GOLD, 0.05)
    return B.finalize(buf, IMG_W, IMG_H)


_BG_CACHE = {}
def cached_bg(w, h, seed, gold_haze):
    key = (w, h, seed, round(gold_haze, 3))
    if key not in _BG_CACHE:
        _BG_CACHE[key] = B.background(w, h, seed=seed, gold_haze=gold_haze)
    return _BG_CACHE[key].copy()

VIDEOS = {"svc1": svc1, "svc2": svc2, "svc5": svc5, "svc8": svc8}
IMAGES = {"svc3": svc3, "svc4": svc4, "svc6": svc6, "svc7": svc7, "svc9": svc9}


def run(which):
    if which in VIDEOS:
        frames = VIDEOS[which]()
        d = os.path.join(TMP, which)
        os.makedirs(d, exist_ok=True)
        for i, im in enumerate(frames):
            im.save(os.path.join(d, f"{i:04d}.png"))
        # poster = a strong representative frame (~60% through)
        frames[int(len(frames)*0.6)].save(os.path.join(OUT, f"{which}.jpg"), quality=85)
        print(f"{which}: {len(frames)} frames -> {d}")
    elif which in IMAGES:
        im = IMAGES[which]()
        im.save(os.path.join(OUT, f"{which}.png"))
        print(f"{which}: image -> {OUT}/{which}.png")
    else:
        raise SystemExit(f"unknown {which}")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        for k in list(VIDEOS) + list(IMAGES):
            run(k)
    elif arg == "vids":
        for k in VIDEOS: run(k)
    elif arg == "imgs":
        for k in IMAGES: run(k)
    else:
        run(arg)
