/** @jest-environment node */
jest.mock('server-only', () => ({}));
const getUser = jest.fn();
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ supabase: {}, user: getUser() }) }));
jest.mock('../../../lib/admin/guard', () => ({ isAdminUserAsync: async (u: { admin?: boolean } | null) => !!u?.admin }));
jest.mock('../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: {}, TASKS: {}, WRITE: {} }, checkRateLimit: async () => null }));
const createJob = jest.fn(async () => ({ ok: true, id: 'j', step: 'queued', quote: [] }));
const pollJob = jest.fn(async () => ({ ok: true, id: 'j', step: 'shape', quote: [] }));
jest.mock('../../../lib/studio3d/server/service', () => ({ createJob: (...a: unknown[]) => (createJob as jest.Mock)(...a), pollJob: (...a: unknown[]) => (pollJob as jest.Mock)(...a), actOnJob: jest.fn() }));
jest.mock('../../../lib/studio3d/server/deps', () => ({ studio3dDeps: () => ({}) }));
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { POST } from './route';
import { GET } from './[id]/route';

const post = () => new NextRequest('https://myavatar.ge/api/studio3d', { method: 'POST', body: JSON.stringify({ mode: 'text', prompt: 'a chair' }) });
const get = () => GET(new NextRequest('https://myavatar.ge/api/studio3d/j'), { params: Promise.resolve({ id: 'j' }) });

describe('/api/studio3d behind STUDIO_3D_V2', () => {
  const env = process.env.STUDIO_3D_V2;
  afterEach(() => {
    process.env.STUDIO_3D_V2 = env;
    jest.clearAllMocks();
  });

  it('flag off → 404 for everyone, nothing runs', async () => {
    delete process.env.STUDIO_3D_V2;
    getUser.mockReturnValue({ id: 'u', admin: true });
    expect((await POST(post())).status).toBe(404);
    expect((await get()).status).toBe(404);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('admin audience: non-admins and anonymous callers get 404, admins get through', async () => {
    process.env.STUDIO_3D_V2 = 'admin';
    getUser.mockReturnValue(null);
    expect((await POST(post())).status).toBe(404);
    getUser.mockReturnValue({ id: 'u' });
    expect((await POST(post())).status).toBe(404);
    getUser.mockReturnValue({ id: 'u', admin: true });
    expect((await POST(post())).status).toBe(201);
    expect(createJob).toHaveBeenCalledWith({}, 'u', { mode: 'text', prompt: 'a chair' });
  });

  it('everyone audience: anonymous → 401, signed-in → runs', async () => {
    process.env.STUDIO_3D_V2 = 'everyone';
    getUser.mockReturnValue(null);
    expect((await POST(post())).status).toBe(401);
    getUser.mockReturnValue({ id: 'u2' });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(pollJob).toHaveBeenCalledWith({}, 'u2', 'j');
  });
});
