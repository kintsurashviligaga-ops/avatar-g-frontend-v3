/** @jest-environment node */
import { callAction, placeCall, readCallPermission } from './metaCalls';

const CFG = { token: 'TEST_TOKEN_NOT_REAL', phoneNumberId: '100000000000001', graphVersion: 'v25.0' };

function fakeFetch(status: number, body: unknown) {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe('Meta Calling API requests (mocked fetch)', () => {
  it('pre_accept / accept send the SDP answer; accept carries our opaque reference', async () => {
    const { f, seen } = fakeFetch(200, { success: true });
    expect(await callAction({ callId: 'wacid.X', action: 'accept', sdpAnswer: 'v=0', opaque: 'nonce1' }, CFG, f)).toEqual({ ok: true, status: 200, errorCode: null });
    expect(seen[0]!.url).toBe('https://graph.facebook.com/v25.0/100000000000001/calls');
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({
      messaging_product: 'whatsapp', call_id: 'wacid.X', action: 'accept', session: { sdp_type: 'answer', sdp: 'v=0' }, biz_opaque_callback_data: 'nonce1',
    });
    await callAction({ callId: 'wacid.X', action: 'reject' }, CFG, f);
    expect(JSON.parse(String(seen[1]!.init.body))).toEqual({ messaging_product: 'whatsapp', call_id: 'wacid.X', action: 'reject' });
  });

  it('refuses to accept without an SDP, and without config', async () => {
    const { f, seen } = fakeFetch(200, {});
    expect(await callAction({ callId: 'wacid.X', action: 'accept' }, CFG, f)).toMatchObject({ ok: false });
    expect(await callAction({ callId: 'wacid.X', action: 'reject' }, null, f)).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });

  it('reports Meta\'s error code and never logs the token', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { f } = fakeFetch(400, { error: { code: 138006, message: 'x' } });
    expect(await callAction({ callId: 'wacid.X', action: 'terminate' }, CFG, f)).toEqual({ ok: false, status: 400, errorCode: 138006 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('TEST_TOKEN_NOT_REAL');
    warn.mockRestore();
  });

  it('a network failure is a result, not a throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect(await callAction({ callId: 'wacid.X', action: 'reject' }, CFG, f)).toEqual({ ok: false, status: null, errorCode: null });
    warn.mockRestore();
  });

  it('placeCall returns Meta\'s new call id', async () => {
    const { f, seen } = fakeFetch(200, { messaging_product: 'whatsapp', calls: [{ id: 'wacid.NEW' }] });
    expect(await placeCall({ to: '995555000111', sdpOffer: 'v=0', opaque: 'o' }, CFG, f)).toMatchObject({ ok: true, callId: 'wacid.NEW' });
    expect(JSON.parse(String(seen[0]!.init.body))).toMatchObject({ to: '995555000111', action: 'connect', session: { sdp_type: 'offer' } });
  });

  it('reads call permission; anything unreadable is unknown (treated as no permission)', async () => {
    expect(await readCallPermission('995555000111', CFG, fakeFetch(200, { permission: { status: 'granted' } }).f)).toBe('granted');
    expect(await readCallPermission('995555000111', CFG, fakeFetch(200, { permission: { status: 'temporary' } }).f)).toBe('granted');
    expect(await readCallPermission('995555000111', CFG, fakeFetch(200, { permission: { status: 'denied' } }).f)).toBe('none');
    expect(await readCallPermission('995555000111', CFG, fakeFetch(500, {}).f)).toBe('unknown');
    expect(await readCallPermission('bad', CFG, fakeFetch(200, {}).f)).toBe('unknown');
  });
});
