/** @jest-environment node */
/**
 * handleInbound — what Agent G answers to one WhatsApp message. Pinned:
 *   • an unknown number never reaches a model: a link code binds it, anything else gets the how-to-link text (once);
 *   • a linked number's talk is answered by the model with this number's history and the WhatsApp style note;
 *   • an order to MAKE something is answered with a studio link and NEVER reaches the model or a generation route;
 *   • control words (help / stop / alerts on / unlink), media, a model miss, the spend brake, and missing tables.
 */
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

const windows = new Map<string, number>();
jest.mock('../../api/rate-limit', () => ({
  checkRateLimitByKey: jest.fn(async (id: string, cfg: { maxRequests: number; keyPrefix: string }) => {
    const k = `${cfg.keyPrefix}:${id}`;
    const n = (windows.get(k) ?? 0) + 1;
    windows.set(k, n);
    return n > cfg.maxRequests ? ({ status: 429 } as unknown) : null;
  }),
}));

jest.mock('../../ai/channelBridge', () => ({ generateChannelReply: jest.fn() }));
jest.mock('./whatsapp-link', () => ({
  findLinkByNumber: jest.fn(),
  consumeConnectCode: jest.fn(),
  patchLinkMeta: jest.fn(async () => true),
  appendTurn: jest.fn(async () => undefined),
  recentTurns: jest.fn(async () => [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }]),
  unlink: jest.fn(async () => true),
}));

import { handleInbound } from './handleInbound';
import { generateChannelReply } from '../../ai/channelBridge';
import * as store from './whatsapp-link';
import { WA_COPY, WHATSAPP_STYLE_NOTE } from './whatsapp-text';

const m = store as jest.Mocked<typeof store>;
const reply = generateChannelReply as jest.MockedFunction<typeof generateChannelReply>;

const NUMBER = '995555123456';
const LINK = { id: 'link-1', userId: '11111111-1111-4111-8111-111111111111', waId: NUMBER, meta: { alerts: true } };
const msg = (text: string, extra: Record<string, unknown> = {}) =>
  handleInbound({ channel: 'whatsapp', externalId: NUMBER, text, origin: 'https://myavatar.ge', ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  windows.clear();
  m.findLinkByNumber.mockResolvedValue({ state: 'linked', link: LINK });
  reply.mockResolvedValue({
    reply: '**Yes**, I am here.', model: 'm', tokensIn: 0, tokensOut: 0, costEstimate: 0, dualStage: false,
    durationMs: 1, agentId: 'executive-agent-g', answered: true,
  });
});

describe('missing tables', () => {
  test('"opening soon", once per half hour, and nothing else runs', async () => {
    m.findLinkByNumber.mockResolvedValue({ state: 'unavailable' });
    const first = await msg('hello');
    expect(first).toEqual({ replyMessages: [WA_COPY.en.soon], outcome: 'soon' });
    expect((await msg('hello again')).replyMessages).toEqual([]);
    expect(reply).not.toHaveBeenCalled();
    expect(m.consumeConnectCode).not.toHaveBeenCalled();
  });
});

describe('an unlinked number', () => {
  beforeEach(() => m.findLinkByNumber.mockResolvedValue({ state: 'unlinked' }));

  test('a link code binds the number to the code’s owner', async () => {
    m.consumeConnectCode.mockResolvedValue({ userId: LINK.userId });
    const out = await msg('connect ABCD2345', { profileName: 'Nino' });
    expect(m.consumeConnectCode).toHaveBeenCalledWith({}, 'ABCD2345', NUMBER, { locale: 'en', profile_name: 'Nino' });
    expect(out).toEqual({ replyMessages: [WA_COPY.en.linked], outcome: 'linked', userId: LINK.userId });
  });

  test('a wrong or expired code says so and points at Settings', async () => {
    m.consumeConnectCode.mockResolvedValue('not_found');
    const out = await msg('connect ABCD2345');
    expect(out.outcome).toBe('code_not_found');
    expect(out.replyMessages[0]).toContain('https://myavatar.ge/en/settings#whatsapp');
  });

  test('five tries an hour, then "too many attempts" without touching the codes', async () => {
    m.consumeConnectCode.mockResolvedValue('not_found');
    for (let i = 0; i < 5; i += 1) await msg('connect ABCD2345');
    const sixth = await msg('connect ABCD2345');
    expect(sixth.outcome).toBe('rate_limited');
    expect(m.consumeConnectCode).toHaveBeenCalledTimes(5);
  });

  test('anything else gets the how-to-link text in the person’s language — once per 10 minutes — and no model call', async () => {
    const first = await msg('აქ ხარ?');
    expect(first.outcome).toBe('not_linked');
    expect(first.replyMessages[0]).toBe(WA_COPY.ka.notLinked('https://myavatar.ge/ka/settings#whatsapp'));
    expect((await msg('გამარჯობა')).outcome).toBe('silent');
    expect(reply).not.toHaveBeenCalled();
  });

  test('media from an unknown number is not read as a code', async () => {
    await msg('', { kind: 'media' });
    expect(m.consumeConnectCode).not.toHaveBeenCalled();
  });
});

