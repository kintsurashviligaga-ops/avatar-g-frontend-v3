/**
 * lib/video/clipPrompt — the Veo prompt of one direct clip: the user's own scene, translated; the spoken words verbatim;
 * a Georgian line said by the character in Latin letters (its Cloud TTS voice is laid on later); nothing else added.
 */
import {
  asksForSubtitles, clipNegativePrompt, clipVoicedByTts, composeClipPrompt, parseClipReading, quotedLines, spokenText,
  type ClipReading,
} from './clipPrompt';

const reading = (o: Partial<ClipReading>): ClipReading => ({ english: 'A cat sleeps on a windowsill.', lines: [], speaker: null, silent: false, ...o });

test('quoted lines in every quote style people type are found and marked in order', () => {
  expect(quotedLines('კაცი ამბობს: „გამარჯობა!“ ქალი პასუხობს “როგორ ხარ?” და "კარგად" «спасибо»')).toEqual({
    marked: 'კაცი ამბობს: [LINE 1] ქალი პასუხობს [LINE 2] და [LINE 3] [LINE 4]',
    lines: ['გამარჯობა!', 'როგორ ხარ?', 'კარგად', 'спасибо'],
  });
  expect(quotedLines('no speech here')).toEqual({ marked: 'no speech here', lines: [] });
});

test('the reader\'s JSON is checked; off-shape answers are null', () => {
  expect(parseClipReading('{"english":"A man says [LINE 1]","lines":["„გამარჯობა“"],"speaker":"male","silent":false}'))
    .toEqual({ english: 'A man says [LINE 1]', lines: ['გამარჯობა'], speaker: 'male', silent: false });
  expect(parseClipReading('{"english":"Rain on a lake.","lines":[],"speaker":"unknown","silent":true}'))
    .toEqual({ english: 'Rain on a lake.', lines: [], speaker: null, silent: true });
  // `silent` never survives a line.
  expect(parseClipReading('{"english":"A man says [LINE 1]","lines":["hi"],"speaker":"male","silent":true}')!.silent).toBe(false);
  for (const bad of ['', 'not json', '[]', '{"english":"","lines":[]}', '{"english":"ok text","lines":"x"}', '{"english":"ok text","lines":[1]}']) {
    expect(parseClipReading(bad)).toBeNull();
  }
});

test('a Georgian line is voiced by TTS; English and Russian keep Veo\'s voice', () => {
  expect(clipVoicedByTts(['გამარჯობა'])).toBe(true);
  expect(clipVoicedByTts(['Hello', 'Привет'])).toBe(false);
  expect(spokenText(['გამარჯობა!', ' როგორ ხარ? '])).toBe('გამარჯობა! როგორ ხარ?');
});

test('text only: the translation, unchanged; told there is no dialogue only when nobody talks', () => {
  expect(composeClipPrompt({ reading: reading({}), clipSec: 8, photos: 'none' })).toBe('A cat sleeps on a windowsill.');
  expect(composeClipPrompt({ reading: reading({ silent: true }), clipSec: 8, photos: 'none' })).toBe('A cat sleeps on a windowsill. No dialogue, no voices.');
});

test('a photo is kept: the first frame, or the reference images', () => {
  expect(composeClipPrompt({ reading: reading({}), clipSec: 6, photos: 'frame' })).toMatch(/^Start exactly from the first frame: keep its people, faces, clothes and setting as they are\. A cat/);
  expect(composeClipPrompt({ reading: reading({}), clipSec: 8, photos: 'refs' })).toMatch(/^Keep the people and things from the reference images exactly as they look\. A cat/);
});

test('an English line is said verbatim by Veo, where the user put it', () => {
  const r = reading({ english: 'A barista hands over a cup and says [LINE 1], then waves.', lines: ['Here you go!'] });
  expect(composeClipPrompt({ reading: r, clipSec: 8, photos: 'none' })).toBe('A barista hands over a cup and says "Here you go!", then waves.');
});

test('a Georgian line: Latin letters for Veo\'s mouth, no Georgian script, and a pace that fits the voice', () => {
  const r = reading({ english: 'An old man raises a glass and says [LINE 1]', lines: ['გაუმარჯოს ჩვენს მეგობრობას!'], speaker: 'male' });
  const p = composeClipPrompt({ reading: r, clipSec: 8, photos: 'none', voicedSec: 3.2 });
  expect(p).toContain('says "gaumarjos chvens megobrobas!"');
  expect(p).not.toMatch(/[ა-ჰ]/);
  expect(p).toContain('The spoken words are Georgian, pronounced exactly as written');
  expect(p).toContain('taking about 3 seconds');
  expect(composeClipPrompt({ reading: r, clipSec: 4, photos: 'none', voicedSec: 3.8 })).toContain('fills the clip');
});

test('a line the translation lost its marker for is still said, at the end', () => {
  const r = reading({ english: 'A girl waves at the camera.', lines: ['Hi mom!'] });
  expect(composeClipPrompt({ reading: r, clipSec: 8, photos: 'none' })).toBe('A girl waves at the camera. They say aloud: "Hi mom!"');
});

test('subtitles are forbidden unless the user asked for them', () => {
  expect(clipNegativePrompt('a fox')).toContain('subtitles');
  expect(asksForSubtitles('ქართული სუბტიტრებით')).toBe(true);
  expect(clipNegativePrompt('with English subtitles')).not.toContain('subtitles');
});

test('Omni Flash (10 s): a Georgian line stays Georgian, said once by the character, and on-screen text is ruled out in words', () => {
  const r = reading({ english: 'A woman in the first frame smiles and says [LINE 1]', lines: ['გამარჯობა, მე ვარ თქვენი ასისტენტი!'], speaker: 'female' });
  const p = composeClipPrompt({ reading: r, clipSec: 10, photos: 'frame', engine: 'omni', voicedSec: 3 });
  expect(p).toContain('says "გამარჯობა, მე ვარ თქვენი ასისტენტი!"');
  expect(p).not.toContain('gamarjoba');
  expect(p).toContain('Each line is said once, exactly as written, in natural Georgian, lips in sync, no narrator.');
  expect(p).toMatch(/No subtitles, captions or on-screen text\.$/);
  expect(p).not.toContain('pronounced exactly as written');
  // Words on screen the user asked for are not forbidden; a silent scene is still told so.
  expect(composeClipPrompt({ reading: reading({ silent: true }), clipSec: 10, photos: 'none', engine: 'omni', subtitles: true }))
    .toBe('A cat sleeps on a windowsill. No dialogue, no voices.');
});
