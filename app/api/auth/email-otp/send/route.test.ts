/** @jest-environment node */
// The one-field sign-in (purpose 'continue'): ONE code for anyone, and the answer never says whether the address
// already had an account.

jest.mock('server-only', () => ({}));
const mockGenerateLink = jest.fn();
const mockUpdateUser = jest.fn(async () => ({ data: null, error: null }));
// public.auth_account_status: an account exists unless a test says otherwise.
const mockRpc = jest.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: { message?: string } | null }> => ({
  data: { exists: true, confirmed: true, password: null }, error: null,
}));
jest.mock('../../../../../lib/supabase/server', () => ({
  isSupabaseConfiguredServer: () => true,
  createServiceRoleClient: () => ({
    auth: { admin: {
      generateLink: (...a: unknown[]) => mockGenerateLink(...a),
      updateUserById: (...a: unknown[]) => mockUpdateUser(...a),
    } },
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}));
const mockByKey = jest.fn(async (..._a: unknown[]): Promise<Response | null> => null);
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: (...a: unknown[]) => mockByKey(...a),
  RATE_LIMITS: { AUTH: {}, AUTH_IP: {}, OTP_ADDRESS: { keyPrefix: 'rl:otp:addr' } },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const send = (body: Record<string, unknown>) =>
  POST(new NextRequest('https://myavatar.ge/api/auth/email-otp/send', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

const mail = jest.fn();
beforeEach(() => {
  mockGenerateLink.mockReset();
  mockRpc.mockClear();
  mockByKey.mockReset().mockResolvedValue(null);
  mail.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = mail as unknown as typeof fetch;
});

const otp = (code: string) => ({ data: { properties: { email_otp: code } }, error: null });

describe("purpose 'continue'", () => {
  it('an existing account gets a sign-in code', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('123456'));
    const res = await send({ email: 'Known@Example.com', purpose: 'continue', locale: 'ka' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, length: 6 });
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'known@example.com' });
    const sent = JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body));
    expect(sent.to).toEqual(['known@example.com']);
    expect(sent.subject).toContain('123456');
  });

  it('a new address gets its account created (random password) and a code — with the SAME answer', async () => {
    mockGenerateLink
      .mockResolvedValueOnce({ data: null, error: { message: 'User not found' } })
      .mockResolvedValueOnce(otp('654321'));
    const res = await send({ email: 'new@example.com', purpose: 'continue', locale: 'en' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, length: 6 });
    const [, second] = mockGenerateLink.mock.calls;
    expect(second[0]).toMatchObject({ type: 'signup', email: 'new@example.com' });
    expect(String(second[0].password).length).toBeGreaterThanOrEqual(32); // nobody can guess it
    expect(JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body)).subject).toContain('654321');
  });

  it('a real provider failure is a failure, not a fake "sent"', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });
    const res = await send({ email: 'a@example.com', purpose: 'continue' });
    expect(res.status).toBe(502);
    expect(mail).not.toHaveBeenCalled();
  });

  it('never needs a password', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('111111'));
    const res = await send({ email: 'a@example.com', purpose: 'continue' });
    expect(res.status).toBe(200);
  });
});

describe('pre-account takeover', () => {
  it("an UNCONFIRMED account's password (anyone could have set it) is replaced before its owner gets in", async () => {
    mockUpdateUser.mockClear();
    mockGenerateLink.mockResolvedValueOnce({ data: { user: { id: 'u1', email_confirmed_at: null }, properties: { email_otp: '222222' } }, error: null });
    await send({ email: 'victim@example.com', purpose: 'continue' });
    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { password: expect.any(String) });
  });
  it('a confirmed account keeps its password', async () => {
    mockUpdateUser.mockClear();
    mockGenerateLink.mockResolvedValueOnce({ data: { user: { id: 'u2', email_confirmed_at: '2026-01-01' }, properties: { email_otp: '333333' } }, error: null });
    await send({ email: 'member@example.com', purpose: 'continue' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe("purpose 'signin' (log in with a code)", () => {
  it('an existing account gets a sign-in code', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('121212'));
    const res = await send({ email: 'member@example.com', purpose: 'signin', locale: 'en' });
    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'member@example.com' });
    expect(JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body)).subject).toContain('sign-in code');
  });
  it('an unknown address is told „no account" — Supabase Auth is never asked, so nothing is created or mailed', async () => {
    // GoTrue turns a magiclink for an unknown address into a sign-up and CREATES the user (Production, 2026-10-09).
    mockRpc.mockResolvedValueOnce({ data: { exists: false, confirmed: false, password: null }, error: null });
    const res = await send({ email: 'Ghost@Example.com', purpose: 'signin' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_account' });
    expect(mockRpc).toHaveBeenCalledWith('auth_account_status', { p_email: 'ghost@example.com', p_phone: null });
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
  it('an unfinished sign-up (row exists, unconfirmed) still gets its code', async () => {
    mockRpc.mockResolvedValueOnce({ data: { exists: true, confirmed: false, password: false }, error: null });
    mockGenerateLink.mockResolvedValueOnce(otp('131313'));
    const res = await send({ email: 'pending@example.com', purpose: 'signin' });
    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'pending@example.com' });
  });
  it('if the database cannot answer, log-in still works (falls through to Supabase Auth)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } });
    mockGenerateLink.mockResolvedValueOnce(otp('141414'));
    const res = await send({ email: 'member@example.com', purpose: 'signin' });
    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
  });
  it('a GoTrue „user not found" is still answered no_account', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });
    const res = await send({ email: 'ghost@example.com', purpose: 'signin' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_account' });
    expect(mail).not.toHaveBeenCalled();
  });
});

