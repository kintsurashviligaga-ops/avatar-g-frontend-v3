/**
 * lib/agent/media/askCoverage — every part of a montage message is in the plan or named with why (owner 2026-10-11:
 * „დავალება რაც მივეცი ქარდში არ წერია სრულად").
 */
import { unplannedAsks, unplannedText, type UnplannedKind } from './askCoverage';
import { mineEdits } from './editWords';

const kinds = (t: string, planned = mineEdits(t).edits.filter(() => false)) => unplannedAsks(t, planned).map((u) => u.kind);

const GG = 'დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59 წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს ქართულად უნდა დაიწეროს გადმოდი საიტზე';

describe('what a montage leaves out, by name', () => {
  test('the owner\'s message with its edit step planned: nothing is left out', () => {
    const planned = mineEdits(GG).edits.filter((e) => e.op === 'overlay' || e.op === 'layers');
    expect(unplannedAsks(GG, planned)).toEqual([]);
  });

  test('the same message on a plain montage card: the overlay and both texts are named, the speed and music start are not', () => {
    const u = unplannedAsks(GG);
    expect(u.map((x) => x.kind)).toEqual(['later_edit', 'later_edit']);
    const text = unplannedText(u, 'ka');
    expect(text).toMatch(/^ამ გეგმაში არ შედის: /);
    expect(text).toContain('ოვერლეი: თბილი სინათლის ანარეკლები');
    expect(text).toContain('„myavatar.ge🚀“');
    expect(text).toContain('„გადმოდი საიტზე“');
    expect(text).not.toContain('სიჩქარე');
  });

  test.each<[string, UnplannedKind[]]>([
    // Transitions are the montage's own (./montageAsk transitionAsk): never listed as left out.
    ['დაამონტაჟე მუსიკაზე, კადრებს შორის გადასვლები გაუკეთე', []],
    ['cut these to the music with crossfades', []],
    ['cut to the music and fade between the clips', []],
    ['смонтируй под музыку с переходами', []],
    ['დაამონტაჟე მუსიკაზე და ზუმი გაუკეთე', ['motion_fx']],
    ['cut to the beat with a glitch and some shake', ['motion_fx']],
    ['cut to the music and add my logo top right', ['logo']],
    ['დაამონტაჟე და გაუკეთე ქეფშენები', ['speech_captions']],
    ['дай субтитры на английском, переведи', ['translate_captions']],
    ['cut to the music and make a thumbnail', ['thumbnail']],
    ['cut these to the music and remove 0:05–0:10', ['cut_middle']],
    ['დაამონტაჟე მუსიკაზე და 2x', []],
  ])('%s → %j', (text, want) => {
    expect(kinds(text)).toEqual(want);
  });

  test('what the montage holds itself is never listed: a ramp, the music start, the length, the frame, its silent clips', () => {
    expect(kinds('დაამონტაჟე, სადაც საჭიროა ააჩქარე და შეანელე, მუსიკა 5 წამიდან, 20 წამიანი, 9:16, უხმოდ')).toEqual([]);
  });

  test('the words to be drawn are not read as asks: „დააწერე „zoom in““ asks no zoom', () => {
    expect(kinds('დაამონტაჟე მუსიკაზე და დააწერე „zoom in“')).toEqual(['later_edit']);
  });

  test('a logo with a text: the text is planned by the chain, only the logo is named', () => {
    const t = 'cut these to the music, add my logo top right and write "Summer" at the bottom';
    const planned = [{ op: 'layers' as const, add: [{ kind: 'text' as const, text: 'Summer', anchor: 'bottom' as const }] }];
    expect(kinds(t, planned)).toEqual(['logo']);
  });

  test('each reason in ka · en · ru, and nothing at all when nothing is left out', () => {
    for (const k of ['transition', 'motion_fx', 'logo', 'thumbnail', 'text_words', 'cta_words', 'speech_captions', 'translate_captions', 'cut_middle', 'trim', 'speed', 'layer_change'] as UnplannedKind[]) {
      for (const l of ['ka', 'en', 'ru']) expect(unplannedText([{ kind: k }], l).length).toBeGreaterThan(20);
    }
    expect(unplannedText([{ kind: 'transition' }], 'en')).toBe('Not in this plan: transitions between shots: this edit has no boundary to draw them on.');
    expect(unplannedText([], 'ka')).toBe('');
    expect(unplannedText(undefined, 'ka')).toBe('');
    expect(unplannedAsks('')).toEqual([]);
  });
});
