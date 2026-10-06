/** @jest-environment jsdom */
import { MUSIC_ENGINE_CHAIN, engineChoices, effectiveEnginePref, isMusicEngineId, parseMusicEnginesStatus, chainNames } from './musicEngines';
import { MUSIC_ENGINE_KEY, getMusicEnginePref, musicEngineField, setMusicEnginePref } from './musicEnginePref';
const wire = { engines: { lyria: { configured: true, busy: false, controls: 'prompt' } }, references: { cover: true, voice: true }, chain: ['lyria', 'udio'] };
test('only Lyria is a selectable music engine', () => {
  expect(MUSIC_ENGINE_CHAIN).toEqual(['lyria']);
  for (const id of ['udio', 'musicgen', 'elevenlabs-music', 'suno']) expect(isMusicEngineId(id)).toBe(false);
  const status = parseMusicEnginesStatus(wire)!;
  expect(status.chain).toEqual(['lyria']);
  expect(status.references).toEqual({ cover: false, voice: false });
  expect(engineChoices(status, { instrumental: true }).map((c) => c.id)).toEqual(['auto', 'lyria']);
});
test('unavailable or busy Lyria cannot be selected', () => {
  expect(engineChoices(null, { instrumental: false }).filter((c) => c.selectable).map((c) => c.id)).toEqual(['auto']);
  const status = parseMusicEnginesStatus({ ...wire, engines: { lyria: { configured: true, busy: true } } })!;
  expect(effectiveEnginePref('lyria', status, { instrumental: false })).toBe('auto');
});
test('rejects malformed status and retains localized display', () => {
  expect(parseMusicEnginesStatus(null)).toBeNull();
  expect(parseMusicEnginesStatus({ engines: {} })).toBeNull();
  for (const lang of ['ka', 'en', 'ru']) expect(chainNames(parseMusicEnginesStatus(wire), lang)).toEqual(['Lyria 3']);
});
test('stored retired preferences are ignored, while Lyria survives reload', () => {
  localStorage.setItem(MUSIC_ENGINE_KEY, 'udio');
  expect(getMusicEnginePref()).toBe('auto');
  expect(musicEngineField()).toEqual({});
  setMusicEnginePref('lyria');
  expect(getMusicEnginePref()).toBe('lyria');
  expect(musicEngineField()).toEqual({ engine: 'lyria' });
  setMusicEnginePref('auto');
  expect(musicEngineField()).toEqual({});
});
