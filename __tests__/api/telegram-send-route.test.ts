/** @jest-environment node */

import { POST } from '@/app/api/telegram/send/route';
import { sendTelegramTextMessage } from '@/lib/server/telegram';

jest.mock('@/lib/server/telegram', () => ({
  sendTelegramTextMessage: jest.fn(async () => ({ ok: true, status: 200 })),
}));

describe('/api/telegram/send', () => {
  beforeEach(() => {
    process.env.ADMIN_KEY = 'admin-secret';
  });

  test('returns 401 when admin key is missing', async () => {
    const req = new Request('http://localhost/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  test('sends telegram message with valid admin key', async () => {
    const req = new Request('http://localhost/api/telegram/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'admin-secret',
      },
      body: JSON.stringify({ message: 'hello telegram' }),
    });

    const res = await POST(req as never);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(sendTelegramTextMessage).toHaveBeenCalledWith({ text: 'hello telegram', chatId: undefined });
  });
});
