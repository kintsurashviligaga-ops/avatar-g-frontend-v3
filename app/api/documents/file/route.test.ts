/** @jest-environment node */
jest.mock('server-only', () => ({}));
const getUser = jest.fn();
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: (...a: unknown[]) => getUser(...a) }));
const sign = jest.fn();
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ createSignedAssetUrl: (...a: unknown[]) => sign(...a) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const UID = '11111111-2222-4333-8444-555555555555';
const PATH = `documents/${UID}/2026-10-30-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf`;
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/renders/' + PATH + '?token=t';
const get = (q: string) => GET(new NextRequest(`http://localhost/api/documents/file?${q}`));

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ id: UID });
  sign.mockResolvedValue(SIGNED);
});

describe('GET /api/documents/file', () => {
  it('redirects the owner to a fresh short link', async () => {
    const res = await get(`path=${encodeURIComponent(PATH)}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SIGNED);
    expect(sign).toHaveBeenCalledWith('renders', PATH, 600);
  });

  it('asks Storage for an attachment when downloading', async () => {
    const res = await get(`path=${encodeURIComponent(PATH)}&download=1&name=${encodeURIComponent('ანგარიში.pdf')}`);
    expect(new URL(res.headers.get('location')!).searchParams.get('download')).toBe('ანგარიში.pdf');
  });

  it('serves no one else\'s folder, and no other path', async () => {
    getUser.mockResolvedValue({ id: '99999999-2222-4333-8444-555555555555' });
    expect((await get(`path=${encodeURIComponent(PATH)}`)).status).toBe(404);
    getUser.mockResolvedValue({ id: UID });
    expect((await get(`path=${encodeURIComponent(`documents/${UID}/../x.pdf`)}`)).status).toBe(404);
    expect((await get(`path=${encodeURIComponent(`video-clip/${UID}/a.mp4`)}`)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });

  it('needs a signed-in caller', async () => {
    getUser.mockResolvedValue(null);
    expect((await get(`path=${encodeURIComponent(PATH)}`)).status).toBe(401);
  });
});
