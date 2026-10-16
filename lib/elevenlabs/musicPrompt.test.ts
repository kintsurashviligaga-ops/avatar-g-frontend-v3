/** @jest-environment node */
/** The song follows what the user wrote: GG's Georgian pub brief came back as an English blues track (Production 2026-10-16). */
import { buildElevenMusicPrompt, mostlyGeorgian } from './music';

test('a brief written in Georgian gets a Georgian song in the genre it names', () => {
  const r = buildElevenMusicPrompt({ brief: 'ძველ ფაბში მღერის ბლუზს და ჯაზს', totalSec: 32 });
  expect(r.instrumental).toBe(false); // "მღერის" (sings) is a song, not a score
  expect(r.prompt).toContain('sung in Georgian');
  expect(r.prompt).toContain('blues and jazz');
});
test('the language comes from the brief the user typed, not from a lyrics block below it', () => {
  const r = buildElevenMusicPrompt({ brief: 'ქართული სიმღერა ზღვაზე\n\nLYRICS (verbatim):\nhello world', totalSec: 24, musicVideoMode: true });
  expect(r.prompt).toContain('sung in Georgian');
});
test('an English brief stays English, and an explicit "in English" wins over Georgian script', () => {
  expect(buildElevenMusicPrompt({ brief: 'a country singer on a porch', totalSec: 24, musicVideoMode: true }).prompt).not.toContain('Georgian');
  expect(buildElevenMusicPrompt({ brief: 'a country singer on a porch', totalSec: 24, musicVideoMode: true }).prompt).toContain('country');
  expect(buildElevenMusicPrompt({ brief: 'მღერის ინგლისურად ჯაზს', totalSec: 24 }).prompt).not.toContain('sung in Georgian');
});
test('a film with no singing keeps an instrumental score', () => {
  expect(buildElevenMusicPrompt({ brief: 'a ship in a storm', totalSec: 24 }).instrumental).toBe(true);
});
test('mostlyGeorgian counts letters', () => {
  expect(mostlyGeorgian('ძველ ფაბში ბლუზი')).toBe(true);
  expect(mostlyGeorgian('an old pub, ფაბი')).toBe(false);
  expect(mostlyGeorgian('')).toBe(false);
});
