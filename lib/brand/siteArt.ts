/**
 * lib/brand/siteArt.ts — how a site-imagery-v2 still is loaded (the `site` art pack, scripts/site-art/shots.md): the VFX
 * preset tiles (public/vfx/) and the video tool's header banners (public/brand/video-hero/).
 *
 *   siteArt('/vfx/fire.jpg')  → { src, blurDataURL } — next/image with the picture's own ≤ 16 px blur placeholder from
 *                               the generated map (scripts/site-art/build-site-art.mjs), so a tile never flashes empty.
 *                               A file the map does not know yet still loads, without a blur.
 *
 * The banners for the video header, keyed the way VideoHero asks: a Veo tier, the music-video mode, or „another model".
 * lib/brand/siteArt.test.ts pins that every path here exists and that the map is current.
 *
 * Pure and isomorphic: no React.
 */
import { SITE_ART_META } from './siteArt.generated';

export interface SiteArtImage { src: string; blurDataURL?: string }

export function siteArt(path: string): SiteArtImage {
  const meta = Object.prototype.hasOwnProperty.call(SITE_ART_META, path) ? SITE_ART_META[path] : undefined;
  return meta ? { src: path, blurDataURL: meta.blur } : { src: path };
}

/**
 * The video header's banners (21:9 stills, 1200×514). Each suggests what its engine is for: Lite a phone reel shot at a
 * café table, Fast a gimbal chasing a cyclist (a quick social reel), Veo 3.1 a crane over Old Tbilisi (the trailer),
 * the music video a singer on a rooftop stage, and „another model" a cinema lens — neutral, since it names no engine.
 */
export const VIDEO_HERO_ART = {
  lite: '/brand/video-hero/lite.jpg',
  fast: '/brand/video-hero/fast.jpg',
  standard: '/brand/video-hero/standard.jpg',
  musicvideo: '/brand/video-hero/musicvideo.jpg',
  model: '/brand/video-hero/model.jpg',
} as const;
