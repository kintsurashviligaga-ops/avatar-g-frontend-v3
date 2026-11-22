/** @jest-environment node */
/**
 * Phase 8.18 flag isolation for #309: the Agent G step switches (media-edit, audio-extract) exist in the admin panel
 * only while AGENT_VALIDATE is on. Off, GET lists exactly the studio switches main lists, and POST answers 404.
 */
jest.mock('../../lib/admin/routeContext', () => ({
  adminContext: async () => ({ ok: true, actorId: '00000000-0000-4000-8000-000000000001' }),
  isUuid: () => true,
}));
jest.mock('../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
jest.mock('../../lib/server/feature-flags', () => ({ getFeatureFlag: async () => true, invalidateFlagCache: () => undefined, readDbOverrides: async () => ({}) }));
const setServiceEnabled = jest.fn(async () => ({ ok: true }));
jest.mock('../../lib/server/serviceSwitches', () => {
  const actual = jest.requireActual('../../lib/server/serviceSwitches');
  return { ...actual, disabledServices: async () => [], setServiceEnabled: (...a: unknown[]) => setServiceEnabled(...(a as [])) };
});

import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/admin/services/route';
import { AGENT_SWITCHES, openSwitches } from '../../lib/server/serviceSwitches';

const post = (tool: string) => POST(new NextRequest('http://x/api/admin/services', { method: 'POST', body: JSON.stringify({ tool, enabled: false }) }));
const listed = async () => ((await (await GET()).json()) as { services: Array<{ tool: string }> }).services.map((s) => s.tool);

describe('admin service switches with AGENT_VALIDATE off (the default)', () => {
  const saved = process.env.AGENT_VALIDATE;
  beforeEach(() => { delete process.env.AGENT_VALIDATE; setServiceEnabled.mockClear(); });
  afterAll(() => { if (saved === undefined) delete process.env.AGENT_VALIDATE; else process.env.AGENT_VALIDATE = saved; });

  it('GET does not list the Agent G step switches', async () => {
    const tools = await listed();
    for (const t of AGENT_SWITCHES) expect(tools).not.toContain(t);
    expect(tools).toContain('video');
  });

  it.each(AGENT_SWITCHES)('POST %s answers 404 feature_disabled and writes nothing', async (t) => {
    const r = await post(t);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'feature_disabled' });
    expect(setServiceEnabled).not.toHaveBeenCalled();
  });

  it('a studio switch still works as before', async () => {
    expect((await post('video')).status).toBe(200);
    expect(setServiceEnabled).toHaveBeenCalledTimes(1);
  });

  it('AGENT_VALIDATE=on shows and accepts them', async () => {
    process.env.AGENT_VALIDATE = 'on';
    expect(await listed()).toEqual(expect.arrayContaining([...AGENT_SWITCHES]));
    expect((await post('media-edit')).status).toBe(200);
    expect(openSwitches({ AGENT_VALIDATE: 'off' } as NodeJS.ProcessEnv)).not.toContain('media-edit');
  });
});
