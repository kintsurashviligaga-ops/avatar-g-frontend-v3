/** @jest-environment node */
/**
 * lib/avatar/speechMatch — the avatar's ElevenLabs line fitted onto the mouth Veo drew. GG, 2026-10-17 10:15Z: "the lip
 * sync does not match at all" (Veo had rendered a silent "talking" clip and the line was laid from 0 s); tap 10:22Z
 * „Veo ლაპარაკობს": Veo says the line in Latin letters and the line replaces its voice, phrase by phrase.
 */
import { DUB_TEMPO_MAX, DUB_TEMPO_MIN, describeDub, dropIsolatedBlips, dubFilter, frameLevelsDb, georgianToLatin, mergeSpansTo, planDub, speechSpans, type Span } from './speechMatch';

describe('georgianToLatin', () => {
  it('reads the Production line in Latin letters, punctuation and spaces kept', () => {
    expect(georgianToLatin('გადადი მაი ავატარ ჯიზე და დაიწყე')).toBe('gadadi mai avatar jize da daitsqe');
    expect(georgianToLatin('გამარჯობა, მე ვარ შენი ავატარი!')).toBe('gamarjoba, me var sheni avatari!');
  });
  it('covers the digraph letters and Mtavruli capitals; Latin and digits pass through', () => {
    expect(georgianToLatin('ჟღერს ხმა ძალიან ჭკვიანი წყალი ცხრა')).toBe('zhghers khma dzalian chkviani tsqali tskhra');
    expect(georgianToLatin('ᲒᲐᲛᲐᲠᲯᲝᲑᲐ')).toBe('gamarjoba');
    expect(georgianToLatin('MyAvatar.ge 2026')).toBe('MyAvatar.ge 2026');
  });
});

/** Levels of a track: `loud` spans at -12 dB over a -70 dB room, 10 ms frames. */
function levels(totalSec: number, loud: [number, number][], room = -70): number[] {
  return Array.from({ length: Math.round(totalSec * 100) }, (_, i) => (loud.some(([a, b]) => i / 100 >= a && i / 100 < b) ? -12 : room));
}

describe('speechSpans', () => {
  it('finds each phrase, padded 30 ms, and joins a pause shorter than 0.2 s', () => {
    expect(speechSpans(levels(4, [[0.5, 1.2], [1.3, 1.6], [2.2, 3.0]]))).toEqual([{ start: 0.47, end: 1.63 }, { start: 2.17, end: 3.03 }]);
  });
  it('drops a click, ignores room tone, and reads digital silence as no speech', () => {
    expect(speechSpans(levels(3, [[0.5, 0.53], [1, 2]]))).toEqual([{ start: 0.97, end: 2.03 }]);
    expect(speechSpans(levels(3, [], -100))).toEqual([]);
    expect(speechSpans([])).toEqual([]);
  });
  it('a music bed far under the voice is not speech', () => {
    // The 30 ms average lets a -40 dB bed widen the edge by one frame, never more.
    expect(speechSpans(levels(3, [[1, 2]], -40))).toEqual([{ start: 0.96, end: 2.04 }]);
  });
});

describe('frameLevelsDb', () => {
  it('reads a full-scale square as ~0 dB and zeros as -100, one level per 10 ms', () => {
    const pcm = new Int16Array(16_000 * 0.05);
    pcm.fill(32_000, 0, 160);
    const l = frameLevelsDb(pcm, 16_000);
    expect(l).toHaveLength(5);
    expect(l[0]).toBeGreaterThan(-1);
    expect(l[1]).toBe(-100);
  });
});

describe('mergeSpansTo', () => {
  it('joins the closest neighbours first, keeping the longest pause', () => {
    const s: Span[] = [{ start: 0, end: 1 }, { start: 1.3, end: 2 }, { start: 3, end: 4 }];
    expect(mergeSpansTo(s, 2)).toEqual([{ start: 0, end: 2 }, { start: 3, end: 4 }]);
    expect(mergeSpansTo(s, 1)).toEqual([{ start: 0, end: 4 }]);
    expect(mergeSpansTo(s, 5)).toEqual(s);
  });
});

