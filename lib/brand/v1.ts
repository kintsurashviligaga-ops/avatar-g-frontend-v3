/**
 * brand/v1 — the generated image pack (scripts/hf-art-pack.md, costs in public/brand/v1/manifest.json).
 * One world, one grade (docs/DESIGN.md §4). Web files are produced from the selected raw outputs by
 * `node scripts/brand/build-v1.mjs`; nothing here is referenced before that script has written it
 * (lib/brand/v1.test.ts checks every file exists).
 */
export const BRAND_V1 = {
  hero16x9: { src: '/brand/v1/hero-16x9.jpg', width: 2048, height: 1152 },
  hero9x16: { src: '/brand/v1/hero-9x16.jpg', width: 1080, height: 1920 },
  plate: { src: '/brand/v1/dashboard-plate.jpg', width: 1920, height: 1080 },
  cards: {
    video: { src: '/brand/v1/card-video.jpg', width: 1200, height: 1500 },
    image: { src: '/brand/v1/card-image.jpg', width: 1200, height: 1500 },
    music: { src: '/brand/v1/card-music.jpg', width: 1200, height: 1500 },
    avatar: { src: '/brand/v1/card-avatar.jpg', width: 1200, height: 1500 },
  },
  world: { src: '/brand/v1/world-16x9.jpg', width: 2048, height: 1152 },
  og: { src: '/brand/v1/og.jpg', width: 1200, height: 630 },
  /** 5 s silent loop of the hero (B1 — last frame = first frame), desktop only, off under reduced motion. */
  heroLoop: { src: '/brand/v1/hero-loop.mp4', poster: '/brand/v1/hero-16x9.jpg' } as null | { src: string; poster: string },
  /** R1–R3 — three 5 s vertical loops for the landing (scripts/hf-art-pack.md), 720×1280, poster = first frame. */
  reels: [
    { id: 'street', src: '/brand/v1/reel-street.mp4', poster: '/brand/v1/reel-street.jpg' },
    { id: 'product', src: '/brand/v1/reel-product.mp4', poster: '/brand/v1/reel-product.jpg' },
    { id: 'portrait', src: '/brand/v1/reel-portrait.mp4', poster: '/brand/v1/reel-portrait.jpg' },
  ] as ReadonlyArray<{ id: 'street' | 'product' | 'portrait'; src: string; poster: string }>,
} as const;
