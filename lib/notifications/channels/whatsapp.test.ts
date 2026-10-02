/** @jest-environment node */
/**
 * sendWhatsAppAlert — "your video is ready" on the linked WhatsApp, under WhatsApp's 24 h rule.
 * Pinned: every reason it does NOT send (no keys, no tables, not linked, alerts off, rate), free-form text inside the
 * window, the approved template outside it (or `window_closed` without one), Meta's late window-close error, and a
 * link that is only ever a same-site path.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
jest.mock('../../agent-g/channels/whatsapp-link', () => ({ findLinkByUser: jest.fn() }));
jest.mock('../../agent-g/channels/whatsapp-client', () => ({
  whatsappConfig: jest.fn(),
  sendWhatsAppText: jest.fn(),
  sendWhatsAppTemplate: jest.fn(),
}));

import { alertLink, sendWhatsAppAlert } from './whatsapp';
import { findLinkByUser } from '../../agent-g/channels/whatsapp-link';
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappConfig } from '../../agent-g/channels/whatsapp-client';
import { checkRateLimitByKey } from '../../api/rate-limit';

const find = findLinkByUser as jest.MockedFunction<typeof findLinkByUser>;
const text = sendWhatsAppText as jest.MockedFunction<typeof sendWhatsAppText>;
const tpl = sendWhatsAppTemplate as jest.MockedFunction<typeof sendWhatsAppTemplate>;
const CFG = { token: 't', phoneNumberId: 'p', graphVersion: 'v21.0' };
const OK = { ok: true, status: 200, errorCode: null, messageIds: ['w'] };
const EV = { userId: 'u1', kind: 'video' as const, title: '🎬 თქვენი ვიდეო მზადაა!', body: '', url: '/library' };
const ENV = { NEXT_PUBLIC_APP_URL: 'https://myavatar.ge' } as NodeJS.ProcessEnv;
const linkWith = (meta: Record<string, unknown>) =>
  ({ state: 'linked', link: { id: 'L', userId: 'u1', waId: '995555000111', meta } }) as Awaited<ReturnType<typeof findLinkByUser>>;
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  (whatsappConfig as jest.Mock).mockReturnValue(CFG);
  text.mockResolvedValue(OK);
  tpl.mockResolvedValue(OK);
});

test.each([
  ['no keys', () => (whatsappConfig as jest.Mock).mockReturnValue(null), 'not_configured'],
  ['no tables', () => find.mockResolvedValue({ state: 'unavailable' }), 'not_configured'],
  ['not linked', () => find.mockResolvedValue({ state: 'unlinked' }), 'not_linked'],
  ['alerts off', () => find.mockResolvedValue(linkWith({ alerts: false, last_inbound_at: ago(1) })), 'opted_out'],
])('%s → %s, nothing sent', async (_label, arrange, reason) => {
  find.mockResolvedValue(linkWith({ alerts: true, last_inbound_at: ago(1) }));
  arrange();
  expect(await sendWhatsAppAlert(EV, ENV)).toEqual({ sent: false, reason });
  expect(text).not.toHaveBeenCalled();
  expect(tpl).not.toHaveBeenCalled();
});

test('rate-limited → rate_limited', async () => {
  find.mockResolvedValue(linkWith({ last_inbound_at: ago(1) }));
  (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce({ status: 429 });
  expect(await sendWhatsAppAlert(EV, ENV)).toEqual({ sent: false, reason: 'rate_limited' });
});

test('inside the 24 h window: a free-form text with the title in bold and the absolute link', async () => {
  find.mockResolvedValue(linkWith({ last_inbound_at: ago(2) }));
  expect(await sendWhatsAppAlert({ ...EV, body: 'Ready to download.' }, ENV)).toEqual({ sent: true });
  expect(text).toHaveBeenCalledWith('995555000111', '*🎬 თქვენი ვიდეო მზადაა!*\nReady to download.\nhttps://myavatar.ge/library', CFG);
  expect(tpl).not.toHaveBeenCalled();
});

test('outside the window with a template configured: the template, title and details as parameters', async () => {
  find.mockResolvedValue(linkWith({ last_inbound_at: ago(30) }));
  const env = { ...ENV, WHATSAPP_ALERT_TEMPLATE: 'result_ready', WHATSAPP_ALERT_TEMPLATE_LANG: 'en' } as NodeJS.ProcessEnv;
  expect(await sendWhatsAppAlert(EV, env)).toEqual({ sent: true });
  expect(text).not.toHaveBeenCalled();
  expect(tpl).toHaveBeenCalledWith('995555000111', { name: 'result_ready', language: 'en' }, [EV.title, 'https://myavatar.ge/library'], CFG);
});

test('outside the window without a template: window_closed (the bell and push still carry it)', async () => {
  find.mockResolvedValue(linkWith({}));
  expect(await sendWhatsAppAlert(EV, ENV)).toEqual({ sent: false, reason: 'window_closed' });
  expect(text).not.toHaveBeenCalled();
});

test('the window closed between our check and the send (Meta 131047) → the template is tried', async () => {
  find.mockResolvedValue(linkWith({ last_inbound_at: ago(1) }));
  text.mockResolvedValueOnce({ ok: false, status: 400, errorCode: 131047, messageIds: [] });
  const env = { ...ENV, WHATSAPP_ALERT_TEMPLATE: 'result_ready' } as NodeJS.ProcessEnv;
  expect(await sendWhatsAppAlert(EV, env)).toEqual({ sent: true });
  expect(tpl).toHaveBeenCalledWith('995555000111', { name: 'result_ready', language: 'ka' }, expect.any(Array), CFG);
});

test('any other refusal → failed, and a throw anywhere is a result, not an exception', async () => {
  find.mockResolvedValue(linkWith({ last_inbound_at: ago(1) }));
  text.mockResolvedValueOnce({ ok: false, status: 401, errorCode: 190, messageIds: [] });
  expect(await sendWhatsAppAlert(EV, ENV)).toEqual({ sent: false, reason: 'failed' });
  find.mockRejectedValueOnce(new Error('db down'));
  expect(await sendWhatsAppAlert(EV, ENV)).toEqual({ sent: false, reason: 'failed' });
});

test('alertLink: a same-site path only', () => {
  expect(alertLink('/ka/library', 'https://myavatar.ge/')).toBe('https://myavatar.ge/ka/library');
  expect(alertLink('//evil.example/x', 'https://myavatar.ge')).toBeNull();
  expect(alertLink('https://evil.example', 'https://myavatar.ge')).toBeNull();
  expect(alertLink('/a b', 'https://myavatar.ge')).toBeNull();
  expect(alertLink(undefined, 'https://myavatar.ge')).toBeNull();
});
