/** @jest-environment node */
/**
 * The recorded answers of the paid certification run (owner card 2026-11-05 20:15Z, $5 cap; run 2026-11-06 05:54Z on the
 * Production Vertex project, __tests__/fixtures/vertex/) fed back to our own adapters on a mocked network: each adapter
 * must read the answer Google really gave. The fixtures hold media as "<media bytes=N sha256=…>" (no bytes in the repo);
 * here each placeholder becomes synthetic bytes of the same kind, so what is tested is the answer's SHAPE (where the
 * audio / image / video sits, which parts sit beside it), which is what an adapter depends on. No network, no spend.
 *
 * plan.contract.test.ts proves the other half: the recorded request is the one our adapter sends.
 */
jest.mock('server-only', () => ({}));
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));
jest.mock('../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'contract-token'),
}));
jest.mock('../../../lib/services/billing/BillingGuard', () => ({
  canProceed: jest.fn(async () => ({ allowed: true })),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock('../../../lib/services/billing/chatBudget', () => ({
  ...jest.requireActual('../../../lib/services/billing/chatBudget'),
  chatBudgetAllows: jest.fn(async () => true),
  bookChatUsage: jest.fn(async () => undefined),
}));
jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: '11111111-2222-4333-8444-555555555555' } })),
}));
jest.mock('../../../lib/api/rate-limit', () => {
  // rate-limit.ts starts a cleanup interval when imported; unref it so it cannot hold jest open.
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null), checkRateLimitByKey: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});
jest.mock('../../../lib/auth/adminGuard', () => ({ isAdminIdentity: jest.fn(async () => false) }));

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

import { generateGeminiImage } from '../../../lib/ai/geminiImage';
import { generateLyriaTrack } from '../../../lib/ai/lyriaMusic';
import { musicLengthDirection, lyriaModelForSec } from '../../../lib/studio/musicEngines';
import { POST as readAloud } from '../../../app/api/tts/gemini/route';
import { synthesizeGoogleTts, __resetGoogleTtsForTests } from '../../../lib/audio/google-tts';
import { transcribeWithChirp } from '../../../lib/voice-v2v/chirpStt';
import { pollVertexVeo, submitVertexVeo } from '../../../lib/veo/vertexClient';
import { resolutionFor } from '../../../lib/veo/capabilities';
import type { VeoClipRequest, VertexConfig } from '../../../lib/veo/types';

const FIXTURES = path.join(__dirname, '../../fixtures/vertex');
const PROJECT = 'certify-project';
const VERTEX_ENV = {
  GCP_PROJECT_ID: PROJECT,
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_SERVICE_ACCOUNT_EMAIL: `contract@${PROJECT}.iam.gserviceaccount.com`,
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = { ...process.env };

type Recorded = { status: number; body: unknown };
const fixture = <T = Recorded>(id: string, name: 'request' | 'response' | 'operation' | 'meta'): T =>
  JSON.parse(readFileSync(path.join(FIXTURES, id, `${name}.json`), 'utf8')) as T;

// ── placeholders → synthetic bytes of the same kind ─────────────────────────────────────────────────────────────

const PLACEHOLDER = /^<media bytes=(\d+) sha256=([0-9a-f]{64})>$/;
const MAGIC: Array<[RegExp, number[]]> = [
  [/png/, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  [/mpeg|mp3/, [0xff, 0xf3, 0x84, 0xc4]],
  [/mp4/, [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]],
];
function synthetic(bytes: number, mimeType: string | undefined, seed: number): string {
  const n = Math.min(bytes, 6000);
  const buf = Buffer.alloc(n, seed % 251);
  const magic = MAGIC.find(([re]) => mimeType && re.test(mimeType))?.[1] ?? [];
  Buffer.from(magic).copy(buf);
  for (let i = magic.length; i < n; i += 97) buf[i] = (i * 31 + seed) % 256;
  return buf.toString('base64');
}
/** A deep copy with each media placeholder replaced; `filled` maps each placeholder's sha256 to the bytes put there. */
function hydrate<T>(value: T, fallbackMime?: string, filled: Map<string, string> = new Map(), seed = { n: 1 }): T {
  if (Array.isArray(value)) return value.map((v) => hydrate(v, fallbackMime, filled, seed)) as T;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const mime = typeof obj.mimeType === 'string' ? obj.mimeType : fallbackMime;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
      if (typeof v === 'string') {
        const m = PLACEHOLDER.exec(v);
        if (m) {
          const b64 = synthetic(Number(m[1]), k === 'thoughtSignature' ? undefined : mime, seed.n++);
          filled.set(m[2]!, b64);
          return [k, b64];
        }
        return [k, v.replace(/\{project\}/g, PROJECT)];
      }
      return [k, hydrate(v, fallbackMime, filled, seed)];
    })) as T;
  }
  return value;
}

