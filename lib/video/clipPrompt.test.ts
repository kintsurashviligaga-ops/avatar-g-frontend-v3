/**
 * lib/video/clipPrompt — the prompt of one direct clip: the user's own scene, translated; the spoken words verbatim; who
 * says each line, each in their own voice, with no narrator; a Georgian line makes it Omni's (GG 2026-10-26 10:44Z: three
 * people in one TTS voice); the words checked against the clip's length; nothing else added.
 */
import {
  SPEAKER_TURN_SEC, asksForMusic, asksForSubtitles, clipNegativePrompt, clipSpeechFits, clipSpeechRoom, clipSpeechSeconds, composeClipPrompt,
  parseClipReading, promptSpeaksGeorgian, quotedLines, quotedSpeechSeconds, speaksGeorgian, spokenText, type ClipReading, type ClipSpeaker,
} from './clipPrompt';
import { speechSeconds } from './speechTiming';

const reading = (o: Partial<ClipReading>): ClipReading => ({
  english: 'A cat sleeps on a windowsill.', lines: [], speaker: null, silent: false, ...o,
  speakers: o.speakers ?? (o.lines ?? []).map(() => ({ who: '', voice: null })),
});
/** GG's brief, verbatim (2026-10-26 10:31Z): three people at a podcast table, three Georgian lines. */
const GG_BRIEF = '9:16. იგივე პოდკასტი. დასაწყისში 180° გლუვი orbit მრგვალ მაგიდაზე; დრამატული შუქი, სერიოზული ატმოსფერო. კამერა ჩერდება მამაკაცზე — თავდაჯერებული, ოდნავ აღფრთოვანებული, დამაჯერებელი მზერით: „აგენტ ჯი გესმენია? ხმოვანი ბრძანებებით მართავ და ქართულადაც ესაუბრები!“ სწრაფი ჭრა წამყვანზე — ირონიული ღიმილით, ცნობისმოყვარე და ოდნავ გაკვირვებული ტონით: „ანუ ქართულად ვეუბნები, რა გააკეთოს?“ შემდეგ ქალი — თბილი ინტერესით, თვალებში გაოცება და ჩართულობა: „ეს უკვე საინტერესოა!“ ბუნებრივი ჟესტები, ზუსტი lip-sync, ტექსტის გარეშე.';
const GG_LINES = ['აგენტ ჯი გესმენია? ხმოვანი ბრძანებებით მართავ და ქართულადაც ესაუბრები!', 'ანუ ქართულად ვეუბნები, რა გააკეთოს?', 'ეს უკვე საინტერესოა!'];
const GG_SPEAKERS: ClipSpeaker[] = [{ who: 'the man', voice: 'male' }, { who: 'the host', voice: 'male' }, { who: 'the woman', voice: 'female' }];

test('quoted lines in every quote style people type are found and marked in order', () => {
  expect(quotedLines('კაცი ამბობს: „გამარჯობა!“ ქალი პასუხობს “როგორ ხარ?” და "კარგად" «спасибо»')).toEqual({
    marked: 'კაცი ამბობს: [LINE 1] ქალი პასუხობს [LINE 2] და [LINE 3] [LINE 4]',
    lines: ['გამარჯობა!', 'როგორ ხარ?', 'კარგად', 'спасибо'],
  });
  expect(quotedLines('no speech here')).toEqual({ marked: 'no speech here', lines: [] });
});

test('the reader\'s JSON is checked; off-shape answers are null', () => {
  expect(parseClipReading('{"english":"A man says [LINE 1]","lines":["„გამარჯობა“"],"speaker":"male","silent":false}'))
    .toEqual({ english: 'A man says [LINE 1]', lines: ['გამარჯობა'], speakers: [{ who: '', voice: 'male' }], speaker: 'male', silent: false });
  expect(parseClipReading('{"english":"Rain on a lake.","lines":[],"speaker":"unknown","silent":true}'))
    .toEqual({ english: 'Rain on a lake.', lines: [], speakers: [], speaker: null, silent: true });
  // `silent` never survives a line.
  expect(parseClipReading('{"english":"A man says [LINE 1]","lines":["hi"],"speaker":"male","silent":true}')!.silent).toBe(false);
  for (const bad of ['', 'not json', '[]', '{"english":"","lines":[]}', '{"english":"ok text","lines":"x"}', '{"english":"ok text","lines":[1]}']) {
    expect(parseClipReading(bad)).toBeNull();
  }
});

