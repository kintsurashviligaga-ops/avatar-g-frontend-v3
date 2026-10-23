/** @jest-environment jsdom */
/**
 * The engine catalogue: the list is exactly the route's engines — Google Lyria alone, one per request, no chain; a pick
 * the server would refuse (Lyria not configured, breaker open, status not loaded) cannot be offered; a retired engine's
 * id (Udio, ElevenLabs Music, MusicGen) is known as retired but never offered; copy exists in ka / en / ru for every row.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENGINE_COPY, MUSIC_ENGINE_CHAIN, chainNames, effectiveEnginePref, engineAvailability, engineChoices, enginePillLabel,
  isMusicEngineId, isMusicEnginePref, isRetiredMusicEngineId, parseMusicEnginesStatus, RETIRED_MUSIC_ENGINE_IDS,
  type MusicEnginesStatus,
  LYRIA_CLIP_MODEL, LYRIA_PRO_MODEL, lyriaModelForSec, musicLengthDirection, musicTargetSec, offeredMusicLengths,
} from './musicEngines';
import { musicDraftFromPanel } from '@/components/studio/music/musicDraft';
import { musicCapabilities, validateCapability } from '@/lib/music/studio/capabilities';
import { lyriaInput } from '@/lib/music/studio/prompt';
import { musicQuote } from './musicQuote';
import { MUSIC_ENGINE_KEY, getMusicEnginePref, musicEngineField, setMusicEnginePref } from './musicEnginePref';

const STATUS: MusicEnginesStatus = {
  engines: { lyria: { configured: true, busy: false, controls: 'prompt' } },
  references: { cover: true, voice: true },
  chain: ['lyria'], // Auto is Lyria alone (R7)
  lengths: [30],
  vocals: true,
};
const BUSY: MusicEnginesStatus = { ...STATUS, engines: { lyria: { configured: true, busy: true, controls: 'prompt' } }, chain: [] };
const OFF: MusicEnginesStatus = { ...STATUS, engines: { lyria: { configured: false, busy: false, controls: 'prompt' } }, chain: [] };

test('the picker lists exactly ONE engine, the one the route can run: Google Lyria (MASTER TASK v3.1)', () => {
  expect(MUSIC_ENGINE_CHAIN).toEqual(['lyria']);
  const route = readFileSync(join(process.cwd(), 'app/api/ai/music/route.ts'), 'utf8');
  // The only attempt the route can build is Lyria's (Clip, or Pro over 30 s — one of them); no other engine's client is
  // even imported.
  expect([...route.matchAll(/name: ([^,]+),/g)].map((m) => m[1])).toEqual(["pro ? 'lyria-pro' : 'lyria'"]);
  expect(route).not.toMatch(/lib\/udio\/client|lib\/elevenlabs\/music|lib\/ai\/replicate|lib\/audio\/rvc|pollinations\.ai/);
  // A retired engine's id is refused before the reserve, by name.
  expect(route).toContain('else if (isRetiredMusicEngineId(body.engine)) retiredEngine = true;');
  expect(route).toContain('if (audioReference || voiceReference || useMyVoice || retiredEngine) {');
});

test('…and there is no chain: ONE attempt reaches the failover helper, with no failover (R7)', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/ai/music/route.ts'), 'utf8');
  expect(route).toContain('runWithLatencyFailover<Track>([bounded],');
  expect(route).not.toMatch(/providers\.(unshift|splice)\(/);
});

test('ids and picks validate: a made-up engine is neither, and a retired one is neither but is known as retired', () => {
  expect(isMusicEngineId('lyria')).toBe(true);
  expect(isMusicEngineId('suno')).toBe(false);
  expect(isMusicEnginePref('auto')).toBe(true);
  expect(isMusicEnginePref('suno')).toBe(false);
  expect(isMusicEnginePref(undefined)).toBe(false);
  for (const id of ['udio', 'elevenlabs-music', 'musicgen']) {
    expect(isMusicEngineId(id)).toBe(false);
    expect(isMusicEnginePref(id)).toBe(false);
    expect(isRetiredMusicEngineId(id)).toBe(true);
  }
  for (const v of ['lyria', 'auto', 'suno', '', 7, null, undefined, {}]) expect(isRetiredMusicEngineId(v)).toBe(false);
  expect(RETIRED_MUSIC_ENGINE_IDS).toEqual(['udio', 'elevenlabs-music', 'musicgen']);
});

test('availability: off (not configured) · busy (breaker open) · ready — and unknown while the status has not loaded', () => {
  expect(engineAvailability(STATUS, 'lyria')).toBe('ready');
  expect(engineAvailability(OFF, 'lyria')).toBe('off');
  expect(engineAvailability(BUSY, 'lyria')).toBe('busy');
  expect(engineAvailability(null, 'lyria')).toBe('unknown');
});

test('the rows are Auto and Lyria only; Lyria is selectable when ready, shown but inert when off or busy — song or not', () => {
  for (const instrumental of [true, false]) {
    const rows = engineChoices(STATUS, { instrumental });
    expect(rows.map((r) => r.id)).toEqual(['auto', 'lyria']);
    expect(rows).toEqual([{ id: 'auto', selectable: true, blocked: null }, { id: 'lyria', selectable: true, blocked: null }]);
  }
  expect(engineChoices(OFF, { instrumental: true })[1]).toEqual({ id: 'lyria', selectable: false, blocked: 'off' });
  expect(engineChoices(BUSY, { instrumental: true })[1]).toEqual({ id: 'lyria', selectable: false, blocked: 'busy' });
});

test('before the status loads only Auto is offered', () => {
  const rows = engineChoices(null, { instrumental: true });
  expect(rows.filter((r) => r.selectable).map((r) => r.id)).toEqual(['auto']);
  expect(rows.find((r) => r.id === 'lyria')?.blocked).toBe('unknown');
});

test('a stored pick the server would refuse right now is Auto', () => {
  expect(effectiveEnginePref('lyria', STATUS, { instrumental: false })).toBe('lyria');
  expect(effectiveEnginePref('lyria', BUSY, { instrumental: false })).toBe('auto');
  expect(effectiveEnginePref('lyria', OFF, { instrumental: true })).toBe('auto');
  expect(effectiveEnginePref('lyria', null, { instrumental: false })).toBe('auto');
});

test('the status parser accepts the route\'s shape, normalises it, and refuses junk', () => {
  expect(parseMusicEnginesStatus(STATUS)).toEqual(STATUS);
  expect(parseMusicEnginesStatus(null)).toBeNull();
  expect(parseMusicEnginesStatus({ engines: {} })).toBeNull(); // a missing engine = not our shape
  expect(parseMusicEnginesStatus({ engines: { lyria: {} } })?.engines).toEqual({ lyria: { configured: false, busy: false, controls: 'prompt' } });
  // An older server still sends the retired rows: they are dropped, never offered.
  const older = parseMusicEnginesStatus({ ...STATUS, engines: { ...STATUS.engines, udio: { configured: true, busy: false, controls: 'native' } } });
  expect(older?.engines).toEqual(STATUS.engines);
  const loose = parseMusicEnginesStatus({ ...STATUS, chain: ['lyria', 'nope', 7] });
  expect(loose?.chain).toEqual(['lyria']);
  // `lengths`: only the panel's own values; an older server that sends none offers the clip's 30 s alone.
  expect(parseMusicEnginesStatus({ ...STATUS, lengths: [0, 90, 45, '60', 60, 30] })?.lengths).toEqual([30, 60, 90, 0]);
  const { lengths: _omit, ...old } = STATUS;
  expect(parseMusicEnginesStatus(old)?.lengths).toEqual([30]);
  // `vocals`: true only when the server says so; an older server that sends none offers no sung song.
  const { vocals: _v, ...noVocals } = STATUS;
  expect(parseMusicEnginesStatus(noVocals)?.vocals).toBe(false);
  expect(parseMusicEnginesStatus({ ...STATUS, vocals: 'true' })?.vocals).toBe(false);
});

describe('track length → Lyria model (owner, GG 2026-10-18): Clip up to 30 s, Pro above', () => {
  test('Full song is a ~3-minute song on Pro; 60 / 90 are Pro; 30 (and the legacy 15) the clip', () => {
    expect([30, 15, 60, 90, 0].map(musicTargetSec)).toEqual([30, 15, 60, 90, 180]);
    expect([30, 15, 60, 90, 180].map(lyriaModelForSec)).toEqual([LYRIA_CLIP_MODEL, LYRIA_CLIP_MODEL, LYRIA_PRO_MODEL, LYRIA_PRO_MODEL, LYRIA_PRO_MODEL]);
    expect(musicLengthDirection(30)).toBe('');
    expect(musicLengthDirection(60)).toMatch(/^About 60 seconds/);
    expect(musicLengthDirection(180)).toMatch(/about 3 minutes.*intro.*verses.*choruses.*bridge.*outro/);
  });

  test('the panel offers a longer length only within Pro\'s verified length (0 = not verified)', () => {
    expect(offeredMusicLengths(0)).toEqual([30]);
    expect(offeredMusicLengths(60)).toEqual([30, 60]);
    expect(offeredMusicLengths(90)).toEqual([30, 60, 90]);
    expect(offeredMusicLengths(180)).toEqual([30, 60, 90, 0]);
  });

  test('prices are unchanged: a Full song is still the 90 s tier, on the panel and in Music Studio v1', () => {
    expect(musicQuote({ duration: 0 })).toBe(musicQuote({ duration: 90 }));
  });

  test('Music Studio v1: the draft sends the panel\'s length and model; the matrix takes it once Pro is verified', () => {
    const draft = (duration: number) => musicDraftFromPanel({ prompt: 'epic ballad', genre: 'rock', tempo: 'medium', instrumental: true, voiceType: 'auto', lyrics: '', duration }, 'en').request;
    expect(draft(30)).toMatchObject({ modelId: LYRIA_CLIP_MODEL, durationSec: 30 });
    expect(draft(15)).toMatchObject({ modelId: LYRIA_CLIP_MODEL, durationSec: 30 });
    expect(draft(60)).toMatchObject({ modelId: LYRIA_PRO_MODEL, durationSec: 60 });
    expect(draft(0)).toMatchObject({ modelId: LYRIA_PRO_MODEL, durationSec: 180 });
    expect(musicDraftFromPanel({ prompt: 'x', genre: '', tempo: '', instrumental: true, voiceType: 'auto', lyrics: '' }, 'en').request).toMatchObject({ modelId: LYRIA_CLIP_MODEL, durationSec: 30 });

    const base = { MUSIC_STUDIO_ENABLED: '1', GEMINI_TRANSPORT: 'gemini_api', GEMINI_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv;
    const on = musicCapabilities({ ...base, MUSIC_LYRIA_PRO_VERIFIED: '1', MUSIC_LYRIA_PRO_SECONDS: '180' });
    expect(on.models.find((m) => m.id === LYRIA_PRO_MODEL)?.durationsSec).toEqual([60, 90, 180]);
    expect(musicCapabilities({ ...base, MUSIC_LYRIA_PRO_VERIFIED: '1', MUSIC_LYRIA_PRO_SECONDS: '90' }).models.find((m) => m.id === LYRIA_PRO_MODEL)?.durationsSec).toEqual([60, 90]);
    expect(musicCapabilities(base).models.map((m) => m.id)).toEqual([LYRIA_CLIP_MODEL]); // gate off: no Pro
    expect(validateCapability(draft(0), { ...on, configured: true, transport: 'vertex' }).id).toBe(LYRIA_PRO_MODEL);

    // Pro has no length field: the v1 prompt carries the direction; the clip's is unchanged.
    const plan = (r: ReturnType<typeof draft>) => ({ v: 1, kind: 'music', request: r, transport: 'vertex', billedSec: r.durationSec }) as unknown as Parameters<typeof lyriaInput>[0];
    expect(lyriaInput(plan(draft(0)))).toMatch(/about 3 minutes/);
    expect(lyriaInput(plan(draft(30)))).not.toMatch(/seconds long|minutes/);
  });
});

test('every engine, reason and note has ka / en / ru copy, and no copy is empty', () => {
  for (const l of ['ka', 'en', 'ru'] as const) {
    const c = ENGINE_COPY[l];
    expect(c.auto.name.length).toBeGreaterThan(0);
    // Auto names the engine it runs and never reads as a chain (one engine per request, R7).
    expect(c.auto.role(['A'])).toContain('A');
    expect(c.auto.role(['A'])).not.toContain('→');
    expect(c.auto.role([]).length).toBeGreaterThan(0);
    for (const id of MUSIC_ENGINE_CHAIN) {
      expect(c.engines[id].name.length).toBeGreaterThan(0);
      expect(c.engines[id].role.length).toBeGreaterThan(0);
    }
    expect(Object.keys(c.engines)).toEqual(['lyria']);
    expect(Object.keys(c.blocked).sort()).toEqual(['busy', 'off', 'unknown']);
    for (const k of ['off', 'busy', 'unknown'] as const) expect(c.blocked[k].length).toBeGreaterThan(0);
    expect(c.priceNote.length).toBeGreaterThan(0);
    expect(c.settleNote.length).toBeGreaterThan(0);
  }
  expect(chainNames(STATUS, 'en')).toEqual(['Lyria 3']);
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
    // Production 2026-10-16: a phone kept an old „Udio" pick. A retired engine's stored id reads back as Auto and sends
    // nothing, so the track is composed on Lyria instead of refused.
    for (const old of ['udio', 'elevenlabs-music', 'musicgen']) {
      window.localStorage.setItem(MUSIC_ENGINE_KEY, old);
      expect(getMusicEnginePref()).toBe('auto');
      expect(musicEngineField()).toEqual({});
    }
    setMusicEnginePref('lyria');
    expect(window.localStorage.getItem(MUSIC_ENGINE_KEY)).toBe('lyria');
    expect(getMusicEnginePref()).toBe('lyria');
    expect(musicEngineField()).toEqual({ engine: 'lyria' });
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
