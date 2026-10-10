/**
 * lib/calls/whatsapp/testFixtures.ts — MOCKED Meta `calls` webhook payloads for the tests, shaped like Meta's documented
 * examples (User-initiated calls, read 2026-10-10). Nothing here was received from Meta; no real number or call id.
 */
export const PHONE_NUMBER_ID = '100000000000001';
export const SDP_OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
export const SDP_ANSWER = 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

const wrap = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA_TEST', changes: [{ field: 'calls', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: PHONE_NUMBER_ID }, ...value } }] }],
});

export function connectPayload(o: { callId: string; from?: string | null; atSec: number; sdp?: string | null; direction?: string; fromUserId?: string }) {
  const call: Record<string, unknown> = {
    id: o.callId,
    to: '15550000000',
    event: 'connect',
    timestamp: String(o.atSec),
    direction: o.direction ?? 'USER_INITIATED',
  };
  if (o.from !== null) call.from = o.from ?? '995555000111';
  if (o.fromUserId) call.from_user_id = o.fromUserId;
  if (o.sdp !== null) call.session = { sdp_type: 'offer', sdp: o.sdp ?? SDP_OFFER };
  return wrap({ contacts: [{ profile: { name: 'Test' }, wa_id: o.from ?? '995555000111' }], calls: [call] });
}

export function terminatePayload(o: { callId: string; atSec: number; status?: unknown; duration?: number; errorCode?: number; from?: string }) {
  const call: Record<string, unknown> = {
    id: o.callId, from: o.from ?? '995555000111', to: '15550000000', event: 'terminate', direction: 'USER_INITIATED',
    timestamp: String(o.atSec), status: o.status ?? 'COMPLETED',
  };
  if (typeof o.duration === 'number') { call.duration = o.duration; call.start_time = String(o.atSec - o.duration); call.end_time = String(o.atSec); }
  return wrap({ calls: [call], ...(o.errorCode ? { errors: [{ code: o.errorCode, message: 'test' }] } : {}) });
}

export function statusPayload(o: { callId: string; atSec: number; status: string; to?: string }) {
  return wrap({ statuses: [{ id: o.callId, timestamp: String(o.atSec), type: 'call', status: o.status, recipient_id: o.to ?? '995555000111' }] });
}

export const messagesPayload = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA_TEST', changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, messages: [{ from: '995555000111', id: 'wamid.x', type: 'text', text: { body: 'hi' }, timestamp: '1760000000' }] } }] }],
};
