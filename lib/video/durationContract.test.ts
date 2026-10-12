/** @jest-environment node */
/**
 * Video Core v1.0 — §4 the exact duration engine: requested · native · final · trim, frames at 30 fps, and a refusal
 * instead of a shorter film. Written against the register: "60 → 64", "29.7 → 32", "70 → 72" (the nearest stop sold as
 * the length; lib/video/duration snapVideoSeconds still does that for the slider) and "240 → 96" (the film ceiling).
 */
import { CLOSED_CAPABILITIES } from './createPanel';
import { snapVideoSeconds } from './duration';
import { joinOverlaps } from '@/lib/orchestrator/ffmpeg-filtergraph';
import {
  JOIN_OVERLAP_SEC, VIDEO_FPS, activePlan, describeDurationBlock, describeDurationPlan, describeFinalCutRefusal, finalCutForAssemble, framesFor,
  joinOverlapFor, nativeGridSeconds, openMaxSeconds, planFinalDuration, quantizeToFrames,
} from './durationContract';

const OPEN = { longform: true, maxSeconds: 240 };

describe('frames at 30 fps (AC-04, AC-05)', () => {
  test.each<[number, number]>([[24, 720], [29.7, 891], [60, 1800], [70, 2100], [240, 7200], [4, 120], [7.5, 225]])('%s s = %s frames', (sec, frames) => {
    expect(framesFor(sec)).toBe(frames);
  });
  test('quantized to whole frames', () => {
    expect(VIDEO_FPS).toBe(30);
    expect(quantizeToFrames(29.7)).toBe(29.7);
    expect(quantizeToFrames(29.713)).toBe(29.7);
    expect(quantizeToFrames(60.004)).toBe(60);
  });
});

describe('the native grid is the smallest length NOT SHORTER than the request (ceil), where the slider snaps to the nearest', () => {
  test.each<[number, number, number]>([
    // requested, native (ceil), slider (nearest, the old reading)
    [5, 6, 6], [7.5, 8, 8], [9, 16, 8], [24, 24, 24], [29.7, 32, 32], [60, 64, 64], [65, 72, 64], [70, 72, 72], [96, 96, 96], [100, 104, 104], [240, 240, 240],
  ])('%s s → native %s s (slider would say %s s)', (req, native, slider) => {
    expect(nativeGridSeconds(req)).toBe(native);
    expect(snapVideoSeconds(req)).toBe(slider);
    expect(native).toBeGreaterThanOrEqual(req);
  });
});

describe('planFinalDuration: requested · native · final · trim', () => {
  test('60 s: rendered 64 (8 × 8 s), delivered 60 (1800 frames), 4 s trimmed — never "64"', () => {
    const v = planFinalDuration(60, CLOSED_CAPABILITIES);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.plan).toMatchObject({ requestedSec: 60, nativeSec: 64, sceneCount: 8, clipSec: 8, finalSec: 60, finalFrames: 1800, trimSec: 4, route: 'film', deviation: 'trim' });
  });

  test('29.7 s: rendered 32 (4 scenes), delivered 29.7 = 891 frames — never "7", never "32"', () => {
    const v = planFinalDuration(29.7, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 32, sceneCount: 4, finalSec: 29.7, finalFrames: 891, trimSec: 2.3, deviation: 'trim' });
  });

  test('70 s: rendered 72 (9 scenes), delivered 70 (2100 frames), 2 s trimmed', () => {
    const v = planFinalDuration(70, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 72, sceneCount: 9, finalSec: 70, finalFrames: 2100, trimSec: 2 });
  });

  test('65 s is rendered 72 and trimmed to 65, not cut to 64', () => {
    const v = planFinalDuration(65, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 72, finalSec: 65, finalFrames: 1950, trimSec: 7 });
  });

  test('on the grid there is no deviation: 24 s = 3 scenes = 720 frames; 8 s = one clip', () => {
    const a = planFinalDuration(24, CLOSED_CAPABILITIES);
    if (!a.ok) throw new Error(a.reason);
    expect(a.plan).toMatchObject({ nativeSec: 24, sceneCount: 3, finalSec: 24, finalFrames: 720, trimSec: 0, deviation: 'none' });
    const b = planFinalDuration(8, CLOSED_CAPABILITIES);
    if (!b.ok) throw new Error(b.reason);
    expect(b.plan).toMatchObject({ nativeSec: 8, sceneCount: 1, clipSec: 8, route: 'single', deviation: 'none' });
  });

  test('a single clip: 5 s is one 6 s clip trimmed to 5 (150 frames)', () => {
    const v = planFinalDuration(5, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 6, sceneCount: 1, clipSec: 6, finalSec: 5, finalFrames: 150, trimSec: 1, route: 'single' });
  });
});

