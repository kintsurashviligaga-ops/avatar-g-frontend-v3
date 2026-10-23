/** @jest-environment node */
/**
 * POST /api/agent-g/delegate — no fallback between engines (PROJECT_MASTER R7, MASTER TASK v3.1).
 *
 * A voice sub-task is read by /api/tts/gemini alone: a miss is the sub-task's error and nothing is posted to Voice Lab.
 * Image, music and video sub-tasks refuse with the google_only text before any internal call (their old Replicate, Udio
 * and LTX routes only refuse). Every internal hop is a global fetch spy; nothing reaches a provider.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { googleOnlyMessage } from '@/lib/providers/mediaPolicy';

const SECRET = 'test-agent-g-secret';
const ENV = { ...process.env };

const post = (body: Record<string, unknown>, secret: string | null = SECRET) =>
  POST(new NextRequest('https://myavatar.ge/api/agent-g/delegate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-agent-g-secret': secret } : {}) },
    body: JSON.stringify(body),
  }));

let fetchSpy: jest.SpyInstance;
const calledPaths = () => fetchSpy.mock.calls.map(([url]) => new URL(String(url)).pathname);

beforeEach(() => {
  process.env = { ...ENV, AGENT_G_INTERNAL_SECRET: SECRET };
  fetchSpy = jest.spyOn(global, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

describe('voice', () => {
  it('reads with /api/tts/gemini', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await post({ agent_name: 'voice', action: 'synthesize_voice', input: { text: 'გამარჯობა' } });
    expect(res.status).toBe(200);
    expect((await res.json()).data.output).toMatchObject({ type: 'audio', source: 'gemini-native', text: 'გამარჯობა' });
    expect(calledPaths()).toEqual(['/api/tts/gemini']);
  });

  it.each([
    { agent_name: 'voice', action: 'synthesize_voice' },
    { agent_name: 'voice-lab', action: 'synthesize_voice' },
  ])('a Gemini miss is the error; Voice Lab is never asked (%o)', async (task) => {
    fetchSpy.mockResolvedValue(new Response('{"error":"down"}', { status: 503 }));
    const res = await post({ ...task, input: { text: 'გამარჯობა' } });
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.error).toBe('ხმის სინთეზი ვერ მოხდა (503)');
    expect(j.error).not.toMatch(/ElevenLabs|voice-lab/i);
    expect(calledPaths()).toEqual(['/api/tts/gemini']);
  });
});

describe('image, music and video', () => {
  it.each(['image', 'music', 'video'])('%s refuses with google_only before any call', async (agent_name) => {
    const res = await post({ agent_name, action: 'generate', input: { goal: 'a sunrise over Tbilisi' } });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(googleOnlyMessage('ka'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says it in the sub-task language', async () => {
    const res = await post({ agent_name: 'music', action: 'generate', input: { goal: 'a song', language: 'en' } });
    expect((await res.json()).error).toBe(googleOnlyMessage('en'));
  });
});

it('still fails closed without the internal secret', async () => {
  const res = await post({ agent_name: 'voice', action: 'synthesize_voice', input: { text: 'hi' } }, null);
  expect(res.status).toBe(403);
  expect(fetchSpy).not.toHaveBeenCalled();
});
