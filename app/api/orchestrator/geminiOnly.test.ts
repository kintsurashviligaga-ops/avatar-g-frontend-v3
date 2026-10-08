/** @jest-environment node */
/**
 * The orchestrator routes plan with Gemini only (Part 2 B1, provider policy: Google + ElevenLabs).
 *
 * Pinned: no route under app/api/orchestrator imports the Anthropic SDK or reads ANTHROPIC_API_KEY (each used to ask
 * Claude for its JSON plan whenever that key was set); the interior style and script routes take their plan from
 * lib/ai/llmText (Gemini only) and fall back to their deterministic plan when it misses — never to another provider,
 * even with ANTHROPIC_API_KEY set.
 */
import fs from 'node:fs';
import path from 'node:path';

jest.mock('server-only', () => ({}));
const mockLlmText = jest.fn();
jest.mock('../../../lib/ai/llmText', () => ({ llmText: (...a: unknown[]) => mockLlmText(...a) }));
const mockAnthropic = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: function Anthropic(...a: unknown[]) { mockAnthropic(...a); } }));
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { WRITE: {}, HELPER_USER: {} },
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
}));
jest.mock('../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));

import { NextRequest } from 'next/server';
import { POST as stylePOST } from './interior/style/route';
import { POST as scriptPOST } from './script/route';
import { DEFAULT_STYLE_GUIDE } from '../../../lib/orchestrator/interior';

const ENV = { ...process.env };
const post = (url: string, body: unknown) =>
  new NextRequest(`https://myavatar.ge${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  delete process.env.GEMINI_MODEL_FLASH;
});
afterAll(() => {
  process.env = { ...ENV };
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test('no orchestrator route imports the Anthropic SDK or reads ANTHROPIC_API_KEY', () => {
  const files = sourceFiles(__dirname);
  expect(files.length).toBeGreaterThan(5);
  const hits = files.filter((f) => /@anthropic-ai\/sdk|ANTHROPIC_API_KEY/.test(fs.readFileSync(f, 'utf8')));
  expect(hits.map((f) => path.relative(__dirname, f))).toEqual([]);
});

test('interior style: the plan comes from Gemini as JSON; Claude is never constructed', async () => {
  mockLlmText.mockResolvedValueOnce(JSON.stringify({ styleName: 'Tbilisi Loft', palette: ['#112233'] }));
  const res = await stylePOST(post('/api/orchestrator/interior/style', { brief: 'loft', geometry: {} }));
  const body = (await res.json()) as { style: { styleName: string }; model: string; degraded: boolean };
  expect(body).toMatchObject({ degraded: false, model: 'gemini-3.8-flash' });
  expect(body.style.styleName).toBe('Tbilisi Loft');
  expect(mockLlmText).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
  expect(mockAnthropic).not.toHaveBeenCalled();
});

test('interior style: a Gemini miss is the deterministic default, not another provider', async () => {
  mockLlmText.mockResolvedValueOnce(null);
  const res = await stylePOST(post('/api/orchestrator/interior/style', { brief: 'loft', geometry: {} }));
  const body = (await res.json()) as { style: unknown; model: string; degraded: boolean };
  expect(body).toMatchObject({ degraded: true, model: 'deterministic', style: DEFAULT_STYLE_GUIDE });
  expect(mockAnthropic).not.toHaveBeenCalled();
});

test('script: Gemini plans the shots; a miss is the deterministic breakdown', async () => {
  mockLlmText.mockResolvedValueOnce(JSON.stringify({ segments: [{ prompt: 'a wide shot of Tbilisi at dawn', cameraMotion: 'dolly_in' }] }));
  const ok = (await (await scriptPOST(post('/api/orchestrator/script', { prompt: 'Tbilisi at dawn', totalDurationSec: 12 }))).json()) as {
    model: string;
    segments: unknown[];
  };
  expect(ok.model).toBe('gemini-3.8-flash');
  expect(ok.segments.length).toBeGreaterThan(0);

  mockLlmText.mockResolvedValueOnce(null);
  const miss = (await (await scriptPOST(post('/api/orchestrator/script', { prompt: 'Tbilisi at dawn', totalDurationSec: 12 }))).json()) as {
    model: string;
    degraded: boolean;
  };
  expect(miss).toMatchObject({ model: 'deterministic', degraded: true });
  expect(mockAnthropic).not.toHaveBeenCalled();
});
