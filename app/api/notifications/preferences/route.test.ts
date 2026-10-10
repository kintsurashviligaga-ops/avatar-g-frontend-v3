/** @jest-environment node */
/**
 * /api/notifications/preferences — signed-in only; GET offers only the places that can carry news for this person;
 * PUT stores what the rules allow (the site always on, no call for minor news), never what the browser asked blindly.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock('../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ sb: true }) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
const mockLookup = jest.fn();
jest.mock('../../../../lib/agent-g/channels/whatsapp-link', () => ({ findLinkByUser: (...a: unknown[]) => mockLookup(...a) }));
let waReady = true;
jest.mock('../../../../lib/agent-g/channels/whatsapp', () => ({ getWhatsappChannelStatus: () => ({ ready: waReady }) }));
const mockWrite = jest.fn();
jest.mock('../../../../lib/notifications/prefsStore', () => {
  const actual = jest.requireActual('../../../../lib/notifications/prefsStore');
  return { ...actual, writePrefs: (...a: unknown[]) => mockWrite(...a) };
});

import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
import { getAuthenticatedUser } from '../../../../lib/supabase/auth';
import { normalizePrefs } from '../../../../lib/notifications/preferences';

const auth = getAuthenticatedUser as jest.Mock;
const url = 'https://myavatar.ge/api/notifications/preferences';
const put = (body: unknown) => new NextRequest(url, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  waReady = true;
  auth.mockResolvedValue({ id: 'u1', app_metadata: {} });
  mockLookup.mockResolvedValue({ state: 'unlinked' });
  mockWrite.mockImplementation(async (_id: string, raw: unknown) => normalizePrefs(raw));
});

test('a guest gets 401 on both', async () => {
  auth.mockResolvedValue(null);
  expect((await GET(new NextRequest(url))).status).toBe(401);
  expect((await PUT(put({ prefs: {} }))).status).toBe(401);
  expect(mockWrite).not.toHaveBeenCalled();
});

test('GET: defaults when nothing is saved; WhatsApp offered only when the number is linked', async () => {
  let data = (await (await GET(new NextRequest(url))).json()).data;
  expect(data.saved).toBe(false);
  expect(data.prefs.events.task_completed).toEqual(['site', 'whatsapp']);
  expect(data.available).toEqual({ whatsapp: false, telegram: false, sms: false, call: false });

  mockLookup.mockResolvedValue({ state: 'linked', link: { waId: '995599000000', meta: {} } });
  data = (await (await GET(new NextRequest(url))).json()).data;
  expect(data.available.whatsapp).toBe(true);
});

test('GET reads what is saved on the account', async () => {
  auth.mockResolvedValue({ id: 'u1', app_metadata: { role: 'user', notify_prefs: { events: { task_completed: ['site'] } } } });
  const data = (await (await GET(new NextRequest(url))).json()).data;
  expect(data.saved).toBe(true);
  expect(data.prefs.events.task_completed).toEqual(['site']);
});

test('PUT stores the normalized prefs: the site cannot be removed, a call for an error is dropped', async () => {
  const res = await PUT(put({ prefs: { events: { needs_attention: ['call', 'whatsapp'], task_completed: [] }, sneaky: true } }));
  expect(res.status).toBe(200);
  const stored = mockWrite.mock.calls[0]![1];
  expect(mockWrite.mock.calls[0]![0]).toBe('u1');
  const saved = (await res.json()).data.prefs;
  expect(saved.events.needs_attention).toEqual(['site', 'whatsapp']);
  expect(saved.events.task_completed).toEqual(['site']);
  expect(stored).toEqual({ events: { needs_attention: ['call', 'whatsapp'], task_completed: [] }, sneaky: true });
  expect(saved).not.toHaveProperty('sneaky');
});

test('PUT refuses a broken body, an oversize body, and reports a failed save', async () => {
  expect((await PUT(put('not json'))).status).toBe(400);
  expect((await PUT(put({ other: 1 }))).status).toBe(400);
  expect((await PUT(put({ prefs: { pad: 'x'.repeat(5000) } }))).status).toBe(413);
  mockWrite.mockResolvedValue(null);
  expect((await PUT(put({ prefs: {} }))).status).toBe(503);
});
