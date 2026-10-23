/** @jest-environment node */
/**
 * The film's four legs as the operator reports name them (lib/chat/filmEngines): Google's engines on Vertex AI only,
 * names-only, and never a vendor key standing in for a missing Google config.
 */
jest.mock('server-only', () => ({}));

import { computeFilmEngines, filmEnginesByLeg } from './filmEngines';

/** A complete keyless (WIF) Vertex config: vertexConfig() is pure, so this costs no network call. */
const VERTEX_ENV: Record<string, string> = {
  GCP_PROJECT_ID: 'myavatar-test',
  GCP_VEO_BUCKET: 'myavatar-veo-test',
  GCP_PROJECT_NUMBER: '123456789',
  GCP_SERVICE_ACCOUNT_EMAIL: 'veo@myavatar-test.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

/** The keys the reports used to read. Distinctive values: none may ever appear in a report. */
const OLD_VENDOR_KEYS: Record<string, string> = {
  LTX_VIDEO_API_KEY: 'ltx-should-not-leak',
  UDIO_API_KEY: 'udio-should-not-leak',
  ELEVENLABS_API_KEY: 'sk-should-not-leak',
  NANOBANANA_API_KEY: 'nb-should-not-leak',
  REPLICATE_API_TOKEN: 'r8_should-not-leak',
  HEYGEN_API_KEY: 'heygen-should-not-leak',
  ANTHROPIC_API_KEY: 'sk-ant-should-not-leak',
  GEMINI_API_KEY: 'AIza-should-not-leak',
};

test('the four legs are Gemini, Veo, Lyria and Cloud TTS, in that order, all ready on a complete Vertex config', () => {
  const legs = computeFilmEngines(VERTEX_ENV);
  expect(legs.map((l) => l.agent)).toEqual(['storyboard', 'director', 'score', 'voice']);
  expect(legs.map((l) => l.engine)).toEqual([
    'Gemini gemini-3.1-flash-image on Vertex AI',
    'Veo on Vertex AI',
    'Lyria on Vertex AI',
    'Google Cloud TTS (Gemini-TTS for Georgian)',
  ]);
  for (const l of legs) expect(l).toMatchObject({ present: true, missing: [] });
});

test('the storyboard names the frame model GEMINI_FRAME_MODEL picks', () => {
  expect(filmEnginesByLeg({ ...VERTEX_ENV, GEMINI_FRAME_MODEL: 'gemini-3-pro-image' }).storyboard.engine).toBe('Gemini gemini-3-pro-image on Vertex AI');
});

test('with no env every leg is missing, and says which variables by name', () => {
  const legs = filmEnginesByLeg({});
  for (const l of Object.values(legs)) {
    expect(l.present).toBe(false);
    expect(l.missing).toContain('GCP_PROJECT_ID');
  }
  // Veo also needs its bucket; the Gemini legs do not.
  expect(legs.director.missing.join(' ')).toMatch(/GCP_VEO_BUCKET/);
  expect(legs.storyboard.missing.join(' ')).not.toMatch(/BUCKET/);
});

test('the old vendor keys alone serve no leg, and no report text or value names them', () => {
  const legs = computeFilmEngines(OLD_VENDOR_KEYS);
  expect(legs.every((l) => !l.present)).toBe(true);
  const text = JSON.stringify(computeFilmEngines({ ...VERTEX_ENV, ...OLD_VENDOR_KEYS }));
  expect(text).not.toMatch(/should-not-leak|LTX|Udio|ElevenLabs|NanoBanana|Nano Banana|Replicate|HeyGen|Anthropic|MusicGen|API_KEY/i);
  // A vendor key changes nothing on a working config either.
  expect(computeFilmEngines({ ...VERTEX_ENV, ...OLD_VENDOR_KEYS })).toEqual(computeFilmEngines(VERTEX_ENV));
});

test('a Gemini transport other than vertex blocks the Gemini legs and is named, never served another way', () => {
  for (const GEMINI_TRANSPORT of ['gemini_api', 'gemini', 'bogus']) {
    const legs = filmEnginesByLeg({ ...VERTEX_ENV, GEMINI_API_KEY: 'AIza-x', GEMINI_TRANSPORT });
    expect(legs.storyboard.present).toBe(false);
    expect(legs.score.present).toBe(false);
    expect(legs.storyboard.missing).toEqual(['GEMINI_TRANSPORT (must be vertex or unset)']);
  }
});

test('LYRIA_ENABLED=0 switches the score off alone', () => {
  const legs = filmEnginesByLeg({ ...VERTEX_ENV, LYRIA_ENABLED: '0' });
  expect(legs.score).toMatchObject({ present: false, missing: ['LYRIA_ENABLED (off)'] });
  expect([legs.storyboard, legs.director, legs.voice].every((l) => l.present)).toBe(true);
});