test('who says each line: one entry per line, in order; a missing or odd entry is an unnamed speaker', () => {
  const r = parseClipReading(JSON.stringify({
    english: 'The man says [LINE 1] The host says [LINE 2] The woman says [LINE 3]', lines: GG_LINES, speaker: 'male', silent: false,
    speakers: [{ who: ' the  man ', voice: 'male' }, { who: 'the host', voice: 'unknown' }, 'x'],
  }))!;
  expect(r.speakers).toEqual([{ who: 'the man', voice: 'male' }, { who: 'the host', voice: null }, { who: '', voice: null }]);
  expect(r.speaker).toBe('male');
});

test('a Georgian line makes it Omni\'s; English and Russian keep Veo\'s voice', () => {
  expect(speaksGeorgian(['გამარჯობა'])).toBe(true);
  expect(speaksGeorgian(['Hello', 'Привет'])).toBe(false);
  expect(spokenText(['გამარჯობა!', ' როგორ ხარ? '])).toBe('გამარჯობა! როგორ ხარ?');
});

test('the card reads Georgian speech itself: a quoted Georgian line, or a Georgian verb of speaking — not a silent scene', () => {
  expect(promptSpeaksGeorgian(GG_BRIEF)).toBe(true);
  expect(promptSpeaksGeorgian('მოხუცი ამბობს, რომ ბედნიერია')).toBe(true);
  expect(promptSpeaksGeorgian('ქალი ეუბნება ბავშვს, რომ დაიძინოს')).toBe(true);
  expect(promptSpeaksGeorgian('A man says "hello" in a cafe')).toBe(false);
  expect(promptSpeaksGeorgian('მელია თოვლში მირბის განთიადისას')).toBe(false);
  expect(promptSpeaksGeorgian('წარწერა „გამარჯობა“ კედელზე')).toBe(true); // quoted Georgian: the route's reader decides
});

test('the words are measured against the clip: GG\'s three lines do not fit 8 s, nor even 10 s; two short ones fit 6 s', () => {
  const sum = GG_LINES.reduce((s, l) => s + speechSeconds(l), 0);
  expect(clipSpeechSeconds(GG_LINES, GG_SPEAKERS)).toBeCloseTo(sum + 2 * SPEAKER_TURN_SEC, 5);
  // One person saying two lines takes no beat between them; unnamed speakers count as a change.
  expect(clipSpeechSeconds(['ერთი', 'ორი'], [{ who: 'the man', voice: 'male' }, { who: 'The man', voice: 'male' }])).toBeCloseTo(speechSeconds('ერთი') + speechSeconds('ორი'), 5);
  expect(clipSpeechSeconds(['ერთი', 'ორი'])).toBeCloseTo(speechSeconds('ერთი') + speechSeconds('ორი') + SPEAKER_TURN_SEC, 5);
  expect(clipSpeechSeconds([])).toBe(0);
  expect([4, 6, 8, 10].map(clipSpeechRoom)).toEqual([3.3, 5.5, 7.7, 9.9]);
  expect(clipSpeechFits(GG_LINES, 8, GG_SPEAKERS)).toEqual({ fits: false, seconds: 11.8 });
  expect(clipSpeechFits(GG_LINES, 10, GG_SPEAKERS).fits).toBe(false);
  const short = ['აგენტ ჯი, ქართულად გესმის?', 'ეს უკვე საინტერესოა!'];
  expect(clipSpeechFits(short, 6, [{ who: 'the man', voice: 'male' }, { who: 'the woman', voice: 'female' }]).fits).toBe(true);
  expect(clipSpeechFits(short, 4).fits).toBe(false);
  // The card's floor: the quoted words alone, no beats.
  expect(quotedSpeechSeconds(GG_BRIEF)).toBe(Math.round(sum * 10) / 10);
  expect(quotedSpeechSeconds('no words')).toBe(0);
});

test('text only: the translation, unchanged; told there is no dialogue only when nobody talks', () => {
  expect(composeClipPrompt({ reading: reading({}), photos: 'none' })).toBe('A cat sleeps on a windowsill.');
  expect(composeClipPrompt({ reading: reading({ silent: true }), photos: 'none' })).toBe('A cat sleeps on a windowsill. No dialogue, no voices.');
});

test('a photo is kept: the first frame, or the reference images', () => {
  expect(composeClipPrompt({ reading: reading({}), photos: 'frame' })).toMatch(/^Start exactly from the first frame: keep its people, faces, clothes and setting as they are\. A cat/);
  expect(composeClipPrompt({ reading: reading({}), photos: 'refs' })).toMatch(/^Keep the people and things from the reference images exactly as they look\. A cat/);
});

test('an English line is said verbatim by Veo, where the user put it, by the person on screen and no narrator', () => {
  const r = reading({ english: 'A barista hands over a cup and says [LINE 1], then waves.', lines: ['Here you go!'], speakers: [{ who: 'the barista', voice: 'female' }] });
  expect(composeClipPrompt({ reading: r, photos: 'none' })).toBe(
    'A barista hands over a cup and says "Here you go!", then waves. The barista (female voice) says the words on screen, once, exactly as written, lips in sync. No false starts, no narrator, no voice-over.');
});

