/**
 * Mocked tests for the Smart Editor foundation (Phase 8.7): timeline ops, snapping, captions (Chirp parse, chunking,
 * cards, Georgian breaking, frames, SRT), silence + filler removal, effects, templates, prices, ops. No network, no
 * ffmpeg, no key.
 */
import {
  addEffect, addText, beatTicks, coerceTracks, emptyTracks, moveItem, removeItem, rippleDeleteClip, rippleTracks, seqLayout,
  snapSpan, snapTargets, snapTime, splitItem, trimItem, MIN_ITEM_SEC,
} from './timeline';
import {
  buildCards, CAPTION_STYLES, captionFrames, chirpCaptionBody, concatList, displayText, mergeChunkWords, offsetSec, parseChirpWords,
  planCaptionChunks, remapWords, toSrt, wrapWords, billedAudioSec,
} from './captions';
import { applyToClip, fillerCuts, isFiller, keptSpans, masterCuts, planSilenceRemoval, silenceCuts } from './silence';
import { buildFxChain, glitchAtCuts } from './effects';
import { captionCenterY, TEMPLATES, TEMPLATE_IDS } from './templates';
import { aiWatchCostUsd, aiWatchCredits, captionCostUsd, captionCredits, marginFloor } from './price';
import { expandTemplate, normalizeOps, quoteSmartEdit } from './ops';
import { syncClipsToBeat } from './beat';
import { smartEditorAllowed, smartEditorAudience, smartEditorClientOn } from './flag';

const W = (text: string, startSec: number, endSec: number) => ({ text, startSec, endSec });

describe('flag', () => {
  it('is off unless said in words', () => {
    expect(smartEditorAudience({})).toBe('off');
    expect(smartEditorAudience({ MONTAGE_SMART_EDITOR: 'true' })).toBe('off');
    expect(smartEditorAudience({ MONTAGE_SMART_EDITOR: ' Admin ' })).toBe('admin');
    expect(smartEditorAllowed(false, { MONTAGE_SMART_EDITOR: 'admin' })).toBe(false);
    expect(smartEditorAllowed(true, { MONTAGE_SMART_EDITOR: 'admin' })).toBe(true);
    expect(smartEditorAllowed(false, { MONTAGE_SMART_EDITOR: 'everyone' })).toBe(true);
    expect(smartEditorClientOn('1')).toBe(false);
    expect(smartEditorClientOn('everyone')).toBe(true);
  });
});

