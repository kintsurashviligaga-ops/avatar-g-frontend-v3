/** @jest-environment node */
/**
 * Pins the admin "Pipeline" card to the engines the code really runs (lib/pipeline/statusAgent):
 * Veo for film clips, Gemini image on Vertex for the anchor frames and the base image, Lyria 3 alone for music
 * Auto — and never a claim of Udio-as-primary, a NanoBanana or FLUX anchor/base or Kling clips under the default
 * Google-only policy. Real gate functions run against a fake env (no network call).
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => '/fake/bin/ffmpeg');

import { checkPipelineHealth, type PipelineHealth, type ServiceStatus } from './statusAgent';

const ORIGINAL_ENV = process.env;

/** Distinctive fake values — none of them may ever appear in the snapshot or the log line. */
const SECRETS: Record<string, string> = {
  ELEVENLABS_API_KEY: 'sk-should-not-leak',
  GEMINI_API_KEY: 'AIza-gemini-should-not-leak',
  REPLICATE_API_TOKEN: 'r8_replicate-should-not-leak',
  NANOBANANA_API_KEY: 'nb-should-not-leak',
  HEYGEN_API_KEY: 'heygen-should-not-leak',
  UDIO_API_KEY: 'udio-should-not-leak',
  LTX_VIDEO_API_KEY: 'ltx-should-not-leak',
  ELEVENLABS_VOICE_ID_FEMALE: 'voiceFemaleShouldNotLeak',
  ELEVENLABS_VOICE_ID_MALE: 'voiceMaleShouldNotLeak',
};

/** A complete keyless (WIF) Vertex config — vertexConfig() is pure, so this costs no network call. */
const VERTEX_ENV: Record<string, string> = {
  GCP_PROJECT_ID: 'myavatar-test',
  GCP_VEO_BUCKET: 'myavatar-veo-test',
  GCP_PROJECT_NUMBER: '123456789',
  GCP_SERVICE_ACCOUNT_EMAIL: 'veo@myavatar-test.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

function setEnv(vars: Record<string, string>): void {
  process.env = { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-test-approval', ...vars } as NodeJS.ProcessEnv;
}

function row(h: PipelineHealth, service: string): ServiceStatus {
  const s = h.services.find((r) => r.service === service);
  if (!s) throw new Error(`no "${service}" row in ${h.services.map((r) => r.service).join(', ')}`);
  return s;
}

const text = (s: ServiceStatus): string => `${s.provider} ${s.note}`;

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  process.env = ORIGINAL_ENV;
});

describe('checkPipelineHealth — with no env at all', () => {
  it('does not throw and returns the full snapshot, critical', async () => {
    setEnv({});
    const h = await checkPipelineHealth();
    expect(h.overall).toBe('critical');
    expect(Number.isNaN(Date.parse(h.checkedAt))).toBe(false);
    expect(h.services.map((s) => s.service)).toEqual([
      'სურათი (Anchor)', 'ვიდეო (Clips)', 'ლიპ-სინქი', 'ხმა (TTS)', 'მუსიკა', 'მუსიკა (ფილმი)', 'სურათი (Base)', 'სუბტიტრები',
    ]);
    // Only the bundled ffmpeg binary works without a single key.
    expect(h.services.filter((s) => s.available).map((s) => s.service)).toEqual(['სუბტიტრები']);
    expect(h.warnings.some((w) => /7 service\(s\) unavailable/.test(w))).toBe(true);
    // The card names what is missing (env NAMES), it does not go blank.
    expect(row(h, 'ვიდეო (Clips)').note).toMatch(/GCP_PROJECT_ID/);
    expect(row(h, 'ვიდეო (Clips)').note).toMatch(/^no Veo route — Vertex AI is not configured for Veo: GCP_PROJECT_ID/);
    expect(row(h, 'ვიდეო (Clips)').note).not.toMatch(/GEMINI_API_KEY/);
    expect(row(h, 'სურათი (Base)').note).toMatch(/^GCP_PROJECT_ID/);
    expect(row(h, 'სურათი (Base)').note).not.toMatch(/NANOBANANA/);
  });

  it('stays fail-open when something inside throws', async () => {
    // An env read that throws (the first thing the snapshot does) must come back as the minimal snapshot, not a 500.
    process.env = new Proxy({} as NodeJS.ProcessEnv, {
      get: (_t, key) => {
        if (key === 'REPLICATE_API_TOKEN') throw new Error('env unreadable');
        return undefined;
      },
    });
    const h = await checkPipelineHealth();
    expect(h).toEqual(expect.objectContaining({ overall: 'critical', services: [] }));
    expect(h.warnings[0]).toMatch(/status agent error: env unreadable/);
  });
});

