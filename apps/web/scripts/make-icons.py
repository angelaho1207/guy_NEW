"""Writes the app icon as PNG, at the sizes iOS and Android actually use.

A pure-stdlib PNG encoder, because there is no image library here and adding one
to draw three shapes would be silly. The shapes come from apps/web/public/
icon.svg so the two cannot drift: a near-black field, a disc filled with the
bloom gradient, and a smaller near-black disc inside it.

No rounded corners: iOS and Android both apply their own mask, and rounding the
source as well leaves a pale halo in the corners.
"""

import struct
import sys
import zlib

BG = (0x0B, 0x0B, 0x0D)        # --bg, midnight
STOP_A = (0xF8, 0xC4, 0xFF)    # bloom, first stop
STOP_B = (0xC9, 0xB6, 0xF0)    # bloom, second stop

OUTER = 150 / 512              # disc radius, as a fraction of the side
INNER = 52 / 512               # the hole in it


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def pixels(size):
    """Row-major RGB bytes for one square icon."""
    centre = (size - 1) / 2
    r_outer = OUTER * size
    r_inner = INNER * size
    # Antialias by sampling a 3x3 grid inside each pixel. Without it the discs
    # look ragged at 180px, which is the size people actually see.
    offsets = [(-1 / 3, -1 / 3), (0, -1 / 3), (1 / 3, -1 / 3),
               (-1 / 3, 0), (0, 0), (1 / 3, 0),
               (-1 / 3, 1 / 3), (0, 1 / 3), (1 / 3, 1 / 3)]

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            acc = [0, 0, 0]
            for dx, dy in offsets:
                px, py = x + dx - centre, y + dy - centre
                dist = (px * px + py * py) ** 0.5
                if dist <= r_inner or dist > r_outer:
                    sample = BG
                else:
                    # Diagonal sweep across the disc, matching the SVG's
                    # top-left to bottom-right gradient.
                    t = ((px + r_outer) + (py + r_outer)) / (4 * r_outer)
                    sample = lerp(STOP_A, STOP_B, min(1.0, max(0.0, t)))
                for i in range(3):
                    acc[i] += sample[i]
            row += bytes(v // len(offsets) for v in acc)
        rows.append(bytes(row))
    return rows


def chunk(tag, payload):
    body = tag + payload
    return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body))


def write_png(path, size):
    rows = pixels(size)
    raw = b''.join(b'\x00' + r for r in rows)  # filter byte 0 per scanline
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


if __name__ == '__main__':
    out = sys.argv[1].rstrip('/')
    for name, size in (
        ('apple-touch-icon.png', 180),  # what iOS uses for the home screen
        ('icon-192.png', 192),          # Android launcher
        ('icon-512.png', 512),          # splash and store listings
    ):
        n = write_png(f'{out}/{name}', size)
        print(f'  {name:<22} {size}x{size}  {n:,} bytes')
