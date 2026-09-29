#!/usr/bin/env python3
"""
Code retouch for brand/v1 — no generation, no new pixels invented beyond their neighbours.

The IMAGE card (A5r) kept a pale letter-like mark on the stone slab after two edits, and the shot's three
attempts were used (docs/DESIGN.md: at most two retries). The mark sits on flat dark stone, so it is filled the
classic way: mask the pale pixels inside a small box, then diffuse the surrounding stone into them (repeated
blur, masked copy-back), and put back film grain of the same strength so the patch does not read smooth.

    python3 scripts/brand/retouch.py        writes public/brand/v1/raw/A5r-1-0-retouched.png

The raw takes stay local (gitignored); the retouched result is committed as the master design/brand/v1/A5r.jpg,
which is what scripts/brand/build-v1.mjs reads. This script is the record of how that master was made.
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public', 'brand', 'v1')
SRC = os.path.join(OUT, 'raw', 'A5r-1-0.png')
DST = os.path.join(OUT, 'raw', 'A5r-1-0-retouched.png')

# The box around the mark, measured on the 1296x1728 source: between the bottle's base and the glass foot.
BOX = (488, 1352, 722, 1428)
LUMA_MIN = 95  # the stone is ~20-60; the mark is pale (>120); the threshold sits between them


def main():
    img = Image.open(SRC).convert('RGB')
    a = np.asarray(img).astype(np.float32)
    x0, y0, x1, y1 = BOX
    roi = a[y0:y1, x0:x1].copy()
    luma = roi @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mask = luma > LUMA_MIN
    # grow the mask by 2 px so the mark's soft edge goes too
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    mask = np.asarray(m) > 0
    print('masked pixels:', int(mask.sum()))

    # Diffusion fill: start the hole at the stone's median, then let the neighbourhood flow in.
    stone = roi[~mask]
    fill = roi.copy()
    fill[mask] = np.median(stone, axis=0)
    for _ in range(300):
        blurred = np.asarray(Image.fromarray(fill.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)
        fill[mask] = blurred[mask]

    # Film grain of the same strength as the untouched stone, so the patch does not look airbrushed.
    rng = np.random.default_rng(260929)
    grain = np.std(stone - np.asarray(Image.fromarray(roi.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)[~mask], axis=0)
    fill[mask] += rng.normal(0, 1, size=(int(mask.sum()), 3)).astype(np.float32) * grain

    a[y0:y1, x0:x1] = fill
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(DST, optimize=True)
    print('wrote', os.path.relpath(DST, ROOT), '· grain std', np.round(grain, 2).tolist())

    # Record it in the manifest: the selection points at the retouched file, with a note saying what was done.
    mpath = os.path.join(OUT, 'manifest.json')
    with open(mpath) as f:
        manifest = json.load(f)
    sel = manifest['selected'].get('A5r')
    if sel:
        sel['file'] = 'raw/A5r-1-0-retouched.png'
        sel['note'] = 'code retouch (scripts/brand/retouch.py): pale mark on the slab filled from the surrounding stone; no generation'
        with open(mpath, 'w') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')


if __name__ == '__main__':
    main()