describe('the video row names the engine that renders film clips', () => {
  it('an AI Studio key is no Veo route (v3.1) — and never Kling, even with Replicate configured', async () => {
    setEnv({ ...SECRETS });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.provider).toBe('Veo 3.1');
    expect(video.available).toBe(false);
    expect(video.tier).toBe('unavailable');
    expect(video.note).toMatch(/Vertex AI is not configured for Veo/);
    expect(text(video)).not.toMatch(/kling|runway|ltx|replicate|Gemini API/i);
  });

  it('VEO_TRANSPORT=gemini is refused even with Vertex complete, and the row says why', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV, VEO_TRANSPORT: 'gemini' });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.available).toBe(false);
    expect(video.note).toMatch(/Developer API, which is not an allowed transport/);
  });

  it('Veo 3.1 on Vertex AI once the Vertex config is complete', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.provider).toBe('Veo 3.1 (Vertex AI)');
    expect(video.available).toBe(true);
    expect(video.note).toMatch(/veo-3\.1-fast-generate-001/);
    expect(video.note).not.toMatch(/refused/);
  });

  it('a default-tier model with no verified Vertex row is unavailable, and the row says why (v3.1)', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV, VEO_MODEL_FAST: 'veo-3.2-fast-generate-001' });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.available).toBe(false);
    expect(video.tier).toBe('unavailable');
    expect(video.note).toMatch(/^veo-3\.2-fast-generate-001 is not a verified Vertex Veo model .* refused before any call: fast$/);
  });

  it('another tier refused (a -preview id, or GCP_VEO_LOCATION) is named while the default still renders', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV, VEO_MODEL_LITE: 'veo-3.1-lite-generate-preview' });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.available).toBe(true);
    expect(video.note).toMatch(/veo-3\.1-fast-generate-001 .* · refused before any call: lite$/);

    setEnv({ ...SECRETS, ...VERTEX_ENV, GCP_VEO_LOCATION: 'europe-west4' });
    const moved = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(moved.available).toBe(false);
    expect(moved.note).toMatch(/not served from europe-west4 \(only us-central1\).* refused before any call: lite, fast, standard$/);
  });

  it('Replicate / LTX keys are no route under Google-only: no Veo transport = clips unavailable', async () => {
    setEnv({ REPLICATE_API_TOKEN: SECRETS.REPLICATE_API_TOKEN, LTX_VIDEO_API_KEY: SECRETS.LTX_VIDEO_API_KEY });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.available).toBe(false);
    expect(video.provider).toBe('Veo 3.1');
    expect(text(video)).not.toMatch(/kling/i);
  });

  it('a VEO_TRANSPORT=vertex pin without Vertex config is no route, and says so', async () => {
    setEnv({ GEMINI_API_KEY: SECRETS.GEMINI_API_KEY, VEO_TRANSPORT: 'vertex' });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.available).toBe(false);
    expect(video.note).toMatch(/^no Veo route — Vertex AI is not configured for Veo: .*GCP_PROJECT_ID/);
  });

  it.each([false, true])('an invalid transport pin is unavailable without leaking its value (Vertex ready: %s)', async (vertexReady) => {
    setEnv({ ...SECRETS, ...(vertexReady ? VERTEX_ENV : {}), VEO_TRANSPORT: 'wrong-pin-should-not-leak' });
    const h = await checkPipelineHealth();
    const video = row(h, 'ვიდეო (Clips)');
    expect(video.available).toBe(false);
    expect(video.note).toMatch(/VEO_TRANSPORT must be/);
    expect(JSON.stringify(h)).not.toContain('wrong-pin-should-not-leak');
  });
});

