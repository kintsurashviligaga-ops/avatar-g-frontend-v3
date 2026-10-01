/** @jest-environment node */
// The one-field sign-in (purpose 'continue'): ONE code for anyone, and the answer never says whether the address
// already had an account.

jest.mock('server-only', () => ({}));
const mockGenerateLink = jest.fn();
jest.mock('../../../../../lib/supabase/server', () => ({
  isSupabaseConfiguredServer: () => true,
  createServiceRoleClient: () => ({ auth: { admin: { generateLink: (...a: unknown[]) => mockGenerateLink(...a) } } }),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { AUTH: {}, AUTH_IP: {} },
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

describe("purpose 'signin' is unchanged", () => {
  it('an unknown address gets OK and NO account', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });
    const res = await send({ email: 'ghost@example.com', purpose: 'signin' });
    expect(await res.json()).toEqual({ ok: true });
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mail).not.toHaveBeenCalled();
  });
});
