import { editAskOf, mineEdits, type EditAsk } from './editWords';

const edits = (t: string): EditAsk[] => mineEdits(t).edits;

describe('mineEdits: ka · en · ru', () => {
  test.each<[string, EditAsk[]]>([
    // trims
    ['ვიდეო 5-დან 12 წამამდე მოჭერი', [{ op: 'trim', fromSec: 5, toSec: 12 }]],
    ['დატოვე 0:05-დან 0:12-მდე', [{ op: 'trim', fromSec: 5, toSec: 12 }]],
    ['Trim it from 5 to 12 seconds', [{ op: 'trim', fromSec: 5, toSec: 12 }]],
    ['cut 0:05–0:12', [{ op: 'trim', fromSec: 5, toSec: 12 }]],
    ['Обрежь с 5 до 12 секунды', [{ op: 'trim', fromSec: 5, toSec: 12 }]],
    ['დატოვე პირველი 10 წამი', [{ op: 'trim', toSec: 10 }]],
    ['პირველი 3 წამი მოაჭერი', [{ op: 'trim', fromSec: 3 }]],
    ['Remove the first 3 seconds', [{ op: 'trim', fromSec: 3 }]],
    ['Keep only the last 8 seconds', [{ op: 'trim', lastSec: 8 }]],
    ['Убери последние 4 секунды', [{ op: 'trim', cutEndSec: 4 }]],
    ['Оставь первые 15 секунд', [{ op: 'trim', toSec: 15 }]],
    ['ვიდეო 15 წამამდე შეამოკლე', [{ op: 'trim', toSec: 15 }]],
    ['Shorten it to 20 seconds', [{ op: 'trim', toSec: 20 }]],
    ['Trim it so it starts from 4 s', [{ op: 'trim', fromSec: 4 }]],
    // speed
    ['ვიდეო 2-ჯერ გააჩქარე', [{ op: 'speed', factor: 2 }]],
    ['გააჩქარე', [{ op: 'speed', factor: 2 }]],
    ['შეანელე ვიდეო', [{ op: 'speed', factor: 0.5 }]],
    ['Make it 1.5x speed', [{ op: 'speed', factor: 1.5 }]],
    ['Slow motion please', [{ op: 'speed', factor: 0.5 }]],
    ['Замедли в 4 раза', [{ op: 'speed', factor: 0.25 }]],
    ['Ускорь в 3 раза', [{ op: 'speed', factor: 3 }]],
    // frame
    ['ვიდეო 9:16 ფორმატში გადაიყვანე', [{ op: 'aspect', to: '9:16', fit: 'crop' }]],
    ['Convert to 16:9 with black bars', [{ op: 'aspect', to: '16:9', fit: 'pad' }]],
    ['Make it square for Instagram', [{ op: 'aspect', to: '1:1', fit: 'crop' }]],
    ['Сделай 4:5 целиком, без обрезки', [{ op: 'aspect', to: '4:5', fit: 'pad' }]],
    ['ვერტიკალური გახადე TikTok-ისთვის', [{ op: 'aspect', to: '9:16', fit: 'crop' }]],
    // colour
    ['შავ-თეთრი გახადე', [{ op: 'grade', style: 'noir' }]],
    ['Give it a vintage look', [{ op: 'grade', style: 'vintage' }]],
    ['Сделай кинематографичный цвет', [{ op: 'grade', style: 'cinematic' }]],
    ['ფერები შეუცვალე', [{ op: 'grade', style: 'cinematic' }]],
    // fades
    ['Fade in and fade out', [{ op: 'fade', inSec: 1, outSec: 1 }]],
    ['Add a 2 second fade out', [{ op: 'fade', inSec: 0, outSec: 2 }]],
    ['ბოლოს ჩაქრეს', [{ op: 'fade', inSec: 0, outSec: 1 }]],
    ['Плавное появление из темноты', [{ op: 'fade', inSec: 1, outSec: 0 }]],
    // sound
    ['ხმა მოაშორე', [{ op: 'mute' }]],
    ['Mute the video', [{ op: 'mute' }]],
    ['Сделай без звука', [{ op: 'mute' }]],
    ['ხმა აუწიე', [{ op: 'volume', db: 6 }]],
    ['Make it quieter by 10 dB', [{ op: 'volume', db: -10 }]],
    ['Сделай потише', [{ op: 'volume', db: -6 }]],
    // caption
    ['დაადე წარწერა: „ზაფხული 2026"', [{ op: 'caption', text: 'ზაფხული 2026' }]],
    ['Add a caption "Summer sale"', [{ op: 'caption', text: 'Summer sale' }]],
    ['Добавь надпись: Привет, мир', [{ op: 'caption', text: 'Привет, мир' }]],
    // thumbnail
    ['ქავერი გამიკეთე 3 წამზე', [{ op: 'thumbnail', atSec: 3 }]],
    ['Make a thumbnail at 0:12', [{ op: 'thumbnail', atSec: 12 }]],
    ['Сделай обложку', [{ op: 'thumbnail' }]],
    ['Vertical thumbnail with the caption "New episode"', [{ op: 'thumbnail' }, { op: 'aspect', to: '9:16', fit: 'crop' }, { op: 'caption', text: 'New episode' }]],
    // several at once
    ['Trim the first 10 seconds, make it vertical and black and white', [{ op: 'trim', toSec: 10 }, { op: 'aspect', to: '9:16', fit: 'crop' }, { op: 'grade', style: 'noir' }]],
    ['პირველი 20 წამი დატოვე, 2-ჯერ გააჩქარე და ხმა მოაშორე', [{ op: 'trim', toSec: 20 }, { op: 'speed', factor: 2 }, { op: 'mute' }]],
  ])('%s', (text, expected) => {
    expect(edits(text)).toEqual(expected);
  });

  test('a caption with no words asks for them', () => {
    expect(mineEdits('Add subtitles')).toEqual({ edits: [], missing: ['caption_text'], unsupported: [] });
    expect(mineEdits('დაამატე წარწერა').missing).toEqual(['caption_text']);
  });

  test('a stretch removed from the middle is not one edit: said, not guessed', () => {
    expect(mineEdits('Delete from 5 to 10 seconds')).toEqual({ edits: [], missing: [], unsupported: ['cut_middle'] });
    expect(mineEdits('წაშალე 5-დან 10 წამამდე').unsupported).toEqual(['cut_middle']);
  });

  test('what is not an edit asks nothing', () => {
    for (const t of [
      'Start the music from 5 seconds', // the montage's music offset
      'მუსიკა 5 წამიდან დაიწყე',
      'ამოიღე ხმა MP3-ად', // the MP3 extraction, not mute
      'Hello',
      '',
    ]) {
      expect(edits(t)).toEqual([]);
    }
    expect(edits(undefined as unknown as string)).toEqual([]);
  });

  test('a number pasted with no time words is no trim', () => {
    expect(edits('cut 5-12')).toEqual([{ op: 'trim', fromSec: 5, toSec: 12 }]);
    expect(edits('version 5-12 please')).toEqual([]);
  });
});

