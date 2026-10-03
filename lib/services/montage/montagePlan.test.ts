/** @jest-environment node */
import {
  validateMontageRequest,
  timelineDuration,
  transitionOverlap,
  buildConcatPlan,
  captionFontSize,
  shotDuration,
  MAX_SHOTS,
  MIN_SHOT_SEC,
  MAX_TOTAL_SEC,
  TRANSITION_MAX_SEC,
  maxrateForTarget,
  coerceMusicStartSec,
  MAX_MUSIC_START_SEC,
  type MontageShot,
} from './montagePlan';

const shot = (over: Partial<MontageShot> = {}): MontageShot => ({
  url: 'https://cdn.example.com/a.mp4',
  kind: 'video',
  startSec: 0,
  endSec: 5,
  muted: false,
  transition: 'cut',
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  shots: [
    { url: 'https://cdn.example.com/a.mp4', startSec: 0, endSec: 5 },
    { url: 'https://cdn.example.com/b.mp4', startSec: 2, endSec: 8 },
  ],
  ...over,
});

describe('validation', () => {
  it('accepts a minimal two-shot request and fills the defaults', () => {
    const r = validateMontageRequest(body());
    expect(r.ok).toBe(true);
    expect(r.request?.aspect).toBe('16:9');
    expect(r.request?.musicDuckDb).toBe(-12);
    expect(r.request?.shots).toHaveLength(2);
  });

  it('accepts ONE shot — a single clip with a format, music, a caption or a grade is a real edit', () => {
    const r = validateMontageRequest({ shots: [body().shots[0]] });
    expect(r.ok).toBe(true);
    expect(r.request?.shots).toHaveLength(1);
  });

  it('rejects an empty timeline', () => {
    expect(validateMontageRequest({ shots: [] }).ok).toBe(false);
  });

  it('carries a grade only when it changes the picture, clamped to what eq can take', () => {
    expect(validateMontageRequest(body()).request?.grade).toBeUndefined();
    expect(validateMontageRequest(body({ grade: { saturation: 100, contrast: 100, brightness: 100, temperature: 0 } })).request?.grade).toBeUndefined();
    expect(validateMontageRequest(body({ grade: { saturation: 999, contrast: 0, brightness: 300, temperature: -500 } })).request?.grade)
      .toEqual({ saturation: 200, contrast: 50, brightness: 150, temperature: -100 });
    // An omitted field is neutral, never NaN.
    expect(validateMontageRequest(body({ grade: { saturation: 0 } })).request?.grade)
      .toEqual({ saturation: 0, contrast: 100, brightness: 100, temperature: 0 });
    expect(validateMontageRequest(body({ grade: 'vivid' })).request?.grade).toBeUndefined();
  });

  it('keeps a centred caption, and only on a shot that has one', () => {
    const r = validateMontageRequest({
      shots: [
        { url: 'https://cdn.example.com/a.mp4', startSec: 0, endSec: 5, caption: 'სათაური', captionPos: 'center' },
        { url: 'https://cdn.example.com/b.mp4', startSec: 0, endSec: 5, caption: 'ქვედა', captionPos: 'sideways' },
        { url: 'https://cdn.example.com/c.mp4', startSec: 0, endSec: 5, captionPos: 'center' },
      ],
    });
    expect(r.request?.shots[0]?.captionPos).toBe('center');
    expect(r.request?.shots[1]?.captionPos).toBeUndefined();
    expect(r.request?.shots[2]?.captionPos).toBeUndefined();
  });

  it('rejects more than the shot cap', () => {
    const many = Array.from({ length: MAX_SHOTS + 1 }, () => body().shots[0]);
    const r = validateMontageRequest({ shots: many });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MAX_SHOTS));
  });

  it('rejects non-http urls — ffmpeg would fetch them server-side', () => {
    expect(validateMontageRequest({ shots: [{ url: 'file:///etc/passwd', startSec: 0, endSec: 5 }, body().shots[1]] }).ok).toBe(false);
    expect(validateMontageRequest(body({ musicUrl: 'javascript:alert(1)' })).ok).toBe(false);
  });

  it('rejects a shot shorter than the floor', () => {
    const r = validateMontageRequest({ shots: [{ url: 'https://x.dev/a.mp4', startSec: 0, endSec: 0.1 }, body().shots[1]] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MIN_SHOT_SEC));
  });

  it('rejects a timeline past the encode budget', () => {
    const long = Array.from({ length: 6 }, () => ({ url: 'https://x.dev/a.mp4', startSec: 0, endSec: 60 }));
    const r = validateMontageRequest({ shots: long });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MAX_TOTAL_SEC));
  });

  it('normalizes a transition on the FIRST shot away — there is nothing to fade from', () => {
    const r = validateMontageRequest({
      shots: [
        { url: 'https://x.dev/a.mp4', startSec: 0, endSec: 5, transition: 'crossfade' },
        { url: 'https://x.dev/b.mp4', startSec: 0, endSec: 5, transition: 'crossfade' },
      ],
    });
    expect(r.request?.shots[0]?.transition).toBe('cut');
    expect(r.request?.shots[1]?.transition).toBe('crossfade');
  });

  it('treats a still as muted and gives it a default beat when no window is supplied', () => {
    const r = validateMontageRequest({
      shots: [{ url: 'https://x.dev/a.jpg', kind: 'image' }, body().shots[1]],
    });
    const img = r.request?.shots[0];
    expect(img?.muted).toBe(true);
    expect(shotDuration(img!)).toBe(3);
  });

  it('clamps the duck into a usable range instead of trusting the client', () => {
    expect(validateMontageRequest(body({ musicDuckDb: -900 })).request?.musicDuckDb).toBe(-30);
    expect(validateMontageRequest(body({ musicDuckDb: 40 })).request?.musicDuckDb).toBe(0);
  });

  it('carries where the song starts — only with a bed, only when it is past the top', () => {
    const song = 'https://cdn.example.com/song.mp3';
    expect(validateMontageRequest(body({ musicUrl: song, musicStartSec: 42.5 })).request?.musicStartSec).toBe(42.5);
    expect(validateMontageRequest(body({ musicUrl: song, musicStartSec: 12.3456789 })).request?.musicStartSec).toBe(12.346);
    expect(validateMontageRequest(body({ musicUrl: song, musicStartSec: MAX_MUSIC_START_SEC })).request?.musicStartSec).toBe(MAX_MUSIC_START_SEC);
    // 0, absent and null are the top of the song: nothing rides along, so the mux runs as it always did.
    for (const musicStartSec of [0, undefined, null]) {
      const r = validateMontageRequest(body({ musicUrl: song, musicStartSec }));
      expect(r.ok).toBe(true);
      expect(r.request).not.toHaveProperty('musicStartSec');
    }
    // No bed, nothing to start.
    expect(validateMontageRequest(body({ musicStartSec: 30 })).request).not.toHaveProperty('musicStartSec');
  });

  it('refuses a music start that is not 0–3600 seconds, with a reason a caller can act on', () => {
    for (const musicStartSec of [-1, MAX_MUSIC_START_SEC + 0.1, '12', true, {}, [5]]) {
      const r = validateMontageRequest(body({ musicUrl: 'https://cdn.example.com/song.mp3', musicStartSec }));
      expect(r.ok).toBe(false);
      expect(r.error).toBe('musicStartSec must be a number of seconds from 0 to 3600');
    }
    expect(coerceMusicStartSec(Number.NaN).ok).toBe(false);
    expect(coerceMusicStartSec(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(coerceMusicStartSec(undefined)).toEqual({ ok: true, value: 0 });
  });
});

