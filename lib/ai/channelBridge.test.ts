/** @jest-environment node */
/**
 * generateChannelReply — the channel doors answer from the SAME engine as the website. While AI_GOOGLE_ONLY is on
 * (the default) that is the product Gemini chain; the OpenAI chatEngine (which production never calls) only with it off.
 * Pinned too: the budget gate, `answered` on a miss, the channel style note, and that a non-account id (a Telegram chat,
 * a phone number) is never booked as a user id.
 */
jest.mock('./chatEngine', () => ({ execute: jest.fn() }));
jest.mock('../services/billing/chatBudget', () => ({ chatBudgetAllows: jest.fn(async () => true) }));
jest.mock('./google/reply', () => ({ geminiReply: jest.fn() }));

import { generateChannelReply } from './channelBridge';
import { execute } from './chatEngine';
import { chatBudgetAllows } from '../services/billing/chatBudget';
import { geminiReply } from './google/reply';

const gemini = geminiReply as jest.MockedFunction<typeof geminiReply>;
const UID = '11111111-1111-4111-8111-111111111111';
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.AI_GOOGLE_ONLY;
  gemini.mockResolvedValue({ text: 'გამარჯობა!', model: 'gemini-x' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

test('Google-only (the default): Gemini answers with the history, the style note and the account id', async () => {
  const out = await generateChannelReply({
    channel: 'whatsapp', userId: UID, externalId: '995555000111', text: 'აქ ხარ?', locale: 'ka',
    history: [{ role: 'assistant', content: 'prev' }], systemNote: 'WA STYLE',
  });
  expect(gemini).toHaveBeenCalledWith([{ role: 'assistant', content: 'prev' }, { role: 'user', content: 'აქ ხარ?' }], UID, expect.any(AbortSignal), { systemNote: 'WA STYLE', locale: 'ka' });
  expect(execute).not.toHaveBeenCalled();
  expect(out).toMatchObject({ reply: 'გამარჯობა!', model: 'gemini-x', answered: true });
});

test('a door can switch Google Search off (WhatsApp); the option reaches the Gemini reply', async () => {
  await generateChannelReply({ channel: 'whatsapp', userId: UID, externalId: '1', text: 'hi', locale: 'en', systemNote: 'WA', googleSearch: false });
  expect(gemini.mock.calls[0][3]).toEqual({ systemNote: 'WA', locale: 'en', googleSearch: false });
});

test('a Telegram chat id is not an account — booked unattributed', async () => {
  await generateChannelReply({ channel: 'telegram', userId: '123456789', externalId: '123456789', text: 'hi' });
  expect(gemini.mock.calls[0][1]).toBeNull();
});

test('no model answered → the localized fallback, answered: false', async () => {
  gemini.mockResolvedValue(null);
  const out = await generateChannelReply({ channel: 'whatsapp', userId: UID, externalId: '1', text: 'hi', locale: 'ru' });
  expect(out.answered).toBe(false);
  expect(out.reply).toMatch(/Приношу извинения/);
});

test('the budget gate refuses before any model is called', async () => {
  (chatBudgetAllows as jest.Mock).mockResolvedValueOnce(false);
  const out = await generateChannelReply({ channel: 'whatsapp', userId: UID, externalId: '1', text: 'hi' });
  expect(out).toMatchObject({ answered: false, model: 'budget' });
  expect(gemini).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0 restores the multi-vendor chatEngine, with the style note as a system turn', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  (execute as jest.Mock).mockResolvedValue({ text: 'hello', model: 'gpt', tokensIn: 1, tokensOut: 2, costEstimate: 0, dualStage: false, durationMs: 5 });
  const out = await generateChannelReply({ channel: 'whatsapp', userId: UID, externalId: '1', text: 'hi', systemNote: 'WA STYLE' });
  expect((execute as jest.Mock).mock.calls[0][0].messages[0]).toEqual({ role: 'system', content: 'WA STYLE' });
  expect(out).toMatchObject({ reply: 'hello', answered: true });
  expect(gemini).not.toHaveBeenCalled();
});
