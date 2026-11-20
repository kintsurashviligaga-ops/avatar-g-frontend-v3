/**
 * lib/avatar/studio/price.ts — what a Virtual Studio scene costs in credits. Pure, client-safe.
 *
 * Two books, picked by the caller (the route reads NEXT_PUBLIC_PRICING_V8, as lib/music/producer/price does):
 *  - V8 (the 65 % rule, draft #343): credits ≥ ⌈full cost USD × 104.38⌉ (econ.minCredits). The margin gate from #343
 *    (econ.enforceMargin, once the wiring PR lands) is handed the full cost and may only RAISE a price.
 *  - TODAY: Omni turns at the live book's omniClipCredits; the Live presenter is new and has no live price, so it uses
 *    the v8 numbers in both books until v8 launches.
 *
 * FULL COST PER SCENE (#343 lib/billing/margin/cogs, Vertex list prices; ⚠️ the Live line is ESTIMATED until the paid
 * probe, decision D4, measures a recorded take):
 *  - Live presenter: $0.0345 per take (session setup, system prompt, script in, hosting) + $0.00745 per second
 *    (live.avatar: 6,192 video tokens/s × $1/1M, plus audio out) → 30 s ≈ $0.258 → ✦27. Karaoke is free (Live's own
 *    transcript, timing.fromChunks).
 *  - Omni 1.2 Flash: one turn per ≤ 10 s (generate + extends): 720p 5,792 tok/s, 1080p 8,688 tok/s × $12/1M, plus
 *    $0.01125 prompt/photo/thinking per turn. Priced per turn from the v8 clip table (10 s 720p ✦83, 1080p ✦122).
 *    Karaoke needs Chirp word times: $0.016/min.
 *  - Studio-voice dub (a named voice over the Omni mouth): Gemini TTS $0.027/min of audio out + text in.
 *  - A generated background: one 1K image, ✦8 (today ✦5); an upload or the green screen costs nothing.
 */
import { omniClipCredits } from '@/lib/credits/priceBook';
import type { StudioEngine } from './catalog';

export type StudioBook = 'today' | 'v8';
export type OmniRes = '720p' | '1080p';

/** #343 econ.creditsPerUsd(): $1 of full cost needs 104.38 credits for a 65 % gross margin at the 0.08 ₾ floor. */
export const CREDITS_PER_USD = 104.38;

export const STUDIO_COST_USD = {
  liveTake: 0.0345,
  livePerSec: 0.00745,
  omniPerSec: { '720p': 0.0695, '1080p': 0.1043 } as Record<OmniRes, number>,
  omniPerTurn: 0.01125,
  sttPerMin: 0.016,
  ttsPerMin: 0.02725,
  backgroundImage: 0.067,
} as const;

/** v8 Omni clip prices by turn length (docs/v8.1-finance/pricing.v8.json, GG-approved 2026-11-14). */
export const V8_OMNI_TURN: Record<OmniRes, Record<4 | 6 | 8 | 10, number>> = {
  '720p': { 4: 33, 6: 50, 8: 66, 10: 83 },
  '1080p': { 4: 49, 6: 74, 8: 98, 10: 122 },
};
export const BACKGROUND_CREDITS: Record<StudioBook, number> = { today: 5, v8: 8 };

export type MarginGate = (credits: number, costUsd: number) => { credits: number; raised: boolean };
const noGate: MarginGate = (credits) => ({ credits, raised: false });

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
/** Omni renders 4, 6, 8 or 10 s; a turn is billed at the next length up. */
export function omniTurnSec(sec: number): 4 | 6 | 8 | 10 {
  return sec <= 4 ? 4 : sec <= 6 ? 6 : sec <= 8 ? 8 : 10;
}

/** Live presenter: ⌈0.78 × s + 3.6⌉ (30 s ✦27, 10 s ✦12, 40 s ✦35) — at or above ⌈cost × 104.38⌉ for every length. */
export const liveSceneCredits = (sec: number): number => Math.ceil(0.78 * Math.max(1, sec) + 3.6 - 1e-9);
export const liveSceneCostUsd = (sec: number): number => r4(STUDIO_COST_USD.liveTake + STUDIO_COST_USD.livePerSec * Math.max(1, sec));