describe('timeline tracks', () => {
  const clips = [{ id: 'a', startSec: 0, endSec: 4 }, { id: 'b', startSec: 2, endSec: 5 }, { id: 'c', startSec: 0, endSec: 6, speed: 2 }];
  it('lays the video sequence with speed', () => {
    expect(seqLayout(clips)).toEqual([{ id: 'a', t0: 0, t1: 4 }, { id: 'b', t0: 4, t1: 7 }, { id: 'c', t0: 7, t1: 10 }]);
  });
  it('adds, moves, trims, splits and removes text inside the edit', () => {
    let t = addText(emptyTracks(), { t0: 1, t1: 3, text: '  გამარჯობა   მსოფლიო ', pos: 'top', look: 'title' }, 10, 'x');
    expect(t.texts[0]).toMatchObject({ id: 'x', t0: 1, t1: 3, text: 'გამარჯობა მსოფლიო', pos: 'top' });
    t = moveItem(t, 'text', 'x', 9.5, 10);
    expect(t.texts[0]).toMatchObject({ t0: 8, t1: 10 }); // length kept, never past the end
    t = trimItem(t, 'text', 'x', 'start', 9.95, 10);
    expect(t.texts[0]!.t1 - t.texts[0]!.t0).toBeGreaterThanOrEqual(MIN_ITEM_SEC - 1e-9);
    t = trimItem(t, 'text', 'x', 'start', 7, 10);
    t = splitItem(t, 'text', 'x', 8.5, 'y');
    expect(t.texts.map((i) => [i.id, i.t0, i.t1])).toEqual([['x', 7, 8.5], ['y', 8.5, 10]]);
    expect(splitItem(t, 'text', 'x', 7.05, 'z')).toBe(t); // a half under MIN_ITEM_SEC is refused
    expect(removeItem(t, 'text', 'x').texts.map((i) => i.id)).toEqual(['y']);
  });
  it('refuses empty text, unknown effects and spans outside the edit', () => {
    expect(addText(emptyTracks(), { t0: 0, t1: 1, text: '   ', pos: 'bottom', look: 'title' }, 10, 'x').texts).toHaveLength(0);
    expect(addEffect(emptyTracks(), { t0: 0, t1: 1, kind: 'explode' as never }, 10, 'f').effects).toHaveLength(0);
    expect(addEffect(emptyTracks(), { t0: 0, t1: 1, kind: 'glitch' }, 0.1, 'f').effects).toHaveLength(0);
    expect(addEffect(emptyTracks(), { t0: -3, t1: 50, kind: 'glitch', amount: 7 }, 10, 'f').effects[0]).toMatchObject({ t0: 0, t1: 10, amount: 1 });
  });
  it('ripple: a removed stretch pulls later items left, shortens straddlers, drops swallowed ones', () => {
    let t = emptyTracks();
    t = addText(t, { t0: 0, t1: 2, text: 'before', pos: 'bottom', look: 'title' }, 20, 'a');
    t = addText(t, { t0: 3, t1: 7, text: 'straddles', pos: 'bottom', look: 'title' }, 20, 'b');
    t = addText(t, { t0: 4.5, t1: 5.5, text: 'inside', pos: 'bottom', look: 'title' }, 20, 'c');
    t = addText(t, { t0: 8, t1: 9, text: 'after', pos: 'bottom', look: 'title' }, 20, 'd');
    const r = rippleTracks(t, 4, -2, 18); // [4, 6) removed
    expect(r.texts.map((i) => [i.id, i.t0, i.t1])).toEqual([['a', 0, 2], ['b', 3, 5], ['d', 6, 7]]);
    const grow = rippleTracks(t, 4, 1, 21);
    expect(grow.texts.find((i) => i.id === 'd')).toMatchObject({ t0: 9, t1: 10 });
  });
  it('ripple delete closes the gap on the video track and moves text with it', () => {
    let t = addText(emptyTracks(), { t0: 8, t1: 9, text: 'on c', pos: 'bottom', look: 'title' }, 10, 'x');
    const r = rippleDeleteClip(clips, t, 'b');
    expect(r.clips.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.tracks.texts[0]).toMatchObject({ t0: 5, t1: 6 });
    t = r.tracks;
    expect(rippleDeleteClip(r.clips, t, 'nope').clips).toHaveLength(2);
  });
  it('coerces wire tracks and drops junk', () => {
    const t = coerceTracks({ texts: [{ t0: 1, t1: 2, text: 'hi', pos: 'weird' }, null, { text: '' }], effects: [{ kind: 'flash', t0: 0, t1: 0.5 }, { kind: 'bad' }] }, 10);
    expect(t.texts).toEqual([{ id: 't0', t0: 1, t1: 2, text: 'hi', pos: 'bottom', look: 'title' }]);
    expect(t.effects).toHaveLength(1);
    expect(coerceTracks('nonsense', 10)).toEqual(emptyTracks());
  });
});

