/** @jest-environment node */
/**
 * handleTelegramWebhook — an update is accepted ONLY with the configured secret header, and never without a secret.
 *
 * ⚠️ The header was checked only `if (expectedSecret)`: with TELEGRAM_WEBHOOK_SECRET unset, ANY POST was queued as a
 * Telegram update and the worker tick drained it into an LLM reply (and voice synthesis) on the platform keys. Pinned:
 * unset secret → 403 and nothing queued; wrong header → 403; the right header → queued. Every dependency is a stub.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../platform/queues', () => ({ enqueueQueueItem: jest.fn(async () => undefined) }));
jest.mock('../../platform/idempotency', () => ({
  hashIdempotencyKey: jest.fn((s: string) => `h:${s.length}`),
  markIdempotentDuplicate: jest.fn(async () => true),
}));
jest.mock('../../platform/request-metrics', () => ({ recordRouteMetric: jest.fn() }));
jest.mock('./inbound-events', () => ({ storeInboundTelegramEvent: jest.fn(async () => undefined) }));
jest.mock('../../agentg/personality', () => ({ generateAgentGPersonalityReply: jest.fn(), getFallbackReply: jest.fn(() => '') }));
jest.mock('../tone', () => ({ detectTone: jest.fn(() => ({ tone: 'neutral', confidence: 1 })) }));
jest.mock('../memory', () => ({ getUserMemory: jest.fn(), recordEvent: jest.fn(), upsertUserMemory: jest.fn() }));
jest.mock('../voice/stt', () => ({ isAgentGVoiceEnabled: jest.fn(() => false), transcribeTelegramVoice: jest.fn() }));
jest.mock('../voice/tts', () => ({ synthesizeTelegramVoice: jest.fn() }));
jest.mock('../../ai/channelBridge', () => ({ generateChannelReply: jest.fn() }));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));

import { handleTelegramWebhook } from './telegram-webhook-handler';
import { enqueueQueueItem } from '../../platform/queues';

const UPDATE = JSON.stringify({ update_id: 42, message: { message_id: 1, chat: { id: 7, type: 'private' }, from: { id: 7 }, text: 'hi' } });
let ip = 0;
const post = (headers: Record<string, string> = {}) =>
  new Request('https://myavatar.ge/api/agent-g/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${(ip += 1)}`, ...headers },
    body: UPDATE,
  });

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('with NO webhook secret configured, an update is refused (403) and nothing is queued', async () => {
  const res = await handleTelegramWebhook(post());
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('with NO webhook secret configured, a header of any value is still refused', async () => {
  const res = await handleTelegramWebhook(post({ 'x-telegram-bot-api-secret-token': 'anything' }));
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('a wrong secret header is refused', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret-123';
  const res = await handleTelegramWebhook(post({ 'x-telegram-bot-api-secret-token': 'tg-secret-124' }));
  expect(res.status).toBe(403);
  expect(enqueueQueueItem).not.toHaveBeenCalled();
});

test('the configured secret header is accepted and the update queued', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret-123';
  const res = await handleTelegramWebhook(post({ 'x-telegram-bot-api-secret-token': 'tg-secret-123' }));
  expect(res.status).toBe(200);
  expect(enqueueQueueItem).toHaveBeenCalledTimes(1);
});
