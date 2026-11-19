/** @jest-environment node */
/**
 * The paid certification plan (scripts/certify/vertex-contract-plan.json) against our own adapters: for each planned
 * call, the adapter is run with the plan's input on a mocked network, and the URL and body it sends must be exactly the
 * planned ones. So the one paid call per model (owner card 2026-11-05 20:15Z, $5 cap) records the answer to the request
 * our code really sends, and a later change to an adapter's request shows up here as a difference from the recording.
 * No network, no spend.
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

import { generateGeminiImage, geminiFrameModel } from '../../../lib/ai/geminiImage';
import { generateLyriaTrack } from '../../../lib/ai/lyriaMusic';
import { lyriaModelForSec, musicLengthDirection } from '../../../lib/studio/musicEngines';
import { ttsModel, CHIRP_STT_MODEL } from '../../../lib/ai/google/models';
import { POST as readAloud } from '../../../app/api/tts/gemini/route';
import { synthesizeGoogleTts, pickBestGoogleVoice, __resetGoogleTtsForTests, GEMINI_TTS_MODEL } from '../../../lib/audio/google-tts';
import { transcribeWithChirp } from '../../../lib/voice-v2v/chirpStt';
import { submitVertexVeo } from '../../../lib/veo/vertexClient';
import { resolveModel, resolutionFor } from '../../../lib/veo/capabilities';
import type { VeoClipRequest, VertexConfig } from '../../../lib/veo/types';
import { pickVoice, substitute, validatePlan, wavFromPcm16 } from '../../../scripts/certify/vertex-contract.mjs';

type PlanCall = {
  id: string;
  model: string;
  kind: 'sync' | 'lro' | 'get';
  url: string;
  body?: unknown;
  estimateUsd: number;
  requires?: string[];
  pick?: { languageCode: string; gender: 'MALE' | 'FEMALE'; variant?: number };
};
const PLAN = JSON.parse(readFileSync(path.join(__dirname, '../../../scripts/certify/vertex-contract-plan.json'), 'utf8')) as {
  capUsd: number;
  calls: PlanCall[];
};
// The 2026-11-12 plan (v5.1 D-02 / D-03): the 3.8 read-aloud probe and the free entitlement probes.
const PLAN3 = JSON.parse(readFileSync(path.join(__dirname, '../../../scripts/certify/vertex-contract-plan-3.json'), 'utf8')) as {
  capUsd: number;
  calls: PlanCall[];
};
const call = (id: string): PlanCall => {
  const c = [...PLAN.calls, ...PLAN3.calls].find((x) => x.id === id);
  if (!c) throw new Error(`no planned call ${id}`);
  return c;
};

const PROJECT = 'certify-project';
const VERTEX_ENV = {
  GCP_PROJECT_ID: PROJECT,
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_SERVICE_ACCOUNT_EMAIL: `contract@${PROJECT}.iam.gserviceaccount.com`,
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = { ...process.env };
const plannedUrl = (c: PlanCall) => c.url.replace('{project}', PROJECT);

type Sent = { url: string; method: string; body: unknown };
let sent: Sent[] = [];
let answers: Array<() => Response> = [];
const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sent = [];
  answers = [];
  for (const k of ['GEMINI_TRANSPORT', 'GEMINI_IMAGE_TRANSPORT', 'GCP_GEMINI_LOCATION', 'GCP_VEO_LOCATION', 'GCP_PREDICT_LOCATION',
    'GEMINI_FRAME_MODEL', 'LYRIA_MODEL', 'GEMINI_TTS_MODEL', 'GEMINI_TTS_LANGUAGE_CODE', 'VEO_VERTEX_PERSON_GENERATION',
    'VEO_FAST_MODEL', 'VEO_STANDARD_MODEL', 'VEO_MODEL', 'GCP_SERVICE_ACCOUNT_KEY']) delete process.env[k];
  Object.assign(process.env, VERTEX_ENV);
  __resetGoogleTtsForTests();
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

test('the plan stays inside the owner cap, sends nothing to the Developer API, and holds one call per model', () => {
  const { total, cap } = validatePlan(PLAN);
  expect(cap).toBeLessThanOrEqual(5);
  expect(total).toBeLessThanOrEqual(cap);
  expect(total).toBeCloseTo(2.2, 5);
  for (const c of PLAN.calls) expect(c.url).not.toContain('generativelanguage');
  expect(PLAN.calls.map((c) => c.id)).toEqual([
    'image', 'lyria-pro', 'gemini-tts', 'cloud-tts-ka', 'voices-ru', 'cloud-tts-ru', 'chirp-listed', 'chirp-ka', 'veo-fast', 'veo-standard',
  ]);
});

test('image: generateGeminiImage sends the planned gemini-3.1-flash-image request', async () => {
  const c = call('image');
  expect(geminiFrameModel()).toBe(c.model);
  answers.push(json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }] } }] }));
  const prompt = ((c.body as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]!.parts[0]!.text);
  const got = await generateGeminiImage({ prompt, aspectRatio: '16:9' });
  expect(got).toMatchObject({ mimeType: 'image/png', model: c.model });
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: c.body }]);
});

test('Lyria Pro: the music route composes a 60 s instrumental as planned', async () => {
  const c = call('lyria-pro');
  expect(lyriaModelForSec(60)).toBe(c.model);
  answers.push(json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/mpeg', data: 'A'.repeat(4000) } }] } }] }));
  // app/api/ai/music composeTrackUrl: the length direction first, then the brief; generateLyriaTrack adds the instrumental line.
  const prompt = `${musicLengthDirection(60)}. Calm acoustic guitar and soft strings, warm and hopeful`;
  await expect(generateLyriaTrack({ prompt, instrumental: true, model: lyriaModelForSec(60) })).resolves.toMatchObject({ mime: 'audio/mpeg' });
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: c.body }]);
});

test('the 2026-11-12 plan stays under $0.05, generates nothing but one Georgian 3.8 line, and never uses the Developer API', () => {
  const { total, cap } = validatePlan(PLAN3);
  expect(cap).toBeLessThanOrEqual(0.05);
  expect(total).toBeLessThanOrEqual(cap);
  for (const c of PLAN3.calls) expect(c.url).not.toContain('generativelanguage');
  const billed = PLAN3.calls.filter((c) => c.estimateUsd > 0).map((c) => c.id);
  expect(billed).toEqual(['tts-38-ka', 'chirp-ka-38']);
  for (const c of PLAN3.calls.filter((x) => x.estimateUsd === 0)) expect(c.kind === 'get' || c.url.endsWith(':countTokens')).toBe(true);
});

test('Gemini TTS: the read-aloud route sends the planned Georgian 3.8 request (voice Aoede, no languageCode, no directive)', async () => {
  const c = call('tts-38-ka');
  expect(ttsModel()).toBe(c.model);
  answers.push(json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(48_000).toString('base64') } }] } }] }));
  const res = await readAloud(new NextRequest('https://myavatar.ge/api/tts/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'გამარჯობა, ეს არის ხმის მოკლე შემოწმება.', locale: 'ka' }),
  }));
  expect(res.status).toBe(200);
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: c.body }]);
});

test('Cloud TTS, Georgian: synthesizeGoogleTts reads with Gemini-TTS as planned', async () => {
  const c = call('cloud-tts-ka');
  expect(GEMINI_TTS_MODEL).toBe(c.model);
  answers.push(json({ audioContent: Buffer.alloc(1024, 1).toString('base64') }));
  const audio = await synthesizeGoogleTts('ეს არის ქართული ხმის შემოწმება ვიდეოსთვის.', { languageCode: 'ka-GE' });
  expect(audio?.byteLength).toBe(1024);
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: c.body }]);
});

const VOICES = {
  voices: [
    { name: 'ru-RU-Standard-A', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
    { name: 'ru-RU-Wavenet-B', ssmlGender: 'MALE', languageCodes: ['ru-RU'] },
    { name: 'ru-RU-Chirp3-HD-Leda', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
    { name: 'ru-RU-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
    { name: 'ru-RU-Chirp3-HD-Charon', ssmlGender: 'MALE', languageCodes: ['ru-RU'] },
    { name: 'ru-RU-Neural2-C', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
  ],
};

test('Cloud TTS, Russian: the voices list and the synthesis are as planned, with the voice the adapter picks', async () => {
  const list = call('voices-ru');
  const c = call('cloud-tts-ru');
  answers.push(json(VOICES), json({ audioContent: Buffer.alloc(2048, 2).toString('base64') }));
  const audio = await synthesizeGoogleTts('Это короткая проверка голоса.', { languageCode: 'ru-RU', gender: 'FEMALE' });
  expect(audio?.byteLength).toBe(2048);
  const picked = pickVoice(VOICES, list.pick!.languageCode, list.pick!.gender, list.pick!.variant ?? 0);
  expect(picked).toBe('ru-RU-Chirp3-HD-Aoede');
  expect(sent).toEqual([
    { url: list.url, method: 'GET', body: undefined },
    { url: plannedUrl(c), method: 'POST', body: substitute(c.body, { 'voices-ru': { pick: picked } }) },
  ]);
});

test("the runner's voice pick is the adapter's on any list (so the recorded synthesis used the voice the app would)", async () => {
  const lists = [
    VOICES,
    { voices: [{ name: 'ru-RU-Wavenet-D', ssmlGender: 'MALE', languageCodes: ['ru-RU'] }, { name: 'ru-RU-Standard-E', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] }] },
    { voices: [{ name: 'ru-RU-Chirp3-HD-Puck', ssmlGender: 'MALE', languageCodes: ['ru-RU'] }, { name: 'ru-RU-Studio-B', ssmlGender: 'MALE', languageCodes: ['ru-RU'] }] },
  ];
  for (const l of lists) {
    for (const gender of ['FEMALE', 'MALE'] as const) {
      for (const variant of [0, 1, 2]) {
        __resetGoogleTtsForTests();
        answers.push(json(l));
        const adapter = await pickBestGoogleVoice('ru-RU', gender, undefined, variant);
        expect(pickVoice(l, 'ru-RU', gender, variant)).toBe(adapter);
      }
    }
  }
});

test('Chirp 3: transcribeWithChirp sends the planned listed and Georgian-only requests', async () => {
  const listed = call('chirp-listed');
  const ka = call('chirp-ka');
  expect(CHIRP_STT_MODEL).toBe(listed.model);
  const wav = wavFromPcm16(Buffer.alloc(48_000), 24_000);
  const georgian = { results: [{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-ge' }], metadata: { totalBilledDuration: '1s' } };
  answers.push(json(georgian), json(georgian));
  const got = await transcribeWithChirp(new Uint8Array(wav), 'ka-GE');
  expect(got.text).toBe('გამარჯობა');
  const refs = { 'gemini-tts': { wavBase64: wav.toString('base64') } };
  expect(sent).toEqual([
    { url: plannedUrl(listed), method: 'POST', body: substitute(listed.body, refs) },
    { url: plannedUrl(ka), method: 'POST', body: substitute(ka.body, refs) },
  ]);
});

const CFG: VertexConfig = {
  projectId: PROJECT,
  location: 'us-central1',
  bucket: '',
  auth: { mode: 'service_account_key', clientEmail: `contract@${PROJECT}.iam.gserviceaccount.com` },
};
const OPERATION = (model: string) => `projects/${PROJECT}/locations/us-central1/publishers/google/models/${model}/operations/0f8a1b2c-3d4e-5f60-7182-93a4b5c6d7e8`;

test('Veo 3.1 Fast: a 4 s clip from a photo is submitted as planned (720p, sound, one sample)', async () => {
  const c = call('veo-fast');
  expect(resolveModel('vertex', 'fast')).toBe(c.model);
  expect(resolutionFor(4)).toBe('720p');
  answers.push(json({ name: OPERATION(c.model) }));
  const body = c.body as { instances: Array<{ prompt: string }> };
  const req: VeoClipRequest = {
    prompt: body.instances[0]!.prompt, aspect: '16:9', durationSec: 4, resolution: resolutionFor(4), tier: 'fast', generateAudio: true,
    startImage: { kind: 'bytes', base64: 'iVBORw0KGgo=', mimeType: 'image/png' },
  };
  const out = await submitVertexVeo(req, CFG, { model: c.model });
  expect(out.ok).toBe(true);
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: substitute(c.body, { image: { base64: 'iVBORw0KGgo=', mimeType: 'image/png' } }) }]);
});

test('Veo 3.1 standard: a 4 s text clip is submitted as planned (720p, sound, one sample)', async () => {
  const c = call('veo-standard');
  expect(resolveModel('vertex', 'standard')).toBe(c.model);
  answers.push(json({ name: OPERATION(c.model) }));
  const body = c.body as { instances: Array<{ prompt: string }> };
  const req: VeoClipRequest = { prompt: body.instances[0]!.prompt, aspect: '16:9', durationSec: 4, resolution: resolutionFor(4), tier: 'standard', generateAudio: true };
  const out = await submitVertexVeo(req, CFG, { model: c.model });
  expect(out.ok).toBe(true);
  expect(sent).toEqual([{ url: plannedUrl(c), method: 'POST', body: c.body }]);
});

const PLAN2 = JSON.parse(readFileSync(path.join(__dirname, '../../../scripts/certify/vertex-contract-plan-2.json'), 'utf8')) as {
  capUsd: number;
  calls: PlanCall[];
  inputs: Record<string, { file: string; mimeType: string; sha256: string }>;
};

test('second plan (owner card 2026-11-06): Gemini TTS is the same request again, Chirp 3 is what the adapter sends for the recorded MP3', async () => {
  const again = PLAN2.calls.find((c) => c.id === 'gemini-tts-2')!;
  expect(again.url).toBe(call('gemini-tts').url);
  expect(again.body).toEqual(call('gemini-tts').body);
  const listed = PLAN2.calls.find((c) => c.id === 'chirp-listed')!;
  const ka = PLAN2.calls.find((c) => c.id === 'chirp-ka')!;
  expect(PLAN2.inputs['ka-mp3']).toMatchObject({ file: 'out/media/cloud-tts-ka.mp3', mimeType: 'audio/mpeg' });
  // The recorded file's pin is the one the first run's fixture names.
  const recorded = JSON.parse(readFileSync(path.join(__dirname, '../../fixtures/vertex/cloud-tts-ka/meta.json'), 'utf8')) as { media: { sha256: string } };
  expect(PLAN2.inputs['ka-mp3']!.sha256).toBe(recorded.media.sha256);
  const mp3 = Buffer.from([0xff, 0xf3, 0x84, 0xc4, ...Array.from({ length: 400 }, (_, i) => i % 251)]);
  const georgian = { results: [{ alternatives: [{ transcript: 'ეს არის' }], languageCode: 'ka-ge' }], metadata: { totalBilledDuration: '5s' } };
  answers.push(json(georgian), json(georgian));
  await transcribeWithChirp(new Uint8Array(mp3), 'ka-GE');
  const refs = { 'ka-mp3': { base64: mp3.toString('base64') } };
  expect(sent).toEqual([
    { url: plannedUrl(listed), method: 'POST', body: substitute(listed.body, refs) },
    { url: plannedUrl(ka), method: 'POST', body: substitute(ka.body, refs) },
  ]);
});
