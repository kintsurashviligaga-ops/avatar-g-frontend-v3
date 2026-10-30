/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { liveRelayUrl, liveTokenMinter, relayTicketMinter } from './liveMint';
import { lockDigests, subjectOf, verifyTicket } from './relay/ticket';

const SECRET = 'k'.repeat(48);
const URL_OK = 'wss://live-relay-abc.a.run.app/v1/live';

describe('liveTokenMinter', () => {
  it('is null unless both the relay URL and a long enough secret are set (the Developer API is never a fallback)', () => {
    expect(liveTokenMinter({})).toBeNull();
    expect(liveTokenMinter({ LIVE_RELAY_URL: URL_OK })).toBeNull();
    expect(liveTokenMinter({ LIVE_RELAY_TICKET_SECRET: SECRET })).toBeNull();
    expect(liveTokenMinter({ LIVE_RELAY_URL: URL_OK, LIVE_RELAY_TICKET_SECRET: 'short' })).toBeNull();
    expect(liveTokenMinter({ LIVE_RELAY_URL: URL_OK, LIVE_RELAY_TICKET_SECRET: SECRET, GEMINI_API_KEY: 'AQ.x' })?.wsUrl).toBe(URL_OK);
    expect(liveTokenMinter({ GEMINI_API_KEY: 'AQ.x', GOOGLE_API_KEY: 'x' })).toBeNull();
  });

  it('takes only a plain wss:// relay URL', () => {
    expect(liveRelayUrl(` ${URL_OK}/ `)).toBe(URL_OK);
    for (const bad of ['https://relay/v1/live', 'ws://relay/v1/live', 'wss://u:p@relay/v1/live', 'wss://relay/v1/live?x=1', 'wss://relay/#a', 'nope', '']) {
      expect(liveRelayUrl(bad)).toBeNull();
    }
  });
});

describe('relayTicketMinter', () => {
  const now = Date.parse('2026-10-25T03:00:00Z');
  const setup = { model: 'models/gemini-2.5-flash-native-audio-latest', systemInstruction: { parts: [{ text: 'locked' }] } };
  const request = {
    uses: 1 as const,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
    bidiGenerateContentSetup: setup,
    subject: 'user-1',
  };

  it('answers 200 { name } with a ticket that locks the setup, signed locally (no network)', async () => {
    const net = jest.spyOn(global, 'fetch');
    const res = await relayTicketMinter(URL_OK, SECRET, () => now).mint(request, 1000);
    expect(res.status).toBe(200);
    const { name } = (await res.json()) as { name: string };
    const r = verifyTicket(SECRET, name, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claims).toMatchObject({ sub: subjectOf('user-1'), iat: now, nse: now + 2 * 60_000, exp: now + 30 * 60_000, d: lockDigests(setup) });
    expect(net).not.toHaveBeenCalled();
    net.mockRestore();
  });

  it('refuses an expiry in the past', async () => {
    const res = await relayTicketMinter(URL_OK, SECRET, () => now).mint({ ...request, expireTime: new Date(now - 1).toISOString() }, 1000);
    expect(res.status).toBe(500);
  });
});