// ── the network ──────────────────────────────────────────────────────────────────────────────────────────────────

type Sent = { url: string; method: string; body: unknown };
let sent: Sent[] = [];
let answers: Array<() => Response> = [];
const answer = (r: Recorded) => () =>
  new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sent = [];
  answers = [];
  for (const k of ['GEMINI_TRANSPORT', 'GEMINI_IMAGE_TRANSPORT', 'GCP_GEMINI_LOCATION', 'GCP_VEO_LOCATION', 'GCP_PREDICT_LOCATION',
    'GEMINI_FRAME_MODEL', 'LYRIA_MODEL', 'GEMINI_TTS_MODEL', 'GEMINI_TTS_LANGUAGE_CODE', 'VEO_VERTEX_PERSON_GENERATION',
    'VEO_FAST_MODEL', 'VEO_STANDARD_MODEL', 'VEO_MODEL', 'GCP_SERVICE_ACCOUNT_KEY']) delete process.env[k];
  Object.assign(process.env, VERTEX_ENV);
  __resetGoogleTtsForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    sent.push({ url: String(input), method: init?.method ?? 'GET', body });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request to ${String(input)}`);
    return next();
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

// ── the fixtures themselves ──────────────────────────────────────────────────────────────────────────────────────

test('the recorded run: what answered, what failed, what was never sent, and the spend inside the cap', () => {
  const summary = JSON.parse(readFileSync(path.join(FIXTURES, 'summary.json'), 'utf8')) as {
    project: string; estimateSentUsd: number; capUsd: number;
    results: Array<{ id: string; status?: number; skipped?: string; media?: Record<string, unknown>; pick?: string; done?: boolean }>;
  };
  expect(summary.project).toBe('{project}');
  expect(summary.capUsd).toBe(5);
  expect(summary.estimateSentUsd).toBeLessThanOrEqual(2.2);
  const by = Object.fromEntries(summary.results.map((r) => [r.id, r]));
  for (const id of ['image', 'lyria-pro', 'cloud-tts-ka', 'voices-ru', 'cloud-tts-ru', 'veo-fast', 'veo-standard']) expect(by[id]!.status).toBe(200);
  expect(by['gemini-tts']!.status).toBe(500);
  expect(by['chirp-listed']!.skipped).toBe('missing:gemini-tts.wavBase64');
  expect(by['chirp-ka']!.skipped).toBe('missing:gemini-tts.wavBase64');
  expect(by.image!.media).toMatchObject({ mimeType: 'image/png', width: 1376, height: 768 });
  expect(by['lyria-pro']!.media).toMatchObject({ mimeType: 'audio/mpeg', sampleRate: 44100 });
  expect(Number(by['lyria-pro']!.media!.durationSec)).toBeGreaterThan(55);
  expect(by['voices-ru']!.pick).toBe('ru-RU-Chirp3-HD-Aoede');
  for (const id of ['veo-fast', 'veo-standard']) {
    expect(by[id]!.done).toBe(true);
    expect(by[id]!.media).toMatchObject({ mimeType: 'video/mp4', width: 1280, height: 720, hasVideoTrack: true, hasAudioTrack: true });
    expect(Number(by[id]!.media!.durationSec)).toBeCloseTo(4, 0);
  }
});

test('no fixture holds a project id, a project number, a token or media bytes', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(FIXTURES);
  expect(files.length).toBeGreaterThan(20);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    expect(text).not.toMatch(/gen-lang-client|projects\/\d{6,}|ya29\.|Bearer /);
    expect(text).not.toMatch(/[A-Za-z0-9+/]{400,}/); // no base64 blob: media is "<media bytes=… sha256=…>"
  }
  expect(existsSync(path.join(FIXTURES, 'ledger.json'))).toBe(false);
});

// ── each adapter reads Google's real answer ──────────────────────────────────────────────────────────────────────

test('image: generateGeminiImage takes the PNG from the recorded answer, not the thoughtSignature beside it', async () => {
  const filled = new Map<string, string>();
  const recorded = hydrate(fixture('image', 'response'), undefined, filled);
  const meta = fixture<{ media: { sha256: string } }>('image', 'meta');
  answers.push(answer(recorded));
  const req = fixture<{ body: { contents: Array<{ parts: Array<{ text: string }> }> } }>('image', 'request');
  const got = await generateGeminiImage({ prompt: req.body.contents[0]!.parts[0]!.text, aspectRatio: '16:9' });
  expect(got).toEqual({ base64: filled.get(meta.media.sha256), mimeType: 'image/png', model: 'gemini-3.1-flash-image' });
});

test('Lyria Pro: generateLyriaTrack takes the MP3 from the recorded answer, not its two caption parts', async () => {
  const filled = new Map<string, string>();
  const recorded = hydrate(fixture('lyria-pro', 'response'), undefined, filled);
  const meta = fixture<{ media: { sha256: string } }>('lyria-pro', 'meta');
  answers.push(answer(recorded));
  const got = await generateLyriaTrack({
    prompt: `${musicLengthDirection(60)}. Calm acoustic guitar and soft strings, warm and hopeful`, instrumental: true, model: lyriaModelForSec(60),
  });
  expect(got).toEqual({ base64: filled.get(meta.media.sha256), mime: 'audio/mpeg' });
});

test('Cloud TTS, Georgian (Gemini-TTS on Cloud TTS): synthesizeGoogleTts returns the recorded audioContent', async () => {
  const filled = new Map<string, string>();
  const recorded = hydrate(fixture('cloud-tts-ka', 'response'), 'audio/mpeg', filled);
  const meta = fixture<{ media: { sha256: string } }>('cloud-tts-ka', 'meta');
  answers.push(answer(recorded));
  const audio = await synthesizeGoogleTts('ეს არის ქართული ხმის შემოწმება ვიდეოსთვის.', { languageCode: 'ka-GE' });
  expect(Buffer.from(audio!).toString('base64')).toBe(filled.get(meta.media.sha256));
});

test('Cloud TTS, Russian: from the recorded voices list the adapter picks the voice the run used, and reads the recorded audio', async () => {
  const filled = new Map<string, string>();
  answers.push(answer(fixture('voices-ru', 'response')), answer(hydrate(fixture('cloud-tts-ru', 'response'), 'audio/mpeg', filled)));
  const meta = fixture<{ media: { sha256: string } }>('cloud-tts-ru', 'meta');
  const audio = await synthesizeGoogleTts('Это короткая проверка голоса.', { languageCode: 'ru-RU', gender: 'FEMALE' });
  expect(Buffer.from(audio!).toString('base64')).toBe(filled.get(meta.media.sha256));
  expect((sent[1]!.body as { voice: { name: string } }).voice.name).toBe('ru-RU-Chirp3-HD-Aoede');
});

test('Gemini TTS: the recorded 500 INTERNAL makes read-aloud try once more, then answer 502 tts_failed (INTERNAL), never another provider', async () => {
  const recorded = fixture('gemini-tts', 'response');
  expect(recorded).toEqual({ status: 500, body: { error: { code: 500, message: 'Internal error encountered.', status: 'INTERNAL' } } });
  answers.push(answer(recorded), answer(recorded));
  const res = await readAloud(new NextRequest('https://myavatar.ge/api/tts/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'გამარჯობა, ეს არის ხმის მოკლე შემოწმება.', locale: 'ka' }),
  }));
  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ error: 'tts_failed', status: 500, reason: 'INTERNAL' });
  expect(sent).toHaveLength(2);
  for (const s of sent) expect(s.url).toContain('aiplatform.googleapis.com/v1/projects/certify-project/locations/global/publishers/google/models/gemini-2.5-flash-preview-tts:generateContent');
});

test('the second run (owner card 2026-11-06 06:01Z): Gemini TTS 500 again, Chirp 3 listed 400, Chirp 3 Georgian word for word', () => {
  const summary = JSON.parse(readFileSync(path.join(FIXTURES, 'summary-2.json'), 'utf8')) as {
    estimateSentUsd: number; capUsd: number; inputs: Record<string, { sha256: string }>;
    results: Array<{ id: string; status: number; transcript?: string }>;
  };
  const first = JSON.parse(readFileSync(path.join(FIXTURES, 'summary.json'), 'utf8')) as { estimateSentUsd: number };
  expect(first.estimateSentUsd + summary.estimateSentUsd).toBeLessThanOrEqual(5);
  // Chirp heard the first run's own recording (the Georgian Cloud TTS answer), pinned by its hash.
  expect(summary.inputs['ka-mp3']!.sha256).toBe(fixture<{ media: { sha256: string } }>('cloud-tts-ka', 'meta').media.sha256);
  const by = Object.fromEntries(summary.results.map((r) => [r.id, r]));
  expect(by['gemini-tts-2']!.status).toBe(500);
  expect(by['chirp-listed']!.status).toBe(400);
  expect(by['chirp-ka']).toMatchObject({ status: 200, transcript: 'ეს არის ქართული ხმის შემოწმება ვიდეოსთვის.' });
  expect(fixture('gemini-tts-2', 'response')).toEqual(fixture('gemini-tts', 'response'));
  expect(fixture('chirp-listed', 'response')).toEqual({ status: 400, body: { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } } });
});

test('Chirp 3: with the recorded answers (listed 400, Georgian 200) transcribeWithChirp returns the Georgian leg word for word', async () => {
  const listed = fixture('chirp-listed', 'response');
  const georgian = fixture('chirp-ka', 'response');
  answers.push(answer(listed), answer(georgian));
  const mp3 = Buffer.from(synthetic(18336, 'audio/mpeg', 3), 'base64');
  const got = await transcribeWithChirp(new Uint8Array(mp3), 'ka-GE');
  expect(got).toMatchObject({ text: 'ეს არის ქართული ხმის შემოწმება ვიდეოსთვის.', model: 'chirp_3', leg: 'georgian', spoken: 'ka' });
  expect(got.billedSeconds).toBe(5);
  expect(sent.map((s) => (s.body as { config: { languageCodes: string[] } }).config.languageCodes)).toEqual([['ka-GE', 'ru-RU', 'en-US'], ['ka-GE']]);
});

const CFG: VertexConfig = {
  projectId: PROJECT,
  location: 'us-central1',
  bucket: '',
  auth: { mode: 'service_account_key', clientEmail: `contract@${PROJECT}.iam.gserviceaccount.com` },
};

describe.each([
  ['veo-fast', 'fast'],
  ['veo-standard', 'standard'],
] as const)('%s: the recorded submit and finished operation', (id, tier) => {
  test('submitVertexVeo reads the operation name, and pollVertexVeo reads the finished operation as one 4 s MP4 with its bytes', async () => {
    const filled = new Map<string, string>();
    const submit = hydrate(fixture(id, 'response'));
    const op = hydrate(fixture<{ body: unknown }>(id, 'operation'), undefined, filled);
    const meta = fixture<{ model: string; media: { sha256: string } }>(id, 'meta');
    const req = fixture<{ body: { instances: Array<{ prompt: string }> } }>(id, 'request');
    answers.push(answer(submit));
    const clip: VeoClipRequest = {
      prompt: req.body.instances[0]!.prompt, aspect: '16:9', durationSec: 4, resolution: resolutionFor(4), tier, generateAudio: true,
      ...(tier === 'fast' ? { startImage: { kind: 'bytes' as const, base64: 'iVBORw0KGgo=', mimeType: 'image/png' } } : {}),
    };
    const created = await submitVertexVeo(clip, CFG, { model: meta.model });
    expect(created.ok).toBe(true);
    const name = (submit.body as { name: string }).name;
    expect(created.ok && JSON.stringify(created.operation)).toContain(name);

    answers.push(answer({ status: 200, body: op.body }));
    const polled = await pollVertexVeo(name);
    expect(polled).toEqual({ state: 'succeeded', videos: [{ kind: 'bytes', base64: filled.get(meta.media.sha256), mimeType: 'video/mp4' }] });
    expect(sent[1]!.url).toBe(`https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models/${meta.model}:fetchPredictOperation`);
    expect(sent[1]!.body).toEqual({ operationName: name });
  });
});
