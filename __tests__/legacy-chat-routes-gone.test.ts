/** @jest-environment node */
/**
 * Retired legacy chat/voice routes — /api/chat/openai, /api/chat/claude, /api/ai/chat, /api/matilda.
 *
 * Each was an anonymous endpoint spending a platform key (OpenAI / Anthropic / ElevenLabs) with no live caller.
 * They now answer 410 Gone with a short JSON body and contain NO provider code. The static half of this test
 * keeps a future edit from quietly re-wiring a provider into one of them.
 */
import fs from 'fs';
import path from 'path';

import { POST as openaiPOST } from '../app/api/chat/openai/route';
import { POST as claudePOST } from '../app/api/chat/claude/route';
import { POST as aiChatPOST } from '../app/api/ai/chat/route';
import { POST as matildaPOST } from '../app/api/matilda/route';

const ROUTES: Array<[string, () => Response]> = [
  ['app/api/chat/openai/route.ts', openaiPOST],
  ['app/api/chat/claude/route.ts', claudePOST],
  ['app/api/ai/chat/route.ts', aiChatPOST],
  ['app/api/matilda/route.ts', matildaPOST],
];

/** Anything that would mean the route talks to a model / TTS provider again. */
const PROVIDER_SIGNALS: RegExp[] = [
  /from\s+['"]openai['"]/,
  /from\s+['"]@anthropic-ai\/sdk['"]/,
  /from\s+['"]@ai-sdk\//,
  /from\s+['"]ai['"]/,
  /api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|generativelanguage\.googleapis\.com/,
  /\bfetch\s*\(/,
  /process\.env\.[A-Z_]*API_KEY/,
];

describe.each(ROUTES)('%s', (rel, POST) => {
  it('answers 410 Gone with a short JSON body', async () => {
    const res = POST();
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    expect(body.error).toBe('gone');
    expect(typeof body.message).toBe('string');
    expect(JSON.stringify(body).length).toBeLessThan(200);
  });

  it('contains no provider call (static)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    for (const re of PROVIDER_SIGNALS) expect({ rel, signal: String(re), hit: re.test(src) }).toEqual({ rel, signal: String(re), hit: false });
  });
});
