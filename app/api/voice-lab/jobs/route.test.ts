/** @jest-environment node */
/**
 * POST /api/voice-lab/jobs — Voice Lab's spoken output is Google Cloud TTS alone (MASTER TASK v3.1 PR 5e).
 *
 * It was ElevenLabs on the platform key. Pinned: no voice named → Cloud TTS reads the text in its language and the job
 * is done; a named (ElevenLabs) voice is refused with google_only before a job row exists, never read in another voice
 * (R7); a malformed id stays a 400; a Cloud TTS miss marks the row failed and answers 502, and nothing else is asked.
 * Global fetch rejects, so an ElevenLabs call put back fails here. Supabase is an in-memory fake.
 */
jest.mock('server-only', () => ({}));

const rows: Array<{ id: string; status: string; output?: unknown; error?: unknown }> = [];
function builder() {
  let pending: Record<string, unknown> | null = null;
  let inserting = false;
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    insert: jest.fn((v: Record<string, unknown>) => { inserting = true; pending = v; return b; }),
    update: jest.fn((v: Record<string, unknown>) => { pending = v; return b; }),
    select: jest.fn(() => b),
    eq: jest.fn(() => b),
    single: jest.fn(async () => {
      if (inserting) {
        const row = { id: `job-${rows.length + 1}`, status: String(pending?.status), ...pending };
        rows.push(row);
        return { data: row, error: null };
      }
      Object.assign(rows[rows.length - 1]!, pending);
      return { data: rows[rows.length - 1], error: null };
    }),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (!inserting && rows.length) Object.assign(rows[rows.length - 1]!, pending);
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  });
  return b;
}
jest.mock('../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => builder() }) }));
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn(async () => ({ id: 'user-1' })) }));
jest.mock('../../../../lib/billing/enforce', () => ({ getBillingSnapshot: jest.fn(async () => ({ plan: 'PRO' })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { AUDIO_GEN_USER: { maxRequests: 60, windowMs: 86_400_000 } },
}));
jest.mock('../../../../lib/audio/google-tts', () => ({
  ...jest.requireActual('../../../../lib/audio/google-tts'),
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(2048)),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { synthesizeGoogleTts } from '../../../../lib/audio/google-tts';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const post = (input: Record<string, unknown>) =>
  POST(new NextRequest('https://myavatar.ge/api/voice-lab/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'generate', input }),
  }));
const ENV = { ...process.env };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  rows.length = 0;
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  process.env.ELEVENLABS_VOICE_ID = 'voiceKaTest01';
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('no voice named: Cloud TTS reads the text in its language, and the job is done', async () => {
  const res = await post({ text: 'გამარჯობა, ეს ხმის ტესტია.', language: 'ka' });
  expect(res.status).toBe(201);
  expect(google).toHaveBeenCalledWith('გამარჯობა, ეს ხმის ტესტია.', { languageCode: 'ka-GE' });
  const job = rows[0]!;
  expect(job.status).toBe('done');
  expect(job.output).toMatchObject({ provider: 'google-cloud-tts', voice_id: null, audio_url: expect.stringMatching(/^data:audio\/mpeg;base64,/) });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a named voice is refused with google_only before a job row exists; a malformed one is a 400', async () => {
  const named = await post({ text: 'hello', provider_voice_id: '21m00Tcm4TlvDq8ikWAM' });
  expect(named.status).toBe(503);
  expect(await named.json()).toMatchObject({ success: false, code: 'google_only', error: 'google_only' });
  const bad = await post({ text: 'hello', provider_voice_id: '../voices/x' });
  expect(bad.status).toBe(400);
  expect(rows).toHaveLength(0);
  expect(google).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a Cloud TTS miss marks the job failed and answers 502; nothing else is asked (R7)', async () => {
  google.mockResolvedValueOnce(null);
  const res = await post({ text: 'hello there' });
  expect(res.status).toBe(502);
  expect(rows[0]!.status).toBe('failed');
  expect(fetchSpy).not.toHaveBeenCalled();
});
