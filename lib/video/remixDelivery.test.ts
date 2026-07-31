/** @jest-environment node */
import { describeRemixDelivery } from './remixDelivery';

describe('a substitution is stated, a clean result is not', () => {
  it('says nothing when the real engine ran and the aspect was applied', () => {
    expect(describeRemixDelivery({ method: 'faceswap', aspectApplied: true }, 'en')).toEqual([]);
  });

  it('THE BUG: a Ken-Burns pan over one still used to be reported as a finished restyle', () => {
    const [note] = describeRemixDelivery({ method: 'stillPan', aspectApplied: true }, 'en');
    expect(note).toContain('single restyled frame');
    expect(note).toContain('not a re-animated clip');
  });

  it('says the original motion is gone when the swap fell back to regeneration', () => {
    expect(describeRemixDelivery({ method: 'reanimated', aspectApplied: true }, 'en')[0])
      .toContain('original motion is not preserved');
  });

  it('reports a dropped aspect ratio, which was silently ignored before', () => {
    expect(describeRemixDelivery({ method: 'faceswap', aspectApplied: false }, 'en')[0])
      .toContain('Kept the source aspect ratio');
  });

  it('reports both at once when both happened', () => {
    expect(describeRemixDelivery({ method: 'stillPan', aspectApplied: false }, 'en')).toHaveLength(2);
  });
});

describe('bounds', () => {
  it('is silent on absent or empty input rather than inventing a warning', () => {
    expect(describeRemixDelivery(null, 'en')).toEqual([]);
    expect(describeRemixDelivery({}, 'en')).toEqual([]);
    expect(describeRemixDelivery({ method: 'faceswap' }, 'en')).toEqual([]);
  });

  it('an op that never fits an aspect (undefined) is not warned about', () => {
    expect(describeRemixDelivery({ aspectApplied: undefined }, 'en')).toEqual([]);
  });

  it('translates', () => {
    expect(describeRemixDelivery({ method: 'stillPan' }, 'ka')[0]).toContain('კადრზე');
    expect(describeRemixDelivery({ method: 'stillPan' }, 'ru')[0]).toContain('панорама');
  });
});