describe('timeline arithmetic — must mirror runSequence, not approximate it', () => {
  it('hard cuts simply sum', () => {
    expect(timelineDuration([shot({ endSec: 5 }), shot({ endSec: 4 })])).toBe(9);
  });

  it('a transition SHORTENS the timeline by the overlap', () => {
    // acc=5, seg=4 → dd = max(0.1, min(0.6, 2, 2.5)) = 0.6 → 5 + 4 - 0.6
    expect(timelineDuration([shot({ endSec: 5 }), shot({ endSec: 4, transition: 'crossfade' })])).toBe(8.4);
  });

  it('clamps the overlap against the SHORTER of half-shot and half-accumulated, capped at 0.6', () => {
    expect(transitionOverlap(10, 10)).toBe(TRANSITION_MAX_SEC);
    expect(transitionOverlap(10, 0.8)).toBe(0.4);   // seg/2 wins
    expect(transitionOverlap(0.6, 10)).toBe(0.3);   // acc/2 wins
  });

  it('never returns zero — runSequence floors the fade at 0.1s even between tiny shots', () => {
    // This is the trap: a "negligible" transition still eats 100ms, so a plan that assumed 0 would
    // over-report the master length and mis-size the bitrate cap.
    expect(transitionOverlap(0.1, 0.1)).toBe(0.1);
    expect(transitionOverlap(0, 0)).toBe(0.1);
  });

  it('folds left-to-right against the ACCUMULATED length, not the previous shot alone', () => {
    // acc after s1 = 2; s2 fade: dd = min(0.6, 3/2, 2/2) = 0.6 → acc = 2 + 3 - 0.6 = 4.4
    // s3 fade: dd = min(0.6, 2, 2.2) = 0.6 → 4.4 + 4 - 0.6 = 7.8
    const t = timelineDuration([
      shot({ endSec: 2 }),
      shot({ endSec: 3, transition: 'fade' }),
      shot({ endSec: 4, transition: 'crossfade' }),
    ]);
    expect(t).toBe(7.8);
  });
});

