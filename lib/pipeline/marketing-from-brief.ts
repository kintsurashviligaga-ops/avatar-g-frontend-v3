// Auto-derived B2B marketing overlay copy from a film brief, retired. The assemble route still asks for it, so the
// export stays: it now always answers null.
import 'server-only';
import type { MarketingOverlay } from './compositing/ffmpeg-overlay';

/**
 * Always null. The director that wrote this copy was Claude, so a Google-only film (docs/VEO_ENGINE.md §3) got no
 * auto-derived overlay, and since MASTER TASK v3.1 every film is Google-only whatever VIDEO_GOOGLE_ONLY says. An
 * overlay the client passes explicitly (the product-ad surface) is still burned in by the assemble route.
 */
export async function deriveMarketingFromBrief(_brief: string): Promise<MarketingOverlay | null> {
  return null;
}
