/** @jest-environment node */
/**
 * The music controls' copy: complete in ka / en / ru, the sliders labelled approximate (owner decision — on Lyria and
 * ElevenLabs they only steer the prompt), the singer's four stops, and the badge / result-card helpers saying nothing
 * about sliders nobody moved, or that never reached the engine. Plus the OmniStudio wiring that feeds the result card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_CONTROLS_COPY, musicControlsCopy, musicControlsModeOf, musicControlsNote, sliderBadgeParts, type MusicControlsCopy } from './musicControlsCopy';
import { VOCAL_GENDERS } from '@/lib/ai/musicControls';

const LANGS = ['ka', 'en', 'ru'] as const;

const strings = (c: MusicControlsCopy): string[] => [
  c.styles, c.trackType, c.lyrics, c.instrumental, c.instrumentalShort, c.vocal, c.weirdness, c.styleInfluence, c.approximate,
  ...c.weirdnessEnds, ...c.styleInfluenceEnds, ...Object.values(c.vocalGender), ...Object.values(c.vocalShort), ...Object.values(c.note),
];

test.each(LANGS)('%s: every string is present', (lang) => {
  const c = MUSIC_CONTROLS_COPY[lang];
  for (const s of strings(c)) expect(s.trim().length).toBeGreaterThan(0);
  expect(Object.keys(c.vocalGender).sort()).toEqual([...VOCAL_GENDERS].sort());
  expect(Object.keys(c.vocalShort).sort()).toEqual([...VOCAL_GENDERS].sort());
});

test.each(LANGS)('%s: the sliders are labelled approximate, naming the engines where they only steer the prompt', (lang) => {
  const { approximate, note, styles } = MUSIC_CONTROLS_COPY[lang];
  expect(approximate.startsWith('≈')).toBe(true);
  expect(approximate).toContain('Lyria');
  expect(approximate).toContain('ElevenLabs');
  expect(note.prompt.startsWith('≈')).toBe(true);
  expect(styles).toContain('3'); // the strip's label states the cap
});

test('an unknown locale falls back to Georgian', () => {
  expect(musicControlsCopy('de')).toBe(MUSIC_CONTROLS_COPY.ka);
  expect(musicControlsCopy('ru')).toBe(MUSIC_CONTROLS_COPY.ru);
});

test('the Fine-tune badge lists only the sliders someone moved', () => {
  expect(sliderBadgeParts({ weirdness: 50, styleInfluence: 50 }, 'en')).toEqual([]);
  expect(sliderBadgeParts({ weirdness: 80, styleInfluence: 50 }, 'en')).toEqual(['Weirdness 80']);
  expect(sliderBadgeParts({ weirdness: 50, styleInfluence: 12 }, 'ka')).toEqual(['სტილის გავლენა 12']);
});

test('the result card speaks only when the route reported a mode AND a slider was moved', () => {
  expect(musicControlsNote(undefined, { weirdness: 90 }, 'en')).toBeNull();
  expect(musicControlsNote('prompt', { weirdness: 50, styleInfluence: 50 }, 'en')).toBeNull();
  expect(musicControlsNote('prompt', undefined, 'en')).toBeNull();
  expect(musicControlsNote('prompt', {}, 'en')).toBeNull(); // a spec from before the sliders existed
  expect(musicControlsNote('prompt', { weirdness: 90 }, 'en')).toBe('≈ sliders approximate');
  expect(musicControlsNote('native', { styleInfluence: 10 }, 'ru')).toBe(MUSIC_CONTROLS_COPY.ru.note.native);
});

test('a bubble keeps the mode only when the route says a slider REACHED the engine (`controls.applied`)', () => {
  expect(musicControlsModeOf({ engine: 'lyria', mode: 'prompt', applied: true })).toBe('prompt');
  expect(musicControlsModeOf({ engine: 'musicgen', mode: 'native', applied: true })).toBe('native');
  // Weirdness 60 on Lyria: moved, but inside the neutral band, so the brief was byte-identical to an untouched panel's.
  const nudged = musicControlsModeOf({ engine: 'lyria', mode: 'prompt', applied: false });
  expect(nudged).toBeUndefined();
  expect(musicControlsNote(nudged, { weirdness: 60 }, 'en')).toBeNull(); // so the card no longer says "≈ sliders approximate"
  expect(musicControlsModeOf({ engine: 'lyria', mode: 'prompt' })).toBeUndefined(); // no verdict, no claim
  for (const junk of [undefined, null, 'prompt', 7, [], { mode: 'exact', applied: true }, { mode: 'prompt', applied: 'yes' }]) {
    expect(musicControlsModeOf(junk)).toBeUndefined();
  }
});

describe('OmniStudio gives a track\'s card the same provenance on the first render and on a re-roll', () => {
  // The component is 9k lines behind a dynamic import, so, like the other studio suites, this reads its source.
  // ⚠️ The re-roll built its bubble inline and dropped `engine`, so the card showed the slider note alone.
  const omni = readFileSync(join(__dirname, '..', 'OmniStudio.tsx'), 'utf8');
  const callbackBody = (start: string): string => {
    const from = omni.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    return omni.slice(from, omni.indexOf('\n  }, [', from));
  };

  test.each([
    ['the first render (runMusicJob)', 'const runMusicJob = useCallback('],
    ['a re-roll (regenerate)', 'const regenerate = useCallback('],
  ])('%s keeps the engine, and the slider mode only when a slider reached the engine', (_where, start) => {
    const body = callbackBody(start);
    expect(body).toContain('...(j.engine ? { engine: j.engine } : {})');
    expect(body).toContain('musicControlsModeOf(j.controls)');
    expect(body).not.toContain('j.controls?.mode'); // a mode without the route's `applied` verdict is a claim it may not make
  });
});
