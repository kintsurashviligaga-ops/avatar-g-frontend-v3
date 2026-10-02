/** @jest-environment jsdom */
/**
 * The engine catalogue: the list is exactly the route's chain; a pick the server would refuse (no key, breaker open,
 * MusicGen for a song, status not loaded) cannot be offered; copy exists in ka / en / ru for every row.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENGINE_COPY, MUSIC_ENGINE_CHAIN, chainNames, effectiveEnginePref, engineAvailability, engineChoices, enginePillLabel,
  isMusicEngineId, isMusicEnginePref, parseMusicEnginesStatus, type MusicEnginesStatus,
} from './musicEngines';
import { MUSIC_ENGINE_KEY, getMusicEnginePref, musicEngineField, setMusicEnginePref } from './musicEnginePref';

const STATUS: MusicEnginesStatus = {
  engines: {
    lyria: { configured: true, busy: false, controls: 'prompt' },
    udio: { configured: false, busy: false, controls: 'prompt' },
    'elevenlabs-music': { configured: true, busy: true, controls: 'prompt' },
    musicgen: { configured: true, busy: false, controls: 'native' },
  },
  references: { cover: true, voice: true },
  chain: ['lyria', 'musicgen'],
};

test('the list is the route\'s failover chain, in its order — and nothing the route cannot run', () => {
  expect(MUSIC_ENGINE_CHAIN).toEqual(['lyria', 'udio', 'elevenlabs-music', 'musicgen']);
  // Pinned from the route's source: the four provider names it pushes, in order.
  const route = readFileSync(join(process.cwd(), 'app/api/ai/music/route.ts'), 'utf8');
  const names = [...route.matchAll(/providers\.push\(\{ name: '([a-z-]+)'/g)].map((m) => m[1]);
  expect(names).toEqual([...MUSIC_ENGINE_CHAIN]);
});

test('ids and picks validate: a made-up engine is neither', () => {
  expect(isMusicEngineId('lyria')).toBe(true);
  expect(isMusicEngineId('suno')).toBe(false);
  expect(isMusicEnginePref('auto')).toBe(true);
  expect(isMusicEnginePref('suno')).toBe(false);
  expect(isMusicEnginePref(undefined)).toBe(false);
});

test('availability: off (no key) · busy (breaker open) · ready — and unknown while the status has not loaded', () => {
  expect(engineAvailability(STATUS, 'lyria')).toBe('ready');
  expect(engineAvailability(STATUS, 'udio')).toBe('off');
  expect(engineAvailability(STATUS, 'elevenlabs-music')).toBe('busy');
  expect(engineAvailability(null, 'lyria')).toBe('unknown');
});

test('only a ready engine is selectable; Udio (off) and ElevenLabs (busy) are shown but inert', () => {
  const rows = engineChoices(STATUS, { instrumental: true });
  expect(rows.map((r) => r.id)).toEqual(['auto', 'lyria', 'udio', 'elevenlabs-music', 'musicgen']);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  expect(by.auto).toMatchObject({ selectable: true, blocked: null });
  expect(by.lyria).toMatchObject({ selectable: true, blocked: null });
  expect(by.udio).toMatchObject({ selectable: false, blocked: 'off' });
  expect(by['elevenlabs-music']).toMatchObject({ selectable: false, blocked: 'busy' });
  expect(by.musicgen).toMatchObject({ selectable: true, blocked: null });
});

test('MusicGen makes no vocals, so it cannot be picked for a song', () => {
  const by = Object.fromEntries(engineChoices(STATUS, { instrumental: false }).map((r) => [r.id, r]));
  expect(by.musicgen).toMatchObject({ selectable: false, blocked: 'instrumental-only' });
});

test('before the status loads only Auto is offered', () => {
  const rows = engineChoices(null, { instrumental: true });
  expect(rows.filter((r) => r.selectable).map((r) => r.id)).toEqual(['auto']);
  expect(rows.find((r) => r.id === 'lyria')?.blocked).toBe('unknown');
});

test('a stored pick the server would refuse right now is Auto', () => {
  expect(effectiveEnginePref('lyria', STATUS, { instrumental: false })).toBe('lyria');
  expect(effectiveEnginePref('udio', STATUS, { instrumental: false })).toBe('auto');
  expect(effectiveEnginePref('musicgen', STATUS, { instrumental: false })).toBe('auto'); // a song
  expect(effectiveEnginePref('musicgen', STATUS, { instrumental: true })).toBe('musicgen');
  expect(effectiveEnginePref('lyria', null, { instrumental: false })).toBe('auto');
});

test('the status parser accepts the route\'s shape, normalises it, and refuses junk', () => {
  expect(parseMusicEnginesStatus(STATUS)).toEqual(STATUS);
  expect(parseMusicEnginesStatus(null)).toBeNull();
  expect(parseMusicEnginesStatus({ engines: { lyria: {} } })).toBeNull(); // a missing engine = not our shape
  const loose = parseMusicEnginesStatus({ ...STATUS, chain: ['lyria', 'nope', 7] });
  expect(loose?.chain).toEqual(['lyria']);
});

test('every engine, reason and note has ka / en / ru copy, and no copy is empty', () => {
  for (const l of ['ka', 'en', 'ru'] as const) {
    const c = ENGINE_COPY[l];
    expect(c.auto.name.length).toBeGreaterThan(0);
    expect(c.auto.role(['A', 'B'])).toContain('A → B');
    expect(c.auto.role([]).length).toBeGreaterThan(0);
    for (const id of MUSIC_ENGINE_CHAIN) {
      expect(c.engines[id].name.length).toBeGreaterThan(0);
      expect(c.engines[id].role.length).toBeGreaterThan(0);
    }
    for (const k of ['off', 'busy', 'unknown', 'instrumental-only'] as const) expect(c.blocked[k].length).toBeGreaterThan(0);
    expect(c.priceNote.length).toBeGreaterThan(0);
    expect(c.settleNote.length).toBeGreaterThan(0);
  }
  expect(chainNames(STATUS, 'en')).toEqual(['Lyria 3', 'MusicGen']);
});

test('the pill names the pick — a reference track fixes the engine', () => {
  expect(enginePillLabel({ locale: 'en', pref: 'auto', reference: null })).toBe('Auto');
  expect(enginePillLabel({ locale: 'en', pref: 'lyria', reference: null })).toBe('Lyria 3');
  expect(enginePillLabel({ locale: 'en', pref: 'lyria', reference: 'cover' })).toBe('Cover');
  expect(enginePillLabel({ locale: 'en', pref: 'lyria', reference: 'voice' })).toBe('Your voice');
});

describe('the stored preference', () => {
  beforeEach(() => window.localStorage.clear());

  test('defaults to Auto and sends no field for it', () => {
    expect(getMusicEnginePref()).toBe('auto');
    expect(musicEngineField()).toEqual({});
  });

  test('a pick is stored, read back and sent as `engine`; Auto clears it', () => {
    setMusicEnginePref('elevenlabs-music');
    expect(window.localStorage.getItem(MUSIC_ENGINE_KEY)).toBe('elevenlabs-music');
    expect(getMusicEnginePref()).toBe('elevenlabs-music');
    expect(musicEngineField()).toEqual({ engine: 'elevenlabs-music' });
    setMusicEnginePref('auto');
    expect(window.localStorage.getItem(MUSIC_ENGINE_KEY)).toBeNull();
    expect(musicEngineField()).toEqual({});
  });

  test('a corrupt value is Auto, and unreadable storage never throws', () => {
    window.localStorage.setItem(MUSIC_ENGINE_KEY, 'suno');
    expect(getMusicEnginePref()).toBe('auto');
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getMusicEnginePref()).toBe('auto');
    spy.mockRestore();
  });
});
