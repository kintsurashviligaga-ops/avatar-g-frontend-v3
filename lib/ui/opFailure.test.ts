/** @jest-environment node */
import { describeOpFailure, filmFailureText, opFailureReason } from './opFailure';

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

describe('opFailureReason: the route\'s sentence alone (Video Core round 3)', () => {
  it('returns the human sentence, bounded', () => {
    expect(opFailureReason({ error: 'qc_rejected', message: 'The finished video failed its quality check.' })).toBe('The finished video failed its quality check.');
    expect(opFailureReason({ message: 'x'.repeat(400) })).toHaveLength(160);
  });
  it('a machine code or nothing is null, so the caller falls back to its own line', () => {
    expect(opFailureReason({ error: 'music_unreadable' })).toBeNull();
    expect(opFailureReason(null)).toBeNull();
    expect(opFailureReason({})).toBeNull();
  });
});

describe('filmFailureText: a headline in the user\'s language, then the route\'s sentence (review 2026-10-13, finding F)', () => {
  const body = { error: 'qc_rejected', message: 'The finished video failed its quality check.' };
  test('ka · en · ru each lead with their own short headline and keep the whole reason', () => {
    expect(filmFailureText(body, 'ka', 'generic')).toBe('ვიდეო ვერ შეიქმნა: The finished video failed its quality check.');
    expect(filmFailureText(body, 'en', 'generic')).toBe('The video was not made: The finished video failed its quality check.');
    expect(filmFailureText(body, 'ru', 'generic')).toBe('Видео не создано: The finished video failed its quality check.');
  });
  test('only a code, or nothing: the caller\'s translated line', () => {
    expect(filmFailureText({ error: 'music_unreadable' }, 'ka', 'ქართული ზოგადი')).toBe('ქართული ზოგადი');
    expect(filmFailureText(null, 'ru', 'общий')).toBe('общий');
  });
});
