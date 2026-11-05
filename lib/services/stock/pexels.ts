/**
 * lib/services/stock/pexels.ts — real, licensed footage for a cutaway, from Pexels (GG's choice, 2026-11-05 14:35Z).
 *
 * Pexels' licence lets anyone use its videos free, commercially, without asking or crediting (pexels.com/license);
 * the author and page are still kept with the pick so the card can name them. One search per line, in English; the
 * file chosen is an MP4 at least as wide as the edit's half frame and no larger than needed (fast to fetch), long
 * enough for the cutaway. PEXELS_API_KEY unset = no stock (null), never an error that stops the edit.
 *
 * The pure part (`pickPexelsFile`) is tested offline; `searchPexels` does one GET with a deadline.
 */

export interface PexelsFile { link: string; width: number; height: number; file_type?: string; quality?: string | null }
export interface PexelsVideo { id: number; url: string; duration: number; width: number; height: number; user?: { name?: string }; video_files: PexelsFile[] }

export interface StockPick {
  url: string;
  durationSec: number;
  width: number;
  height: number;
  /** The Pexels page of the video (for the card and the audit). */
  pageUrl: string;
  author: string | null;
  source: 'pexels';
  id: number;
}

export function pexelsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.PEXELS_API_KEY ?? '').trim();
}

/** The best file of the best video for a cutaway of `minSec` that fills `minWidth` pixels across. */
export function pickPexelsFile(videos: readonly PexelsVideo[], o: { minSec: number; minWidth: number; skip?: ReadonlySet<number> }): StockPick | null {
  for (const v of videos) {
    if (o.skip?.has(v.id) || !(v.duration >= o.minSec)) continue;
    const files = (v.video_files ?? [])
      .filter((f) => (f.file_type ?? 'video/mp4') === 'video/mp4' && typeof f.link === 'string' && /^https:\/\//.test(f.link))
      .filter((f) => f.width >= o.minWidth && f.width <= 2560)
      .sort((a, b) => a.width - b.width);
    const f = files[0];
    if (!f) continue;
    return { url: f.link, durationSec: v.duration, width: f.width, height: f.height, pageUrl: v.url, author: v.user?.name ?? null, source: 'pexels', id: v.id };
  }
  return null;
}

/** One search. Never throws: null = nothing usable (or no key, or Pexels down). */
export async function searchPexels(
  query: string,
  o: { minSec: number; minWidth: number; orientation?: 'landscape' | 'portrait' | 'square'; skip?: ReadonlySet<number>; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<StockPick | null> {
  const key = (process.env.PEXELS_API_KEY ?? '').trim();
  const q = query.trim().slice(0, 80);
  if (!key || !q) return null;
  const u = new URL('https://api.pexels.com/videos/search');
  u.searchParams.set('query', q);
  u.searchParams.set('per_page', '10');
  u.searchParams.set('size', 'medium');
  if (o.orientation) u.searchParams.set('orientation', o.orientation);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  const onAbort = () => ctl.abort();
  o.signal?.addEventListener('abort', onAbort);
  try {
    const res = await (o.fetchImpl ?? fetch)(u, { headers: { Authorization: key }, signal: ctl.signal });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { videos?: PexelsVideo[] } | null;
    return pickPexelsFile(json?.videos ?? [], o);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}
