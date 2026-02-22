/** @jest-environment node */

import { POST } from '@/app/api/agent-g/telegram/webhook/route';
import { transcribeTelegramVoice } from '@/lib/agent-g/voice/stt';
import { synthesizeTelegramVoice } from '@/lib/agent-g/voice/tts';

jest.mock('@/lib/agentg/personality', () => ({
  generateAgentGPersonalityReply: jest.fn(async () => ({
    replyText: 'გაგ, მშვიდად ვართ — ერთად მოვაგვარებთ ✨',
    tone: { mood: 'calm', confidence: 0.91 },
    meta: {
      detectedEmotion: 'stressed_angry',
      styleHints: ['reassuring'],
      voiceHint: 'calmer voice',
    },
  })),
  getFallbackReply: jest.fn(() => 'გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌'),
}));

jest.mock('@/lib/agent-g/channels/inbound-events', () => ({
  storeInboundTelegramEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/agent-g/voice/stt', () => ({
  isAgentGVoiceEnabled: jest.fn(() => true),
  transcribeTelegramVoice: jest.fn(async () => ({
    transcript: 'ვნერვიულობ და დამეხმარე რა',
    provider: 'openai-stt',
  })),
}));

jest.mock('@/lib/agent-g/voice/tts', () => ({
  synthesizeTelegramVoice: jest.fn(async () => ({
    audio: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'audio/mpeg',
    fileName: 'reply.mp3',
    provider: 'elevenlabs',
  })),
}));

describe('/api/agent-g/telegram/webhook voice path', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
    process.env.AGENT_G_VOICE_ENABLED = 'true';
    process.env.AGENT_G_VOICE_MAX_SECONDS = '45';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
  });

  test('transcribes voice and sends audio response', async () => {
    const req = new Request('http://localhost:3000/api/agent-g/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'telegram-secret',
      },
      body: JSON.stringify({
        update_id: 222,
        message: {
          message_id: 9,
          date: Date.now(),
          voice: { file_id: 'voice-file-1', duration: 12, mime_type: 'audio/ogg' },
          chat: { id: 77, type: 'private' },
          from: { id: 77, is_bot: false },
        },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.replied).toBe(true);
    expect(transcribeTelegramVoice).toHaveBeenCalled();
    expect(synthesizeTelegramVoice).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });
});
