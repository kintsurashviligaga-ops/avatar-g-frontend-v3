/** @jest-environment node */
import { describeFilmDelivery } from './filmDelivery';

describe('a silent film must not be reported as a finished one', () => {
  it('THE BUG: every music provider missed and the card said nothing', () => {
    const [note] = describeFilmDelivery({ scoreFallback: null, musicRequested: true }, 'en');
    expect(note).toContain('no soundtrack');
  });

  it('names the backup engine when the primary was unavailable', () => {
    expect(describeFilmDelivery({ scoreFallback: 'musicgen', musicRequested: true }, 'en')[0])
      .toContain('MusicGen');
  });

  it('says nothing when the score landed normally', () => {
    expect(describeFilmDelivery({ scoreFallback: 'elevenlabs', musicRequested: true }, 'en')).toEqual([]);
    expect(describeFilmDelivery({ scoreFallback: 'udio', musicRequested: true }, 'en')).toEqual([]);
  });
});

describe('a deliberately silent film is not a degraded one', () => {
  it('says nothing when no music was requested, even though scoreFallback is null', () => {
    expect(describeFilmDelivery({ scoreFallback: null, musicRequested: false }, 'en')).toEqual([]);
  });

  it('undefined means "not reported", which is not the same as "all providers missed"', () => {
    expect(describeFilmDelivery({ scoreFallback: undefined, musicRequested: true }, 'en')).toEqual([]);
    expect(describeFilmDelivery({ musicRequested: true }, 'en')).toEqual([]);
  });
});

describe('bounds', () => {
  it.each([[null], [undefined], [{}]])('is silent for %p', (d) => {
    expect(describeFilmDelivery(d as never, 'en')).toEqual([]);
  });

  it('translates', () => {
    expect(describeFilmDelivery({ scoreFallback: null, musicRequested: true }, 'ka')[0]).toContain('საუნდტრეკი');
    expect(describeFilmDelivery({ scoreFallback: null, musicRequested: true }, 'ru')[0]).toContain('саундтрека');
  });
});
