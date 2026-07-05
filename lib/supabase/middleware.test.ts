/** @jest-environment node */
/**
 * Tests for updateSession — the middleware Supabase session refresh. Locks the two behaviors that
 * matter: (1) a refreshed cookie is propagated to BOTH the request (so the same-request RSC's
 * getUser() sees it) AND the response (so the browser gets it); (2) an Auth-server error fails OPEN
 * (never bubbles up to 500 every page navigation).
 */
jest.mock('next/server', () => ({
  NextResponse: {
    next: (init?: unknown) => ({
      __init: init,
      cookies: {
        set: jest.fn(function (this: { _set: unknown[] }, name: string, value: string, options?: unknown) {
          (this._set ||= []).push({ name, value, options });
        }),
        _set: [] as Array<{ name: string; value: string; options?: unknown }>,
      },
    }),
  },
}));

type Cookie = { name: string; value: string; options?: unknown };
let mockUser: { id: string } | null = null;
let mockThrow = false;
let mockRefresh: Cookie[] | null = null;
let capturedCookieAdapter: { getAll(): Cookie[]; setAll(c: Cookie[]): void } | null = null;

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { getAll(): Cookie[]; setAll(c: Cookie[]): void } }) => {
    capturedCookieAdapter = opts.cookies;
    return {
      auth: {
        getUser: async () => {
          if (mockRefresh) capturedCookieAdapter!.setAll(mockRefresh); // simulate a token refresh mid-call
          if (mockThrow) throw new Error('auth server unreachable');
          return { data: { user: mockUser } };
        },
      },
    };
  },
}));

import { updateSession } from './middleware';

function fakeRequest(cookies: Record<string, string> = {}) {
  const store = new Map(Object.entries(cookies));
  return {
    headers: new Headers(),
    cookies: {
      getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => store.set(name, value),
      _store: store,
    },
  } as never;
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

beforeEach(() => {
  mockUser = null;
  mockThrow = false;
  mockRefresh = null;
  capturedCookieAdapter = null;
});

it('returns the validated user on the happy path', async () => {
  mockUser = { id: 'user_1' };
  const { user, response } = await updateSession(fakeRequest({ 'sb-x-auth-token': 'valid' }));
  expect(user).toEqual({ id: 'user_1' });
  expect(response).toBeDefined();
});

it('propagates a refreshed cookie to BOTH the request and the response', async () => {
  mockUser = { id: 'user_1' };
  mockRefresh = [{ name: 'sb-x-auth-token', value: 'REFRESHED', options: { path: '/' } }];
  const req = fakeRequest({ 'sb-x-auth-token': 'STALE' });
  const { response } = await updateSession(req);
  // request side — the same-request RSC reads this store via cookies()
  expect((req as unknown as { cookies: { _store: Map<string, string> } }).cookies._store.get('sb-x-auth-token')).toBe('REFRESHED');
  // response side — the browser receives the Set-Cookie
  const set = (response as unknown as { cookies: { _set: Cookie[] } }).cookies._set;
  expect(set).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'sb-x-auth-token', value: 'REFRESHED' })]));
});

it('FAILS OPEN when getUser() throws (never bubbles a 500 to every navigation)', async () => {
  mockThrow = true;
  await expect(updateSession(fakeRequest())).resolves.toEqual(
    expect.objectContaining({ user: null, response: expect.anything() }),
  );
});

it('no-ops (no client) when Supabase env is absent', async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { user } = await updateSession(fakeRequest());
  expect(user).toBeNull();
  expect(capturedCookieAdapter).toBeNull(); // createServerClient never constructed
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
});
