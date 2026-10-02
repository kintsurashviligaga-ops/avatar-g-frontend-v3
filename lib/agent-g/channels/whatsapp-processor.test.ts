/** @jest-environment node */
/**
 * whatsapp-processor — Meta's webhook payload → one answered message per user message.
 * Pinned: what is parsed (text, buttons, media; statuses and reactions are not messages), that a reply is actually SENT
 * through the Cloud API (it used to be logged as "simulated_outgoing" and never sent), and the skips.
 */
jest.mock('./handleInbound', () => ({ handleInbound: jest.fn() }));
jest.mock('./whatsapp-client', () => ({
  whatsappConfig: jest.fn(),
  sendWhatsAppText: jest.fn(async () => ({ ok: true, status: 200, errorCode: null, messageIds: ['wamid.out'] })),
  markWhatsAppRead: jest.fn(async () => undefined),
}));

import { parseWhatsAppMessageSummary, processWhatsAppPayload } from './whatsapp-processor';
import { handleInbound } from './handleInbound';
import { markWhatsAppRead, sendWhatsAppText, whatsappConfig } from './whatsapp-client';

const handle = handleInbound as jest.MockedFunction<typeof handleInbound>;
const send = sendWhatsAppText as jest.MockedFunction<typeof sendWhatsAppText>;
const cfgFn = whatsappConfig as jest.MockedFunction<typeof whatsappConfig>;
const CFG = { token: 't', phoneNumberId: 'p', graphVersion: 'v21.0' };

const now = () => Math.floor(Date.now() / 1000);
const payload = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { contacts: [{ wa_id: '995555000111', profile: { name: 'Nino' } }], messages, ...extra } }] }],
});

describe('parseWhatsAppMessageSummary', () => {
  test('text, a tapped button, an interactive reply and media are messages; the sender’s profile name comes along', () => {
    const out = parseWhatsAppMessageSummary(payload([
      { from: '995555000111', id: 'w1', type: 'text', text: { body: ' hi ' }, timestamp: '1700000000' },
      { from: '995555000111', id: 'w2', type: 'button', button: { text: 'Yes' } },
      { from: '995555000111', id: 'w3', type: 'interactive', interactive: { button_reply: { title: 'Start' } } },
      { from: '995555000111', id: 'w4', type: 'image', image: { id: 'media-1' } },
      { from: '995555000111', id: 'w5', type: 'reaction', reaction: { emoji: '👍' } },
      { from: '995555000111', id: 'w6', type: 'unsupported' },
    ]));
    expect(out).toEqual([
      { from: '995555000111', id: 'w1', text: 'hi', kind: 'text', profileName: 'Nino', timestamp: 1700000000 },
      { from: '995555000111', id: 'w2', text: 'Yes', kind: 'text', profileName: 'Nino', timestamp: undefined },
      { from: '995555000111', id: 'w3', text: 'Start', kind: 'text', profileName: 'Nino', timestamp: undefined },
      { from: '995555000111', id: 'w4', text: '', kind: 'media', profileName: 'Nino', timestamp: undefined },
    ]);
  });

  test('a delivery/read status callback carries no messages', () => {
    expect(parseWhatsAppMessageSummary(payload([], { statuses: [{ id: 'x', status: 'read' }] }))).toEqual([]);
    expect(parseWhatsAppMessageSummary({})).toEqual([]);
  });
});

describe('processWhatsAppPayload', () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example';
    cfgFn.mockReturnValue(CFG);
    handle.mockResolvedValue({ replyMessages: ['one', 'two'], outcome: 'talk', userId: 'u' });
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...ENV }; jest.restoreAllMocks(); });

  test('every reply is SENT to the sender, after the read receipt was started', async () => {
    await processWhatsAppPayload(payload([{ from: '995555000111', id: 'w1', type: 'text', text: { body: 'hi' }, timestamp: String(now()) }]), 'req', 'https://myavatar.ge');
    expect(markWhatsAppRead).toHaveBeenCalledWith('w1', CFG);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp', externalId: '995555000111', text: 'hi', kind: 'text', messageId: 'w1', profileName: 'Nino', origin: 'https://myavatar.ge',
    }));
    expect(send.mock.calls).toEqual([['995555000111', 'one', CFG], ['995555000111', 'two', CFG]]);
  });

  test('a refused send stops the rest of that answer (no half-sent pile-up)', async () => {
    send.mockResolvedValueOnce({ ok: false, status: 400, errorCode: 131047, messageIds: [] });
    await processWhatsAppPayload(payload([{ from: '995555000111', id: 'w1', type: 'text', text: { body: 'hi' } }]), 'req', '');
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('without send credentials or the database, nothing is answered', async () => {
    cfgFn.mockReturnValue(null);
    await processWhatsAppPayload(payload([{ from: '995555000111', id: 'w1', type: 'text', text: { body: 'hi' } }]), 'req', '');
    cfgFn.mockReturnValue(CFG);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await processWhatsAppPayload(payload([{ from: '995555000111', id: 'w1', type: 'text', text: { body: 'hi' } }]), 'req', '');
    expect(handle).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test('a message older than 23 h (a redelivery after an outage) is not answered', async () => {
    await processWhatsAppPayload(payload([{ from: '995555000111', id: 'w1', type: 'text', text: { body: 'hi' }, timestamp: String(now() - 24 * 3600) }]), 'req', '');
    expect(handle).not.toHaveBeenCalled();
  });

  test('one failing message does not stop the next one', async () => {
    handle.mockRejectedValueOnce(new Error('boom'));
    await processWhatsAppPayload(payload([
      { from: '995555000111', id: 'w1', type: 'text', text: { body: 'a' } },
      { from: '995555000111', id: 'w2', type: 'text', text: { body: 'b' } },
    ]), 'req', '');
    expect(handle).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
