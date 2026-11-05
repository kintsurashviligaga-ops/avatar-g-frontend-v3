/**
 * lib/agent/media/cutawayPlan.ts — from the speaker's lines (./cutawaySpot) to the edit's cutaways: footage found for
 * each line that a picture helps, placed on the MASTER's timeline (./../../services/montage/insertPlan).
 *
 * The speaker's lines are in his clip's own seconds; the master may play that clip from another point (an assembly's
 * intro comes first, its silence is trimmed), so each line is moved onto the master through the shots that play it.
 * A line no shot plays is dropped. A line that already has footage nearby keeps the same footage out (no repeats).
 */
import { outputTimeline } from './montageAsk';
import type { SpottedLine } from './cutawaySpot';
import type { StockPick } from '@/lib/services/stock/pexels';
import { planInserts, type InsertLine } from '@/lib/services/montage/insertPlan';
import type { MontageInsert, MontageShot } from '@/lib/services/montage/montagePlan';

/** A source second of `source` on the master, or null when no shot plays it. */
export function toMaster(shots: ReadonlyArray<MontageShot & { source: number }>, source: number, srcSec: number): number | null {
  for (const t of outputTimeline(shots)) {
    if (t.source !== source) continue;
    if (srcSec >= t.srcStartSec - 1e-6 && srcSec <= t.srcEndSec + 1e-6) return t.outStartSec + (srcSec - t.srcStartSec) / (t.speed || 1);
  }
  return null;
}

/** The speaker: the assembly's body, else the longest video in the edit (manifest index). */
export function speakerOf(shots: ReadonlyArray<MontageShot & { source: number }>, body?: number): number | null {
  if (body !== undefined) return body;
  const len = new Map<number, number>();
  for (const t of outputTimeline(shots)) len.set(t.source, (len.get(t.source) ?? 0) + (t.outEndSec - t.outStartSec));
  let best: number | null = null;
  for (const [s, l] of len) if (best === null || l > (len.get(best) ?? 0)) best = s;
  return best;
}

export interface CutawaySummary {
  /** The cutaways as planned, in order (the card lists them). */
  items: Array<{ startSec: number; endSec: number; text: string; query: string; source: MontageInsert['source']; author?: string; pageUrl?: string }>;
  /** Lines a picture would help that found no footage (they stay on the speaker). */
  missed: Array<{ startSec: number; text: string; query: string }>;
}

export async function planCutaways(input: {
  shots: ReadonlyArray<MontageShot & { source: number }>;
  speaker: number;
  masterSec: number;
  lines: readonly SpottedLine[];
  /** Half the frame across, in pixels: the footage must fill it. */
  minWidth: number;
  orientation: 'landscape' | 'portrait' | 'square';
  search: (query: string, o: { minSec: number; minWidth: number; orientation: 'landscape' | 'portrait' | 'square'; skip: ReadonlySet<number> }) => Promise<StockPick | null>;
  /** Searches at most this many lines (a stock call each). */
  maxSearches?: number;
}): Promise<{ inserts: MontageInsert[]; summary: CutawaySummary }> {
  const onMaster = input.lines
    .filter((l) => l.visual)
    .map((l) => {
      const a = toMaster(input.shots, input.speaker, l.startSec);
      const b = toMaster(input.shots, input.speaker, l.endSec);
      return a !== null && b !== null && b > a ? { ...l, startSec: a, endSec: b } : null;
    })
    .filter((l): l is SpottedLine => l !== null);
  const picks: StockPick[] = [];
  const lines: InsertLine[] = [];
  const missed: CutawaySummary['missed'] = [];
  const skip = new Set<number>();
  const queries: string[] = [];
  for (const l of onMaster.slice(0, input.maxSearches ?? 10)) {
    const pick = await input.search(l.query, { minSec: 1.5, minWidth: input.minWidth, orientation: input.orientation, skip }).catch(() => null);
    if (!pick) { missed.push({ startSec: Number(l.startSec.toFixed(2)), text: l.text, query: l.query }); continue; }
    skip.add(pick.id);
    lines.push({ startSec: l.startSec, endSec: l.endSec, text: l.text, clip: picks.length });
    queries.push(l.query);
    picks.push(pick);
  }
  const planned = planInserts({ masterSec: input.masterSec, lines, clips: picks.map((p) => ({ durationSec: p.durationSec })) });
  const inserts: MontageInsert[] = planned.map((p) => {
    const pick = picks[p.clip]!;
    return {
      url: pick.url, startSec: p.startSec, endSec: p.endSec, clipStartSec: p.clipStartSec, source: 'pexels',
      text: p.text, query: queries[p.line] ?? '', pageUrl: pick.pageUrl, ...(pick.author ? { author: pick.author } : {}),
    };
  });
  return {
    inserts,
    summary: {
      items: inserts.map((x) => ({ startSec: x.startSec, endSec: x.endSec, text: x.text ?? '', query: x.query ?? '', source: x.source, ...(x.author ? { author: x.author } : {}), ...(x.pageUrl ? { pageUrl: x.pageUrl } : {}) })),
      missed,
    },
  };
}
