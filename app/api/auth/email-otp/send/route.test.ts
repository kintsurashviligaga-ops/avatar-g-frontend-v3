/** @jest-environment node */
// The one-field sign-in (purpose 'continue'): ONE code for anyone, and the answer never says whether the address
// already had an account.

jest.mock('server-only', () => ({}));
const mockGenerateLink = jest.fn();
const mockUpdateUser = jest.fn(async () => ({ data: null, error: null }));
jest.mock('../../../../../lib/supabase/server', () => ({
  isSupabaseConfiguredServer: () => true,
  createServiceRoleClient: () => ({ auth: { admin: {
    generateLink: (...a: unknown[]) => mockGenerateLink(...a),
    updateUserById: (...a: unknown[]) => mockUpdateUser(...a),
  } } }),
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
    expect(await res.json()).toEqual({ ok: true });
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
    expect(await res.json()).toEqual({ ok: true });
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

describe("purpose 'signin' is unchanged", () => {
  it('an unknown address gets OK and NO account', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });
    const res = await send({ email: 'ghost@example.com', purpose: 'signin' });
    expect(await res.json()).toEqual({ ok: true });
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mail).not.toHaveBeenCalled();
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
