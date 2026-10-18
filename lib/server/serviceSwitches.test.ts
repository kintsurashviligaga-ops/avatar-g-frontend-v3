/** @jest-environment node */
const overrides = new Map<string, boolean>();
const upsert = jest.fn(async () => ({ error: null }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => ({ upsert }) }) }));
jest.mock('./feature-flags', () => ({
  getFeatureFlag: jest.fn(async (name: string, dflt: boolean) => (overrides.has(name) ? overrides.get(name) : dflt)),
  readDbOverrides: jest.fn(async () => overrides),
  invalidateFlagCache: jest.fn(),
}));

import {
  SWITCHABLE_TOOLS, disabledServices, isServiceEnabled, isSwitchableTool, serviceFlagName,
  serviceOffReason, serviceOffResponse, setServiceEnabled,
} from './serviceSwitches';
import { invalidateFlagCache } from './feature-flags';

beforeEach(() => { overrides.clear(); upsert.mockClear(); });

describe('service switches', () => {
  it('names each switch service:<tool> and knows only studio tools', () => {
    expect(serviceFlagName('video')).toBe('service:video');
    expect(isSwitchableTool('music')).toBe(true);
    expect(isSwitchableTool('chat')).toBe(false);
    expect(isSwitchableTool(42)).toBe(false);
  });

  it('is on when no row exists (a tool is only off after an admin switched it off)', async () => {
    for (const t of SWITCHABLE_TOOLS) expect(await isServiceEnabled(t)).toBe(true);
    expect(await serviceOffResponse('video')).toBeNull();
    expect(await serviceOffReason('video')).toBeNull();
    expect(await disabledServices()).toEqual([]);
  });

  it('refuses a switched-off tool with a 503 and a Georgian message', async () => {
    overrides.set('service:music', false);
    const res = await serviceOffResponse('music');
    expect(res?.status).toBe(503);
    const body = await res!.json();
    expect(body).toMatchObject({ error: 'service_disabled', tool: 'music' });
    expect(body.message).toMatch(/გათიშულია/);
    expect(await serviceOffReason('music')).toMatch(/გათიშულია/);
    expect(await serviceOffResponse('video')).toBeNull();
    expect(await disabledServices()).toEqual(['music']);
  });

  it('writes the row and clears the cache', async () => {
    const r = await setServiceEnabled('image', false, null);
    expect(r.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ flag_name: 'service:image', enabled: false, updated_by: null }), { onConflict: 'flag_name' });
    expect(invalidateFlagCache).toHaveBeenCalled();
  });
});
