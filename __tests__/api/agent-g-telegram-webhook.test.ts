/** @jest-environment node */

import { POST } from '@/app/api/agent-g/telegram/webhook/route';

jest.mock('@/lib/agentg/personality', () => ({
  generateAgentGPersonalityReply: jest.fn(async () => ({
    replyText: 'გამარჯობა გაგ 👋',
    tone: { mood: 'friendly', confidence: 0.88 },
    meta: {
      detectedEmotion: 'happy_positive',
      styleHints: ['warm'],
      voiceHint: 'slightly brighter tone, faster pace',
    },
  })),
  getFallbackReply: jest.fn(() => 'გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌'),
}));

jest.mock('@/lib/agent-g/channels/inbound-events', () => ({
  storeInboundTelegramEvent: jest.fn(async () => undefined),
}));

describe('/api/agent-g/telegram/webhook', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
  });

  test('returns 403 when webhook secret is invalid', async () => {
    const req = new Request('http://localhost:3000/api/agent-g/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      },
      body: JSON.stringify({ message: { chat: { id: 10 }, text: 'Hi' } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  test('returns 200 and schedules sendMessage on valid request', async () => {
    const req = new Request('http://localhost:3000/api/agent-g/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'telegram-secret',
      },
      body: JSON.stringify({
        update_id: 123,
        message: {
          message_id: 1,
          date: Date.now(),
          text: 'Hi',
          chat: { id: 99, type: 'private' },
          from: { id: 99, is_bot: false },
        },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.queued).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });
});
