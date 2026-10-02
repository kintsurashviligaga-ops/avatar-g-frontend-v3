/** @jest-environment node */
/**
 * The Create button's number is the bill: 30 s → 5, 60 s → 8, 90 s → 12 credits, "Full song" at the 90 s tier, a cover
 * flat at 30 s. The route's own `billSeconds` expression is pinned from its source, so the two cannot drift apart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditCostFor, CREDIT_COSTS } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import { MUSIC_DURATIONS, isCoverRun, musicBilledSeconds, musicQuote } from './musicQuote';

test('30 / 60 / 90 s quote exactly the shared price list (5 / 8 / 12) — and the button reads the same function', () => {
  expect(musicQuote({ duration: 30 })).toBe(5);
  expect(musicQuote({ duration: 60 })).toBe(8);
  expect(musicQuote({ duration: 90 })).toBe(12);
  expect(musicQuote({ duration: 30 })).toBe(CREDIT_COSTS.music_30s);
  expect(musicQuote({ duration: 60 })).toBe(CREDIT_COSTS.music_60s);
  expect(musicQuote({ duration: 90 })).toBe(CREDIT_COSTS.music_90s);
  for (const d of [30, 60, 90]) expect(musicQuote({ duration: d })).toBe(quoteCredits({ tool: 'music', seconds: d }));
});

test('"Full song" (0) is billed at the 90 s tier, as the route does', () => {
  expect(musicBilledSeconds({ duration: 0 })).toBe(90);
  expect(musicQuote({ duration: 0 })).toBe(12);
});

test('a cover is a flat 30 s whatever the length picker says', () => {
  for (const d of [0, 30, 60, 90]) {
    expect(musicBilledSeconds({ duration: d, cover: true })).toBe(30);
    expect(musicQuote({ duration: d, cover: true })).toBe(5);
  }
});

test('every length the screen offers quotes a positive whole number of credits, ascending with length', () => {
  const prices = MUSIC_DURATIONS.map((d) => musicQuote({ duration: d }));
  expect(prices.every((p) => Number.isInteger(p) && p > 0)).toBe(true);
  expect(prices).toEqual([5, 8, 12, 12]);
});

test('a cover run needs an attached track, in cover mode, with no trained voice overriding it', () => {
  const base = { hasAudio: true, audioMode: 'cover' as const, trainedVoiceActive: false };
  expect(isCoverRun(base)).toBe(true);
  expect(isCoverRun({ ...base, hasAudio: false })).toBe(false);
  expect(isCoverRun({ ...base, audioMode: 'voice' })).toBe(false); // a cloned voice sings: billed by length
  expect(isCoverRun({ ...base, trainedVoiceActive: true })).toBe(false); // the trained-voice path sends no reference
});

test('the route bills `audioReference ? 30 : durationSec === 0 ? 90 : durationSec` — pinned from its source', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/ai/music/route.ts'), 'utf8');
  expect(route).toContain('const billSeconds = audioReference ? 30 : (durationSec === 0 ? 90 : durationSec);');
  // …and charges `creditCostFor('music', { seconds: billSeconds })`, the function the quote is built from.
  expect(route).toContain("creditCostFor('music', { seconds: billSeconds })");
  expect(creditCostFor('music', { seconds: musicBilledSeconds({ duration: 60 }) })).toBe(musicQuote({ duration: 60 }));
});