describe('concat plan', () => {
  it("maps the studio's 'cut' to surgicalOps' absent transition, and keeps the others", () => {
    const plan = buildConcatPlan([shot(), shot({ transition: 'crossfade' }), shot({ transition: 'fade' })]);
    expect(plan[0]?.transition).toBeUndefined();
    expect(plan[1]?.transition).toBe('crossfade');
    expect(plan[2]?.transition).toBe('fade');
  });

  it('addresses sources positionally so a bridged still keeps its slot', () => {
    const plan = buildConcatPlan([shot(), shot({ kind: 'image' }), shot()]);
    expect(plan.map((p) => p.src)).toEqual([0, 1, 2]);
  });

  it('rebases a still to 0 — its generated clip has its own timeline', () => {
    const plan = buildConcatPlan([shot({ kind: 'image', startSec: 12, endSec: 15 }), shot()]);
    expect(plan[0]).toMatchObject({ start: 0, end: 3 });
  });

  it('keeps a real clip trim window as-is', () => {
    const plan = buildConcatPlan([shot({ startSec: 12, endSec: 15 }), shot()]);
    expect(plan[0]).toMatchObject({ start: 12, end: 15 });
  });

  it('musicOnly mutes every source so only the bed survives', () => {
    const plan = buildConcatPlan([shot({ muted: false }), shot({ muted: false })], { musicOnly: true });
    expect(plan.every((p) => p.muted)).toBe(true);
  });

  it('emits a COMPLETE TextOverlay — surgicalOps requires position, fontSize and fontColor', () => {
    const plan = buildConcatPlan([shot({ caption: 'გამარჯობა' }), shot()], { aspect: '9:16' });
    expect(plan[0]?.textOverlay).toEqual({
      text: 'გამარჯობა',
      position: 'bottom-center',
      fontSize: captionFontSize('9:16'),
      fontColor: '#FFFFFF',
    });
  });

  it('scales caption size to the frame, so 9:16 is not illegible', () => {
    expect(captionFontSize('9:16')).toBeGreaterThan(captionFontSize('16:9'));
  });

  it('centres a title and sets it larger than a subtitle', () => {
    const plan = buildConcatPlan([shot({ caption: 'სათაური', captionPos: 'center' }), shot({ caption: 'ქვედა' })], { aspect: '9:16' });
    expect(plan[0]?.textOverlay?.position).toBe('center');
    expect(plan[0]?.textOverlay?.fontSize).toBe(captionFontSize('9:16', 'center'));
    expect(plan[1]?.textOverlay?.position).toBe('bottom-center');
    expect(captionFontSize('9:16', 'center')).toBeGreaterThan(captionFontSize('9:16'));
  });
});

describe('size cap', () => {
  it('targets ~42MB, so a long montage is not rejected by storage after a full encode', () => {
    // 42MB over 300s ≈ 1147 kbps, below the 2000 floor → floor wins.
    expect(maxrateForTarget(300)).toBe(2000);
    // A 30s master can afford much more.
    expect(maxrateForTarget(30)).toBe(Math.round((42 * 8192) / 30) - 192);
  });

  it('never returns a nonsense cap for a zero or negative duration', () => {
    expect(maxrateForTarget(0)).toBeGreaterThanOrEqual(2000);
    expect(maxrateForTarget(-5)).toBeGreaterThanOrEqual(2000);
  });
});
