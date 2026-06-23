"""AHoosh.ai brand rendering toolkit — dark-luxury fintech, navy + gold only.
Render at SS x supersample then LANCZOS downscale. Dither to kill banding.
All draw helpers operate on a float32 RGB accumulation buffer (additive glow),
then we tone-map + dither to 8-bit at the end.
"""
import numpy as np
from PIL import Image

# ---- brand palette (linear-ish sRGB tuples 0..1) ----
NAVY_A   = np.array([0x05, 0x08, 0x0f]) / 255.0   # deep corner
NAVY_B   = np.array([0x0c, 0x17, 0x30]) / 255.0   # lifted center-ish
NAVY_BG  = np.array([0x03, 0x06, 0x0f]) / 255.0   # canonical page bg
GOLD     = np.array([0xe0, 0xa9, 0x3f]) / 255.0   # primary
GOLD_LT  = np.array([0xf4, 0xd9, 0x8b]) / 255.0   # light
GOLD_HI  = np.array([0xff, 0xf7, 0xe0]) / 255.0   # highlight
TEAL     = np.array([0xbf, 0xe6, 0xe0]) / 255.0   # rare teal-white glow

SS = 2  # supersample factor


def _grid(w, h):
    ys, xs = np.mgrid[0:h, 0:w]
    return xs.astype(np.float32), ys.astype(np.float32)


def background(w, h, seed=0, gold_haze=0.5):
    """Deep navy diagonal+radial gradient with faint warm gold marble haze.
    Returns float32 HxWx3 buffer (the additive accumulator base)."""
    rng = np.random.default_rng(seed)
    xs, ys = _grid(w, h)
    # diagonal factor (top-left dark -> center lifts)
    diag = (xs / w * 0.55 + ys / h * 0.45)
    # radial brighten around a center slightly above middle
    cx, cy = w * 0.52, h * 0.42
    r = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / (0.75 * np.hypot(w, h))
    radial = np.clip(1.0 - r, 0, 1) ** 1.6
    # base navy mix
    t = np.clip(0.30 + 0.55 * radial - 0.18 * diag, 0, 1)[..., None]
    base = NAVY_A[None, None, :] * (1 - t) + NAVY_B[None, None, :] * t
    # gentle vignette toward edges
    vig = np.clip(1.0 - (r * 0.9) ** 2.2, 0.25, 1.0)[..., None]
    base = base * (0.55 + 0.45 * vig)

    # warm dark-gold marble haze: low-freq smooth noise, only a faint warm tint
    haze = _fbm(w, h, rng, octaves=4, base_scale=2.0)
    haze = (haze - haze.min()) / (np.ptp(haze) + 1e-6)
    # confine haze warmth mostly to brighter regions -> marble feel
    warm = (haze ** 1.8) * radial * gold_haze * 0.16
    base = base + warm[..., None] * GOLD[None, None, :] * np.array([1.0, 0.85, 0.55])
    return base.astype(np.float32)


def _fbm(w, h, rng, octaves=4, base_scale=3.0):
    """cheap fractal value noise via upsampled random lattices."""
    acc = np.zeros((h, w), np.float32)
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        gx = max(2, int(base_scale * (2 ** o)))
        gy = max(2, int(base_scale * (2 ** o) * h / w))
        lat = rng.standard_normal((gy + 1, gx + 1)).astype(np.float32)
        img = np.array(Image.fromarray(lat).resize((w, h), Image.BICUBIC))
        acc += amp * img
        total += amp
        amp *= 0.5
    return acc / total


def add_glow_dot(buf, x, y, radius, color, intensity=1.0):
    """Additive soft luminous node (gaussian)."""
    h, w = buf.shape[:2]
    r = int(radius * 3)
    x0, x1 = max(0, int(x - r)), min(w, int(x + r))
    y0, y1 = max(0, int(y - r)), min(h, int(y + r))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d2 = (xx - x) ** 2 + (yy - y) ** 2
    g = np.exp(-d2 / (2 * radius ** 2)) * intensity
    buf[y0:y1, x0:x1, :] += g[..., None] * np.asarray(color)[None, None, :]


