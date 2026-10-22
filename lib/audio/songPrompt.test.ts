/** @jest-environment node */
/** The song follows what the user wrote: GG's Georgian pub brief came back as an English blues track (Production 2026-10-16). */
import { buildSongPrompt, filmSongSeconds, mostlyGeorgian, sceneAlignedBpm, songGenreFromBrief } from './songPrompt';

test('a brief written in Georgian gets a Georgian song in the genre it names', () => {
  const r = buildSongPrompt({ brief: 'ძველ ფაბში მღერის ბლუზს და ჯაზს', totalSec: 32 });
  expect(r.instrumental).toBe(false); // "მღერის" (sings) is a song, not a score
  expect(r.prompt).toContain('sung in Georgian');
  expect(r.prompt).toContain('blues and jazz');
});
test('the language comes from the brief the user typed, not from a lyrics block below it', () => {
  const r = buildSongPrompt({ brief: 'ქართული სიმღერა ზღვაზე\n\nLYRICS (verbatim):\nhello world', totalSec: 24, musicVideoMode: true });
  expect(r.prompt).toContain('sung in Georgian');
});
test('an English brief stays English, and an explicit "in English" wins over Georgian script', () => {
  expect(buildSongPrompt({ brief: 'a country singer on a porch', totalSec: 24, musicVideoMode: true }).prompt).not.toContain('Georgian');
  expect(buildSongPrompt({ brief: 'a country singer on a porch', totalSec: 24, musicVideoMode: true }).prompt).toContain('country');
  expect(buildSongPrompt({ brief: 'მღერის ინგლისურად ჯაზს', totalSec: 24 }).prompt).not.toContain('sung in Georgian');
});
test('a film with no singing keeps an instrumental score', () => {
  expect(buildSongPrompt({ brief: 'a ship in a storm', totalSec: 24 }).instrumental).toBe(true);
});
test('mostlyGeorgian counts letters', () => {
  expect(mostlyGeorgian('ძველ ფაბში ბლუზი')).toBe(true);
  expect(mostlyGeorgian('an old pub, ფაბი')).toBe(false);
  expect(mostlyGeorgian('')).toBe(false);
});

test('every scene cut lands on a bar line: 8 s scenes take 60/90/120/150 BPM, 6 s scenes 80/120/160', () => {
  expect(sceneAlignedBpm(80, 8)).toBe(90); // blues → 3 bars per scene
  expect(sceneAlignedBpm(115, 8)).toBe(120); // pop → 4 bars
  expect(sceneAlignedBpm(85, 6)).toBe(80);
  expect(sceneAlignedBpm(124, 6)).toBe(120);
  for (const sec of [4, 6, 8]) {
    const bpm = sceneAlignedBpm(110, sec);
    expect(((bpm * sec) / 240) % 1).toBe(0); // a whole number of 4/4 bars in one scene
  }
  expect(sceneAlignedBpm(100, 0)).toBe(100); // no scene length → the tempo is left alone
});

test('a music video asks for ONE continuous song at that tempo, as long as the film', () => {
  const { prompt } = buildSongPrompt({ brief: 'ძველ ფაბში მღერის ბლუზს', totalSec: 48, musicVideoMode: true, sceneSec: 8 });
  expect(prompt).toContain('One continuous song for the full 48 seconds at a steady 90 BPM in 4/4');
});

test('the theme reaches the engine in English, while the song stays Georgian because the user wrote Georgian', () => {
  const { prompt } = buildSongPrompt({
    brief: 'სიმღერა ბებიაზე, რომელიც სოფელში ცხოვრობს', totalSec: 24, musicVideoMode: true, theme: 'a song about a grandmother who lives in a village',
  });
  expect(prompt).toContain('Theme: "a song about a grandmother who lives in a village"');
  expect(prompt).toContain('sung in Georgian');
  expect(prompt).not.toContain('ბებია');
});

test('genres named in Georgian are heard; a word that only contains one is not', () => {
  expect(songGenreFromBrief('ჰიპ-ჰოპი თბილისზე')).toBe('hip-hop');
  expect(songGenreFromBrief('ქართული რეპი')).toBe('hip-hop');
  expect(songGenreFromBrief('პოპ სიმღერა')).toBe('pop');
  expect(songGenreFromBrief('პოპულარული ადგილი')).toBeNull();
  expect(songGenreFromBrief('რეპეტიცია სცენაზე')).toBeNull();
  expect(songGenreFromBrief('a song\nan electronic track')).toBe('electronic');
});

test('a film song is as long as the film (8–240 s), not a flat 30 s', () => {
  expect(filmSongSeconds(48)).toBe(48);
  expect(filmSongSeconds(43.2)).toBe(43);
  expect(filmSongSeconds(3)).toBe(8);
  expect(filmSongSeconds(500)).toBe(240);
  expect(filmSongSeconds(Number.NaN)).toBe(30);
});
