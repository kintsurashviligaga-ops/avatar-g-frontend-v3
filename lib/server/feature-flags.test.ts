/** @jest-environment node */
// Mock the supabase server module (its import graph reads required NEXT_PUBLIC env at load). Returning null
// from createServiceRoleClient makes loadDbFlags fail open to an empty override map — the deterministic
// "no DB overrides" state these tests assert env-wins / default-fallback precedence against.
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => null }));

import { envBool, getFeatureFlag, resolveAllFlags, setFeatureFlag, isKnownFlag, invalidateFlagCache, FLAG_DEFS } from './feature-flags';

// No Supabase env in the test runner → createServiceRoleClient throws/returns null → loadDbFlags fails open
// to an empty override map. So the DB layer is deterministically "no overrides" here, which lets us assert
// the env-wins and default-fallback precedence without mocking.

const SAVE: Record<string, string | undefined> = {};
const FLAGS = ['FILM_AUDIO_MIX_ENABLED', 'FILM_LIPSYNC_ENABLED', 'LIPSYNC_HEYGEN'];

beforeEach(() => {
  for (const k of FLAGS) { SAVE[k] = process.env[k]; delete process.env[k]; }
  invalidateFlagCache();
});
afterEach(() => {
  for (const k of FLAGS) { if (SAVE[k] === undefined) delete process.env[k]; else process.env[k] = SAVE[k]; }
});

describe('envBool', () => {
  it('is undefined when unset or empty', () => {
    expect(envBool(undefined)).toBeUndefined();
    expect(envBool('')).toBeUndefined();
    expect(envBool('   ')).toBeUndefined();
  });
  it('maps 0/false/off/no → false, everything else set → true', () => {
    for (const f of ['0', 'false', 'FALSE', 'off', 'no']) expect(envBool(f)).toBe(false);
    for (const t of ['1', 'true', 'on', 'yes', 'anything']) expect(envBool(t)).toBe(true);
  });
});

describe('getFeatureFlag precedence', () => {
  it('ENV wins when set (both polarities)', async () => {
    process.env.FILM_AUDIO_MIX_ENABLED = '1';
    expect(await getFeatureFlag('FILM_AUDIO_MIX_ENABLED', false)).toBe(true);
    process.env.FILM_AUDIO_MIX_ENABLED = '0';
    invalidateFlagCache();
    expect(await getFeatureFlag('FILM_AUDIO_MIX_ENABLED', false)).toBe(false);
    // LIPSYNC_HEYGEN default true: '0' env forces off
    process.env.LIPSYNC_HEYGEN = '0';
    expect(await getFeatureFlag('LIPSYNC_HEYGEN', true)).toBe(false);
  });
  it('falls back to the built-in default when neither env nor DB is set (DB fail-open)', async () => {
    expect(await getFeatureFlag('FILM_AUDIO_MIX_ENABLED', false)).toBe(false);
    expect(await getFeatureFlag('LIPSYNC_HEYGEN', true)).toBe(true);
  });

  // Pin the DELIBERATE widening vs the old strict checks (old: FILM_* `=== '1'`, HEYGEN `!== '0'`).
  // Real deployments only ever use '1'/'0'/unset, but lock the documented behaviour so it can't drift silently.
  it('reads a set env with standard truthiness (widened superset of the old strict checks)', async () => {
    for (const v of ['1', 'true', 'on', 'yes', '  1  ']) {
      process.env.FILM_AUDIO_MIX_ENABLED = v; invalidateFlagCache();
      expect(await getFeatureFlag('FILM_AUDIO_MIX_ENABLED', false)).toBe(true);
    }
    for (const v of ['0', 'false', 'off', 'no']) {
      process.env.LIPSYNC_HEYGEN = v; invalidateFlagCache();
      expect(await getFeatureFlag('LIPSYNC_HEYGEN', true)).toBe(false);
    }
  });
});

describe('resolveAllFlags', () => {
  it('reports env source + resolved value when env pins a flag', async () => {
    process.env.FILM_LIPSYNC_ENABLED = '1';
    const all = await resolveAllFlags();
    const f = all.find((x) => x.name === 'FILM_LIPSYNC_ENABLED')!;
    expect(f.source).toBe('env');
    expect(f.effective).toBe(true);
    expect(f.envResolved).toBe(true);
  });
  it('reports default source when nothing is set', async () => {
    const all = await resolveAllFlags();
    expect(all).toHaveLength(FLAG_DEFS.length);
    const heygen = all.find((x) => x.name === 'LIPSYNC_HEYGEN')!;
    expect(heygen.source).toBe('default');
    expect(heygen.effective).toBe(true); // its default
    expect(heygen.dbEnabled).toBeNull();
  });
});

describe('write guard', () => {
  it('rejects unknown flags', async () => {
    expect(isKnownFlag('NOPE')).toBe(false);
    expect(await setFeatureFlag('NOPE', true, null)).toEqual({ ok: false, error: 'unknown_flag' });
  });
  it('accepts known flag names', () => {
    for (const f of FLAGS) expect(isKnownFlag(f)).toBe(true);
  });
});
