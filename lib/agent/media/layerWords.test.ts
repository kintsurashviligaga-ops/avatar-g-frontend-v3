/**
 * lib/agent/media/layerWords — the owner's nine v2.1 commands (2026-10-11 13:31Z addendum) and their en/ru twins, read
 * into the typed `layers` / `captions` asks the server resolves. The words drawn come from quotes or a colon only.
 */
import { drawnWordsOf, LOGO_REF, mineComposition } from './layerWords';

const layersOf = (text: string) => {
  const m = mineComposition(text);
  const l = m.asks.find((a) => a.op === 'layers');
  return { m, l: l && l.op === 'layers' ? l : undefined };
};

describe('the owner\'s nine commands', () => {
  test('„ვიდეოს ქართული ქეფშენები დაამატე." — captions of what is said need a transcription: said, not guessed', () => {
    const m = mineComposition('ვიდეოს ქართული ქეფშენები დაამატე.');
    expect(m.hit).toBe(true);
    expect(m.asks).toEqual([]);
    expect(m.unsupported).toEqual(['speech_captions']);
  });

  test('„სიტყვები მუსიკის ბიტებზე გამოაჩინე." — every text of ours, word by word on the beats', () => {
    const { m, l } = layersOf('სიტყვები მუსიკის ბიტებზე გამოაჩინე.');
    expect(m.hit).toBe(true);
    expect(l?.change).toEqual([{ target: { kind: 'text', all: true }, motionIn: 'words', beats: true }]);
  });

  test('„ტექსტი უფრო პრემიუმ და მინიმალისტური გახადე." — a new look for every text', () => {
    const { l } = layersOf('ტექსტი უფრო პრემიუმ და მინიმალისტური გახადე.');
    expect(l?.change).toEqual([{ target: { kind: 'text', all: true }, style: 'premium' }]);
  });

  test('„ზედა ლოგო მოხსენი, პაკეტის ლოგო შეინარჩუნე." — the top picture layer goes; the package is left alone', () => {
    const { m, l } = layersOf('ზედა ლოგო მოხსენი, პაკეტის ლოგო შეინარჩუნე.');
    expect(l?.remove).toEqual([{ kind: 'image', where: 'top' }]);
    expect(l?.add).toBeUndefined();
    expect(l?.change).toBeUndefined();
    expect(m.logo).toBe(false);
  });

  test('„აქ დააწერე: მიტანის სერვისი თბილისში." — exactly those words, the full stop is the sentence\'s', () => {
    const { m, l } = layersOf('აქ დააწერე: მიტანის სერვისი თბილისში.');
    expect(l?.add).toEqual([{ kind: 'text', text: 'მიტანის სერვისი თბილისში' }]);
    expect(m.rest).toBe('აქ დააწერე');
  });

  test('„ბოლო სამ წამში ანიმაციური CTA ჩასვი: შეუკვეთე ახლავე" — a CTA in the last 3 s', () => {
    const { m, l } = layersOf('ბოლო სამ წამში ანიმაციური CTA ჩასვი: შეუკვეთე ახლავე');
    expect(l?.add).toEqual([{ kind: 'text', role: 'cta', text: 'შეუკვეთე ახლავე', lastSec: 3 }]);
    expect(m.timeUsed).toBe(true);
  });

  test('a CTA with no words asks for them', () => {
    const m = mineComposition('ბოლო სამ წამში ანიმაციური CTA ჩასვი.');
    expect(m.hit).toBe(true);
    expect(m.asks).toEqual([]);
    expect(m.missing).toEqual(['cta_text']);
  });

  test('„ტექსტი მარცხნივ გადაიტანე და ზომა შეამცირე." — one change: left, 0.8×', () => {
    const { l } = layersOf('ტექსტი მარცხნივ გადაიტანე და ზომა შეამცირე.');
    expect(l?.change).toHaveLength(1);
    expect(l?.change?.[0]).toMatchObject({ target: { kind: 'text' }, moveH: 'left', sizeBy: 0.8 });
    expect(l?.change?.[0]?.target?.all).toBeUndefined();
  });

  test('„იგივე ვიდეო მომეცი ქეფშენებით და ქეფშენების გარეშე." — both copies of the earlier track', () => {
    const m = mineComposition('იგივე ვიდეო მომეცი ქეფშენებით და ქეფშენების გარეშე.');
    expect(m.asks).toEqual([{ op: 'captions', deliver: 'both' }]);
  });

  test('„ეს დიზაინი 9:16 სტორად გადააკეთე." — not a layer ask (the aspect edit reads it)', () => {
    const m = mineComposition('ეს დიზაინი 9:16 სტორად გადააკეთე.');
    expect(m.hit).toBe(false);
    expect(m.asks).toEqual([]);
    expect(m.rest).toBe('ეს დიზაინი 9:16 სტორად გადააკეთე.');
  });
});

