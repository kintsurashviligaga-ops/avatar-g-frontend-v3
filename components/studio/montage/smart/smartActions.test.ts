/**
 * Agent G's smart edit run on the edit (Phase 8.7 PR C), mocked fetch: no network, no ffmpeg, nothing charged.
 *
 *   GG's sentence → pauses cut, clips laid on the beat, captions PREPARED (never bought by the run)
 *   a failing route does not stop the other ops · no music → `needs_music` · AI trim is `not_built`
 *   glitch lands on the cuts the pauses and the beat made
 */
import { parseSmartSentence } from '@/lib/services/montage/smart/sentence';
import type { SilencePlan } from '@/lib/services/montage/smart/silence';
import { emptyEdit, type Clip, type Edit, type MediaSource } from '../project';
import { emptySmart } from './smartEdit';
import { runSmartOps, type Fetcher } from './smartActions';

const src = (id: string, over: Partial<MediaSource> = {}): MediaSource => ({ id, kind: 'video', name: id, previewUrl: `blob:${id}`, ref: `uploads/u1/${id}.mp4`, status: 'ready', durationSec: 20, ...over });
const clip = (id: string, sourceId: string, startSec: number, endSec: number): Clip => ({ id, sourceId, startSec, endSec, muted: false, transition: 'cut', caption: '', captionPos: 'bottom' });
const editOf = (clips: Clip[], over: Partial<Edit> = {}): Edit => ({ ...emptyEdit('9:16'), clips, ...over });

const plan = (from: number, to: number): SilencePlan => ({
  cuts: [{ startSec: from + 2, endSec: from + 3 }], kept: [{ startSec: from, endSec: from + 2 }, { startSec: from + 3, endSec: to }],
  count: 1, removedSec: 1, durationSec: to - from, resultSec: to - from - 1, fillers: 0, untouched: false,
});

type Route = (body: Record<string, unknown>) => { status: number; j: unknown };
function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    const r = routes[url]?.(body) ?? { status: 404, j: { error: 'not found' } };
    return { ok: r.status < 400, status: r.status, json: async () => r.j } as Response;
  }) as unknown as Fetcher;
  return { f, calls };
}

const sources = { a: src('a'), b: src('b'), m: src('m', { kind: 'audio', durationSec: 60 }) };
const grid = { bpm: 120, periodSec: 0.5, phaseSec: 0, confidence: 0.8 };

describe('runSmartOps', () => {
  it("GG's sentence: pauses cut, clips on the beat, captions waiting for the person's tap (no captions call)", async () => {
    const { ops } = parseSmartSentence('Take these 3 clips, cut the boring parts, add Georgian captions, and put the music on the beat');
    const { f, calls } = fakeFetch({
      '/api/v2/montage/smart/silence': (b) => ({ status: 200, j: { plan: plan(Number(b.startSec), Number(b.endSec)) } }),
      '/api/v2/montage/smart/beat': () => ({ status: 200, j: { grid, durationSec: 60 } }),
    });
    let n = 0;
    const r = await runSmartOps(f, ops, editOf([clip('1', 'a', 0, 8), clip('2', 'b', 0, 8)], { musicId: 'm' }), sources, emptySmart(), () => `n${++n}`);

    expect(r.steps.map((s) => [s.op, s.status])).toEqual([['removeSilence', 'done'], ['beatSync', 'done'], ['captions', 'waits_for_tap']]);
    expect(r.steps[0].detail).toBe('2|2');
    expect(r.steps[2].detail).toBe('ka');
    expect(r.captionsOp).toEqual({ op: 'captions', lang: 'ka', style: 'bold-word' });
    expect(r.smart.grid).toEqual(grid);
    expect(calls.map((c) => c.url)).toEqual(['/api/v2/montage/smart/silence', '/api/v2/montage/smart/silence', '/api/v2/montage/smart/beat']);
    expect(calls.some((c) => c.url.includes('captions'))).toBe(false);
    expect(calls[0].body).toMatchObject({ path: 'uploads/u1/a.mp4', startSec: 0, endSec: 8, sensitivity: 'normal' });
    // Four kept pieces from two clips; every piece is still on the timeline after the beat pass.
    expect(r.edit.clips.length).toBeGreaterThanOrEqual(4);
  });

  it('a failing route does not stop the rest; no music → needs_music; AI trim is stated as not built', async () => {
    const { f } = fakeFetch({ '/api/v2/montage/smart/silence': () => ({ status: 502, j: { error: 'down' } }) });
    const ops = [{ op: 'removeSilence', sensitivity: 'normal', fillers: true }, { op: 'aiTrim' }, { op: 'beatSync' }, { op: 'aspect', aspect: '16:9' }] as const;
    const e0 = editOf([clip('1', 'a', 0, 8)]);
    const r = await runSmartOps(f, ops, e0, sources, emptySmart());
    expect(r.steps.map((s) => [s.op, s.status])).toEqual([['removeSilence', 'failed'], ['aiTrim', 'not_built'], ['beatSync', 'needs_music'], ['aspect', 'done']]);
    expect(r.edit.clips).toEqual(e0.clips);
    expect(r.edit.aspect).toBe('16:9');
  });

  it('nothing to cut → nothing; glitch lands on the cuts the pauses made', async () => {
    const quiet = fakeFetch({ '/api/v2/montage/smart/silence': () => ({ status: 200, j: { plan: { ...plan(0, 8), untouched: true } } }) });
    const r0 = await runSmartOps(quiet.f, [{ op: 'removeSilence', sensitivity: 'low', fillers: false }], editOf([clip('1', 'a', 0, 8)]), sources, emptySmart());
    expect(r0.steps[0].status).toBe('nothing');

    const { f } = fakeFetch({ '/api/v2/montage/smart/silence': (b) => ({ status: 200, j: { plan: plan(Number(b.startSec), Number(b.endSec)) } }) });
    let n = 0;
    const r = await runSmartOps(f, [{ op: 'removeSilence', sensitivity: 'normal', fillers: true }, { op: 'transition', style: 'glitch' }], editOf([clip('1', 'a', 0, 8)]), sources, emptySmart(), () => `n${++n}`);
    expect(r.edit.clips).toHaveLength(2);
    expect(r.smart.tracks.effects).toHaveLength(1);
    expect(r.smart.tracks.effects[0].kind).toBe('glitch');
  });

  it('a non-glitch transition goes on every clip but the first', async () => {
    const { f } = fakeFetch({});
    const r = await runSmartOps(f, [{ op: 'transition', style: 'crossfade' }], editOf([clip('1', 'a', 0, 2), clip('2', 'b', 0, 2), clip('3', 'a', 4, 6)]), sources, emptySmart());
    expect(r.edit.clips.map((c) => c.transition)).toEqual(['cut', 'crossfade', 'crossfade']);
  });
});
