// Auto-derive B2B marketing overlay copy from a film brief. Used by the assemble route so
// commercial films automatically get premium lower-third / price / CTA overlays — no client
// changes needed. A cheap keyword gate avoids running the director on cinematic briefs.
import 'server-only';
import { ClaudeDirectorAgent } from './agents/claude-director';
import type { MarketingOverlay } from './compositing/ffmpeg-overlay';

const B2B_RE =
  /\b(commercial|advert|advertis|promo|real\s?estate|apartment|property|for\s?sale|listing|product|brand|store|shop|price|\$\s?\d|\d+\s?(gel|usd|\$|₾)|sale|business|company|service|booking|book\s?now|call\s?now|contact|launch|offer)\b/i;

/** Returns marketing copy when the brief reads as a B2B commercial, else null (cinematic). */
export async function deriveMarketingFromBrief(brief: string): Promise<MarketingOverlay | null> {
  if (!brief || brief.trim().length < 8 || !B2B_RE.test(brief)) return null;
  try {
    const director = new ClaudeDirectorAgent();
    const o = await director.direct({ jobId: 'film-b2b-marketing' }, brief.slice(0, 1500));
    if (o.intent !== 'b2b_commercial') return null;

    const metas = o.scenes.map((s) => s.marketingMetadata).filter((m): m is NonNullable<typeof m> => Boolean(m));
    const pick = (key: 'overlayText' | 'priceTag' | 'cta' | 'website'): string | undefined =>
      metas.map((m) => m[key]).find((v): v is string => typeof v === 'string' && v.trim().length > 0);

    const marketing: MarketingOverlay = {
      overlayText: pick('overlayText') || o.masterTheme.slice(0, 64),
      priceTag: pick('priceTag'),
      cta: pick('cta'),
      website: pick('website') || 'myavatar.ge',
    };
    return marketing;
  } catch {
    return null; // fail-open — a derivation miss simply skips the overlay
  }
}