describe('a length the open pipelines cannot make is a refusal with the reason, never a shorter film (AC-06)', () => {
  test('240 s with long-form closed: longform_closed, longest today 96 s', () => {
    const v = planFinalDuration(240, CLOSED_CAPABILITIES);
    expect(v).toEqual({ ok: false, reason: 'longform_closed', requestedSec: 240, maxSec: 96 });
    expect(describeDurationBlock(v as Extract<typeof v, { ok: false }>, 'en')).toMatch(/4:00 film needs the long-form pipeline.*longest film today is 1:36.*nothing shorter/i);
  });

  test('100 s with long-form closed: refused too (it would need 104 s = 13 scenes)', () => {
    expect(planFinalDuration(100, CLOSED_CAPABILITIES)).toMatchObject({ ok: false, reason: 'longform_closed' });
  });

  test('240 s with long-form open: 30 scenes, 7200 frames, no trim', () => {
    const v = planFinalDuration(240, OPEN);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 240, sceneCount: 30, finalFrames: 7200, trimSec: 0, route: 'longform' });
  });

  test('long-form open but capped by the server: 200 s with maxSeconds 160 is refused', () => {
    expect(planFinalDuration(200, { longform: true, maxSeconds: 160 })).toMatchObject({ ok: false, reason: 'longform_closed', maxSec: 160 });
    expect(openMaxSeconds({ longform: true, maxSeconds: 160 })).toBe(160);
    expect(openMaxSeconds(CLOSED_CAPABILITIES)).toBe(96);
  });

  test('under 4 s and over 4 min', () => {
    expect(planFinalDuration(2, CLOSED_CAPABILITIES)).toMatchObject({ ok: false, reason: 'too_short' });
    expect(planFinalDuration(300, CLOSED_CAPABILITIES)).toMatchObject({ ok: false, reason: 'too_long' });
    expect(planFinalDuration(NaN, CLOSED_CAPABILITIES)).toMatchObject({ ok: false, reason: 'too_short' });
  });
});

