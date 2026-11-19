/**
 * lib/ai/musicVocals — a sung track is told to sing (GG 2026-10-26: songs came back without vocals), in the language
 * the person wrote in (GG's card 18:36Z: a Georgian brief is sung in Georgian), with a structure sized to the length.
 */
import { songDirections, songLanguageOf } from './musicVocals';
import { buildMusicBrief } from './musicBrief';
import { lyriaInput } from '../music/studio/prompt';
import type { MusicPlan } from '../music/studio/contracts';

test('the language is read from the person’s own words, lyrics first', () => {
  expect(songLanguageOf(undefined, 'სიმღერა ბათუმზე')).toBe('Georgian');
  expect(songLanguageOf('', 'песня про лето')).toBe('Russian');
  expect(songLanguageOf('ზღვა და მზე', 'a summer song')).toBe('Georgian');
  expect(songLanguageOf(undefined, 'a summer song')).toBeNull();
});

test('a song gets a lead vocal, the language, lyrics and a structure; an instrumental gets nothing', () => {
  const d = songDirections({ instrumental: false, hasLyrics: false, language: 'Georgian', briefEn: 'a summer song about Batumi' });
  expect(d.join(' ')).toMatch(/lead vocal/);
  expect(d).toContain('Sung in Georgian');
  expect(d.join(' ')).toMatch(/Write original, meaningful lyrics/);
  expect(d.join(' ')).toMatch(/one verse, then the chorus/);
  expect(songDirections({ instrumental: true, hasLyrics: false, language: 'Georgian' })).toEqual([]);
});

test('given lyrics are sung as written; a long track gets the whole form; a language the brief names wins', () => {
  const d = songDirections({ instrumental: false, hasLyrics: true, language: 'Georgian', briefEn: 'a love song sung in Spanish', targetSec: 180 });
  expect(d.join(' ')).toMatch(/Sing the lyrics below as written/);
  expect(d.join(' ')).toMatch(/bridge, final chorus/);
  expect(d.some((s) => s.startsWith('Sung in'))).toBe(false);
});

test('the brief carries the song directions for a song and drops them for an instrumental', () => {
  const song = songDirections({ instrumental: false, hasLyrics: false, language: 'Georgian' });
  const sung = buildMusicBrief({ prompt: 'a summer song about Batumi', style: 'pop', instrumental: false, songDirections: song });
  expect(sung.prompt).toMatch(/^a summer song about Batumi /);
  expect(sung.prompt).toMatch(/Sung in Georgian\./);
  expect(sung.prompt).not.toMatch(/Instrumental/);
  const inst = buildMusicBrief({ prompt: 'a calm beat', instrumental: true, songDirections: song });
  expect(inst.prompt).not.toMatch(/lead vocal|Sung in/);
  expect(inst.prompt).toMatch(/Instrumental, no vocals\./);
});

test('Music Studio’s Lyria input: a Georgian song is told to sing in Georgian and to write lyrics', () => {
  const plan = { request: { prompt: 'სიმღერა თბილისზე', mode: 'song', durationSec: 30 } } as unknown as MusicPlan;
  const input = lyriaInput(plan);
  expect(input).toMatch(/^სიმღერა თბილისზე/);
  expect(input).toMatch(/Sung in Georgian/);
  expect(input).toMatch(/Write original, meaningful lyrics/);
  const inst = lyriaInput({ request: { prompt: 'calm piano', mode: 'instrumental', durationSec: 30 } } as unknown as MusicPlan);
  expect(inst).toMatch(/Instrumental only, no vocals/);
  expect(inst).not.toMatch(/lead vocal/);
});
