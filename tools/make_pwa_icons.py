#!/usr/bin/env python3
"""Generate the Lethe PWA icons (icon-192.png, icon-512.png, icon-512-maskable.png).

The design mirrors `lethe/web_static/favicon.svg`: three flowing currents on a
dusk-amethyst tile — gold above and below a lighter amethyst middle stream.
Pure stdlib (zlib bitmap -> PNG), so it runs anywhere Python does:

    python tools/make_pwa_icons.py

Output lands in lethe/web_static/icons/ and is committed; re-run only when the
mark or the palette changes.
"""
from __future__ import annotations

import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "lethe", "web_static", "icons"))

# Palette — the dark "still water" tokens from THEME_CSS.
BG = (0x1C, 0x13, 0x30)          # deep amethyst-black tile
GOLD = (0xD8, 0xA9, 0x45)        # --gold (dark mode)
AMETHYST = (0xB7, 0x9B, 0xE0)    # --accent (dark mode)

# The three currents as in favicon.svg: M6 22 q6.5 -7 13 0 t13 0 t13 0 t13 0
VIEW = 64.0
STROKE_W = 4.6                   # svg stroke-width (diameter, viewBox units)
CURRENTS = ((22.0, GOLD), (34.0, AMETHYST), (46.0, GOLD))


def _segments(y0: float):
    """Four alternating quadratic-Bézier spans (x: 6 -> 58, control y ±7)."""
    segs, x, ctrl_y = [], 6.0, y0 - 7.0
    for _ in range(4):
        segs.append(((x, y0), (x + 6.5, ctrl_y), (x + 13.0, y0)))
        ctrl_y = 2.0 * y0 - ctrl_y          # `t` mirrors the previous control point
        x += 13.0
    return segs


def _samples(y0: float, n: int = 64):
    pts = []
    for (x0, ya), (x1, y1), (x2, y2) in _segments(y0):
        for i in range(n + 1):
            t = i / n
            mt = 1.0 - t
            pts.append((mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
                        mt * mt * ya + 2 * mt * t * y1 + t * t * y2))
    return pts


def _buckets(points, step):
    """Index sampled points by screen-x bucket, so each pixel only tests the
    handful of samples that could possibly be within the stroke radius."""
    out: dict[int, list[tuple[float, float]]] = {}
    for (x, y) in points:
        out.setdefault(int(x // step), []).append((x, y))
    return out


def _aa(coverage: float) -> float:
    """A 1-pixel wide smoothstep on the signed distance to an edge."""
    return max(0.0, min(1.0, coverage + 0.5))


def _rounded_rect_alpha(px: float, py: float, size: float, radius: float) -> float:
    cx = min(max(px, radius), size - radius)
    cy = min(max(py, radius), size - radius)
    return _aa(radius - math.hypot(px - cx, py - cy))


def make_icon(size: int, maskable: bool) -> bytes:
    """Rasterise one icon: RGBA, anti-aliased tile with the three currents."""
    pad = size * (0.155 if maskable else 0.10)
    art = size - 2 * pad                      # square artwork box
    scale = art / VIEW                        # viewBox units -> device px
    radius = STROKE_W / 2.0 * scale
    corner = 0.0 if maskable else size * 0.22  # maskable tiles are full-bleed

    # Pre-transform every stroke sample into device space, once.
    strokes = []
    for y0, color in CURRENTS:
        pts = [(pad + (x - 6.0) / 52.0 * art, pad + (y - 6.0) / 52.0 * art)
               for (x, y) in _samples(y0)]
        strokes.append((color, _buckets(pts, 4.0)))

    reach = int(math.ceil(radius)) + 2
    raw = bytearray()
    for py in range(size):
        raw.append(0)                          # PNG filter byte: none
        ry = py + 0.5
        for px in range(size):
            rx = px + 0.5
            a_tile = 1.0 if maskable else _rounded_rect_alpha(rx, ry, size, corner)
            if a_tile <= 0.0:
                raw += b"\x00\x00\x00\x00"
                continue
            r, g, b = BG
            a_out = a_tile
            bx = int(rx // 4.0)
            for color, buckets in strokes:
                best = float("inf")
                for k in range(bx - reach, bx + reach + 1):
                    for (sx, sy) in buckets.get(k, ()):
                        d2 = (rx - sx) ** 2 + (ry - sy) ** 2
                        if d2 < best:
                            best = d2
                a_line = _aa(radius - math.sqrt(best))
                if a_line <= 0.0:
                    continue
                r += (color[0] - r) * a_line
                g += (color[1] - g) * a_line
                b += (color[2] - b) * a_line
                a_out += (1.0 - a_out) * a_line
            raw += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), int(a_out * 255 + 0.5)))
    assert len(raw) == size * (size * 4 + 1), len(raw)
    return _png(size, raw)


def _png(size: int, raw: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)   # 8-bit RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main(out_dir: str | None = None) -> None:
    out_dir = out_dir or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    for name, size, maskable in (("icon-192.png", 192, False),
                                 ("icon-512.png", 512, False),
                                 ("icon-512-maskable.png", 512, True)):
        path = os.path.join(out_dir, name)
        data = make_icon(size, maskable)
        with open(path, "wb") as fh:
            fh.write(data)
        print(f"wrote {path} ({len(data)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