test('GG\'s podcast (2026-10-26): each person says only their own line in their own voice — the order named, the words not repeated', () => {
  const r = reading({
    english: 'The camera stops on the man, confident: [LINE 1] A quick cut to the host, with an ironic smile: [LINE 2] Then the woman, with warm interest: [LINE 3]',
    lines: GG_LINES, speakers: GG_SPEAKERS, speaker: 'male',
  });
  const p = composeClipPrompt({ reading: r, photos: 'frame', engine: 'omni' });
  for (const line of GG_LINES) expect(p.split(line).length - 1).toBe(1);
  expect(p).toContain('The lines are spoken in this order: the man (male voice), then the host (male voice), then the woman (female voice).');
  expect(p).toContain('Each person says only their own words, once, exactly as written, in natural Georgian, in their own voice, with their own lips in sync; no two people share a voice. The camera is on each person while they speak. No false starts, no narrator, no voice-over.');
  expect(p).toContain('No background music.');
  // The Georgian stays Georgian: no Latin-letter version for a dub.
  expect(p).not.toContain('agent ji');
  expect(p).toMatch(/No subtitles, captions or on-screen text\.$/);
});

test('unnamed speakers: each line once, by the person on screen, no narrator', () => {
  const r = reading({ english: 'Two friends talk: [LINE 1] [LINE 2]', lines: ['გამარჯობა!', 'როგორ ხარ?'] });
  expect(composeClipPrompt({ reading: r, photos: 'none', engine: 'omni' }))
    .toContain('Each line is said once, exactly as written, in natural Georgian, by the person on screen, lips in sync. No false starts, no narrator, no voice-over.');
});

test('Omni keeps music out from under the lines unless the user asked for it (GG\'s clip 2026-10-26 13:53Z)', () => {
  const r = reading({ english: 'Two friends talk: [LINE 1] [LINE 2]', lines: ['გამარჯობა!', 'როგორ ხარ?'] });
  expect(composeClipPrompt({ reading: r, photos: 'none', engine: 'omni' })).toContain('No background music.');
  expect(asksForMusic('ორი მეგობარი საუბრობს, ფონზე მსუბუქი მუსიკა')).toBe(true);
  expect(asksForMusic('Two friends talk in a café')).toBe(false);
  expect(composeClipPrompt({ reading: r, photos: 'none', engine: 'omni', music: true })).not.toContain('music');
  // Veo is not told (its sound follows the prompt), nor is a scene with no lines.
  expect(composeClipPrompt({ reading: r, photos: 'none' })).not.toContain('music');
  expect(composeClipPrompt({ reading: reading({ silent: true }), photos: 'none', engine: 'omni' })).not.toContain('music');
});

test('a line the translation lost its marker for is still said, at the end', () => {
  const r = reading({ english: 'A girl waves at the camera.', lines: ['Hi mom!'] });
  expect(composeClipPrompt({ reading: r, photos: 'none' })).toMatch(/^A girl waves at the camera\. They say aloud: "Hi mom!" /);
});

test('subtitles are forbidden unless the user asked for them', () => {
  expect(clipNegativePrompt('a fox')).toContain('subtitles');
  expect(asksForSubtitles('ქართული სუბტიტრებით')).toBe(true);
  expect(clipNegativePrompt('with English subtitles')).not.toContain('subtitles');
});

test('Omni Flash: a Georgian line stays Georgian, said once by the character, and on-screen text is ruled out in words', () => {
  const r = reading({ english: 'A woman in the first frame smiles and says [LINE 1]', lines: ['გამარჯობა, მე ვარ თქვენი ასისტენტი!'], speakers: [{ who: 'the woman', voice: 'female' }], speaker: 'female' });
  const p = composeClipPrompt({ reading: r, photos: 'frame', engine: 'omni' });
  expect(p).toContain('says "გამარჯობა, მე ვარ თქვენი ასისტენტი!"');
  expect(p).not.toContain('gamarjoba');
  expect(p).toContain('The woman (female voice) says the words on screen, once, exactly as written, in natural Georgian, lips in sync. No false starts, no narrator, no voice-over.');
  expect(p).toMatch(/No subtitles, captions or on-screen text\.$/);
  // Words on screen the user asked for are not forbidden; a silent scene is still told so.
  expect(composeClipPrompt({ reading: reading({ silent: true }), photos: 'none', engine: 'omni', subtitles: true }))
    .toBe('A cat sleeps on a windowsill. No dialogue, no voices.');
});
