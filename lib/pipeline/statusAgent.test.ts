/** @jest-environment node */
/**
 * Pins the admin "Pipeline" card to the engines the code really runs (lib/pipeline/statusAgent):
 * Veo for film clips, Gemini image for the anchor frames, Lyria 3 alone for music Auto, the NanoBanana
 * reseller for the base image — and never a claim of Udio-as-primary, a FLUX anchor/base or Kling clips
 * under the default Google-only policy. Real gate functions run against a fake env (no network call).
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
  process.env = { ...vars } as NodeJS.ProcessEnv;
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
    expect(row(h, 'ვიდეო (Clips)').note).toMatch(/GEMINI_API_KEY/);
    expect(row(h, 'სურათი (Base)').note).toMatch(/NANOBANANA_API_KEY/);
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
  it('Veo 3.1 on the Gemini API with a Gemini key — never Kling, even with Replicate configured', async () => {
    setEnv({ ...SECRETS });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.provider).toBe('Veo 3.1 (Gemini API)');
    expect(video.available).toBe(true);
    expect(video.tier).toBe('high');
    expect(video.note).toMatch(/veo-3\.1-fast-generate-preview/);
    expect(text(video)).not.toMatch(/kling|runway|ltx|replicate/i);
  });

  it('Veo 3.1 on Vertex AI once the Vertex config is complete', async () => {
    setEnv({ ...SECRETS, ...VERTEX_ENV });
    const video = row(await checkPipelineHealth(), 'ვიდეო (Clips)');
    expect(video.provider).toBe('Veo 3.1 (Vertex AI)');
    expect(video.note).toMatch(/veo-3\.1-fast-generate-001/);
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
    expect(video.note).toMatch(/^VEO_TRANSPORT=vertex but Vertex AI is missing .*GCP_PROJECT_ID/);
  });
});

describe('no row repeats the stale provider claims', () => {
  it('fully configured, Google-only: Lyria (not Udio), Gemini anchor, NanoBanana base — no FLUX, no Kling', async () => {
    setEnv({ ...SECRETS });
    const h = await checkPipelineHealth();
    for (const s of h.services) expect(text(s)).not.toMatch(/udio \(primary\)/i);

    const anchor = row(h, 'სურათი (Anchor)');
    expect(anchor.provider).toBe('Gemini gemini-3.1-flash-image');
    expect(anchor.available).toBe(true);
    expect(anchor.provider).not.toMatch(/flux/i);

    const base = row(h, 'სურათი (Base)');
    expect(base.provider).toBe('NanoBanana (reseller)');
    expect(base.provider).not.toMatch(/flux|google|gemini/i);
    expect(base.note).toMatch(/no fallback/);

    const music = row(h, 'მუსიკა');
    expect(music.provider).toBe('Lyria 3 (lyria-3-clip-preview)');
    expect(music.note).toMatch(/Auto = Lyria 3 only, no failover/);
    expect(music.note).not.toMatch(/→|chain/i);

    expect(row(h, 'მუსიკა (ფილმი)').provider).toBe('ElevenLabs Music');
    expect(row(h, 'ხმა (TTS)').provider).toMatch(/^ElevenLabs/);
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
    expect(music.note).toMatch(/explicit pick only: ElevenLabs Music✅ Udio✅ MusicGen✅/);
  });

  it('an unknown GEMINI_TRANSPORT fails closed for the frames and Lyria without throwing', async () => {
    setEnv({ ...SECRETS, GEMINI_TRANSPORT: 'bogus' });
    const h = await checkPipelineHealth();
    expect(row(h, 'სურათი (Anchor)').available).toBe(false);
    expect(row(h, 'მუსიკა').available).toBe(false);
    expect(row(h, 'სურათი (Anchor)').note).toMatch(/GEMINI_TRANSPORT/);
  });

  it('VIDEO_GOOGLE_ONLY=0 is reported honestly as the legacy multi-vendor paths', async () => {
    setEnv({ ...SECRETS, VIDEO_GOOGLE_ONLY: '0', AUTO_ANCHOR_FRAME: '1' });
    const h = await checkPipelineHealth();
    expect(row(h, 'ვიდეო (Clips)').provider).toMatch(/legacy cascade/);
    expect(row(h, 'სურათი (Anchor)').provider).toMatch(/Replicate/);
    expect(h.warnings.some((w) => /VIDEO_GOOGLE_ONLY is off.*Auto-Anchor/.test(w))).toBe(true);
  });
});

describe('overall follows the CRITICAL rows (Base, Clips, TTS, Music)', () => {
  const CORE = { GEMINI_API_KEY: SECRETS.GEMINI_API_KEY, ELEVENLABS_API_KEY: SECRETS.ELEVENLABS_API_KEY, NANOBANANA_API_KEY: SECRETS.NANOBANANA_API_KEY };

  it('healthy on Google + ElevenLabs + the base-image reseller alone (no Replicate needed)', async () => {
    setEnv(CORE);
    const h = await checkPipelineHealth();
    expect(h.overall).toBe('healthy');
    expect(row(h, 'ლიპ-სინქი').available).toBe(false); // not critical
  });

  it('degraded with one critical row down, critical with two', async () => {
    setEnv({ GEMINI_API_KEY: CORE.GEMINI_API_KEY, NANOBANANA_API_KEY: CORE.NANOBANANA_API_KEY });
    expect((await checkPipelineHealth()).overall).toBe('degraded');
    setEnv({ GEMINI_API_KEY: CORE.GEMINI_API_KEY });
    expect((await checkPipelineHealth()).overall).toBe('critical');
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
    // Presence is still reported — as booleans/marks, not values.
    expect(row(h, 'ხმა (TTS)').note).toMatch(/female=✅ male=✅/);
  });
});