describe('a linked number', () => {
  test('every message stamps the 24 h window', async () => {
    await msg('hi');
    expect(m.patchLinkMeta).toHaveBeenCalledWith({}, LINK, expect.objectContaining({ last_inbound_at: expect.any(String), locale: 'en' }));
  });

  test('talk is answered by the model, with this number’s history and the WhatsApp style, in WhatsApp formatting', async () => {
    const out = await msg('are you there?', { messageId: 'wamid.1' });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      userId: LINK.userId,
      text: 'are you there?',
      locale: 'en',
      systemNote: WHATSAPP_STYLE_NOTE,
      googleSearch: false, // a service channel: no web search on WhatsApp
      history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }],
    }));
    expect(out).toEqual({ replyMessages: ['*Yes*, I am here.'], outcome: 'talk', userId: LINK.userId });
    expect(m.appendTurn).toHaveBeenNthCalledWith(1, {}, expect.anything(), 'user', 'are you there?', 'wamid.1');
    expect(m.appendTurn).toHaveBeenNthCalledWith(2, {}, expect.anything(), 'assistant', '*Yes*, I am here.');
  });

  test.each([
    ['დამიხატე კატა მზიან ფანჯარასთან', 'image', 'ka'],
    ['make a video of a cat surfing at sunset', 'video', 'en'],
    ['create a song about the sea', 'music', 'en'],
    ['нарисуй кота в космосе', 'image', 'ru'],
  ])('“%s” → a %s studio link with the request typed in; the model is never asked', async (text, mode, lang) => {
    const out = await msg(text);
    expect(out.outcome).toBe('studio');
    expect(reply).not.toHaveBeenCalled();
    const url = new URL(out.replyMessages[0].split('\n').pop() as string);
    expect(url.pathname).toBe(`/${lang}/dashboard`);
    expect(url.searchParams.get('mode')).toBe(mode);
    expect(url.searchParams.get('prompt')).toBe(text);
  });

  test('a request to WRITE something is talk, not a render', async () => {
    const out = await msg('write me a short poem about Tbilisi');
    expect(out.outcome).toBe('talk');
    expect(reply).toHaveBeenCalledTimes(1);
  });

  test('a model miss is an apology, and the turn is not kept as history', async () => {
    reply.mockResolvedValue({
      reply: 'fallback', model: 'fallback', tokensIn: 0, tokensOut: 0, costEstimate: 0, dualStage: false,
      durationMs: 1, agentId: 'executive-agent-g', answered: false,
    });
    const out = await msg('hello');
    expect(out.replyMessages).toEqual([WA_COPY.en.unavailable]);
    expect(m.appendTurn).not.toHaveBeenCalled();
  });

  test('help, stop, alerts on, unlink', async () => {
    expect((await msg('help')).replyMessages).toEqual([WA_COPY.en.help]);
    expect((await msg('stop')).replyMessages).toEqual([WA_COPY.en.alertsOff]);
    expect(m.patchLinkMeta).toHaveBeenLastCalledWith({}, expect.objectContaining({ id: 'link-1' }), { alerts: false });
    expect((await msg('alerts on')).replyMessages).toEqual([WA_COPY.en.alertsOn]);
    expect(m.patchLinkMeta).toHaveBeenLastCalledWith({}, expect.objectContaining({ id: 'link-1' }), { alerts: true });
    expect((await msg('unlink')).replyMessages).toEqual([WA_COPY.en.unlinked]);
    expect(m.unlink).toHaveBeenCalledWith({}, 'link-1');
    expect(reply).not.toHaveBeenCalled();
  });

  test('media is answered with "send text"', async () => {
    const out = await msg('', { kind: 'media' });
    expect(out).toEqual({ replyMessages: [WA_COPY.ka.notText], outcome: 'not_text', userId: LINK.userId });
  });

  test('the spend brake: 20 answers per 10 minutes, then one "slow down", then silence', async () => {
    for (let i = 0; i < 20; i += 1) await msg(`question ${i}?`);
    expect(reply).toHaveBeenCalledTimes(20);
    expect((await msg('one more?')).replyMessages).toEqual([WA_COPY.en.slowDown]);
    expect((await msg('and another?')).outcome).toBe('silent');
    expect(reply).toHaveBeenCalledTimes(20);
  });
});

test('no sender, no answer', async () => {
  expect(await handleInbound({ channel: 'whatsapp', externalId: '', text: 'hi' })).toEqual({ replyMessages: [], outcome: 'silent' });
});
