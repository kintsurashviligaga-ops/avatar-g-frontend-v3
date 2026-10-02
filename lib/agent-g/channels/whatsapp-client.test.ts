/** @jest-environment node */
/**
 * The Cloud API calls: which env names count as credentials, what a text/template/read call sends, that a long answer
 * goes as several messages, and that nothing throws — a refused or failed call is a result.
 */
import {
  __resetWhatsAppClientCache,
  businessNumber,
  markWhatsAppRead,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  whatsappConfig,
} from './whatsapp-client';

const CFG = { token: 'tok', phoneNumberId: '123', graphVersion: 'v21.0' };
type Call = [string, RequestInit];
let fetchMock: jest.Mock;
const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

beforeEach(() => {
  __resetWhatsAppClientCache();
  fetchMock = jest.fn(() => ok({ messages: [{ id: 'wamid.x' }] }));
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const bodyOf = (i: number) => JSON.parse(String((fetchMock.mock.calls[i] as Call)[1].body));

describe('whatsappConfig', () => {
  test('the documented names, and the aliases a token is often saved under', () => {
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: 'a', WHATSAPP_PHONE_NUMBER_ID: '1' } as NodeJS.ProcessEnv)).toEqual({ token: 'a', phoneNumberId: '1', graphVersion: 'v21.0' });
    expect(whatsappConfig({ WHATSAPP_TOKEN: ' b ', WHATSAPP_PHONE_ID: '2' } as NodeJS.ProcessEnv)?.token).toBe('b');
    expect(whatsappConfig({ META_WHATSAPP_TOKEN: 'c', WHATSAPP_PHONE_NUMBER_ID: '3', WHATSAPP_GRAPH_VERSION: 'v22.0' } as NodeJS.ProcessEnv)?.graphVersion).toBe('v22.0');
  });
  test('a token without a phone number id (or the reverse) is not a configuration; a junk version falls back', () => {
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: 'a' } as NodeJS.ProcessEnv)).toBeNull();
    expect(whatsappConfig({ WHATSAPP_PHONE_NUMBER_ID: '1' } as NodeJS.ProcessEnv)).toBeNull();
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: 'a', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_GRAPH_VERSION: 'latest' } as NodeJS.ProcessEnv)?.graphVersion).toBe('v21.0');
  });
});

describe('sendWhatsAppText', () => {
  test('posts a text message to the phone number’s /messages with the bearer token', async () => {
    const res = await sendWhatsAppText('995555000111', 'hello', CFG);
    expect(res).toEqual({ ok: true, status: 200, errorCode: null, messageIds: ['wamid.x'] });
    const [url, init] = fetchMock.mock.calls[0] as Call;
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(bodyOf(0)).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '995555000111', type: 'text', text: { body: 'hello', preview_url: true },
    });
  });

  test('a long answer goes as several messages, in order', async () => {
    const res = await sendWhatsAppText('1', `${'a'.repeat(3000)}\n\n${'b'.repeat(3000)}`, CFG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).text.body).toBe('a'.repeat(3000));
    expect(bodyOf(1).text.body).toBe('b'.repeat(3000));
    expect(res.messageIds).toEqual(['wamid.x', 'wamid.x']);
  });

  test('a refusal reports Meta’s error code; a network failure is a result, not a throw', async () => {
    fetchMock.mockImplementationOnce(() => ok({ error: { code: 131047, message: 'Re-engagement message' } }, 400));
    expect(await sendWhatsAppText('1', 'x', CFG)).toEqual({ ok: false, status: 400, errorCode: 131047, messageIds: [] });
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(await sendWhatsAppText('1', 'x', CFG)).toEqual({ ok: false, status: null, errorCode: null, messageIds: [] });
  });

  test('no configuration → nothing is sent', async () => {
    expect((await sendWhatsAppText('1', 'x', null)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

test('a template fills {{1}}, {{2}} with cleaned parameters (no newlines/tabs, capped)', async () => {
  await sendWhatsAppTemplate('1', { name: 'result_ready', language: 'ka' }, ['Title\nline', `${'z'.repeat(1000)}\t`], CFG);
  expect(bodyOf(0)).toEqual({
    messaging_product: 'whatsapp',
    to: '1',
    type: 'template',
    template: {
      name: 'result_ready',
      language: { code: 'ka' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Title line' }, { type: 'text', text: 'z'.repeat(900) }] }],
    },
  });
});

test('read receipt with typing; when Meta refuses the typing indicator, the plain receipt is sent', async () => {
  fetchMock.mockImplementationOnce(() => ok({ error: { code: 100 } }, 400));
  await markWhatsAppRead('wamid.in', CFG);
  expect(bodyOf(0)).toEqual({ messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.in', typing_indicator: { type: 'text' } });
  expect(bodyOf(1)).toEqual({ messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.in' });
});

describe('businessNumber', () => {
  test('the configured number wins, digits only', async () => {
    expect(await businessNumber(CFG, { WHATSAPP_BUSINESS_NUMBER: '+995 32 200 00 00' } as NodeJS.ProcessEnv)).toBe('995322000000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test('else asked from Graph once and cached', async () => {
    fetchMock.mockImplementation(() => ok({ display_phone_number: '+995 32 211 11 11' }));
    expect(await businessNumber(CFG, {} as NodeJS.ProcessEnv)).toBe('995322111111');
    expect(await businessNumber(CFG, {} as NodeJS.ProcessEnv)).toBe('995322111111');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as Call)[0]).toBe('https://graph.facebook.com/v21.0/123?fields=display_phone_number');
  });
  test('nothing configured and Graph silent → null', async () => {
    fetchMock.mockImplementation(() => ok({}, 400));
    expect(await businessNumber(CFG, {} as NodeJS.ProcessEnv)).toBeNull();
    expect(await businessNumber(null, {} as NodeJS.ProcessEnv)).toBeNull();
  });
});
