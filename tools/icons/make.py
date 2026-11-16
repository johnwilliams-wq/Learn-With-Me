#!/usr/bin/env python3
"""Make the app's icons from the owner's picture (tools/icons/source.png).

    python3 tools/icons/make.py        # needs Pillow; then: node tools/build-precache.mjs

The picture is a rounded square with a green border on black. Each place that shows an icon cuts
its own shape out of it, so the black must never show:
  assets/icons/icon-180.png      the iPad / iPhone home screen. A full square, the corners filled
                                 with the border's green: the device rounds it itself, and the
                                 picture's own rounding is close to the device's, so the border
                                 comes out even all round.
  assets/icons/icon-192.png,     Android, desktop, the browser tab: shown as they are, so the corners
  icon-512.png                   are see-through.
  assets/icons/maskable-512.png  Android cuts a circle (or another shape) out of this one: the
                                 picture a little smaller on green, so both faces stay inside.

An app that is already on a home screen keeps the icon it was added with.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "icons"
GREEN = (125, 250, 30)  # the picture's border

im = Image.open(Path(__file__).with_name("source.png")).convert("RGB")
W, H = im.size

# the black outside the rounded square: dark pixels that are connected to a corner ...
dark = im.convert("L").point(lambda v: 255 if v < 70 else 0)
for corner in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
    ImageDraw.floodfill(dark, corner, 128)
outside = dark.point(lambda v: 255 if v == 128 else 0)
# ... grown a little, to take the dark fringe where black meets the border with it
outside = outside.filter(ImageFilter.MaxFilter(11))

square = Image.composite(Image.new("RGB", im.size, GREEN), im, outside)
rounded = im.convert("RGBA")
rounded.putalpha(outside.point(lambda v: 255 - v).filter(ImageFilter.GaussianBlur(1.2)))
maskable = Image.new("RGB", (W, H), GREEN)
small = square.resize((int(W * 0.9), int(H * 0.9)), Image.LANCZOS)
maskable.paste(small, ((W - small.width) // 2, (H - small.height) // 2))

square.resize((180, 180), Image.LANCZOS).save(OUT / "icon-180.png", optimize=True)
rounded.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
rounded.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png", optimize=True)
maskable.resize((512, 512), Image.LANCZOS).save(OUT / "maskable-512.png", optimize=True)
print("icons written to", OUT.relative_to(ROOT))