describe('snapping', () => {
  const clips = [{ id: 'a', startSec: 0, endSec: 4 }, { id: 'b', startSec: 0, endSec: 4 }];
  const tracks = addText(emptyTracks(), { t0: 1, t1: 2.5, text: 'x', pos: 'bottom', look: 'title' }, 8, 'x');
  const targets = snapTargets({ clips, tracks, playheadSec: 3, beats: [0.5, 1, 1.5, 6.02], excludeId: 'none' });
  it('lands on the nearest target within 8 px', () => {
    expect(snapTime(3.9, targets, 100).t).toBe(3.9); // 10 px away at 100 px/s: past the 8 px limit
    expect(snapTime(3.95, targets, 100)).toMatchObject({ t: 4, snapped: { kind: 'clip' } });
    expect(snapTime(3.5, targets, 100)).toEqual({ t: 3.5, snapped: null });
  });
  it('prefers the playhead over a beat at the same distance, and turns off when free', () => {
    const t2 = [{ t: 2, kind: 'beat' as const }, { t: 2, kind: 'playhead' as const }];
    expect(snapTime(2.03, t2, 100).snapped?.kind).toBe('playhead');
    expect(snapTime(2.03, t2, 100, { free: true }).snapped).toBeNull();
  });
  it('snaps a dragged span by whichever edge is closer and keeps its length', () => {
    const r = snapSpan(4.97, 1, targets, 100);
    expect(r.t0).toBe(5.02); // the END (5.97) snapped to the beat at 6.02? no: start 4.97 → nothing; end 5.97 → 6.02
    expect(r.snapped?.kind).toBe('beat');
  });
  it('excludes the dragged item from its own targets', () => {
    const own = snapTargets({ clips, tracks, excludeId: 'x' });
    expect(own.some((g) => g.kind === 'item')).toBe(false);
  });
  it('draws beat ticks from the song start over the edit', () => {
    expect(beatTicks({ periodSec: 0.5, phaseSec: 0.1 }, 1, 2)).toEqual([0.1, 0.6, 1.1, 1.6]);
    expect(beatTicks(null, 0, 10)).toEqual([]);
  });
});

describe('captions: Chirp', () => {
  it('asks Chirp 3 for word offsets in the right language', () => {
    const b = chirpCaptionBody('QUJD', 'ka') as { config: { model: string; languageCodes: string[]; features: Record<string, boolean> } };
    expect(b.config.model).toBe('chirp_3');
    expect(b.config.languageCodes).toEqual(['ka-GE']);
    expect(b.config.features.enableWordTimeOffsets).toBe(true);
  });
  it('reads both offset shapes and shifts by the piece start', () => {
    expect(offsetSec('1.250s')).toBe(1.25);
    expect(offsetSec({ seconds: '2', nanos: 500_000_000 })).toBe(2.5);
    expect(offsetSec(undefined)).toBe(0);
    expect(offsetSec('soon')).toBeNull();
    const raw = { results: [{ alternatives: [{ transcript: 'გამარჯობა მეგობრებო', words: [{ word: 'გამარჯობა', endOffset: '0.6s' }, { word: 'მეგობრებო', startOffset: '0.7s', endOffset: '1.4s' }, { word: '', startOffset: '1s' }] }] }] };
    const r = parseChirpWords(raw, 55);
    expect(r.transcript).toBe('გამარჯობა მეგობრებო');
    expect(r.words).toEqual([W('გამარჯობა', 55, 55.6), W('მეგობრებო', 55.7, 56.4)]);
    expect(parseChirpWords(null).words).toEqual([]);
  });
  it('splits long audio at its own pauses, each piece under a minute', () => {
    const chunks = planCaptionChunks(150, [{ startSec: 40, endSec: 41 }, { startSec: 50, endSec: 50.6 }, { startSec: 100, endSec: 101 }]);
    expect(chunks.every((c) => c.endSec - c.startSec <= 55)).toBe(true);
    expect(chunks[0]).toEqual({ startSec: 0, endSec: 50.3 }); // the LATEST pause in the window
    expect(chunks[chunks.length - 1]!.endSec).toBe(150);
    expect(billedAudioSec(chunks)).toBe(150);
    expect(planCaptionChunks(30, [])).toEqual([{ startSec: 0, endSec: 30 }]);
    // no pause at all → hard 55 s pieces
    expect(planCaptionChunks(120, []).map((c) => c.endSec)).toEqual([55, 110, 120]);
  });
  it('merges pieces, dropping a word repeated on the seam', () => {
    const m = mergeChunkWords([[W('a', 0, 0.5), W('seam', 54.8, 55.2)], [W('seam', 54.85, 55.2), W('b', 55.3, 56)]]);
    expect(m.map((w) => w.text)).toEqual(['a', 'seam', 'b']);
  });
  it('remaps words through a silence cut list', () => {
    const r = remapWords([W('one', 0, 0.5), W('gone', 1.2, 1.4), W('two', 3, 3.5)], [{ startSec: 1, endSec: 2 }]);
    expect(r).toEqual([W('one', 0, 0.5), W('two', 2, 2.5)]);
  });
});

