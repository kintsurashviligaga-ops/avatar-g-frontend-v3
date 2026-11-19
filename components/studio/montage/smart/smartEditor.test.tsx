/**
 * The Smart Editor in the montage editor (Phase 8.7 PR B), mocked: no network, no ffmpeg.
 *
 *   smartEdit   caption windows per source · captions laid on the CUT edit · silence pieces (12-piece cap) · beat ·
 *               glitch on every cut · templates · the export's `smart` field
 *   SmartPanel  the price is on the button before the tap · captions / pauses / beat call their routes and apply
 *   SmartLanes  drag moves an item and snaps to a clip boundary
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { emptyTracks, type SmartTracks } from '@/lib/services/montage/smart/timeline';
import type { SilencePlan } from '@/lib/services/montage/smart/silence';
import { emptyEdit, type Clip, type Edit, type MediaSource } from '../project';
import {
  applyBeat, applySilence, applyTemplate, captionSources, captionsOnEdit, cutTimes, emptySmart, glitchEveryCut, smartRenderField, type SmartState,
} from './smartEdit';
import { SmartPanel } from './SmartPanel';
import { SmartLanes } from './SmartLanes';

const src = (id: string, over: Partial<MediaSource> = {}): MediaSource => ({ id, kind: 'video', name: id, previewUrl: `blob:${id}`, ref: `uploads/u1/${id}.mp4`, status: 'ready', durationSec: 60, ...over });
const clip = (id: string, sourceId: string, startSec: number, endSec: number, over: Partial<Clip> = {}): Clip => ({ id, sourceId, startSec, endSec, muted: false, transition: 'cut', caption: '', captionPos: 'bottom', ...over });
const editOf = (clips: Clip[], over: Partial<Edit> = {}): Edit => ({ ...emptyEdit('9:16'), clips, ...over });

describe('smartEdit', () => {
  const sources = { a: src('a'), b: src('b', { ref: 'https://cdn.test/b.mp4' }), p: src('p', { kind: 'image' }), up: src('up', { status: 'uploading' }) };

  it('one caption window per video source (the union of its clips); photos, uploads and muted clips left out', () => {
    const e = editOf([clip('1', 'a', 2, 6), clip('2', 'b', 0, 4), clip('3', 'a', 10, 12), clip('4', 'p', 0, 3), clip('5', 'up', 0, 3), clip('6', 'b', 20, 25, { muted: true })]);
    expect(captionSources(e, sources)).toEqual([
      { sourceId: 'a', path: 'uploads/u1/a.mp4', startSec: 2, endSec: 12 },
      { sourceId: 'b', url: 'https://cdn.test/b.mp4', startSec: 0, endSec: 4 },
    ]);
  });

  it('captions follow the cut edit; none when the clips\' own sound is off', () => {
    const caps = { lang: 'ka' as const, style: 'bold-word' as const, wordsBySource: { a: [{ text: 'ერთი', startSec: 3, endSec: 3.4 }, { text: 'ორი', startSec: 11, endSec: 11.5 }] } };
    const e = editOf([clip('1', 'a', 10, 12), clip('2', 'a', 2, 6)]);
    expect(captionsOnEdit(e, caps).map((w) => [w.text, w.startSec])).toEqual([['ორი', 1], ['ერთი', 3]]);
    expect(captionsOnEdit({ ...e, originalSound: false }, caps)).toEqual([]);
  });

  it('silence: a clip becomes its kept pieces, hard cuts, caption on the first; refused past 12 pieces', () => {
    const plan: SilencePlan = { cuts: [{ startSec: 3, endSec: 4 }], kept: [{ startSec: 0, endSec: 3 }, { startSec: 4, endSec: 8 }], count: 1, removedSec: 1, durationSec: 8, resultSec: 7, fillers: 0, untouched: false };
    const e = editOf([clip('1', 'a', 0, 8, { caption: 'hi', transition: 'fade' })]);
    let n = 0;
    const r = applySilence(e, '1', plan, () => `n${++n}`);
    expect(r.ok && r.value.clips.map((c) => [c.id, c.startSec, c.endSec, c.transition, c.caption])).toEqual([['1', 0, 3, 'fade', 'hi'], ['n1', 4, 8, 'cut', '']]);
    const full = editOf(Array.from({ length: 12 }, (_, i) => clip(`c${i}`, 'a', 0, 8)));
    expect(applySilence(full, 'c0', plan, () => 'x')).toEqual({ ok: false, reason: 'too_many_pieces' });
    expect(applySilence(e, '1', { ...plan, untouched: true }, () => 'x')).toEqual({ ok: false, reason: 'nothing' });
  });

  it('beat: windows from the planner, a sped-up window shortened to the same screen time, the song start set', () => {
    const e = editOf([clip('1', 'a', 0, 10), clip('2', 'b', 0, 10)]);
    const out = applyBeat(e, [{ id: '1', sourceId: 'a', startSec: 1, endSec: 3 }, { id: '2', sourceId: 'b', startSec: 0, endSec: 4, speed: 2 }], 12);
    expect(out.clips.map((c) => [c.id, c.startSec, c.endSec])).toEqual([['1', 1, 3], ['2', 0, 2]]);
    expect(out.musicStartSec).toBe(12);
  });

  it('glitch on every cut, replacing an earlier set; templates set format, transitions and caption look', () => {
    const e = editOf([clip('1', 'a', 0, 2), clip('2', 'a', 2, 5), clip('3', 'a', 5, 6)]);
    expect(cutTimes(e)).toEqual([2, 5]);
    const s1: SmartState = { ...emptySmart(), tracks: glitchEveryCut(emptySmart(), e) };
    expect(s1.tracks.effects).toHaveLength(2);
    expect(glitchEveryCut(s1, e).effects).toHaveLength(2);
    const caps = { lang: 'ka' as const, style: 'standard' as const, wordsBySource: {} };
    const r = applyTemplate(e, { ...emptySmart(), captions: caps }, 'youtube');
    expect(r.edit.aspect).toBe('16:9');
    expect(r.edit.clips.map((c) => c.transition)).toEqual(['cut', 'crossfade', 'crossfade']);
    expect(r.state.captions?.style).toBe('standard');
    expect(r.state.template).toBe('youtube');
  });

  it('the export sends `smart` only when there is something to lay', () => {
    const e = editOf([clip('1', 'a', 0, 4)]);
    expect(smartRenderField(emptySmart(), e)).toBeNull();
    const s: SmartState = { ...emptySmart(), template: 'tiktok', captions: { lang: 'en', style: 'karaoke', pos: 'middle', wordsBySource: { a: [{ text: 'hi', startSec: 1, endSec: 1.3 }] } } };
    expect(smartRenderField(s, e)).toEqual({ tracks: emptyTracks(), captions: { words: [{ text: 'hi', startSec: 1, endSec: 1.3 }], style: 'karaoke', pos: 'middle' }, template: 'tiktok' });
  });
});

// ── SmartPanel ──────────────────────────────────────────────────────────────────────────────────────────────────

function Harness({ fetcher, initial, sources }: { fetcher: typeof fetch; initial: Edit; sources: Record<string, MediaSource> }) {
  const [edit, setEdit] = useState(initial);
  const [smart, setSmart] = useState<SmartState>(emptySmart);
  return (
    <>
      <SmartPanel locale="en" edit={edit} sources={sources} smart={smart} playheadSec={1} onEdit={(fn) => setEdit(fn)} onSmart={setSmart} onDone={() => undefined} fetcher={fetcher} />
      <output data-testid="h-clips">{edit.clips.map((c) => `${c.id}:${c.startSec}-${c.endSec}`).join(',')}</output>
      <output data-testid="h-words">{smart.captions ? Object.values(smart.captions.wordsBySource).flat().map((w) => w.text).join(' ') : ''}</output>
      <output data-testid="h-fx">{smart.tracks.effects.map((f) => f.kind).join(',')}</output>
      <output data-testid="h-text">{smart.tracks.texts.map((x) => x.text).join(',')}</output>
    </>
  );
}

const respond = (j: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => j } as Response);

describe('SmartPanel', () => {
  const sources = { a: src('a'), m: src('m', { kind: 'audio', durationSec: 30 }) };

  it('shows the price before the tap, then charges via the route and keeps the words', async () => {
    const fetcher = jest.fn((url: string) => respond(url.endsWith('/captions') ? { ok: true, wordsBySource: { a: [{ text: 'hello', startSec: 0.2, endSec: 0.6 }] }, billedSec: 75, charged: 4 } : {})) as unknown as typeof fetch;
    render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 75)])} sources={sources} />);
    expect(screen.getByTestId('smart-captions-run')).toHaveTextContent('✦4');
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByTestId('smart-captions-run')); });
    await waitFor(() => expect(screen.getByTestId('h-words')).toHaveTextContent('hello'));
    expect(screen.getByTestId('smart-note')).toHaveTextContent('✦4 charged');
    const body = JSON.parse((fetcher as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ lang: 'en', sources: [{ sourceId: 'a', path: 'uploads/u1/a.mp4', startSec: 0, endSec: 75 }] });
  });

  it('a 402 says what it costs and changes nothing', async () => {
    const fetcher = jest.fn(() => respond({ ok: false, credits: 4 }, 402)) as unknown as typeof fetch;
    render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 75)])} sources={sources} />);
    await act(async () => { fireEvent.click(screen.getByTestId('smart-captions-run')); });
    await waitFor(() => expect(screen.getByTestId('smart-note')).toHaveTextContent('✦4'));
    expect(screen.getByTestId('h-words')).toHaveTextContent('');
  });

  it('pauses: free preview, then the cut lands on the edit', async () => {
    const plan: SilencePlan = { cuts: [{ startSec: 3, endSec: 4 }], kept: [{ startSec: 0, endSec: 3 }, { startSec: 4, endSec: 8 }], count: 1, removedSec: 1, durationSec: 8, resultSec: 7, fillers: 0, untouched: false };
    const fetcher = jest.fn(() => respond({ ok: true, plan, charged: 0 })) as unknown as typeof fetch;
    render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 8)])} sources={sources} />);
    await act(async () => { fireEvent.click(screen.getByTestId('smart-pauses-find')); });
    await waitFor(() => expect(screen.getByTestId('smart-pauses-preview')).toHaveTextContent('1 pauses · −0:01'));
    fireEvent.click(screen.getByTestId('smart-pauses-apply'));
    expect(screen.getByTestId('h-clips').textContent).toMatch(/^1:0-3,clip.+:4-8$/);
  });

  it('beat: needs music; with music it cuts the clips on the grid', async () => {
    const fetcher = jest.fn(() => respond({ ok: true, durationSec: 30, grid: { bpm: 120, periodSec: 0.5, phaseSec: 0, confidence: 0.9 } })) as unknown as typeof fetch;
    const { unmount } = render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 20), clip('2', 'a', 20, 40)])} sources={sources} />);
    expect(screen.getByTestId('smart-beat-run')).toBeDisabled();
    unmount();
    render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 20), clip('2', 'a', 20, 40)], { musicId: 'm' })} sources={sources} />);
    await act(async () => { fireEvent.click(screen.getByTestId('smart-beat-run')); });
    await waitFor(() => expect(screen.getByTestId('smart-note')).toHaveTextContent(/BPM|beat/));
    expect(screen.getByTestId('h-clips').textContent).not.toBe('1:0-20,2:20-40');
  });

  it('text and effects land at the playhead', () => {
    const fetcher = jest.fn() as unknown as typeof fetch;
    render(<Harness fetcher={fetcher} initial={editOf([clip('1', 'a', 0, 6)])} sources={sources} />);
    fireEvent.change(screen.getByTestId('smart-text-input'), { target: { value: 'სათაური' } });
    fireEvent.click(screen.getByTestId('smart-text-add'));
    fireEvent.click(screen.getByTestId('smart-fx-zoomPunch'));
    expect(screen.getByTestId('h-text')).toHaveTextContent('სათაური');
    expect(screen.getByTestId('h-fx')).toHaveTextContent('zoomPunch');
  });
});

// ── SmartLanes ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('SmartLanes', () => {
  // jsdom has no PointerEvent: without this, fireEvent.pointer* drops clientX.
  beforeAll(() => {
    if (!('PointerEvent' in window)) {
      class PE extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; } }
      (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
    }
  });

  it('a drag moves the item and snaps it to a clip boundary within 8 px', () => {
    let tracks: SmartTracks = { texts: [{ id: 't1', t0: 0, t1: 1, text: 'hi', pos: 'top', look: 'title' }], effects: [] };
    const onChange = jest.fn((n: SmartTracks) => { tracks = n; });
    render(
      <div style={{ position: 'relative' }}>
        <SmartLanes tracks={tracks} clips={[{ id: 'c1', startSec: 0, endSec: 2 }, { id: 'c2', startSec: 0, endSec: 3 }]} totalSec={5} pxPerSec={50} pad={0} top={0} laneH={20} playheadSec={4.5}
          labels={{ text: 'Text', fx: 'Effects', remove: 'Remove', fxNames: {} }} onChange={onChange} />
      </div>,
    );
    const item = screen.getByTestId('smart-item-t1');
    fireEvent.pointerDown(item, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 10 + 1.9 * 50, pointerId: 1 }); // t0 → 1.9, the cut at 2 is 5 px away
    fireEvent.pointerUp(item, { pointerId: 1 });
    expect(tracks.texts[0]!.t0).toBe(2);
    expect(tracks.texts[0]!.t1).toBe(3);
  });
});