def _line_mask(buf_shape, p0, p1, width):
    """signed distance based soft line mask over the whole buffer region of interest."""
    h, w = buf_shape[:2]
    (x0, y0), (x1, y1) = p0, p1
    minx, maxx = int(min(x0, x1) - width * 4), int(max(x0, x1) + width * 4)
    miny, maxy = int(min(y0, y1) - width * 4), int(max(y0, y1) + width * 4)
    minx, miny = max(0, minx), max(0, miny)
    maxx, maxy = min(w, maxx), min(h, maxy)
    if maxx <= minx or maxy <= miny:
        return None
    yy, xx = np.mgrid[miny:maxy, minx:maxx].astype(np.float32)
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy + 1e-6
    tt = np.clip(((xx - x0) * dx + (yy - y0) * dy) / L2, 0, 1)
    px = x0 + tt * dx
    py = y0 + tt * dy
    dist = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
    mask = np.exp(-(dist ** 2) / (2 * (width) ** 2))
    return (slice(miny, maxy), slice(minx, maxx)), mask


def add_line(buf, p0, p1, width, color, intensity=1.0):
    res = _line_mask(buf.shape, p0, p1, width)
    if res is None:
        return
    sl, mask = res
    buf[sl[0], sl[1], :] += (mask * intensity)[..., None] * np.asarray(color)[None, None, :]


def add_polyline(buf, pts, width, color, intensity=1.0):
    for a, b in zip(pts[:-1], pts[1:]):
        add_line(buf, a, b, width, color, intensity)


def add_disc(buf, x, y, radius, color, intensity=1.0, softness=1.5):
    """filled soft disc (a node core)."""
    h, w = buf.shape[:2]
    r = int(radius + softness * 4)
    x0, x1 = max(0, int(x - r)), min(w, int(x + r))
    y0, y1 = max(0, int(y - r)), min(h, int(y + r))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
    core = np.clip(1.0 - (d - radius) / max(softness, 0.5), 0, 1)
    core = core ** 1.4 * intensity
    buf[y0:y1, x0:x1, :] += core[..., None] * np.asarray(color)[None, None, :]


def add_ring(buf, x, y, radius, width, color, intensity=1.0, a0=0.0, a1=2*np.pi):
    """soft ring / arc. angles in radians."""
    h, w = buf.shape[:2]
    r = int(radius + width * 4)
    x0, x1 = max(0, int(x - r)), min(w, int(x + r))
    y0, y1 = max(0, int(y - r)), min(h, int(y + r))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
    ang = np.arctan2(yy - y, xx - x)
    ring = np.exp(-((d - radius) ** 2) / (2 * width ** 2))
    if not (a0 == 0 and abs(a1 - 2*np.pi) < 1e-3):
        a = (ang - a0) % (2 * np.pi)
        span = (a1 - a0) % (2 * np.pi)
        within = (a <= span).astype(np.float32)
        # soften the arc ends
        ring = ring * within
    buf[y0:y1, x0:x1, :] += (ring * intensity)[..., None] * np.asarray(color)[None, None, :]


def add_wedge(buf, x, y, radius, a_center, a_half, color, intensity=1.0):
    """radar sweep wedge with angular falloff to leading edge."""
    h, w = buf.shape[:2]
    r = int(radius)
    x0, x1 = max(0, int(x - r)), min(w, int(x + r))
    y0, y1 = max(0, int(y - r)), min(h, int(y + r))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
    ang = np.arctan2(yy - y, xx - x)
    da = (ang - a_center + np.pi) % (2 * np.pi) - np.pi
    within = np.clip(1.0 - np.abs(da) / a_half, 0, 1) ** 1.2
    radial = np.clip(1.0 - d / radius, 0, 1)
    w_mask = within * radial * intensity
    buf[y0:y1, x0:x1, :] += w_mask[..., None] * np.asarray(color)[None, None, :]


def finalize(buf, out_w, out_h, dither=1.4, gamma=0.92):
    """tone-map (soft), downscale with LANCZOS, add tiny dither -> PIL RGB image."""
    # filmic-ish soft clip to avoid harsh white blowouts in glows
    x = np.clip(buf, 0, None)
    x = x / (1.0 + x * 0.6)            # soft shoulder
    x = np.clip(x, 0, 1) ** gamma
    img8 = (x * 255.0).astype(np.float32)
    im = Image.fromarray(np.clip(img8, 0, 255).astype(np.uint8), "RGB")
    if (im.width, im.height) != (out_w, out_h):
        im = im.resize((out_w, out_h), Image.LANCZOS)
    # tiny blue-noise-ish dither to kill 8-bit banding
    arr = np.asarray(im).astype(np.float32)
    rng = np.random.default_rng(7)
    arr += rng.uniform(-dither, dither, arr.shape)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def ease_loop(p):
    """p in [0,1] -> eased value that returns to start (for seamless loops)."""
    return 0.5 - 0.5 * np.cos(2 * np.pi * p)