describe('captions: Georgian cards and styles', () => {
  it('never uppercases Georgian, uppercases Latin/Cyrillic only when the style asks', () => {
    const bold = CAPTION_STYLES['bold-word'];
    expect(displayText('გამარჯობა', bold)).toBe('გამარჯობა');
    expect(displayText('hello', bold)).toBe('HELLO');
    expect(displayText('привет', bold)).toBe('ПРИВЕТ');
    expect(displayText('hello', CAPTION_STYLES.standard)).toBe('hello');
  });
  it('breaks lines only between words; a word longer than a line keeps a line of its own', () => {
    expect(wrapWords(['საქართველოს', 'დედაქალაქი', 'თბილისი'], 16)).toEqual([[0], [1], [2]]);
    expect(wrapWords(['ეს', 'არის', 'ჩემი', 'სახლი'], 16)).toEqual([[0, 1, 2], [3]]);
    expect(wrapWords(['ურთიერთთანამშრომლობისთვის'], 10)).toEqual([[0]]);
  });
  const words = [W('გამარჯობა', 0, 0.6), W('ყველას!', 0.65, 1.2), W('დღეს', 2.5, 2.9), W('ვისაუბრებთ', 3, 3.7), W('მონტაჟზე', 3.75, 4.4), W('და', 4.45, 4.6)];
  it('makes cards at sentence ends, long pauses and the style limits, held briefly', () => {
    const cards = buildCards(words, CAPTION_STYLES['bold-word']);
    expect(cards.map((c) => c.words.map((w) => w.text).join(' '))).toEqual(['გამარჯობა ყველას!', 'დღეს ვისაუბრებთ მონტაჟზე', 'და']);
    expect(cards[0]!.endSec).toBeCloseTo(1.55); // held 0.35 s, next starts at 2.5
    expect(cards[1]!.endSec).toBe(4.45); // never into the next card
    expect(cards[1]!.lines).toEqual([[0, 1], [2]]); // two lines, broken between words
    expect(cards.every((c) => c.lines.length <= CAPTION_STYLES['bold-word'].maxLines)).toBe(true);
  });
  it('bold word-by-word: one frame per word, lit until the next word starts', () => {
    const style = CAPTION_STYLES['bold-word'];
    const frames = captionFrames(buildCards(words, style), style);
    expect(frames.slice(0, 2)).toEqual([{ startSec: 0, endSec: 0.65, card: 0, active: 0 }, { startSec: 0.65, endSec: 1.55, card: 0, active: 1 }]);
    expect(frames).toHaveLength(words.length);
  });
  it('standard: one static frame per card', () => {
    const style = CAPTION_STYLES.standard;
    const frames = captionFrames(buildCards(words, style), style);
    expect(frames.every((f) => f.active === -1)).toBe(true);
  });
  it('one image stream: blanks fill the gaps, the last file repeats', () => {
    const list = concatList([{ startSec: 1, endSec: 2, card: 0, active: -1 }], (i) => `/tmp/f${i}.png`, '/tmp/blank.png', 3);
    expect(list.split('\n')).toEqual(['ffconcat version 1.0', "file '/tmp/blank.png'", 'duration 1.000', "file '/tmp/f0.png'", 'duration 1.000', "file '/tmp/blank.png'", 'duration 1.000', "file '/tmp/blank.png'", '']);
  });
  it('writes a valid SRT', () => {
    const srt = toSrt(buildCards(words.slice(0, 2), CAPTION_STYLES.standard));
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,550\nგამარჯობა ყველას!\n');
  });
});

