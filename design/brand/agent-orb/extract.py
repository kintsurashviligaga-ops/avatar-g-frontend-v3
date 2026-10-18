import numpy as np
from PIL import Image
# Run from the repo root: python3 design/brand/agent-orb/extract.py
# The Live call's agent logo: the rocket in a glowing blue sphere, as the owner supplied it with the PRD of 2026-10-18
# (agent-orb-master.png here, 720x1280 on black). Cuts the sphere out square and makes the black around it transparent:
# the sphere itself stays opaque (so the rocket keeps its dark glass behind it on a light page too), and its glow is
# "unscreened" (alpha = the brightest channel, colour divided back out) so it fades into any ground without a box.
# Writes public/brand/agent-orb-256.webp and agent-orb-512.webp. Never redraw the mark: re-run this on a new master.
src = Image.open('design/brand/agent-orb/agent-orb-master.png').convert('RGB')
# The sphere's centre and the crop's half-size, measured on the master: its bright rim spans x 147-571, y 409-835, and
# its glow fades below 5 % about 50 px outside the rim.
CX, CY, HALF = 359, 622, 262
R_OPAQUE = 200.0  # just inside the rim
crop = np.asarray(src.crop((CX - HALF, CY - HALF, CX + HALF, CY + HALF))).astype(float) / 255.0
n = crop.shape[0]
yy, xx = np.mgrid[0:n, 0:n]
r = np.hypot(xx - (n - 1) / 2, yy - (n - 1) / 2)
bright = np.clip(crop.max(axis=2), 0, 1)
unscreened = np.clip(np.where(bright[..., None] > 1e-4, crop / np.maximum(bright[..., None], 1e-4), 0), 0, 1)
t = np.clip((r - R_OPAQUE) / 10.0, 0, 1)  # 0 on the sphere, 1 in its glow
alpha = (1 - t) + t * bright
colour = (1 - t[..., None]) * crop + t[..., None] * unscreened
alpha *= np.clip((HALF - 2 - r) / 14.0, 0, 1)  # nothing reaches the square's edge
img = Image.fromarray((np.clip(np.dstack([colour, alpha]), 0, 1) * 255 + 0.5).astype('uint8'), 'RGBA')
for size in (256, 512):
    img.resize((size, size), Image.LANCZOS).save(f'public/brand/agent-orb-{size}.webp', quality=90, method=6)
