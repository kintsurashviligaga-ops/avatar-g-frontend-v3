/**
 * lib/calls/whatsapp/metaCalls.ts — the Calling API requests our app makes to Meta (POST /<PHONE_NUMBER_ID>/calls).
 * The Graph token lives only here, on the server; the bridge never sees it.
 *
 *   pre_accept  our SDP answer, before media (recommended by Meta: avoids clipped first words)
 *   accept      the same SDP answer; media may flow only after Meta's 200 OK
 *   reject      refuse a call (a gate said no)
 *   terminate   hang up (end_call, the per-call cap, a bridge failure). Meta asks for it even after an RTCP BYE.
 *   connect     place a business-initiated call with our SDP offer (needs the person's call permission)
 *
 * Every function answers a result and never throws; failures are logged with Meta's status and error code only.
 */
import { whatsappConfig, type WhatsAppConfig } from '@/lib/agent-g/channels/whatsapp-client';

export type CallAction = 'pre_accept' | 'accept' | 'reject' | 'terminate';

export interface MetaResult { ok: boolean; status: number | null; errorCode: number | null }

const TIMEOUT_MS = 8_000;

type Fetch = typeof fetch;

async function post(cfg: WhatsAppConfig, body: Record<string, unknown>, f: Fetch): Promise<MetaResult & { json: Record<string, unknown> }> {
  try {
    const res = await f(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = json.error as { code?: unknown } | undefined;
    const errorCode = typeof err?.code === 'number' ? err.code : null;
    const ok = res.ok && json.success !== false;
    if (!ok) console.warn('[WhatsApp.Calls] refused', { action: body.action, status: res.status, error_code: errorCode });
    return { ok, status: res.status, errorCode, json };
  } catch (error) {
    console.warn('[WhatsApp.Calls] failed', { action: body.action, error: error instanceof Error ? error.name : 'unknown' });
    return { ok: false, status: null, errorCode: null, json: {} };
  }
}

export async function callAction(
  input: { callId: string; action: CallAction; sdpAnswer?: string; opaque?: string },
  cfg: WhatsAppConfig | null = whatsappConfig(),
  f: Fetch = fetch,
): Promise<MetaResult> {
  if (!cfg) return { ok: false, status: null, errorCode: null };
  const needsSdp = input.action === 'pre_accept' || input.action === 'accept';
  if (needsSdp && !input.sdpAnswer) return { ok: false, status: null, errorCode: null };
  const { json: _json, ...r } = await post(cfg, {
    call_id: input.callId,
    action: input.action,
    ...(needsSdp ? { session: { sdp_type: 'answer', sdp: input.sdpAnswer } } : {}),
    ...(input.action === 'accept' && input.opaque ? { biz_opaque_callback_data: input.opaque.slice(0, 512) } : {}),
  }, f);
  return r;
}

/** Place a business-initiated call. Meta answers the new call id; the person's answer SDP comes in a `connect` webhook. */
export async function placeCall(
  input: { to: string; sdpOffer: string; opaque: string },
  cfg: WhatsAppConfig | null = whatsappConfig(),
  f: Fetch = fetch,
): Promise<MetaResult & { callId: string | null }> {
  if (!cfg) return { ok: false, status: null, errorCode: null, callId: null };
  const r = await post(cfg, {
    to: input.to,
    action: 'connect',
    session: { sdp_type: 'offer', sdp: input.sdpOffer },
    biz_opaque_callback_data: input.opaque.slice(0, 512),
  }, f);
  const calls = Array.isArray(r.json.calls) ? (r.json.calls as Array<{ id?: unknown }>) : [];
  const callId = typeof calls[0]?.id === 'string' ? calls[0].id : null;
  return { ok: r.ok && !!callId, status: r.status, errorCode: r.errorCode, callId };
}

/**
 * The person's WhatsApp call permission for our number (GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=…).
 * 'granted' covers a permanent and a temporary (7-day) permission; anything unreadable is 'unknown', which the gates
 * treat as no permission.
 */
export async function readCallPermission(
  waId: string,
  cfg: WhatsAppConfig | null = whatsappConfig(),
  f: Fetch = fetch,
): Promise<'granted' | 'none' | 'unknown'> {
  if (!cfg || !/^\d{6,20}$/.test(waId)) return 'unknown';
  try {
    const res = await f(
      `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(waId)}`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return 'unknown';
    const json = (await res.json().catch(() => ({}))) as { permission?: { status?: unknown } };
    const s = typeof json.permission?.status === 'string' ? json.permission.status.toLowerCase() : '';
    if (s === 'granted' || s === 'temporary') return 'granted';
    if (s) return 'none';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