describe('silence removal (free, ffmpeg silencedetect)', () => {
  const silences = [{ startSec: 0, endSec: 0.8 }, { startSec: 3, endSec: 3.4 }, { startSec: 5, endSec: 6.5 }, { startSec: 9.2, endSec: 10 }];
  it('cuts long pauses with air kept, edges whole, short pauses kept', () => {
    expect(silenceCuts(silences, 10, 'normal')).toEqual([{ startSec: 0, endSec: 0.65 }, { startSec: 5.15, endSec: 6.35 }, { startSec: 9.35, endSec: 10 }]);
    expect(silenceCuts(silences, 10, 'tight').length).toBe(4); // the 0.4 s pause goes too
    expect(silenceCuts(silences, 10, 'low').length).toBe(3);
  });
  it('plans the cut with a count and the time saved, before applying', () => {
    const p = planSilenceRemoval({ durationSec: 10, silences, sensitivity: 'normal' });
    expect(p.count).toBe(3);
    expect(p.removedSec).toBe(2.5);
    expect(p.resultSec).toBe(7.5);
    expect(keptSpans(p.cuts, 10)).toEqual(p.kept);
  });
  it('also cuts filler words from the caption words (conservative list)', () => {
    expect(isFiller('ეე,', 'ka')).toBe(true);
    expect(isFiller('ანუ', 'ka')).toBe(false); // a real word, never cut
    expect(isFiller('Um', 'en')).toBe(true);
    expect(isFiller('ну', 'ru')).toBe(false);
    const words = [W('ეს', 1, 1.3), W('ეე', 1.5, 2), W('კარგია', 2.1, 2.8)];
    expect(fillerCuts(words, 'ka')).toEqual([{ startSec: 1.5, endSec: 2 }]);
    const p = planSilenceRemoval({ durationSec: 10, silences, words, lang: 'ka' });
    expect(p.fillers).toBe(1);
    expect(planSilenceRemoval({ durationSec: 10, silences, words, lang: 'ka', removeFillers: false }).fillers).toBe(0);
  });
  it('a sliver of picture between two cuts goes too', () => {
    const p = planSilenceRemoval({ durationSec: 10, silences: [{ startSec: 2, endSec: 4 }, { startSec: 4.4, endSec: 6 }], sensitivity: 'normal' });
    expect(p.kept.every((k) => k.endSec - k.startSec >= 0.3)).toBe(true);
  });
  it('leaves a silent or already-tight clip untouched', () => {
    expect(planSilenceRemoval({ durationSec: 4, silences: [{ startSec: 0, endSec: 4 }] }).untouched).toBe(true);
    expect(planSilenceRemoval({ durationSec: 4, silences: [] }).untouched).toBe(true);
  });
  it('turns one timeline clip into its kept sub-clips, inside its own trim window', () => {
    const p = planSilenceRemoval({ durationSec: 10, silences, sensitivity: 'normal' });
    const pieces = applyToClip({ id: 'c1', startSec: 1, endSec: 9, muted: false }, p, (i) => `c1-${i}`);
    expect(pieces).toEqual([{ id: 'c1', startSec: 1, endSec: 5.15, muted: false }, { id: 'c1-1', startSec: 6.35, endSec: 9, muted: false }]);
    expect(masterCuts({ startSec: 1, endSec: 9 }, 10, p)).toEqual([{ startSec: 14.15, endSec: 15.35 }]);
  });
});

