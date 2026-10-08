/** @jest-environment node */
/**
 * GET /api/agent-g/channels — the hub's Connectors tab reads only `runtime_status` (is each bot configured?). Pinned:
 * a failed stored-links query no longer turns that answer into a 500. In Production `agent_g_channels` does not exist
 * (checked 2026-10-08), so every signed-in user saw Telegram and WhatsApp as broken; now the runtime status still
 * arrives and `channels_unavailable` says the list could not be read.
 */
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn() }));
let query: { data: unknown; error: unknown };
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: async () => query }) }) }),
  }),
}));
jest.mock('../../../../lib/agent-g/channels/web', () => ({ getWebChannelStatus: () => ({ type: 'web', ready: true }) }));
jest.mock('../../../../lib/agent-g/channels/telegram', () => ({ getTelegramChannelStatus: () => ({ type: 'telegram', ready: true }) }));
jest.mock('../../../../lib/agent-g/channels/whatsapp', () => ({ getWhatsappChannelStatus: () => ({ type: 'whatsapp', ready: false }) }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { getAuthenticatedUser } from '../../../../lib/supabase/auth';

const auth = getAuthenticatedUser as jest.Mock;
const req = () => new NextRequest('https://myavatar.ge/api/agent-g/channels');
const RUNTIME = [{ type: 'web', ready: true }, { type: 'telegram', ready: true }, { type: 'whatsapp', ready: false }];

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ id: 'u1' });
  query = { data: [], error: null };
});

test('a guest gets the runtime status and no links', async () => {
  auth.mockResolvedValue(null);
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({ guest: true, channels: [], runtime_status: RUNTIME });
});

test('a signed-in user gets their stored links with the runtime status', async () => {
  query = { data: [{ id: 'c1', type: 'web' }], error: null };
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({ guest: false, channels: [{ id: 'c1', type: 'web' }], runtime_status: RUNTIME });
});

test('a missing links table still answers with the runtime status, and says the list is unavailable', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  query = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.agent_g_channels'" } };
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({ guest: false, channels: [], channels_unavailable: true, runtime_status: RUNTIME });
  expect(spy).toHaveBeenCalledWith('[agent-g/channels] stored links unavailable:', 'PGRST205', expect.stringContaining('agent_g_channels'));
  spy.mockRestore();
});