describe('the same in English and Russian', () => {
  test('en: put text, a CTA, move, restyle, remove the top logo, both copies', () => {
    expect(layersOf('Put this on it: "Delivery in Tbilisi"').l?.add).toEqual([{ kind: 'text', text: 'Delivery in Tbilisi' }]);
    expect(layersOf('Add an animated CTA in the last 3 seconds: "Order now"').l?.add)
      .toEqual([{ kind: 'text', role: 'cta', text: 'Order now', lastSec: 3 }]);
    expect(layersOf('Add an animated CTA in the last three seconds: "Order now"').l?.add?.[0]).toMatchObject({ lastSec: 3 });
    expect(layersOf('Move the text to the left and make it smaller').l?.change?.[0]).toMatchObject({ moveH: 'left', sizeBy: 0.8 });
    expect(layersOf('Make the text more premium').l?.change).toEqual([{ target: { kind: 'text', all: true }, style: 'premium' }]);
    expect(layersOf('Remove the top logo, keep the logo on the package').l?.remove).toEqual([{ kind: 'image', where: 'top' }]);
    expect(mineComposition('Give me the same video with and without captions').asks).toEqual([{ op: 'captions', deliver: 'both' }]);
    expect(mineComposition('Add English subtitles').unsupported).toEqual(['speech_captions']);
  });

  test('ru: надпись, CTA, перемести, убери логотип, с субтитрами и без', () => {
    expect(layersOf('Напиши на видео: «Доставка по Тбилиси»').l?.add).toEqual([{ kind: 'text', text: 'Доставка по Тбилиси' }]);
    expect(layersOf('Добавь CTA в последние 3 секунды: «Закажи сейчас»').l?.add?.[0]).toMatchObject({ role: 'cta', lastSec: 3 });
    expect(layersOf('Перемести текст вправо и уменьши').l?.change?.[0]).toMatchObject({ moveH: 'right', sizeBy: 0.8 });
    expect(layersOf('Убери верхний логотип').l?.remove).toEqual([{ kind: 'image', where: 'top' }]);
    expect(mineComposition('То же видео с субтитрами и без').asks).toEqual([{ op: 'captions', deliver: 'both' }]);
  });
});