describe('editAskOf: an ask from a tool call or a run step, rebuilt from its known, typed fields only', () => {
  test('known ops with their own fields pass as they are; ranges are left to the quote', () => {
    expect(editAskOf({ op: 'trim', fromSec: 5, toSec: 12 })).toEqual({ op: 'trim', fromSec: 5, toSec: 12 });
    expect(editAskOf({ op: 'speed', factor: 99 })).toEqual({ op: 'speed', factor: 99 });
    expect(editAskOf({ op: 'mute' })).toEqual({ op: 'mute' });
    expect(editAskOf({ op: 'thumbnail' })).toEqual({ op: 'thumbnail' });
    expect(editAskOf({ op: 'caption', text: 'ზაფხული' })).toEqual({ op: 'caption', text: 'ზაფხული' });
  });
  test('an unknown op, an unknown field, a wrong type or a non-finite number is refused', () => {
    expect(editAskOf({ op: 'exec', cmd: 'ls' })).toBeNull();
    expect(editAskOf({ op: 'trim', toSec: 5, vf: 'movie=/etc/passwd' })).toBeNull();
    expect(editAskOf({ op: 'trim', toSec: '5' })).toBeNull();
    expect(editAskOf({ op: 'volume', db: Infinity })).toBeNull();
    expect(editAskOf({ op: 'aspect', to: 916 })).toBeNull();
    expect(editAskOf({ op: 'toString' })).toBeNull();
    expect(editAskOf([{ op: 'mute' }])).toBeNull();
    expect(editAskOf(null)).toBeNull();
  });
});
