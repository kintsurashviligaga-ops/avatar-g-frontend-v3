/** @jest-environment node */
/**
 * GET /api/agent-g/channels — Settings → Connections. Pinned:
 *   • one word per channel, decided on the server; never a key's presence as „connected";
 *   • nothing technical leaves the server: no env names, no table names, no full number (the old `runtime_status`
 *     notes such as "missing TELEGRAM_WEBHOOK_SECRET" reached guests until 2026-10-10);
 *   • WhatsApp tables missing (Production today) → „temporarily unavailable", not an error and not „connect";
 *   • Telegram binding not built → unavailable; phone → unavailable.
 */
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock('../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ sb: true }) }));
const mockLookup = jest.fn();
jest.mock('../../../../lib/agent-g/channels/whatsapp-link', () => ({ findLinkByUser: (...a: unknown[]) => mockLookup(...a) }));
let waReady = true;
let tgReady = true;
jest.mock('../../../../lib/agent-g/channels/whatsapp', () => ({
  getWhatsappChannelStatus: () => ({ type: 'whatsapp', ready: waReady, connected: waReady, note: waReady ? 'Webhook ready' : 'Connected, missing WHATSAPP_APP_SECRET' }),
}));
jest.mock('../../../../lib/agent-g/channels/telegram', () => ({
  TELEGRAM_BINDING_LIVE: false,
  getTelegramChannelStatus: () => ({ type: 'telegram', ready: tgReady, connected: tgReady, note: 'Token set, missing TELEGRAM_WEBHOOK_SECRET' }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { getAuthenticatedUser } from '../../../../lib/supabase/auth';

const auth = getAuthenticatedUser as jest.Mock;
const req = () => new NextRequest('https://myavatar.ge/api/agent-g/channels');
const states = (data: { connections: Array<{ id: string; state: string; detail?: string }> }) =>
  Object.fromEntries(data.connections.map((c) => [c.id, c.detail ? `${c.state}:${c.detail}` : c.state]));

beforeEach(() => {
  jest.clearAllMocks();
  waReady = true;
  tgReady = true;
  auth.mockResolvedValue({ id: 'u1' });
  mockLookup.mockResolvedValue({ state: 'unlinked' });
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('a signed-in user who has not linked WhatsApp sees „Connect"; Telegram and the phone are unavailable', async () => {
  const res = await GET(req());
  expect(res.status).toBe(200);
  const data = (await res.json()).data;
  expect(data.guest).toBe(false);
  expect(states(data)).toEqual({ phone: 'unavailable', whatsapp: 'connect', telegram: 'unavailable', notifications: 'on' });
  expect(mockLookup).toHaveBeenCalledWith({ sb: true }, 'u1');
});

test('a linked number shows „Connected" with the number masked, never in full', async () => {
  mockLookup.mockResolvedValue({ state: 'linked', link: { id: 'l1', userId: 'u1', waId: '995599123456', meta: {} } });
  const res = await GET(req());
  const body = JSON.stringify(await res.json());
  expect(states(JSON.parse(body).data).whatsapp).toBe('connected:+995 ••• ••456');
  expect(body).not.toContain('995599123456');
});

test('the link tables are missing (Production today) → WhatsApp is „temporarily unavailable", not an error', async () => {
  mockLookup.mockResolvedValue({ state: 'unavailable' });
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(states((await res.json()).data).whatsapp).toBe('unavailable');
});

test('keys only partly set → unavailable, and the reason stays in the server log', async () => {
  waReady = false;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const res = await GET(req());
  const text = await res.text();
  expect(states(JSON.parse(text).data).whatsapp).toBe('unavailable');
  expect(mockLookup).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('[agent-g/channels] runtime', expect.objectContaining({ whatsapp: expect.stringContaining('WHATSAPP_APP_SECRET') }));
  expect(text).not.toMatch(/WHATSAPP_|TELEGRAM_|missing|Webhook|agent_g_/);
});

test('a guest: the channels that exist say „sign in", nothing technical, no lookup', async () => {
  auth.mockResolvedValue(null);
  const res = await GET(req());
  const text = await res.text();
  const data = JSON.parse(text).data;
  expect(data.guest).toBe(true);
  expect(states(data)).toEqual({ phone: 'unavailable', whatsapp: 'signin', telegram: 'unavailable', notifications: 'signin' });
  expect(mockLookup).not.toHaveBeenCalled();
  expect(text).not.toMatch(/WHATSAPP_|TELEGRAM_|missing|Webhook|runtime_status/);
});