describe('no row repeats the stale provider claims', () => {
  it('fully configured, Google-only: Lyria (not Udio), Gemini anchor and base — no NanoBanana, no FLUX, no Kling', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV });
    const h = await checkPipelineHealth();
    for (const s of h.services) expect(text(s)).not.toMatch(/udio \(primary\)/i);

    const anchor = row(h, 'სურათი (Anchor)');
    expect(anchor.provider).toBe('Gemini gemini-3.1-flash-image');
    expect(anchor.available).toBe(true);
    expect(anchor.note).toMatch(/on Vertex AI/);
    expect(anchor.provider).not.toMatch(/flux/i);

    const base = row(h, 'სურათი (Base)');
    expect(base.provider).toBe('Gemini gemini-3.1-flash-image');
    expect(base.available).toBe(true);
    expect(base.note).toMatch(/on Vertex AI/);
    expect(base.note).toMatch(/no fallback/);
    expect(text(base)).not.toMatch(/nanobanana|reseller|flux|grok/i);

    const music = row(h, 'მუსიკა');
    expect(music.provider).toBe('Lyria 3 (lyria-3-clip-preview)');
    expect(music.note).toMatch(/Auto = Lyria 3 only, no failover/);
    expect(music.note).not.toMatch(/→|chain/i);

    expect(row(h, 'მუსიკა (ფილმი)').provider).toBe('Lyria 3 (Vertex)');
    expect(row(h, 'ხმა (TTS)').provider).toBe('Google Cloud TTS (Vertex)');
    expect(row(h, 'ხმა (TTS)').note).not.toMatch(/ElevenLabs/);
    expect(row(h, 'ლიპ-სინქი').provider).toBe('sync/lipsync-2 (Replicate)');
    expect(h.services.some((s) => s.service === 'Auto-Anchor')).toBe(false);
    expect(h.warnings.join(' ')).not.toMatch(/AUTO_ANCHOR_FRAME|LTX instead of Kling/);
    expect(h.overall).toBe('healthy');
  });

  it('music never falls to another engine: with Lyria switched off Auto is down, whatever other keys exist', async () => {
    setEnv({ ...SECRETS, LYRIA_ENABLED: '0' });
    const music = row(await checkPipelineHealth(), 'მუსიკა');
    expect(music.available).toBe(false);
    expect(music.provider).toMatch(/^Lyria 3/);
    expect(music.note).toMatch(/Auto fails — LYRIA_ENABLED is off/);
    // Music Studio v1: no other engine can be picked, whatever keys exist.
    expect(music.note).toMatch(/Udio \/ ElevenLabs Music \/ MusicGen removed/);
  });

  it('the film score is Lyria at only its verified length, and says when a sung song cannot be made', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV });
    let score = row(await checkPipelineHealth(), 'მუსიკა (ფილმი)');
    expect(score.available).toBe(true);
    expect(score.note).toMatch(/~30 s \(clip; Pro not verified\)/);
    expect(score.note).toMatch(/no sung song until Lyria vocals are verified/);
    expect(score.note).not.toMatch(/ElevenLabs/);

    setEnv({ ...SECRETS, ...VERTEX_ENV, MUSIC_LYRIA_PRO_VERIFIED: '1', MUSIC_LYRIA_PRO_SECONDS: '120', MUSIC_LYRIA_VOCALS_VERIFIED: '1' });
    score = row(await checkPipelineHealth(), 'მუსიკა (ფილმი)');
    expect(score.note).toMatch(/up to 120 s on Pro · sung songs on/);

    // An ElevenLabs key is no score: with Lyria off, films get none.
    setEnv({ ...SECRETS, ...VERTEX_ENV, LYRIA_ENABLED: '0' });
    score = row(await checkPipelineHealth(), 'მუსიკა (ფილმი)');
    expect(score.available).toBe(false);
    expect(score.note).toMatch(/^LYRIA_ENABLED is off — films get no generated score/);
  });

  it.each(['bogus', 'gemini_api'])('GEMINI_TRANSPORT=%s fails closed for the frames and Lyria without throwing', async (value) => {
    setEnv({ ...SECRETS, ...VERTEX_ENV, GEMINI_TRANSPORT: value });
    const h = await checkPipelineHealth();
    expect(row(h, 'სურათი (Anchor)').available).toBe(false);
    expect(row(h, 'მუსიკა').available).toBe(false);
    expect(row(h, 'სურათი (Anchor)').note).toMatch(/GEMINI_TRANSPORT \(not vertex\)/);
    expect(row(h, 'სურათი (Base)').available).toBe(false);
    expect(row(h, 'სურათი (Base)').note).toMatch(/GEMINI_TRANSPORT \(not vertex\)/);
  });

  it('an AI Studio key alone serves no frame, no studio image and no Lyria track (v3.1: Vertex AI only)', async () => {
    setEnv({ GEMINI_API_KEY: SECRETS.GEMINI_API_KEY });
    const h = await checkPipelineHealth();
    expect(row(h, 'სურათი (Anchor)').available).toBe(false);
    expect(row(h, 'სურათი (Base)').available).toBe(false);
    expect(row(h, 'სურათი (Anchor)').note).toMatch(/GCP_PROJECT_ID/);
    expect(row(h, 'მუსიკა').available).toBe(false);
  });

  it('VIDEO_GOOGLE_ONLY=0 with an owner approval re-opens nothing: the rows name Veo and Gemini (MASTER TASK v3.1)', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV, VIDEO_GOOGLE_ONLY: '0', AUTO_ANCHOR_FRAME: '1' });
    const h = await checkPipelineHealth();
    expect(row(h, 'ვიდეო (Clips)').provider).toBe('Veo 3.1 (Vertex AI)');
    expect(row(h, 'სურათი (Anchor)').provider).toBe('Gemini gemini-3.1-flash-image');
    expect(text(row(h, 'ვიდეო (Clips)')) + text(row(h, 'სურათი (Anchor)'))).not.toMatch(/legacy cascade|kling|runway|ltx|nano-banana/i);
    expect(h.warnings.join(' ')).not.toMatch(/VIDEO_GOOGLE_ONLY|Auto-Anchor/);
  });
});

