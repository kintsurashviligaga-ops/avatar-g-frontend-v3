/**
 * Regression guards for the two quality defects a real run exposed:
 *
 *  1. IDENTITY DRIFT — planFilmScenes appends the character-lock ("the SAME protagonist … ") and the
 *     consistency seed at the END of each scene prompt. Every clamp on the way to the provider used a naked
 *     `slice(0, max)`, so that tail was the FIRST thing deleted: Veo never received the identity instruction
 *     and rendered a different person in scene 2 (the owner uploaded a selfie of a man and got a woman).
 *
 *  2. SILENT FILM — Veo bakes a diegetic soundtrack into every scene, but the stitch discarded it
 *     (`concat=…:a=0`, and the clips only ever entered the graph as `[i:v]`), so a Veo ocean film came back
 *     with no wave sound.
 */
import { withColorScience, clampPreservingTail } from './colorScience';
import { buildFilterComplex } from '../orchestrator/ffmpeg-filtergraph';

const IDENTITY_TAIL =
  'Character consistency: the protagonist is a man in his late 30s, short spiky salt-and-pepper hair, ' +
  'stubble beard, plain shirt — keep his face, hair and wardrobe identical in every shot (consistency seed 5262842).';

describe('clampPreservingTail — the identity clause survives every clamp', () => {
  it('returns the string untouched when it already fits', () => {
    expect(clampPreservingTail('short prompt', 100)).toBe('short prompt');
  });

  it('keeps BOTH the opening brief and the identity tail when it must trim', () => {
    const prompt = `A calm ocean wave at sunset. ${'filler '.repeat(300)}${IDENTITY_TAIL}`;
    const out = clampPreservingTail(prompt, 900);
    expect(out.length).toBeLessThanOrEqual(900);
    expect(out.startsWith('A calm ocean wave at sunset.')).toBe(true);
    expect(out).toContain('consistency seed 5262842');
    expect(out).toContain('identical in every shot');
  });

  it('THE REGRESSION: a naked slice() would have deleted the identity tail', () => {
    const prompt = `A calm ocean wave at sunset. ${'filler '.repeat(300)}${IDENTITY_TAIL}`;
    expect(prompt.slice(0, 900)).not.toContain('consistency seed'); // the old behaviour — clause lost
    expect(clampPreservingTail(prompt, 900)).toContain('consistency seed'); // the fix
  });

  it('withColorScience preserves the identity tail even when the prompt already carries the grade', () => {
    // buildStyleGuide emits "ARRI Alexa color science", which used to take a naked-slice early return.
    const prompt = `A hero walks through a neon market. ARRI Alexa color science. ${'x'.repeat(2000)}${IDENTITY_TAIL}`;
    const out = withColorScience(prompt, 2000);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out).toContain('consistency seed 5262842');
  });

  it('the positive grade carries no negations (they inject the concept they try to suppress)', () => {
    const out = withColorScience('a quiet street', 2000);
    expect(out).not.toMatch(/\bno\s+flicker\b/i);
    expect(out).not.toMatch(/zero sepia|no yellow/i);
    expect(out).toContain('clean neutral whites');
  });
});

describe('buildFilterComplex — Veo native (diegetic) audio reaches the master', () => {
  const base = {
    nClips: 3, hasVoice: false, hasMusic: false, hasSfx: false,
    fps: 24, duckPct: 30, clipSec: 8, transition: 'cut',
  } as const;

  it('omitting nativeAudio leaves the graph unchanged (opt-in, no regression)', () => {
    const { filter, amap } = buildFilterComplex({ ...base });
    expect(filter).not.toContain('[na0]');
    expect(amap).toBeNull(); // no audio lanes at all → silent master, exactly as before
  });

  it('preserves each clip’s own soundtrack and maps it to the output', () => {
    const { filter, amap } = buildFilterComplex({ ...base, nativeAudio: [true, true, true] });
    // every clip contributes its real audio stream …
    expect(filter).toContain('[0:a]');
    expect(filter).toContain('[1:a]');
    expect(filter).toContain('[2:a]');
    // … concatenated into one diegetic lane that reaches the master
    expect(filter).toContain('concat=n=3:v=0:a=1');
    expect(amap).toBe('[aout]');
  });

  it('a silent fallback clip contributes silence instead of breaking the encode', () => {
    const { filter } = buildFilterComplex({ ...base, nativeAudio: [true, false, true] });
    expect(filter).toContain('anullsrc'); // clip 1 has no audio stream → generated silence
    expect(filter).not.toContain('[1:a]'); // never reference a missing stream (ffmpeg would abort)
    expect(filter).toContain('[0:a]');
    expect(filter).toContain('[2:a]');
  });

  it('crossfaded films acrossfade the audio so sound stays aligned with the picture', () => {
    const { filter } = buildFilterComplex({ ...base, transition: 'crossfade', nativeAudio: [true, true, true] });
    expect(filter).toContain('acrossfade=d=1');
    expect(filter).not.toContain('concat=n=3:v=0:a=1'); // straight concat would drift (N−1)s long
  });

  it('mixes the diegetic lane WITH the music bed rather than replacing it', () => {
    const { filter } = buildFilterComplex({ ...base, hasMusic: true, nativeAudio: [true, true, true] });
    expect(filter).toContain('amix');
    expect(filter).toContain('[0:a]'); // clip sound present …
    expect(filter).toContain('[3:a]'); // … alongside the music input (index nClips)
  });
});
