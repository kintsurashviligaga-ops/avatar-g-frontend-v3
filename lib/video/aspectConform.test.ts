/** @jest-environment node */
import { needsAspectConform, describeAspect, ORIENTATION_ASPECT, ORIENTATION_DIMS } from './aspectConform';

describe('the shapes a provider actually returns', () => {
  it('THE BUG: Veo returns 16:9, the user asked for vertical — that must be conformed', () => {
    expect(needsAspectConform({ w: 1920, h: 1080 }, 'vertical')).toBe(true);
  });

  it('1:1 and 4:5 can never come back native from Veo, so both always conform', () => {
    expect(needsAspectConform({ w: 1920, h: 1080 }, 'square')).toBe(true);
    expect(needsAspectConform({ w: 1080, h: 1920 }, 'square')).toBe(true);
    expect(needsAspectConform({ w: 1080, h: 1920 }, 'portrait')).toBe(true);
  });

  it('leaves a clip that already matches alone — a re-encode for nothing is quality lost for nothing', () => {
    expect(needsAspectConform({ w: 1080, h: 1920 }, 'vertical')).toBe(false);
    expect(needsAspectConform({ w: 1920, h: 1080 }, 'landscape')).toBe(false);
    expect(needsAspectConform({ w: 1080, h: 1080 }, 'square')).toBe(false);
    expect(needsAspectConform({ w: 1080, h: 1350 }, 'portrait')).toBe(false);
  });

  it('tolerates macroblock-aligned heights — 1920x1088 is not "the wrong shape"', () => {
    expect(needsAspectConform({ w: 1920, h: 1088 }, 'landscape')).toBe(false);
  });

  it('accepts any resolution at the right ratio, not just the canonical dims', () => {
    expect(needsAspectConform({ w: 720, h: 1280 }, 'vertical')).toBe(false);
    expect(needsAspectConform({ w: 3840, h: 2160 }, 'landscape')).toBe(false);
  });
});

describe('an unmeasurable clip is never mangled on a guess', () => {
  it.each([[null], [undefined], [{ w: 0, h: 0 }], [{ w: 1080, h: 0 }], [{ w: Number.NaN, h: 100 }]])(
    'returns false for %p', (d) => {
      expect(needsAspectConform(d as { w: number; h: number } | null, 'vertical')).toBe(false);
    });
});

describe('the tables agree with the assembler', () => {
  it('every orientation has both dims and an aspect string', () => {
    for (const o of ['landscape', 'vertical', 'square', 'portrait'] as const) {
      expect(ORIENTATION_DIMS[o]).toHaveLength(2);
      expect(ORIENTATION_ASPECT[o]).toMatch(/^\d+:\d+$/);
    }
  });

  it('portrait is 4:5 at 1080x1350 — the canvas the multi-clip filtergraph uses', () => {
    expect(ORIENTATION_DIMS.portrait).toEqual([1080, 1350]);
    expect(ORIENTATION_ASPECT.portrait).toBe('4:5');
  });
});

describe('the card must state the shape actually delivered', () => {
  it.each([[1920, 1080, '16:9'], [1080, 1920, '9:16'], [1080, 1080, '1:1'], [1080, 1350, '4:5']])(
    '%ix%i → %s', (w, h, want) => {
      expect(describeAspect(w, h)).toBe(want);
    });

  it('snaps a near-miss rather than inventing a new label', () => {
    expect(describeAspect(1920, 1088)).toBe('16:9');
  });

  it('THE HONESTY CASE: an unusual shape reports its real dimensions, not a rounded lie', () => {
    expect(describeAspect(2560, 1080)).toBe('2560×1080'); // ultrawide — none of the four
  });

  it('returns null rather than guessing when dimensions are unknown', () => {
    expect(describeAspect(0, 0)).toBeNull();
    expect(describeAspect(Number.NaN, 100)).toBeNull();
    expect(describeAspect(-10, 10)).toBeNull();
  });
});
