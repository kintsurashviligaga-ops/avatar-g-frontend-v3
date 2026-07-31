/** @jest-environment node */
import { describeOpFailure } from './opFailure';

const FB = 'Failed';

describe('the route’s own explanation reaches the user', () => {
  it('THE BUG: a real reason used to be replaced by the word "Failed"', () => {
    expect(describeOpFailure({ message: 'The mask covers the entire frame.' }, FB))
      .toBe('Failed — The mask covers the entire frame.');
  });

  it('reads message, then detail, then error — in that order of humanity', () => {
    expect(describeOpFailure({ error: 'x_y', detail: 'Provider timed out.' }, FB)).toContain('Provider timed out.');
    expect(describeOpFailure({ message: 'First.', detail: 'Second.' }, FB)).toContain('First.');
  });

  it('accepts a human sentence even when it arrives in `error`', () => {
    expect(describeOpFailure({ error: 'Prompt rejected by the safety filter' }, FB)).toContain('safety filter');
  });
});

describe('machine codes must never reach the screen', () => {
  it.each(['insufficient_credits', 'provider_not_configured', 'RATE_LIMITED', 'deck_failed', 'invalid.request'])(
    'suppresses %s and shows the translated fallback instead', (code) => {
      expect(describeOpFailure({ error: code }, FB)).toBe(FB);
    });

  it('a code in `message` is suppressed just the same', () => {
    expect(describeOpFailure({ message: 'insufficient_credits' }, FB)).toBe(FB);
  });

  it('does not mistake a real sentence for a code', () => {
    expect(describeOpFailure({ message: 'Upload failed. Try a smaller file.' }, FB)).toContain('smaller file');
  });
});

describe('bounds and junk', () => {
  it('caps the length — a provider can echo the whole prompt back', () => {
    const out = describeOpFailure({ message: 'q '.repeat(500) }, FB);
    expect(out.length).toBeLessThanOrEqual(FB.length + 3 + 160);
  });

  it.each([[null], [undefined], [{}], ['a string'], [42], [{ message: '   ' }], [{ error: 123 }]])(
    'returns the bare fallback for %p', (body) => {
      expect(describeOpFailure(body, FB)).toBe(FB);
    });
});