describe('what the words carry', () => {
  test('the drawn words are never read as a command („სიჩქარე" in them is not a speed-up)', () => {
    const m = mineComposition('აქ დააწერე: სიჩქარე და ხარისხი');
    expect(m.rest).not.toMatch(/სიჩქარე/u);
    expect(layersOf('აქ დააწერე: სიჩქარე და ხარისხი').l?.add?.[0]).toMatchObject({ text: 'სიჩქარე და ხარისხი' });
  });

  test('drawnWordsOf: quotes first, then a colon; the words are kept as typed', () => {
    expect(drawnWordsOf('დაამატე „ახალი კოლექცია" ზემოთ')?.words).toBe('ახალი კოლექცია');
    expect(drawnWordsOf('Title: NEW Drop...')?.words).toBe('NEW Drop...');
    expect(drawnWordsOf('just a sentence.')).toBeNull();
  });

  test('typed caption lines become a track in their language', () => {
    const m = mineComposition('ქეფშენები დაადე:\n0:00-0:02 გამარჯობა\n0:02-0:04 მიტანა უფასოა');
    const c = m.asks[0];
    expect(c?.op).toBe('captions');
    if (c?.op !== 'captions') return;
    expect(c.track?.lang).toBe('ka');
    expect(c.track?.source).toBe('typed');
    expect(c.track?.cues.map((q) => q.text)).toEqual(['გამარჯობა', 'მიტანა უფასოა']);
  });

  test('caption lines typed on one line (a phone sends on return): every line kept, none merged into another', () => {
    const cuesOf = (t: string) => {
      const c = mineComposition(t).asks[0];
      return c?.op === 'captions' ? c.track?.cues.map((q) => [q.startSec, q.endSec, q.text]) : undefined;
    };
    const two = [[0, 2, 'გამარჯობა'], [2, 4, 'მიტანა უფასოა']];
    expect(cuesOf('ქეფშენები დაადე: 0:00-0:02 გამარჯობა; 0:02-0:04 მიტანა უფასოა')).toEqual(two);
    expect(cuesOf('ქეფშენები დაადე: 0:00-0:02 გამარჯობა, 0:02-0:04 მიტანა უფასოა')).toEqual(two);
    expect(cuesOf('ქეფშენები დაადე: 0:00-0:02 გამარჯობა 0:02-0:04 მიტანა უფასოა')).toEqual(two);
    expect(cuesOf('Add captions: 1-3 s Hello; 3-5 s Order now')).toEqual([[1, 3, 'Hello'], [3, 5, 'Order now']]);
    // A number range inside the words is not a new line.
    expect(cuesOf('ქეფშენები დაადე: 0:00-0:03 მიტანა, 2-3 დღეში')).toEqual([[0, 3, 'მიტანა, 2-3 დღეში']]);
  });

  test('a translation is a model call: said, not done', () => {
    expect(mineComposition('ქეფშენები ინგლისურად თარგმნე').unsupported).toEqual(['translate_captions']);
  });

  test('captions off', () => {
    expect(mineComposition('ქეფშენები მოხსენი').asks).toEqual([{ op: 'captions', off: true }]);
  });

  test('a logo: the attached picture, placed', () => {
    const { m, l } = layersOf('ლოგო მარჯვენა ზედა კუთხეში დაადე');
    expect(m.logo).toBe(true);
    expect(l?.add).toEqual([{ kind: 'image', ref: LOGO_REF, anchor: 'top-right' }]);
  });

  test('a mask: blur or mosaic, at a place', () => {
    expect(layersOf('ქვედა ნაწილი დაბლარე').l?.add).toEqual([{ kind: 'mask', mode: 'blur', anchor: 'bottom' }]);
    expect(layersOf('pixelate the top right corner').l?.add).toEqual([{ kind: 'mask', mode: 'mosaic', anchor: 'top-right' }]);
  });

  test('removing every text, and adding with no words', () => {
    expect(layersOf('ყველა ტექსტი წაშალე').l?.remove).toEqual([{ kind: 'text', all: true }]);
    const m = mineComposition('ტექსტი დაამატე');
    expect(m.missing).toEqual(['caption_text']);
  });

  test('a timed range belongs to the layer', () => {
    const { m, l } = layersOf('2-დან 5-მდე დააწერე: ფასდაკლება 20%');
    expect(l?.add?.[0]).toMatchObject({ text: 'ფასდაკლება 20%', fromSec: 2, toSec: 5 });
    expect(m.timeUsed).toBe(true);
  });

  test('nothing about text, logos or captions: no hit', () => {
    for (const t of ['ვიდეო 10 წამამდე შეამოკლე', 'make it brighter', 'сделай ярче', '']) {
      expect(mineComposition(t).hit).toBe(false);
    }
  });
});