describe('overall follows the CRITICAL rows (Base, Clips, TTS, Music)', () => {
  it('healthy on Google alone (no NanoBanana, ElevenLabs or Replicate key needed)', async () => {
    setEnv({ ...VERTEX_ENV });
    const h = await checkPipelineHealth();
    expect(h.overall).toBe('healthy');
    expect(row(h, 'ხმა (TTS)').available).toBe(true); // Cloud TTS on the Vertex identity
    expect(row(h, 'ლიპ-სინქი').available).toBe(false); // not critical
  });

  it('degraded with one critical row down, critical with two', async () => {
    setEnv({ ...VERTEX_ENV, LYRIA_ENABLED: '0' });
    expect((await checkPipelineHealth()).overall).toBe('degraded'); // music only
    setEnv({ NANOBANANA_API_KEY: SECRETS.NANOBANANA_API_KEY, ELEVENLABS_API_KEY: SECRETS.ELEVENLABS_API_KEY });
    const h = await checkPipelineHealth(); // no Vertex: images, clips, voice and music are down, whatever vendor key is set
    expect(h.overall).toBe('critical');
    expect(row(h, 'სურათი (Base)').available).toBe(false);
    expect(row(h, 'ხმა (TTS)')).toMatchObject({ available: false, note: expect.stringMatching(/^Vertex AI config missing — no voice-over/) });
  });
});

describe('never a secret value', () => {
  // (The log line is built from these same notes and warnings — and next.config's removeConsole strips console.log
  // from the compiled module, under Jest too — so the snapshot is the surface to check.)
  it('no key, token or voice id appears in the snapshot', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV });
    const h = await checkPipelineHealth();
    const out = JSON.stringify(h);
    expect(out).not.toContain('sk-should-not-leak');
    for (const value of Object.values(SECRETS)) expect(out).not.toContain(value);
    // Presence is still reported — as booleans/marks, not values. (The TTS row no longer lists the ElevenLabs voice-id
    // overrides: Cloud TTS picks its own voice and never reads them, PR 6b.)
    expect(row(h, 'ლიპ-სინქი').note).toMatch(/sync\/lipsync-2✅/);
    expect(row(h, 'ხმა (TTS)').note).not.toMatch(/female=|male=/);
  });
});