describe('the plan is said before the price (§4.3)', () => {
  test('Georgian, English, Russian name the three lengths and the trim', () => {
    const v = planFinalDuration(60, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(describeDurationPlan(v.plan, 'ka')).toBe('მოთხოვნილი 1:00 · რენდერი 1:04 (8 × 8წმ) · საბოლოო 1:00 (1800 კადრი, 4წმ მოიჭრება; ფასი 1:04-ზე)');
    expect(describeDurationPlan(v.plan, 'en')).toBe('Requested 1:00 · Rendered 1:04 (8 × 8s) · Final 1:00 (1800 frames, 4s trimmed; priced at 1:04)');
    expect(describeDurationPlan(v.plan, 'ru')).toBe('Запрошено 1:00 · Рендер 1:04 (8 × 8с) · Итог 1:00 (1800 кадров, обрезка 4с; цена за 1:04)');
  });

  test('a fraction is kept as said: 29.7 s', () => {
    const v = planFinalDuration(29.7, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(describeDurationPlan(v.plan, 'en')).toBe('Requested 29.7s · Rendered 32s (4 × 8s) · Final 29.7s (891 frames, 2.3s trimmed; priced at 32s)');
  });

  test('on the grid: one length', () => {
    const v = planFinalDuration(24, CLOSED_CAPABILITIES);
    if (!v.ok) throw new Error(v.reason);
    expect(describeDurationPlan(v.plan, 'en')).toBe('Length 24s (3 × 8s) · 720 frames');
  });
});

describe('activePlan: the panel says the three lengths only while the request still matches its grid', () => {
  test('60 s asked, panel on 64 → the plan; panel moved to 24 → nothing; no request → nothing', () => {
    expect(activePlan(60, 64, CLOSED_CAPABILITIES)).toMatchObject({ requestedSec: 60, nativeSec: 64, finalSec: 60 });
    expect(activePlan(60, 24, CLOSED_CAPABILITIES)).toBeNull();
    expect(activePlan(null, 64, CLOSED_CAPABILITIES)).toBeNull();
    expect(activePlan(undefined, 64, CLOSED_CAPABILITIES)).toBeNull();
  });
  test('an on-grid request still has a plan (no trim), a refused one has none', () => {
    expect(activePlan(24, 24, CLOSED_CAPABILITIES)).toMatchObject({ deviation: 'none', finalFrames: 720 });
    expect(activePlan(240, 96, CLOSED_CAPABILITIES)).toBeNull();
  });
});

describe('finalCutForAssemble: the server checks the final against the clips it has (AC-04 · §8)', () => {
  test('8 × 8 s clips (64 s) cut to 60 s = 1800 frames, 4 s trimmed', () => {
    expect(finalCutForAssemble(64, 60)).toEqual({ ok: true, finalSec: 60, finalFrames: 1800, trimSec: 4 });
  });
  test('4 × 8 s (32 s) cut to 29.7 s = 891 frames; 2.3 s trimmed', () => {
    expect(finalCutForAssemble(32, 29.7)).toEqual({ ok: true, finalSec: 29.7, finalFrames: 891, trimSec: 2.3 });
  });
  test('the final equal to the master is a cut of nothing (it only pins the frame count)', () => {
    expect(finalCutForAssemble(24, 24)).toEqual({ ok: true, finalSec: 24, finalFrames: 720, trimSec: 0 });
  });
  test('refusals: longer than the master (a clip was lost), a whole scene trimmed, off the frame grid, too short, garbage', () => {
    expect(finalCutForAssemble(24, 29.7)).toMatchObject({ ok: false, reason: 'longer_than_master', masterSec: 24, finalSec: 29.7 });
    expect(finalCutForAssemble(72, 60)).toMatchObject({ ok: false, reason: 'trim_exceeds_scene' }); // 12 s cut = a scene too many was rendered
    expect(finalCutForAssemble(32, 29.713)).toMatchObject({ ok: false, reason: 'off_frame_grid' });
    expect(finalCutForAssemble(8, 2)).toMatchObject({ ok: false, reason: 'too_short' });
    expect(finalCutForAssemble(8, 'eight')).toMatchObject({ ok: false, reason: 'not_a_number', finalSec: null });
    expect(finalCutForAssemble(NaN, 8)).toMatchObject({ ok: false, reason: 'not_a_number' });
  });
  test('the legacy 30 s pad of a short 4-scene film is cut back to its real length (24 s of 6 s clips)', () => {
    expect(finalCutForAssemble(30, 24)).toEqual({ ok: true, finalSec: 24, finalFrames: 720, trimSec: 6 });
  });
});

describe('soft joins shorten the stitched master, so the plan counts scenes from the STITCH (§4 · §7)', () => {
  const SOFT = { joinOverlapSec: 1 };
  test('the overlap of one soft join is the filtergraph\'s, and a cut takes nothing', () => {
    expect(JOIN_OVERLAP_SEC).toBe(1);
    expect(joinOverlaps(3, 'crossfade', undefined, 30)).toEqual([JOIN_OVERLAP_SEC, JOIN_OVERLAP_SEC]);
    expect(joinOverlapFor('cut')).toBe(0);
    expect(joinOverlapFor(undefined)).toBe(0);
    expect(joinOverlapFor('crossfade')).toBe(1);
    expect(joinOverlapFor('dissolve')).toBe(1);
  });
  test('60 s with crossfades: 9 scenes (72 s rendered) stitch to 64 s, cut to 60 = 1800 frames — 8 scenes would be 57 s', () => {
    const v = planFinalDuration(60, CLOSED_CAPABILITIES, SOFT);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 72, sceneCount: 9, joinOverlapSec: 1, stitchSec: 64, finalSec: 60, finalFrames: 1800, trimSec: 4, deviation: 'trim' });
    expect(nativeGridSeconds(60, 1)).toBe(72);
    expect(nativeGridSeconds(60)).toBe(64);
  });
  test('29.7 s with crossfades: 5 scenes (40 s) stitch to 36, cut to 29.7 = 891 frames; 24 s on the grid is still a trim', () => {
    const a = planFinalDuration(29.7, CLOSED_CAPABILITIES, SOFT);
    if (!a.ok) throw new Error(a.reason);
    expect(a.plan).toMatchObject({ nativeSec: 40, sceneCount: 5, stitchSec: 36, finalSec: 29.7, finalFrames: 891, trimSec: 6.3 });
    const b = planFinalDuration(24, CLOSED_CAPABILITIES, SOFT);
    if (!b.ok) throw new Error(b.reason);
    expect(b.plan).toMatchObject({ nativeSec: 32, sceneCount: 4, stitchSec: 29, finalSec: 24, finalFrames: 720, trimSec: 5, deviation: 'trim' });
  });
  test('a request that IS the stitch has no trim: 64 s = 9 × 8 − 8 × 1', () => {
    const v = planFinalDuration(64, CLOSED_CAPABILITIES, SOFT);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan).toMatchObject({ nativeSec: 72, sceneCount: 9, stitchSec: 64, trimSec: 0, deviation: 'none' });
    expect(describeDurationPlan(v.plan, 'en')).toBe('Length 1:04 (9 × 8s · 1s joins = 1:04) · 1920 frames');
  });
  test('a single clip has no join; the long-form concat has no overlap', () => {
    const one = planFinalDuration(5, CLOSED_CAPABILITIES, SOFT);
    if (!one.ok) throw new Error(one.reason);
    expect(one.plan).toMatchObject({ route: 'single', nativeSec: 6, joinOverlapSec: 0, stitchSec: 6, trimSec: 1 });
    const lf = planFinalDuration(240, OPEN, SOFT);
    if (!lf.ok) throw new Error(lf.reason);
    expect(lf.plan).toMatchObject({ route: 'longform', nativeSec: 240, sceneCount: 30, joinOverlapSec: 0, stitchSec: 240, trimSec: 0 });
  });
  test('with crossfades the film ceiling is 85 s (12 × 8 − 11): 85 fits, 86 and 90 are refused with the reason', () => {
    const ok = planFinalDuration(85, CLOSED_CAPABILITIES, SOFT);
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.plan).toMatchObject({ nativeSec: 96, sceneCount: 12, stitchSec: 85, trimSec: 0 });
    expect(planFinalDuration(86, CLOSED_CAPABILITIES, SOFT)).toEqual({ ok: false, reason: 'joins_exceed_film', requestedSec: 86, maxSec: 85, joinOverlapSec: 1 });
    const v = planFinalDuration(90, CLOSED_CAPABILITIES, SOFT);
    expect(v).toMatchObject({ ok: false, reason: 'joins_exceed_film', maxSec: 85 });
    expect(describeDurationBlock(v as Extract<typeof v, { ok: false }>, 'en')).toBe('A 1:30 film with 1s joins needs more than 12 scenes. The longest film with these joins is 1:25; with cuts between the scenes, 1:36.');
    // with cuts the same 90 s is a 96 s film
    expect(planFinalDuration(90, CLOSED_CAPABILITIES)).toMatchObject({ ok: true, plan: { nativeSec: 96, stitchSec: 96, trimSec: 6 } });
  });
  test('the plan line says what the scenes stitch to', () => {
    const v = planFinalDuration(60, CLOSED_CAPABILITIES, SOFT);
    if (!v.ok) throw new Error(v.reason);
    expect(describeDurationPlan(v.plan, 'en')).toBe('Requested 1:00 · Rendered 1:12 (9 × 8s · 1s joins = 1:04) · Final 1:00 (1800 frames, 4s trimmed; priced at 1:12)');
    expect(describeDurationPlan(v.plan, 'ka')).toBe('მოთხოვნილი 1:00 · რენდერი 1:12 (9 × 8წმ · 1წმ გადასვლები = 1:04) · საბოლოო 1:00 (1800 კადრი, 4წმ მოიჭრება; ფასი 1:12-ზე)');
    expect(describeDurationPlan(v.plan, 'ru')).toBe('Запрошено 1:00 · Рендер 1:12 (9 × 8с · стыки 1с = 1:04) · Итог 1:00 (1800 кадров, обрезка 4с; цена за 1:12)');
  });
  test('activePlan follows the joins: 60 s with crossfades lives on the 72 s panel, not the 64 s one', () => {
    expect(activePlan(60, 72, CLOSED_CAPABILITIES, SOFT)).toMatchObject({ stitchSec: 64, finalSec: 60 });
    expect(activePlan(60, 64, CLOSED_CAPABILITIES, SOFT)).toBeNull();
    expect(activePlan(60, 64, CLOSED_CAPABILITIES)).toMatchObject({ stitchSec: 64, finalSec: 60 });
  });
  test('the render-time refusal, said: 8 crossfaded scenes stitch to 57 s, a 60 s request cannot be cut from them', () => {
    const v = finalCutForAssemble(57, 60);
    if (v.ok) throw new Error('expected a refusal');
    expect(describeFinalCutRefusal(v, 'en')).toBe('The board stitches to 57s with these joins; 1:00 cannot be cut from it (it is longer than the board). Pick a length on the panel to drop the request, or change the joins.');
    expect(describeFinalCutRefusal(v, 'ka')).toMatch(/^დაფა ამ გადასვლებით 57წმ-ზე იკვრება; 1:00 მისგან ვერ მოიჭრება \(ის დაფაზე გრძელია\)\./);
    const w = finalCutForAssemble(72, 60);
    if (w.ok) throw new Error('expected a refusal');
    expect(describeFinalCutRefusal(w, 'ru')).toMatch(/целую сцену/);
  });
});
