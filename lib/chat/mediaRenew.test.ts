/** @jest-environment node */
// A reopened chat's links are renewed only through the caller-media rule; chat rows are user-written, so nothing is trusted.
jest.mock('server-only', () => ({}));
// The real rule is lib/security/callerMedia (its own tests); here it is injected, so its import chain is stubbed.
jest.mock('../security/callerMedia', () => ({ resolveCallerMedia: jest.fn() }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import { CHAT_MEDIA_MAX_URLS, CHAT_MEDIA_TTL_SEC, chatMediaRenewOn, renewChatMedia } from './mediaRenew';
import type { CallerMedia } from '@/lib/security/callerMedia';

const HOST = 'https://proj.supabase.co';
const ENV = { SUPABASE_URL: HOST } as unknown as NodeJS.ProcessEnv;
const signed = (path: string, token = 'old') => `${HOST}/storage/v1/object/sign/renders/${path}?token=${token}`;
const ME = 'user-1';

test('the flag is off unless CHAT_MEDIA_RENEW says on', () => {
  expect(chatMediaRenewOn({} as NodeJS.ProcessEnv)).toBe(false);
  expect(chatMediaRenewOn({ CHAT_MEDIA_RENEW: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
});

test('only our signed links reach the ownership check, with the 7-day TTL; refused ones stay out', async () => {
  const resolve = jest.fn(async (url: string, uid: string, ttl: number): Promise<CallerMedia> => {
    expect(uid).toBe(ME);
    expect(ttl).toBe(CHAT_MEDIA_TTL_SEC);
    if (url.includes('mine')) return { ok: true, url: url.replace('old', 'new'), own: true };
    return { ok: false, reason: 'not_owner' };
  });
  const out = await renewChatMedia([
    signed('mine/a.mp4'), signed('theirs/b.mp4'),
    `${HOST}/storage/v1/object/public/renders/c.png`, // public: nothing to renew
    'https://other.supabase.co/storage/v1/object/sign/renders/d.mp4?token=x', // another project
    'https://example.com/e.mp4', 42, '',
  ], ME, { env: ENV, resolve });
  expect(out).toEqual({ [signed('mine/a.mp4')]: signed('mine/a.mp4', 'new') });
  expect(resolve).toHaveBeenCalledTimes(2);
});

test('duplicates are asked once and the list is capped', async () => {
  const resolve = jest.fn(async (url: string): Promise<CallerMedia> => ({ ok: true, url: `${url}2`, own: true }));
  const many = Array.from({ length: CHAT_MEDIA_MAX_URLS + 10 }, (_, i) => signed(`mine/${i}.mp4`));
  await renewChatMedia([...many, many[0]], ME, { env: ENV, resolve });
  expect(resolve).toHaveBeenCalledTimes(CHAT_MEDIA_MAX_URLS);
});

test('a failing check leaves the link out rather than throwing', async () => {
  const resolve = jest.fn(async (): Promise<CallerMedia> => { throw new Error('db down'); });
  await expect(renewChatMedia([signed('mine/a.mp4')], ME, { env: ENV, resolve })).resolves.toEqual({});
});
