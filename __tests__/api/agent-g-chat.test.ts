/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/agent-g/chat/route';
import {
  __resetPersonalityOpenAIClientFactoryForTests,
  __setPersonalityOpenAIClientFactoryForTests,
} from '@/lib/agentg/personality';

describe('/api/agent-g/chat', () => {
  const mockCreate = jest.fn();

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate.mockReset();
    __setPersonalityOpenAIClientFactoryForTests(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }));
  });

  afterEach(() => {
    __resetPersonalityOpenAIClientFactoryForTests();
  });

  test('returns reply, tone and meta payload', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'გამარჯობა გაგ! მზად ვარ დაგეხმარო ✨' } }],
    });

    const req = new NextRequest('http://localhost:3000/api/agent-g/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Hi',
        locale: 'ka',
        sessionId: 'session-1',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.reply).toContain('გაგ');
    expect(payload.reply.toLowerCase()).not.toContain('gio');
    expect(payload.tone).toBeDefined();
    expect(payload.meta).toBeDefined();
    expect(payload.meta.voiceHint).toBeTruthy();
  });
});
