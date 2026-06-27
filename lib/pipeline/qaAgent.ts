/**
 * lib/pipeline/qaAgent.ts — lightweight clip quality-assurance (Pipeline Iteration).
 *
 * Two fail-open helpers, no new deps:
 *   - validateClipQuality(url): a names-only sanity check on a finished clip URL (HEAD →
 *     status / content-type / content-length). Returns a score + issues; used for logging
 *     and tests.
 *   - keepLiveClips(items): drops ONLY clips whose URL is DEFINITIVELY gone (a hard 403/
 *     404/410 that would make ffmpeg fail the whole stitch) and KEEPS everything else —
 *     200, a timeout, a 5xx, a network blip, anything uncertain. Never empties a non-empty
 *     list. This lets one dead clip URL fall out so the survivors still stitch (partial
 *     salvage) instead of one 404 killing the entire film.
 *
 * NOTE on auto-retry: the film pipeline DISPATCHES clips (returns provider taskRefs that
 * are polled later) rather than awaiting a URL synchronously, so a "regenerate the bad
 * clip" retry can't run at dispatch time. QA therefore runs at ASSEMBLE, where the real
 * URLs exist, and degrades to the existing partial-salvage stitch. Everything here is
 * STRICTLY fail-open: a QA error never removes a clip.
 */
import 'server-only';

export interface ClipQAResult {
  passed: boolean;
  score: number;
  issues: string[];
  clipUrl: string;
}

/** HEAD-probe a finished clip URL and score it. FAIL-OPEN: a probe error scores as a
 *  soft pass (we never reject a clip just because a HEAD request hiccuped). */
export async function validateClipQuality(clipUrl: string, _sceneIndex = 0): Promise<ClipQAResult> {
  const issues: string[] = [];
  let score = 100;
  if (!clipUrl) return { passed: false, score: 0, issues: ['empty url'], clipUrl };
  try {
    const res = await fetch(clipUrl, { method: 'HEAD', signal: AbortSignal.timeout(6_000) });
    if (!res.ok) {
      // 4xx/410 = genuinely gone; 5xx/other = transient → don't hold it against the clip.
      const hard = res.status === 403 || res.status === 404 || res.status === 410;
      return { passed: !hard, score: hard ? 0 : 70, issues: [`HTTP ${res.status}`], clipUrl };
    }
    const ct = res.headers.get('content-type') || '';
    if (ct && !/video|octet-stream|mp4/i.test(ct)) { issues.push(`content-type ${ct}`); score -= 50; }
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > 0 && len < 50_000) { issues.push(`too small: ${len}B`); score -= 40; }
    return { passed: score >= 60, score, issues, clipUrl };
  } catch {
    // network/timeout → FAIL-OPEN: treat as usable (let ffmpeg be the final judge).
    return { passed: true, score: 80, issues: ['probe-skipped'], clipUrl };
  }
}

/** Drop clips whose URL is DEFINITIVELY dead (hard 403/404/410) so a single expired URL
 *  can't fail the whole ffmpeg stitch; keep everything else. Probes in parallel, bounded
 *  by a short timeout. FAIL-OPEN: never returns an empty list when given a non-empty one,
 *  and any probe error keeps the clip. Generic over any item carrying a `url`. */
export async function keepLiveClips<T extends { url: string }>(items: T[]): Promise<T[]> {
  if (!Array.isArray(items) || items.length <= 1) return items; // never risk the only clip
  try {
    const verdicts = await Promise.all(
      items.map(async (it) => {
        try {
          const res = await fetch(it.url, { method: 'HEAD', signal: AbortSignal.timeout(6_000) });
          const dead = res.status === 403 || res.status === 404 || res.status === 410;
          return { it, dead };
        } catch {
          return { it, dead: false }; // fail-open: keep on any probe error
        }
      }),
    );
    const survivors = verdicts.filter((v) => !v.dead).map((v) => v.it);
    const dropped = items.length - survivors.length;
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[qa] dropped ${dropped} dead clip URL(s) before stitch (partial salvage keeps ${survivors.length})`);
    }
    return survivors.length >= 1 ? survivors : items; // never empty a non-empty list
  } catch {
    return items; // any failure → keep everything (fail-open)
  }
}