export const omniTurnCostUsd = (turnSec: 4 | 6 | 8 | 10, res: OmniRes): number => r4(STUDIO_COST_USD.omniPerSec[res] * turnSec + STUDIO_COST_USD.omniPerTurn);

/** Chirp word times for karaoke: at least 1 credit, priced by minutes. */
export const sttCostUsd = (sec: number): number => r4((Math.max(1, sec) / 60) * STUDIO_COST_USD.sttPerMin);
export const sttCredits = (sec: number): number => Math.max(1, Math.ceil(sttCostUsd(sec) * CREDITS_PER_USD - 1e-9));
export const dubCostUsd = (sec: number): number => r4((Math.max(1, sec) / 60) * STUDIO_COST_USD.ttsPerMin);
export const dubCredits = (sec: number): number => Math.max(1, Math.ceil(dubCostUsd(sec) * CREDITS_PER_USD - 1e-9));

export interface SceneQuoteInput {
  engine: StudioEngine;
  /** Estimated (or measured) scene length. */
  sec: number;
  /** Omni only: the turn lengths the scene is said in (omniTurns); default ⌈sec ÷ 10⌉ turns of 10 s. */
  turnSecs?: readonly number[];
  resolution?: OmniRes;
  /** Omni only: a named voice dubbed over the mouth. */
  dub?: boolean;
}

export interface SceneQuote { credits: number; costUsd: number; lines: Array<{ what: string; credits: number }> }

export function quoteScene(q: SceneQuoteInput, book: StudioBook, gate: MarginGate = noGate): SceneQuote {
  const sec = Math.max(1, q.sec);
  if (q.engine === 'live') {
    const credits = liveSceneCredits(sec);
    const costUsd = liveSceneCostUsd(sec);
    const gated = book === 'v8' ? gate(credits, costUsd).credits : credits;
    return { credits: gated, costUsd, lines: [{ what: 'presenter', credits: gated }] };
  }
  const res: OmniRes = q.resolution === '1080p' ? '1080p' : '720p';
  const turns = (q.turnSecs && q.turnSecs.length ? q.turnSecs : Array.from({ length: Math.ceil(sec / 10) }, () => 10)).map(omniTurnSec);
  const lines: SceneQuote['lines'] = [];
  let costUsd = 0;
  let videoCredits = 0;
  for (const t of turns) {
    videoCredits += book === 'v8' ? V8_OMNI_TURN[res][t] : omniClipCredits(res, t);
    costUsd += omniTurnCostUsd(t, res);
  }
  lines.push({ what: `video ${turns.length}× (${turns.join('+')} s, ${res})`, credits: videoCredits });
  const stt = sttCredits(sec);
  costUsd += sttCostUsd(sec);
  lines.push({ what: 'karaoke timing', credits: stt });
  let credits = videoCredits + stt;
  if (q.dub) {
    const d = dubCredits(sec);
    costUsd += dubCostUsd(sec);
    credits += d;
    lines.push({ what: 'studio voice', credits: d });
  }
  costUsd = r4(costUsd);
  return { credits: book === 'v8' ? gate(credits, costUsd).credits : credits, costUsd, lines };
}

export interface PresentationQuote {
  scenes: SceneQuote[];
  background: number;
  total: number;
  costUsd: number;
}

export function quotePresentation(
  scenes: readonly SceneQuoteInput[],
  opts: { book: StudioBook; generateBackground?: boolean; gate?: MarginGate },
): PresentationQuote {
  const quotes = scenes.map((s) => quoteScene(s, opts.book, opts.gate));
  const background = opts.generateBackground ? BACKGROUND_CREDITS[opts.book] : 0;
  const costUsd = r4(quotes.reduce((s, q) => s + q.costUsd, 0) + (opts.generateBackground ? STUDIO_COST_USD.backgroundImage : 0));
  return { scenes: quotes, background, total: quotes.reduce((s, q) => s + q.credits, 0) + background, costUsd };
}

/** The headline price the Studio shows: one 30 s scene. */
export function price30s(engine: StudioEngine, book: StudioBook, resolution: OmniRes = '720p'): number {
  return quoteScene({ engine, sec: 30, resolution, turnSecs: engine === 'omni' ? [10, 10, 10] : undefined }, book).credits;
}
