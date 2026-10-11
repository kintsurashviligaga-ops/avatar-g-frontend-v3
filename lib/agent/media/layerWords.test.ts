/**
 * lib/agent/media/layerWords — the owner's nine v2.1 commands (2026-10-11 13:31Z addendum) and their en/ru twins, read
 * into the typed `layers` / `captions` asks the server resolves. The words drawn come from quotes or a colon only.
 */
import { mineEdits } from './editWords';
import { drawnItemsOf, drawnWordsOf, END_TEXT_SEC, LOGO_REF, mineComposition } from './layerWords';
import { resolveLayers } from './layers';

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
    expect(l?.remove).toEqual([{ kind: 'image', where: 'top', at: 'top' }]);
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
    expect(layersOf('Remove the top logo, keep the logo on the package').l?.remove).toEqual([{ kind: 'image', where: 'top', at: 'top' }]);
    expect(mineComposition('Give me the same video with and without captions').asks).toEqual([{ op: 'captions', deliver: 'both' }]);
    expect(mineComposition('Add English subtitles').unsupported).toEqual(['speech_captions']);
  });

  test('ru: надпись, CTA, перемести, убери логотип, с субтитрами и без', () => {
    expect(layersOf('Напиши на видео: «Доставка по Тбилиси»').l?.add).toEqual([{ kind: 'text', text: 'Доставка по Тбилиси' }]);
    expect(layersOf('Добавь CTA в последние 3 секунды: «Закажи сейчас»').l?.add?.[0]).toMatchObject({ role: 'cta', lastSec: 3 });
    expect(layersOf('Перемести текст вправо и уменьши').l?.change?.[0]).toMatchObject({ moveH: 'right', sizeBy: 0.8 });
    expect(layersOf('Убери верхний логотип').l?.remove).toEqual([{ kind: 'image', where: 'top', at: 'top' }]);
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

  test('what is in the picture itself: its exact place and its time go with the removal (GG 2026-10-11 17:38Z)', () => {
    expect(layersOf('ზედა მარჯვენა კუთხეში ლოგო მოაშორე').l?.remove).toEqual([{ kind: 'image', where: 'top', at: 'top-right' }]);
    expect(layersOf('წყლის ნიშანი ქვედა მარცხენა კუთხიდან წაშალე').l?.remove).toEqual([{ kind: 'image', where: 'bottom', at: 'bottom-left' }]);
    expect(layersOf('remove the watermark in the bottom right corner').l?.remove).toEqual([{ kind: 'image', where: 'bottom', at: 'bottom-right' }]);
    expect(layersOf('убери водяной знак в правом верхнем углу').l?.remove).toEqual([{ kind: 'image', where: 'top', at: 'top-right' }]);
    expect(layersOf('ქვემოთ ტექსტი წაშალე').l?.remove).toEqual([{ kind: 'text', where: 'bottom', at: 'bottom' }]);
    // Something written, no text noun said.
    expect(layersOf('ზემოთ რაღაც წერია, მოაშორე').l?.remove).toEqual([{ kind: 'text', where: 'top', at: 'top' }]);
    // A stretch: the removal's, not a trim.
    const timed = layersOf('პირველ 3 წამში ზედა ტექსტი მოაშორე');
    expect(timed.l?.remove).toEqual([{ kind: 'text', where: 'top', at: 'top', firstSec: 3 }]);
    expect(timed.m.timeUsed).toBe(true);
    expect(mineEdits('პირველ 3 წამში ზედა ტექსტი მოაშორე').edits.some((e) => e.op === 'trim')).toBe(false);
  });

  test('subtitles off and a logo removed in one message: both read', () => {
    const m = mineComposition('ზედა მარჯვენა კუთხეში ლოგო მოაშორე და ქვედა სუბტიტრები წაშალე');
    expect(m.asks).toEqual([
      { op: 'captions', off: true },
      { op: 'layers', remove: [{ kind: 'image', where: 'top', at: 'top-right' }] },
    ]);
  });

  test('a person, an object or the background out of the picture: said, never smeared over', () => {
    for (const t of ['ეს ადამიანი ვიდეოდან ამოიღე', 'remove the car from the video', 'убери человека из кадра', 'ფონი მოაშორე', 'remove the background']) {
      const m = mineComposition(t);
      expect(m.hit).toBe(true);
      expect(m.unsupported).toEqual(['remove_object']);
      expect(m.asks).toEqual([]);
    }
    // The background MUSIC is sound, not the picture.
    expect(mineComposition('ფონის მუსიკა მოაშორე').unsupported).toEqual([]);
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

// ── the owner's montage message (2026-10-11 15:27Z): texts written without quotes, a motion, an end text ─────────────

const GG = 'დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59 წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს ქართულად უნდა დაიწეროს გადმოდი საიტზე';

describe('texts written out without quotes', () => {
  test('the owner\'s message: „myavatar.ge🚀" beautiful and moving until the end, „გადმოდი საიტზე" the last 3 s', () => {
    const { m, l } = layersOf(GG);
    expect(m.unsupported).toEqual([]); // „გაუკეთე ქებშენი" is the text written out, not a transcription
    expect(m.missing).toEqual([]);
    expect(l?.add).toEqual([
      { kind: 'text', text: 'myavatar.ge🚀', style: 'cinematic', motionIn: 'slide-up', beforeLastSec: END_TEXT_SEC },
      { kind: 'text', text: 'გადმოდი საიტზე', role: 'cta', lastSec: END_TEXT_SEC },
    ]);
    // The rest of the message keeps its other asks (speed, music start, overlay) and loses only the drawn words.
    expect(m.rest).toContain('ააჩქარე');
    expect(m.rest).toContain('0.59 წამიდან');
    expect(m.rest).toContain('ოვერლეი');
    expect(m.rest).not.toContain('myavatar');
    expect(m.rest).not.toContain('საიტზე');
  });

  test('each unquoted text stops where the next ask begins („… და ბოლო 2 წამში დაიწეროს …")', () => {
    const { l } = layersOf('დააწერე გამარჯობა! და ბოლო 2 წამში დაიწეროს ნახვამდის');
    expect(l?.add).toEqual([
      { kind: 'text', text: 'გამარჯობა!', beforeLastSec: 2 },
      { kind: 'text', text: 'ნახვამდის', lastSec: 2 },
    ]);
  });

  test('a colon still takes its words as before, and a long sentence after „დააწერე რომ" is not drawn', () => {
    expect(layersOf('აქ დააწერე: სიჩქარე და ხარისხი').l?.add).toEqual([{ kind: 'text', text: 'სიჩქარე და ხარისხი' }]);
    expect(drawnItemsOf('დააწერე რომ ეს არის ჩვენი ახალი პროდუქტი რომელიც ძალიან კარგია და ყველამ უნდა იყიდოს აუცილებლად დღესვე')).toBeNull();
  });

  test('two quoted texts with their places; English „a text that says"; a plain „write" before quotes', () => {
    expect(layersOf('დააწერე „A“ ზემოთ და „B“ ქვემოთ').l?.add).toEqual([
      { kind: 'text', text: 'A', anchor: 'top' },
      { kind: 'text', text: 'B', anchor: 'bottom' },
    ]);
    expect(layersOf('add a text that says Summer sale at the bottom').l?.add).toEqual([{ kind: 'text', text: 'Summer sale', anchor: 'bottom' }]);
    expect(layersOf('write "Summer" at the bottom').l?.add).toEqual([{ kind: 'text', text: 'Summer', anchor: 'bottom' }]);
  });

  test('a logo beside one quoted text: both, each from its own clause', () => {
    const { m, l } = layersOf('cut these to the music, add my logo top right and write "Summer" at the bottom');
    expect(m.logo).toBe(true);
    expect(l?.add).toEqual([
      { kind: 'text', text: 'Summer', anchor: 'bottom' },
      { kind: 'image', ref: LOGO_REF, anchor: 'top-right' },
    ]);
  });
});

describe('beforeLastSec: a text up to the seconds the end text takes', () => {
  test('on a 30 s result it shows 0–27 s; the end text 27–30 s; on a 2 s result it keeps the whole length', () => {
    const r = resolveLayers({ op: 'layers', add: [
      { kind: 'text', text: 'myavatar.ge🚀', beforeLastSec: 3 },
      { kind: 'text', text: 'გადმოდი საიტზე', role: 'cta', lastSec: 3 },
    ] }, [], 30, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layers.map((x) => [x.startSec, x.endSec])).toEqual([[0, 27], [27, 30]]);
    const short = resolveLayers({ op: 'layers', add: [{ kind: 'text', text: 'x', beforeLastSec: 3 }] }, [], 2, false);
    expect(short.ok && short.layers[0]!.endSec).toBe(2);
    expect(resolveLayers({ op: 'layers', add: [{ kind: 'text', text: 'x', beforeLastSec: -1 }] }, [], 30, false).ok).toBe(false);
  });
});
