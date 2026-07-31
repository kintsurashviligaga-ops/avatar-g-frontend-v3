/** @jest-environment node */
import { checkSourceDuration, MAX_DUB_SOURCE_SEC } from './videoDuration';

describe('the five-minute cap the UI already promised', () => {
  it('THE BUG: a 20-minute source used to declare 60s and sail through — now it is refused', () => {
    const v = checkSourceDuration(20 * 60, 'en');
    expect(v.ok).toBe(false);
    expect(v.message).toContain('20:00');
    expect(v.message).toContain('5 minutes');
  });

  it('passes anything at or under the ceiling', () => {
    expect(checkSourceDuration(MAX_DUB_SOURCE_SEC, 'en').ok).toBe(true);
    expect(checkSourceDuration(1, 'en').ok).toBe(true);
  });

  it('refuses one second over', () => {
    expect(checkSourceDuration(MAX_DUB_SOURCE_SEC + 1, 'en').ok).toBe(false);
  });
});

describe('an unmeasurable file is not a rejected file', () => {
  it.each([[null], [0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]])('passes %p to the server, which still holds the real limit', (d) => {
    expect(checkSourceDuration(d as number | null, 'en').ok).toBe(true);
  });
});

describe('the message is usable', () => {
  it('states the actual length in m:ss, not raw seconds', () => {
    expect(checkSourceDuration(605, 'en').message).toContain('10:05');
  });

  it('pads the seconds so 6:05 never reads as 6:5', () => {
    expect(checkSourceDuration(365, 'en').message).toContain('6:05');
  });

  it('speaks the user’s language', () => {
    expect(checkSourceDuration(400, 'ka').message).toContain('წუთ');
    expect(checkSourceDuration(400, 'ru').message).toContain('минут');
  });

  it('honours a caller-supplied ceiling', () => {
    const v = checkSourceDuration(120, 'en', 60);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('1 minutes'); // plural form is fixed; the number is what matters
  });
});