describe('effects', () => {
  it('builds timeline-enabled glitch and flash, a frame-following zoom, and nothing for none', () => {
    expect(buildFxChain([], 1080, 1920)).toBe('');
    const c = buildFxChain([{ id: 'g', kind: 'glitch', t0: 1, t1: 1.3, amount: 0.8 }, { id: 'f', kind: 'flash', t0: 2, t1: 2.2, amount: 0.5 }], 1080, 1920);
    expect(c).toContain("rgbashift=rh=-14:bh=14:enable='between(t\\,1\\,1.3)'");
    expect(c).toContain("noise=alls=52:allf=t:enable='between(t\\,1\\,1.3)'");
    expect(c).toContain("eq=brightness=0.45:enable='between(t\\,2\\,2.2)'");
    const z = buildFxChain([{ id: 'z', kind: 'zoomPunch', t0: 0, t1: 1, amount: 1 }], 1080, 1920);
    expect(z).toMatch(/^scale=w='2\*trunc\(1080\*\(1\+0\.18\*between/);
    expect(z).toContain(':eval=frame,crop=1080:1920:(iw-1080)/2:(ih-1920)/2');
    const s = buildFxChain([{ id: 's', kind: 'shake', t0: 0, t1: 1, amount: 1 }], 1080, 1920);
    expect(s).toContain('crop=1048:1888');
    expect(s).toContain('scale=1080:1920');
  });
  it('a glitch transition is a hard cut plus a short glitch centred on it', () => {
    expect(glitchAtCuts([0, 4, 8, 12], 10)).toEqual([
      { id: 'gx0', kind: 'glitch', t0: 3.85, t1: 4.15, amount: 0.8 },
      { id: 'gx1', kind: 'glitch', t0: 7.85, t1: 8.15, amount: 0.8 },
    ]);
  });
});

describe('templates', () => {
  it('has the six approved looks with sane safe zones', () => {
    expect(TEMPLATE_IDS).toEqual(['tiktok', 'youtube', 'shorts', 'square', 'explainer', 'music-promo']);
    expect(TEMPLATES.tiktok.aspect).toBe('9:16');
    expect(TEMPLATES.youtube.aspect).toBe('16:9');
    expect(TEMPLATES.square.aspect).toBe('1:1');
    expect(TEMPLATES['music-promo']).toMatchObject({ beatSync: true, transition: 'glitch' });
    for (const id of TEMPLATE_IDS) {
      const s = TEMPLATES[id].safe;
      expect(s.top + s.bottom).toBeLessThan(0.5);
    }
  });
  it('lifts bottom captions above the vertical UI', () => {
    expect(captionCenterY('bottom', TEMPLATES.tiktok.safe, 0.1)).toBe(0.75);
    expect(captionCenterY('top', TEMPLATES.tiktok.safe, 0.1)).toBe(0.15);
    expect(captionCenterY('middle', TEMPLATES.tiktok.safe, 0.1)).toBe(0.5);
  });
});

describe('prices (GG D1-D3) and the 65 % rule', () => {
  it('captions ✦2 per started minute, min ✦2', () => {
    expect(captionCredits(5)).toBe(2);
    expect(captionCredits(60)).toBe(2);
    expect(captionCredits(61)).toBe(4);
    expect(captionCredits(300)).toBe(10);
  });
  it('AI watch pass ✦4 per started minute', () => {
    expect(aiWatchCredits(30)).toBe(4);
    expect(aiWatchCredits(150)).toBe(12);
  });
  it('every price is at or above ⌈cost × 104.38⌉', () => {
    for (const sec of [1, 30, 59, 60, 61, 120, 299, 300]) {
      expect(captionCredits(sec)).toBeGreaterThanOrEqual(marginFloor(captionCostUsd(sec)));
      expect(aiWatchCredits(sec)).toBeGreaterThanOrEqual(marginFloor(aiWatchCostUsd(sec)));
    }
  });
});

describe('smart edit ops', () => {
  it('orders the ops so captions run last, whatever order they were said in', () => {
    const ops = normalizeOps([{ op: 'captions', lang: 'ka' }, { op: 'beatSync' }, { op: 'removeSilence' }, { op: 'nonsense' }, { op: 'transition', style: 'explode' }]);
    expect(ops).toEqual([{ op: 'removeSilence', sensitivity: 'normal', fillers: true }, { op: 'beatSync' }, { op: 'captions', lang: 'ka', style: 'bold-word' }]);
  });
  it('a template expands into its ops; the person’s own ops win', () => {
    const ops = expandTemplate(normalizeOps([{ op: 'template', id: 'tiktok' }, { op: 'captions', lang: 'en', style: 'standard' }]), 'ka');
    expect(ops.find((o) => o.op === 'aspect')).toEqual({ op: 'aspect', aspect: '9:16' });
    expect(ops.find((o) => o.op === 'captions')).toEqual({ op: 'captions', lang: 'en', style: 'standard' });
    expect(ops.some((o) => o.op === 'removeSilence')).toBe(true);
  });
  it('quotes: silence + beat free, captions on the cut length, beat skipped without music', () => {
    const ops = normalizeOps([{ op: 'removeSilence' }, { op: 'beatSync' }, { op: 'captions', lang: 'ka' }]);
    const q = quoteSmartEdit(ops, { editSec: 95, speechSec: 70, hasMusic: true, hasSpeech: true });
    expect(q.credits).toBe(4);
    expect(q.lines.map((l) => [l.op, l.credits])).toEqual([['removeSilence', 0], ['beatSync', 0], ['captions', 4]]);
    const q2 = quoteSmartEdit(ops, { editSec: 50, hasMusic: false, hasSpeech: false });
    expect(q2.credits).toBe(0);
    expect(q2.skipped).toEqual([{ op: 'beatSync', reason: 'no_music' }, { op: 'captions', reason: 'no_speech' }]);
    expect(quoteSmartEdit(normalizeOps([{ op: 'aiTrim' }]), { editSec: 90, hasMusic: false, hasSpeech: true }).credits).toBe(8);
  });
});

describe('beat sync bridge', () => {
  const grid = { bpm: 120, periodSec: 0.5, phaseSec: 0, confidence: 0.5 };
  it('lays every clip on the beat and keeps the first shot’s id', () => {
    const r = syncClipsToBeat({ clips: [{ id: 'a', sourceId: 's1', kind: 'video', sourceSec: 10 }, { id: 'b', sourceId: 's2', kind: 'video', sourceSec: 10 }, { id: 'c', sourceId: 's3', kind: 'image', sourceSec: 0 }], musicSec: 60, grid, idOf: (i) => `n${i}` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.beatSynced).toBe(true);
    expect(new Set(r.clips.map((c) => c.sourceId))).toEqual(new Set(['s1', 's2', 's3']));
    expect(r.clips.filter((c) => c.id === 'a')).toHaveLength(1);
    for (const c of r.clips) {
      const beats = (c.endSec - c.startSec) / (c.speed ?? 1) / 0.5;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(0.07); // whole beats (to the 30 fps frame)
    }
  });
  it('says so when there is no beat, and refuses without music or clips', () => {
    const r = syncClipsToBeat({ clips: [{ id: 'a', sourceId: 's1', kind: 'video', sourceSec: 10 }], musicSec: 30, grid: null, idOf: String });
    expect(r.ok && r.beatSynced).toBe(false);
    expect(syncClipsToBeat({ clips: [], musicSec: 30, grid, idOf: String })).toEqual({ ok: false, error: 'no_clips' });
    expect(syncClipsToBeat({ clips: [{ id: 'a', sourceId: 's', kind: 'video', sourceSec: 5 }], musicSec: 0, grid, idOf: String })).toEqual({ ok: false, error: 'no_music' });
  });
});

describe('caption frame SVG (FiraGO, Georgian kept as written)', () => {
  const { buildCaptionFrameSvg, blankFrameSvg } = jest.requireActual('./captionSvg') as typeof import('./captionSvg');
  const card = buildCards([W('გამარჯობა', 0, 0.5), W('hello', 0.6, 1), W('<b>', 1.1, 1.3)], CAPTION_STYLES['bold-word'])[0]!;
  it('lights only the active word in bold-word, escapes text, never uppercases Georgian', () => {
    const svg = buildCaptionFrameSvg({ card, frame: { active: 1 }, style: 'bold-word', w: 1080, h: 1920 });
    expect(svg).toContain('<tspan fill="#FFFFFF">გამარჯობა</tspan>');
    expect(svg).toContain('<tspan fill="#FFE14D"> HELLO</tspan>');
    expect(svg).toContain('&lt;B&gt;');
    expect(svg).toContain('font-family="FiraGO Medium"');
    expect(svg).toContain('xml:lang="ka"');
    expect(svg).toContain('paint-order="stroke"');
  });
  it('karaoke fills every word up to the active one; boxed draws a pill', () => {
    const k = buildCaptionFrameSvg({ card, frame: { active: 1 }, style: 'karaoke', w: 1080, h: 1920 });
    expect((k.match(/#33D6FF/g) || []).length).toBe(2);
    const b = buildCaptionFrameSvg({ card, frame: { active: -1 }, style: 'boxed', w: 1920, h: 1080 });
    expect(b).toContain('<rect');
    expect(b).not.toContain('stroke=');
  });
  it('a blank frame is empty and full size', () => {
    expect(blankFrameSvg(720, 1280)).toBe('<svg width="720" height="1280" viewBox="0 0 720 1280" xmlns="http://www.w3.org/2000/svg"></svg>');
  });
});

describe('audio-only silence detector', () => {
  const { silenceDetectArgs, parseSilenceLog } = jest.requireActual('./silence') as typeof import('./silence');
  it('decodes only the window, audio only', () => {
    expect(silenceDetectArgs('https://x/a.mp4', { startSec: 2, endSec: 12 })).toEqual(['-hide_banner', '-nostats', '-ss', '2.000', '-t', '10.000', '-i', 'https://x/a.mp4', '-vn', '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-']);
  });
  it('parses ffmpeg’s log, closes an open silence at the end and shifts by the window', () => {
    const log = '[silencedetect @ 0x1] silence_start: 1.2\n[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.3\n[silencedetect @ 0x1] silence_start: 8.9\n';
    expect(parseSilenceLog(log, 10, 2)).toEqual([{ startSec: 3.2, endSec: 4.5 }, { startSec: 10.9, endSec: 12 }]);
    expect(parseSilenceLog('', 10)).toEqual([]);
  });
});

describe('captions follow the cuts', () => {
  const { wordsOnMaster } = jest.requireActual('./captions') as typeof import('./captions');
  it('lays each clip’s own words onto the master, by its window and speed, muted clips silent', () => {
    const words = { s1: [W('ერთი', 1, 1.5), W('ორი', 3, 3.4), W('სამი', 6, 6.5)], s2: [W('four', 0.2, 0.6)] };
    const clips = [{ sourceId: 's1', startSec: 2.5, endSec: 4 }, { sourceId: 's2', startSec: 0, endSec: 2, speed: 2 }, { sourceId: 's1', startSec: 5, endSec: 7, muted: true }, { sourceId: 's1', startSec: 0, endSec: 2 }];
    expect(wordsOnMaster(clips, words)).toEqual([W('ორი', 0.5, 0.9), W('four', 1.6, 1.8), W('ერთი', 5.5, 6)]);
  });
});
