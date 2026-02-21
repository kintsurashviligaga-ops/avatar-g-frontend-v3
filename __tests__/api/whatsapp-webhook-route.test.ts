/** @jest-environment node */

import { GET, POST } from '../../app/api/webhooks/whatsapp/route';

describe('/api/webhooks/whatsapp', () => {
  const originalToken = process.env.WHATSAPP_VERIFY_TOKEN;

  afterEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = originalToken;
  });

  test('returns challenge for valid verify token', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-token';

    const req = new Request(
      'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=12345'
    );

    const res = await GET(req as never);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe('12345');
  });

  test('returns 403 for invalid token', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-token';

    const req = new Request(
      'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'
    );

    const res = await GET(req as never);
    const body = await res.text();

    expect(res.status).toBe(403);
    expect(body).toBe('Forbidden');
  });

  test('POST returns { ok: true } even for unexpected payload', async () => {
    const req = new Request('http://localhost:3000/api/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });

    const res = await POST(req as never);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
  });
});