describe('planDub', () => {
  it('lays each phrase of the line onto the phrase Veo said, stretched to its length', () => {
    const p = planDub([{ start: 0.1, end: 1.0 }, { start: 1.3, end: 2.4 }], [{ start: 0.5, end: 1.4 }, { start: 1.9, end: 3.0 }], 8);
    expect(p).toEqual([{ from: 0.1, to: 1.0, at: 0.5, tempo: 1 }, { from: 1.3, to: 2.4, at: 1.9, tempo: 1 }]);
    const slower = planDub([{ start: 0, end: 2 }], [{ start: 1, end: 3.5 }], 8)!;
    expect(slower[0]).toEqual({ from: 0, to: 2, at: 1, tempo: 0.8 }); // 2 s of line fills Veo's 2.5 s
  });
  it('more pauses on one side are merged down to the other\'s count', () => {
    const p = planDub([{ start: 0, end: 2.4 }], [{ start: 0.4, end: 1.2 }, { start: 1.4, end: 2.8 }], 8)!;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ from: 0, to: 2.4, at: 0.4 });
    expect(p[0]!.tempo).toBeCloseTo(2.4 / 2.4, 3);
  });
  it('never stretches past a voice that still sounds like a person, and never overlaps two phrases', () => {
    const fast = planDub([{ start: 0, end: 3 }], [{ start: 0, end: 1 }], 8)!;
    expect(fast[0]!.tempo).toBe(DUB_TEMPO_MAX);
    const slow = planDub([{ start: 0, end: 1 }], [{ start: 0, end: 5 }], 8)!;
    expect(slow[0]!.tempo).toBe(DUB_TEMPO_MIN);
    const tight = planDub([{ start: 0, end: 2 }, { start: 2.5, end: 3 }], [{ start: 0, end: 1 }, { start: 1.1, end: 1.6 }], 8)!;
    const end0 = tight[0]!.at + (tight[0]!.to - tight[0]!.from) / tight[0]!.tempo;
    expect(tight[1]!.at).toBeGreaterThanOrEqual(end0);
  });
  it('a breath or a laugh Veo makes apart from the words is not a phrase of the line', () => {
    const p = planDub([{ start: 0.05, end: 2.45 }], [{ start: 0.3, end: 2.7 }, { start: 3.4, end: 3.6 }], 8)!;
    expect(p).toEqual([{ from: 0.05, to: 2.45, at: 0.3, tempo: 1 }]);
    // A short word inside the line stays: it is close to its neighbours.
    expect(dropIsolatedBlips([{ start: 0, end: 1 }, { start: 1.2, end: 1.4 }, { start: 1.6, end: 2.5 }], 1)).toHaveLength(3);
    // Never every phrase.
    expect(dropIsolatedBlips([{ start: 0, end: 0.2 }, { start: 1, end: 1.2 }], 1)).toHaveLength(1);
  });
  it('no speech on either side → null (the line is laid from the start, as before)', () => {
    expect(planDub([], [{ start: 0, end: 1 }], 8)).toBeNull();
    expect(planDub([{ start: 0, end: 1 }], [], 8)).toBeNull();
  });
});

describe('dubFilter', () => {
  it('one phrase: trimmed, stretched, faded, delayed and padded to the clip', () => {
    expect(dubFilter([{ from: 0.1, to: 1.1, at: 0.5, tempo: 0.8 }], '1:a', 8)).toBe(
      '[1:a]atrim=start=0.100:end=1.100,asetpts=PTS-STARTPTS,atempo=0.8000,afade=t=in:d=0.01,afade=t=out:st=1.240:d=0.01,adelay=500:all=1[p0];[p0]apad=whole_dur=8[voice]',
    );
  });
  it('several phrases: the input is split, each placed, then mixed at full level', () => {
    const g = dubFilter([{ from: 0, to: 1, at: 0.2, tempo: 1 }, { from: 1.3, to: 2, at: 1.6, tempo: 1.2 }], '1:a', 8);
    expect(g.startsWith('[1:a]asplit=2[s0][s1];[s0]atrim=start=0.000:end=1.000')).toBe(true);
    expect(g).toContain('adelay=1600:all=1[p1]');
    expect(g.endsWith('[p0][p1]amix=inputs=2:normalize=0:duration=longest,asetpts=N/SR/TB,apad=whole_dur=8[voice]')).toBe(true);
  });
});

it('describeDub names the spans and the laying, never words or links', () => {
  expect(describeDub([{ start: 0.1, end: 2.4 }], [{ start: 0.5, end: 2.9 }], [{ from: 0.1, to: 2.4, at: 0.5, tempo: 0.958 }])).toBe('line 0.10–2.40 | veo 0.50–2.90 | laid 0.10→0.50×0.958');
  expect(describeDub([{ start: 0, end: 1 }], [], null)).toBe('line 0.00–1.00 | veo none | laid from 0 (no match)');
});
