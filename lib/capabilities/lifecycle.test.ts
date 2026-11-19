/**
 * v5.1 M-1 — the Google lifecycle guard. The first describe block is the CI guard itself: it reads the real
 * config/google-lifecycle.json against today's date and fails the build when a served model retires within 21 days,
 * or when the code serves a model the file does not list. The rest pin the alarm levels on fixtures.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LIFECYCLE,
  daysUntilRetirement,
  lifecycleBlockers,
  lifecycleEntry,
  lifecycleLevel,
  lifecycleReport,
  servedModels,
  type LifecycleEntry,
  type LifecycleRegistry,
} from './lifecycle';

// lib/video/omniClip is server-only and pulls the billing stack in, so its constant is read from the source.
const OMNI_MODEL = /export const OMNI_MODEL = '([^']+)'/.exec(readFileSync(join(__dirname, '../video/omniClip.ts'), 'utf8'))?.[1];

describe('CI guard: served Google models (config/google-lifecycle.json, today)', () => {
  it('no served model is missing from the registry or retires within 21 days', () => {
    // A red line here means: move the default to the listed replacement (and update the registry), before Google
    // shuts the model down. See docs/v5.1-phase1/04 §5 and 09 §1.
    expect(lifecycleBlockers()).toEqual([]);
  });

  it('the Omni video model (server-only file) is in the guarded set', () => {
    expect(OMNI_MODEL).toBeTruthy();
    expect(servedModels()).toContain(OMNI_MODEL);
  });

  it('every entry names a known source and a well-formed date', () => {
    for (const m of LIFECYCLE.models) {
      expect(LIFECYCLE.sources[m.source]).toBeDefined();
      for (const d of [m.releaseDate, m.retirementDate]) {
        if (typeof d === 'string') expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('ids are unique (aliases included)', () => {
    const all = LIFECYCLE.models.flatMap((m) => [m.id, ...(m.aliases ?? [])]);
    expect(new Set(all).size).toBe(all.length);
  });
});

const entry = (over: Partial<LifecycleEntry>): LifecycleEntry => ({ id: 'm', stage: 'GA', source: 'S', served: [], ...over });
const NOW = new Date('2026-11-12T10:00:00Z');

describe('alarm levels', () => {
  it.each([
    ['2026-11-12', 'retired'],
    ['2026-11-01', 'retired'],
    ['2026-11-19', 'urgent'], // 7 days: the 3.6 Flash case on the day it was found
    ['2026-12-03', 'block'], // 21 days
    ['2026-12-04', 'warn'], // 22 days
    ['2026-12-27', 'warn'], // 45 days
    ['2026-12-28', 'ok'],
  ])('retiring %s → %s', (date, level) => {
    expect(lifecycleLevel(entry({ retirementDate: date }), NOW)).toBe(level);
  });

  it('null date = listed without a date; no date field = unknown; not in the file = unknown', () => {
    expect(lifecycleLevel(entry({ retirementDate: null }), NOW)).toBe('none');
    expect(lifecycleLevel(entry({}), NOW)).toBe('unknown');
    expect(lifecycleLevel(null, NOW)).toBe('unknown');
    expect(lifecycleLevel(entry({ stage: 'RETIRED', retirementDate: '2030-01-01' }), NOW)).toBe('retired');
  });

  it('counts whole UTC days', () => {
    expect(daysUntilRetirement(entry({ retirementDate: '2026-11-19' }), new Date('2026-11-12T23:59:00Z'))).toBe(7);
  });
});

describe('guard on a fixture', () => {
  const fixture = (models: LifecycleEntry[]): LifecycleRegistry => ({
    ...LIFECYCLE,
    models: [...LIFECYCLE.models.filter((m) => !models.some((x) => x.id === m.id)), ...models],
  });

  it('turns red when a served default retires within 21 days, naming the replacement', () => {
    const reg = fixture([entry({ id: 'gemini-3.8-flash', retirementDate: '2026-11-25', replacement: 'gemini-9-flash' })]);
    expect(lifecycleBlockers(NOW, reg)).toContain('gemini-3.8-flash: retires 2026-11-25 (13 days left); move to gemini-9-flash');
  });

  it('turns red when a served default is missing from the registry', () => {
    const reg: LifecycleRegistry = { ...LIFECYCLE, models: LIFECYCLE.models.filter((m) => m.id !== 'gemini-3.8-flash') };
    expect(lifecycleBlockers(NOW, reg)).toContain('gemini-3.8-flash: served but missing from config/google-lifecycle.json');
  });

  it('a near date on a model nobody serves does not block', () => {
    const reg = fixture([entry({ id: 'gemini-unused', retirementDate: '2026-11-13' })]);
    expect(lifecycleBlockers(NOW, reg).some((b) => b.startsWith('gemini-unused'))).toBe(false);
  });

  it('finds a model by alias or models/ prefix', () => {
    expect(lifecycleEntry('models/gemini-2.5-flash-native-audio-latest')?.id).toBe('gemini-live-2.5-flash-native-audio');
  });

  it('report lists the worst first', () => {
    const reg = fixture([entry({ id: 'gemini-3.8-flash', retirementDate: '2026-11-11' })]);
    expect(lifecycleReport(NOW, reg)[0]).toMatchObject({ id: 'gemini-3.8-flash', level: 'retired' });
  });
});