describe("purpose 'register' (sign up) — an address with an account cannot register again", () => {
  it('a new address gets an unconfirmed account (random password, password_set false) and a confirmation code', async () => {
    mockUpdateUser.mockClear();
    mockGenerateLink.mockResolvedValueOnce({ data: { user: { id: 'n1', email_confirmed_at: null }, properties: { email_otp: '424242' } }, error: null });
    const res = await send({ email: 'New@Example.com', purpose: 'register', locale: 'ka' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, length: 6 });
    const [args] = mockGenerateLink.mock.calls[0] as [{ type: string; email: string; password: string; options: { data: Record<string, unknown> } }];
    expect(args).toMatchObject({ type: 'signup', email: 'new@example.com', options: { data: { password_set: false } } });
    expect(args.password.length).toBeGreaterThanOrEqual(32);
    const sent = JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body));
    expect(sent.subject).toContain('424242');
    expect(sent.subject).toContain('დაადასტურეთ');
  });
  it('a CONFIRMED address is refused with account_exists — no code, no mail', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } });
    const res = await send({ email: 'member@example.com', purpose: 'register' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'account_exists' });
    expect(mail).not.toHaveBeenCalled();
  });
  it('an unfinished sign-up (unconfirmed) is not an account: a fresh code, and any stranger-chosen password is replaced', async () => {
    mockUpdateUser.mockClear();
    mockGenerateLink.mockResolvedValueOnce({ data: { user: { id: 'p1', email_confirmed_at: null }, properties: { email_otp: '515151' } }, error: null });
    const res = await send({ email: 'pending@example.com', purpose: 'register' });
    expect(res.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith('p1', { password: expect.any(String) });
  });
});

describe("purpose 'recovery' (forgot password) — a reset CODE by email", () => {
  it('an existing account gets a recovery code', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('909090'));
    const res = await send({ email: 'member@example.com', purpose: 'recovery', locale: 'ru' });
    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'member@example.com' });
    const sent = JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body));
    expect(sent.subject).toContain('909090');
    expect(sent.subject).toContain('сброса пароля');
  });
  it('an unknown address is told „no account" and nothing is mailed', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });
    const res = await send({ email: 'ghost@example.com', purpose: 'recovery' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_account' });
    expect(mail).not.toHaveBeenCalled();
  });
  it('never changes the password itself — the person sets it after the code', async () => {
    mockUpdateUser.mockClear();
    mockGenerateLink.mockResolvedValueOnce({ data: { user: { id: 'm1', email_confirmed_at: '2026-01-01' }, properties: { email_otp: '808080' } }, error: null });
    await send({ email: 'member@example.com', purpose: 'recovery' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe("the legacy 'signup' purpose is retired without revealing who is registered", () => {
  it('answers the same 410 for ANY address, and creates nothing', async () => {
    for (const email of ['member@example.com', 'nobody@example.com']) {
      const res = await send({ email, purpose: 'signup', password: 'chosen-by-requester' });
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: 'client_outdated' });
    }
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});

describe('the address budget (inbox flooding)', () => {
  it('is checked by a HASH of the address — no plain email in the limiter — and only the short window', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('777777'));
    await send({ email: 'Victim@Example.com', purpose: 'continue' });
    expect(mockByKey).toHaveBeenCalledTimes(1); // no 24-h bucket: it let anyone lock a person out for a day
    const [key, cap] = mockByKey.mock.calls[0] as [string, { keyPrefix: string }];
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain('victim');
    expect(cap.keyPrefix).toBe('rl:otp:addr');
  });
  it('refuses BEFORE a code is generated, so the one already in the inbox stays valid', async () => {
    mockByKey.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const res = await send({ email: 'victim@example.com', purpose: 'continue' });
    expect(res.status).toBe(429);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});

describe('the code length (the Supabase project setting, 6–10 digits)', () => {
  it('mails a longer code and tells the sheet its length', async () => {
    mockGenerateLink.mockResolvedValueOnce(otp('01234567'));
    const res = await send({ email: 'member@example.com', purpose: 'signin', locale: 'ka' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, length: 8 });
    const sent = JSON.parse(String((mail.mock.calls[0][1] as RequestInit).body));
    expect(sent.subject).toContain('01234567');
  });

  it('refuses a code it cannot read, logs the shape without the value, and mails nothing', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateLink.mockResolvedValueOnce(otp('12345'));
    const res = await send({ email: 'member@example.com', purpose: 'signin' });
    expect(res.status).toBe(502);
    expect(mail).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(
      '[email-otp/send] no email_otp in generateLink response: keys=[properties] properties=[email_otp] email_otp=string(5, digits)',
    );
    expect(JSON.stringify(err.mock.calls)).not.toContain('12345"');
    err.mockRestore();
  });
});
