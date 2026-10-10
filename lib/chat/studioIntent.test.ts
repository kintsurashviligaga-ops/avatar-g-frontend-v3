/** @jest-environment node */
import { detectStudioIntent, mineDurationSec, mineTargetLanguage } from './studioIntent';

describe('the four services that had no sentence path at all', () => {
  it.each([
    ['dub this video into Russian', 'dubbing'],
    ['make me a 10-slide deck about AI', 'presentation'],
    ['create a 3D model of a sneaker', 'model3d'],
    ['stitch these clips together', 'montage'],
    ['make me an avatar', 'avatar'],
  ])('%s → %s', (text, service) => {
    expect(detectStudioIntent(text)?.service).toBe(service);
  });

  it('routes Georgian', () => {
    expect(detectStudioIntent('გადათარგმნე ეს ვიდეო რუსულად')?.service).toBe('dubbing');
    expect(detectStudioIntent('შექმენი 12 სლაიდიანი პრეზენტაცია')?.service).toBe('presentation');
    expect(detectStudioIntent('გააკეთე 3D მოდელი')?.service).toBe('model3d');
  });

  it('routes Georgian object-first, verb-last requests (Master Task §52)', () => {
    const dub = detectStudioIntent('ამ ვიდეოს ხმა ქართულად გადამითარგმნე.');
    expect(dub?.service).toBe('dubbing');
    expect(dub?.params.targetLanguage).toBe('ka');
    expect(detectStudioIntent('ეს ვიდეო რუსულად გადათარგმნე')?.service).toBe('dubbing');
    expect(detectStudioIntent('პრეზენტაცია გამიკეთე ხელოვნურ ინტელექტზე')?.service).toBe('presentation');
  });

  it('a Georgian text translation is not dubbing, whatever the word order', () => {
    expect(detectStudioIntent('ეს ტექსტი ინგლისურად გადამითარგმნე')).toBeNull();
    // a declarative that shares the „მი" shape is not a request
    expect(detectStudioIntent('პრეზენტაციის გაკეთება შემიძლია')).toBeNull();
  });

  it('routes Russian', () => {
    expect(detectStudioIntent('озвучь это видео на английский')?.service).toBe('dubbing');
    expect(detectStudioIntent('сделай презентацию на 8 слайдов')?.service).toBe('presentation');
  });
});

describe('a question about a service must NOT drag the user into a form', () => {
  it.each([
    'what is dubbing?',
    'how much does a presentation cost?',
    'can you make 3D models?',
    'რა არის დუბლირება?',
    'რამდენი ღირს პრეზენტაცია?',
    'сколько стоит дубляж?',
    'do you support montage?',
  ])('%s → no route', (text) => {
    expect(detectStudioIntent(text)).toBeNull();
  });

  it('a bare service noun with no request is not a request', () => {
    expect(detectStudioIntent('dubbing')).toBeNull();
    expect(detectStudioIntent('presentations are useful')).toBeNull();
  });
});

describe('dubbing picks the DESTINATION language, not the source', () => {
  it('THE TRAP: "the Russian subtitles into English" must resolve to English', () => {
    expect(detectStudioIntent('dub the Russian subtitles into English')?.params.targetLanguage).toBe('en');
  });

  it('reads the Georgian adverbial case ending', () => {
    expect(detectStudioIntent('გადათარგმნე ეს ვიდეო ინგლისურად')?.params.targetLanguage).toBe('en');
    expect(detectStudioIntent('გააკეთე ამ ვიდეოს დუბლირება რუსულად')?.params.targetLanguage).toBe('ru');
  });

  it('omits the language when none was named', () => {
    expect(detectStudioIntent('dub this video')?.params.targetLanguage).toBeUndefined();
  });
});

describe('parameters are mined only when explicitly present, and always bounded', () => {
  it('reads the slide count the user asked for', () => {
    expect(detectStudioIntent('make a 12 slide deck')?.params.slideCount).toBe(12);
    expect(detectStudioIntent('შექმენი 7 სლაიდიანი პრეზენტაცია')?.params.slideCount).toBe(7);
  });

  it('caps an absurd slide count instead of forwarding it', () => {
    expect(detectStudioIntent('make a 900 slide deck')?.params.slideCount).toBe(50);
  });

  it('reads montage duration in both seconds and minutes', () => {
    expect(detectStudioIntent('stitch these clips into a 45 second video')?.params.durationSec).toBe(45);
    expect(detectStudioIntent('combine the clips into a 2 minute montage')?.params.durationSec).toBe(120);
  });

  it('leaves params empty rather than inventing defaults', () => {
    expect(detectStudioIntent('make me a deck')?.params).toEqual({});
  });
});

describe('specificity: dubbing beats the incidental word "video"', () => {
  it('"dub this video" is dubbing, not montage', () => {
    expect(detectStudioIntent('dub this video into Russian')?.service).toBe('dubbing');
  });

  it('"combine the videos" is montage', () => {
    expect(detectStudioIntent('combine the videos')?.service).toBe('montage');
  });
});

describe('bounds and junk', () => {
  it.each([[''], ['   '], [null], [undefined]])('is null for %p', (t) => {
    expect(detectStudioIntent(t as string | null | undefined)).toBeNull();
  });

  it('does not scan an unbounded paste', () => {
    // The service noun sits far past the 400-char window, so it must not route.
    expect(detectStudioIntent(`${'x '.repeat(400)}make a presentation`)).toBeNull();
  });

  it('ordinary chat never routes', () => {
    for (const s of ['hello', 'thanks!', 'who won the world cup', 'გამარჯობა', 'write me a poem']) {
      expect(detectStudioIntent(s)).toBeNull();
    }
  });
});

describe('Agent G PART 1: lengths with a hyphen, and a frame shape is not a translation', () => {
  test('„20-წამიანი", "20-second", „30-секундный" name a length', () => {
    expect(mineDurationSec('გააკეთე 20-წამიანი რეკლამა')).toBe(20);
    expect(mineDurationSec('a 20-second montage')).toBe(20);
    expect(mineDurationSec('30-секундный ролик')).toBe(30);
    expect(mineDurationSec('2-minute reel')).toBe(120);
  });
  test('«Переведи это видео в 9:16» is a conversion; with a language it is still dubbing', () => {
    expect(detectStudioIntent('Переведи это видео в 9:16')).toBeNull();
    expect(detectStudioIntent('ეს ვიდეო ვერტიკალურად გადათარგმნე')).toBeNull();
    expect(detectStudioIntent('Переведи это видео на английский')).toMatchObject({ service: 'dubbing', params: { targetLanguage: 'en' } });
  });
  test('mineTargetLanguage reads the destination only', () => {
    expect(mineTargetLanguage('ეს ვიდეო რუსულად გაახმოვანე')).toBe('ru');
    expect(mineTargetLanguage('dub it into English')).toBe('en');
  });
});
