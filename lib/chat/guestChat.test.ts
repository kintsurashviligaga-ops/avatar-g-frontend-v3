/** @jest-environment node */
import {
  DEFAULT_GUEST_DAILY_LIMIT,
  DEFAULT_GUEST_GLOBAL_DAILY_LIMIT,
  GUEST_MAX_MESSAGE_CHARS,
  GUEST_NOTICE,
  guestChatDailyLimit,
  guestChatEnabled,
  guestChatGlobalDailyLimit,
  guestSearchEnabled,
  guestTurnRefusal,
} from './guestChat';
import type { WireMessage } from './historySerializer';

const env = (vars: Record<string, string | undefined>) => vars as NodeJS.ProcessEnv;

describe('switches', () => {
  test('guest chat is on unless explicitly turned off', () => {
    expect(guestChatEnabled(env({}))).toBe(true);
    expect(guestChatEnabled(env({ CHAT_GUEST_ENABLED: '' }))).toBe(true);
    for (const off of ['0', 'false', 'off', 'no', ' OFF ']) expect(guestChatEnabled(env({ CHAT_GUEST_ENABLED: off }))).toBe(false);
  });
  test('grounding for guests is off unless explicitly turned on', () => {
    expect(guestSearchEnabled(env({}))).toBe(false);
    expect(guestSearchEnabled(env({ CHAT_GUEST_SEARCH: 'true' }))).toBe(true);
  });
});

describe('caps', () => {
  test('defaults: 10 per IP, 250 for all guests, a day each, in their own namespaces', () => {
    expect(guestChatDailyLimit(env({}))).toEqual({ maxRequests: DEFAULT_GUEST_DAILY_LIMIT, windowMs: 86_400_000, keyPrefix: 'rl:chat:guest' });
    expect(guestChatGlobalDailyLimit(env({}))).toEqual({ maxRequests: DEFAULT_GUEST_GLOBAL_DAILY_LIMIT, windowMs: 86_400_000, keyPrefix: 'rl:chat:guest:global' });
    expect(DEFAULT_GUEST_DAILY_LIMIT).toBe(10);
    expect(DEFAULT_GUEST_GLOBAL_DAILY_LIMIT).toBe(250);
  });
  test('an override is a whole number within bounds; 0 is honoured; junk and huge values keep the default', () => {
    expect(guestChatDailyLimit(env({ CHAT_GUEST_DAILY_LIMIT: '3' })).maxRequests).toBe(3);
    expect(guestChatDailyLimit(env({ CHAT_GUEST_DAILY_LIMIT: '0' })).maxRequests).toBe(0);
    for (const junk of ['-1', '2.5', 'ten', '10/day', '999999']) {
      expect(guestChatDailyLimit(env({ CHAT_GUEST_DAILY_LIMIT: junk })).maxRequests).toBe(DEFAULT_GUEST_DAILY_LIMIT);
    }
    expect(guestChatGlobalDailyLimit(env({ CHAT_GUEST_GLOBAL_DAILY_LIMIT: '1000' })).maxRequests).toBe(1000);
    expect(guestChatGlobalDailyLimit(env({ CHAT_GUEST_GLOBAL_DAILY_LIMIT: '50000' })).maxRequests).toBe(DEFAULT_GUEST_GLOBAL_DAILY_LIMIT);
  });
});

describe('guestTurnRefusal', () => {
  const user = (content: WireMessage['content']): WireMessage => ({ role: 'user', content });
  test('plain text passes', () => {
    expect(guestTurnRefusal([user('გამარჯობა')])).toBeNull();
    expect(guestTurnRefusal([user([{ type: 'text', text: 'hi' }])])).toBeNull();
  });
  test('media anywhere in the history is refused — not only in the latest turn', () => {
    const img = { type: 'image' as const, image: 'data:image/png;base64,AAAA' };
    expect(guestTurnRefusal([user([{ type: 'text', text: 'what is this?' }, img])])).toBe('media');
    expect(guestTurnRefusal([user([img]), { role: 'assistant', content: 'a cat' }, user('and now?')])).toBe('media');
    expect(guestTurnRefusal([user([{ type: 'file', data: 'JVBERi0=', mimeType: 'application/pdf' }])])).toBe('media');
  });
  test('the latest message is bounded', () => {
    expect(guestTurnRefusal([user('ა'.repeat(GUEST_MAX_MESSAGE_CHARS))])).toBeNull();
    expect(guestTurnRefusal([user('ა'.repeat(GUEST_MAX_MESSAGE_CHARS + 1))])).toBe('too_long');
  });
  test('every notice exists in all three languages and offers the free account', () => {
    for (const k of ['cap', 'media', 'too_long'] as const) {
      for (const l of ['ka', 'en', 'ru'] as const) expect(GUEST_NOTICE[k][l].length).toBeGreaterThan(20);
      expect(GUEST_NOTICE[k].en).toMatch(/free/i);
    }
  });
});
