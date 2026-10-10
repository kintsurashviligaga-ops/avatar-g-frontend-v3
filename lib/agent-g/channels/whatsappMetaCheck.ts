/**
 * lib/agent-g/channels/whatsappMetaCheck.ts — is our WhatsApp Business setup ready for Calling? READ ONLY.
 *
 * Every request is a documented Graph GET (field names verified 2026-10-10 against Meta's reference pages,
 * docs/handoffs/omnichannel/research/meta-verification-2026-10-10.md §C). Nothing is written, enabled or subscribed.
 *
 * WHAT IS NEVER RETURNED: the access token, the app secret or app token, a SIP password (`include_sip_credentials` is
 * never asked for), a callback URL's path, a payment method's id, the full business number. Each check answers a plain
 * state and, when it could not be read, the exact reason (HTTP status and Meta's error code), so the owner is asked to
 * act only for what this cannot read.
 *
 * Meta has NO single "calling eligible" field. Readiness is the documented prerequisites, each its own check:
 *   Cloud API number · messaging limit ≥ 2,000 (not TIER_250, error 138015 otherwise) · a payment method on the
 *   Messaging account (`primary_funding_id`; 131044 without it) · Calling enabled in the number's settings with no
 *   restriction · the app subscribed to the WABA and to the `calls` webhook field · the number able to send.
 * Webhook ready is NOT calling ready: `messages` alone says nothing about calls.
 */
import { GRAPH_VERSION_DEFAULT } from './whatsapp-client';

export type CheckState = 'pass' | 'fail' | 'unknown';

export interface MetaCheckItem {
  id: string;
  label: string;
  state: CheckState;
  /** What was read (non-secret), or why it could not be read. */
  detail: string;
}

export interface MetaCheckReport {
  checkedAt: string;
  graphVersion: string;
  configured: { token: boolean; phoneNumberId: boolean; wabaId: boolean; appId: boolean; appSecret: boolean };
  number: { masked: string | null; countryDialCode: string | null; country: string | null };
  items: MetaCheckItem[];
  webhookReady: CheckState;
  callingReady: CheckState;
}

export interface MetaCheckEnv {
  token: string;
  phoneNumberId: string;
  graphVersion?: string;
  wabaId?: string;
  appId?: string;
  appSecret?: string;
}

type Fetch = typeof fetch;
type Json = Record<string, unknown>;
type Read = { ok: true; json: Json } | { ok: false; why: string };

const rec = (x: unknown): Json => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Json) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

export function metaCheckEnv(env: NodeJS.ProcessEnv = process.env): MetaCheckEnv | null {
  const pick = (...v: Array<string | undefined>) => v.map((s) => (s ?? '').trim()).find(Boolean) ?? '';
  const token = pick(env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_TOKEN, env.WHATSAPP_API_TOKEN, env.META_WHATSAPP_TOKEN, env.WHATSAPP_CLOUD_API_TOKEN);
  const phoneNumberId = pick(env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_PHONE_ID, env.META_WHATSAPP_PHONE_NUMBER_ID);
  if (!token || !phoneNumberId) return null;
  const v = pick(env.WHATSAPP_GRAPH_VERSION);
  return {
    token,
    phoneNumberId,
    graphVersion: /^v\d+\.\d+$/.test(v) ? v : GRAPH_VERSION_DEFAULT,
    wabaId: pick(env.WHATSAPP_BUSINESS_ACCOUNT_ID, env.WHATSAPP_WABA_ID) || undefined,
    appId: pick(env.WHATSAPP_APP_ID, env.META_APP_ID) || undefined,
    appSecret: pick(env.WHATSAPP_APP_SECRET) || undefined,
  };
}

/** `+995 ••• ••• •12` — the country code and the last two digits only. */
export function maskNumber(display: string | null): string | null {
  const d = (display ?? '').replace(/\D/g, '');
  if (d.length < 6) return null;
  const cc = d.startsWith('995') ? '995' : d.slice(0, d.length > 11 ? 3 : 1);
  return `+${cc} ••• ••• •${d.slice(-2)}`;
}

const COUNTRY_BY_DIAL: Record<string, string> = { '995': 'Georgia (GE)', '1': 'US/Canada (NANP)', '44': 'United Kingdom', '49': 'Germany', '380': 'Ukraine', '7': 'Russia/Kazakhstan' };

async function graphGet(e: MetaCheckEnv, path: string, f: Fetch, bearer = e.token): Promise<Read> {
  try {
    const res = await f(`https://graph.facebook.com/${e.graphVersion ?? GRAPH_VERSION_DEFAULT}/${path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const json = rec(await res.json().catch(() => ({})));
    if (res.ok) return { ok: true, json };
    const err = rec(json.error);
    const code = typeof err.code === 'number' ? err.code : null;
    const sub = typeof err.error_subcode === 'number' ? `/${err.error_subcode}` : '';
    return { ok: false, why: `HTTP ${res.status}${code !== null ? `, Meta error ${code}${sub}` : ''}` };
  } catch (error) {
    return { ok: false, why: `no answer (${error instanceof Error ? error.name : 'network'})` };
  }
}

export async function runMetaCheck(e: MetaCheckEnv, f: Fetch = fetch, now: Date = new Date()): Promise<MetaCheckReport> {
  const items: MetaCheckItem[] = [];
  const add = (id: string, label: string, state: CheckState, detail: string) => items.push({ id, label, state, detail });
  const appToken = e.appId && e.appSecret ? `${e.appId}|${e.appSecret}` : null;

  // 1. The number.
  const phone = await graphGet(e, `${encodeURIComponent(e.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,whatsapp_business_manager_messaging_limit,health_status`, f);
  let masked: string | null = null;
  let dial: string | null = null;
  let limit: string | null = null;
  let canSend: string | null = null;
  if (phone.ok) {
    const p = phone.json;
    masked = maskNumber(str(p.display_phone_number));
    const d = (str(p.display_phone_number) ?? '').replace(/\D/g, '');
    dial = d.startsWith('995') ? '995' : Object.keys(COUNTRY_BY_DIAL).find((k) => d.startsWith(k)) ?? null;
    limit = str(p.whatsapp_business_manager_messaging_limit);
    canSend = str(rec(p.health_status).can_send_message);
    add('number', 'Business number', str(p.status) === 'CONNECTED' ? 'pass' : 'fail', `status ${str(p.status) ?? '—'}, display name ${str(p.name_status) ?? '—'}, verified name set: ${str(p.verified_name) ? 'yes' : 'no'}, code ${str(p.code_verification_status) ?? '—'}`);
    add('quality', 'Quality rating', str(p.quality_rating) === 'GREEN' ? 'pass' : str(p.quality_rating) ? 'fail' : 'unknown', str(p.quality_rating) ?? 'not returned');
    add('messaging_limit', 'Messaging limit ≥ 2,000 (Calling needs it)', !limit ? 'unknown' : limit === 'TIER_250' ? 'fail' : 'pass', limit ?? 'not returned');
    add('can_send', 'Number can send (health status)', canSend === 'AVAILABLE' ? 'pass' : canSend ? 'fail' : 'unknown', canSend ?? 'not returned');
  } else {
    add('number', 'Business number', 'unknown', `could not read the number: ${phone.why}`);
  }

  // 2. Which WABA (Messaging account): configured, else from the token's granular scopes (needs the app token).
  let wabaId = e.wabaId ?? null;
  if (appToken) {
    const dbg = await graphGet(e, `debug_token?input_token=${encodeURIComponent(e.token)}`, f, appToken);
    if (dbg.ok) {
      const d = rec(dbg.json.data);
      const scopes = arr(d.scopes).filter((s): s is string => typeof s === 'string');
      const need = ['whatsapp_business_management', 'whatsapp_business_messaging'];
      const missing = need.filter((s) => !scopes.includes(s));
      const exp = Number(d.expires_at);
      add('token', 'Access token (valid, scopes, expiry)', d.is_valid === true && !missing.length ? 'pass' : 'fail',
        `valid: ${d.is_valid === true ? 'yes' : 'no'}; missing scopes: ${missing.join(', ') || 'none'}; expires: ${exp === 0 ? 'never' : Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000).toISOString().slice(0, 10) : 'unknown'}`);
      if (!wabaId) {
        const g = arr(d.granular_scopes).map(rec).find((s) => s.scope === 'whatsapp_business_management');
        const ids = arr(g?.target_ids).filter((x): x is string => typeof x === 'string');
        if (ids.length === 1) wabaId = ids[0]!;
      }
    } else {
      add('token', 'Access token (valid, scopes, expiry)', 'unknown', `debug_token: ${dbg.why}`);
    }
  } else {
    add('token', 'Access token (valid, scopes, expiry)', 'unknown', 'needs WHATSAPP_APP_ID (the Meta app id; not secret) next to WHATSAPP_APP_SECRET on the server');
  }

  // 3. The Messaging account (WABA): verification, payment method, its numbers.
  if (wabaId) {
    const w = await graphGet(e, `${encodeURIComponent(wabaId)}?fields=id,name,account_review_status,business_verification_status,country,ownership_type,currency,status,primary_funding_id`, f);
    if (w.ok) {
      const j = w.json;
      add('waba', 'WhatsApp Business account (WABA)', str(j.account_review_status) === 'APPROVED' ? 'pass' : str(j.account_review_status) ? 'fail' : 'unknown',
        `review ${str(j.account_review_status) ?? '—'}, status ${str(j.status) ?? '—'}, country ${str(j.country) ?? '—'}, currency ${str(j.currency) ?? '—'}`);
      const bv = str(j.business_verification_status);
      // Not required for calling (Calling FAQ, 2026-09-29); it raises the messaging limit.
      add('business_verification', 'Business verification (not required for Calling)', bv === 'verified' ? 'pass' : bv ? 'fail' : 'unknown', bv ?? 'not returned');
      add('payment_method', 'Payment method on the Messaging account (Calling needs it)', str(j.primary_funding_id) ? 'pass' : 'fail',
        str(j.primary_funding_id) ? 'present (id not shown)' : 'absent: Meta says the account then cannot send paid messages or use Calling');
    } else {
      add('waba', 'WhatsApp Business account (WABA)', 'unknown', `could not read the WABA: ${w.why}`);
    }
    const list = await graphGet(e, `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,account_mode,host_platform,country_code,country_dial_code`, f);
    if (list.ok) {
      const mine = arr(list.json.data).map(rec).find((p) => String(p.id) === e.phoneNumberId);
      if (mine) {
        dial = str(mine.country_dial_code) ?? dial;
        add('cloud_api', 'Number on the Cloud API, live mode', str(mine.host_platform) === 'CLOUD_API' && str(mine.account_mode) === 'LIVE' ? 'pass' : 'fail',
          `host ${str(mine.host_platform) ?? '—'}, mode ${str(mine.account_mode) ?? '—'}, country ${str(mine.country_code) ?? '—'}`);
      } else {
        add('cloud_api', 'Number on the Cloud API, live mode', 'fail', 'the configured number is not in this WABA');
      }
    } else {
      add('cloud_api', 'Number on the Cloud API, live mode', 'unknown', `could not list the WABA's numbers: ${list.why}`);
    }
    const subs = await graphGet(e, `${encodeURIComponent(wabaId)}/subscribed_apps`, f);
    if (subs.ok) {
      const apps = arr(subs.json.data).map((x) => rec(rec(x).whatsapp_business_api_data));
      const ours = e.appId ? apps.some((a) => String(a.id) === e.appId) : apps.length > 0;
      add('waba_subscription', 'App subscribed to the WABA', ours ? 'pass' : 'fail', `${apps.length} app(s) subscribed${e.appId ? `; ours ${ours ? 'is' : 'is not'} among them` : ''}`);
    } else {
      add('waba_subscription', 'App subscribed to the WABA', 'unknown', `subscribed_apps: ${subs.why}`);
    }
  } else {
    for (const [id, label] of [['waba', 'WhatsApp Business account (WABA)'], ['payment_method', 'Payment method on the Messaging account (Calling needs it)'], ['cloud_api', 'Number on the Cloud API, live mode'], ['waba_subscription', 'App subscribed to the WABA']] as const) {
      add(id, label, 'unknown', 'the WABA id is unknown: set WHATSAPP_BUSINESS_ACCOUNT_ID (not secret), or WHATSAPP_APP_ID so the token can name it');
    }
  }

  // 4. Calling settings of the number (no SIP credentials asked for).
  const settings = await graphGet(e, `${encodeURIComponent(e.phoneNumberId)}/settings`, f);
  if (settings.ok) {
    const c = rec(settings.json.calling);
    const restrictions = arr(rec(c.restrictions).restrictions_list).map((r) => str(rec(r).type)).filter(Boolean);
    const status = str(c.status);
    add('calling_enabled', 'Calling enabled on the number', status === 'ENABLED' && !restrictions.length ? 'pass' : status ? 'fail' : 'unknown',
      `status ${status ?? 'not set'}, call button ${str(c.call_icon_visibility) ?? '—'}, call-back permission request ${str(c.callback_permission_status) ?? '—'}, restrictions: ${restrictions.join(', ') || 'none'}`);
  } else {
    add('calling_enabled', 'Calling enabled on the number', 'unknown', `settings: ${settings.why}`);
  }

  // 5. Webhook fields the app is subscribed to (needs the app token).
  let webhookReady: CheckState = 'unknown';
  let callsField: CheckState = 'unknown';
  if (appToken && e.appId) {
    const s = await graphGet(e, `${encodeURIComponent(e.appId)}/subscriptions`, f, appToken);
    if (s.ok) {
      const wa = arr(s.json.data).map(rec).find((x) => x.object === 'whatsapp_business_account');
      const fields = arr(wa?.fields).map((x) => (typeof x === 'string' ? x : str(rec(x).name))).filter((x): x is string => !!x);
      let host = '—';
      try { host = new URL(String(wa?.callback_url ?? '')).host; } catch { /* not shown */ }
      webhookReady = wa && wa.active !== false && fields.includes('messages') ? 'pass' : 'fail';
      callsField = fields.includes('calls') ? 'pass' : 'fail';
      add('webhook_messages', 'Webhook subscribed to `messages`', webhookReady, wa ? `callback host ${host}, active ${wa.active === false ? 'no' : 'yes'}, fields: ${fields.join(', ') || 'none'}` : 'no whatsapp_business_account subscription');
      add('webhook_calls', 'Webhook subscribed to `calls`', callsField, fields.includes('calls') ? 'subscribed' : 'not subscribed');
    } else {
      add('webhook_messages', 'Webhook subscribed to `messages`', 'unknown', `subscriptions: ${s.why}`);
      add('webhook_calls', 'Webhook subscribed to `calls`', 'unknown', `subscriptions: ${s.why}`);
    }
  } else {
    const why = 'needs WHATSAPP_APP_ID (not secret) with WHATSAPP_APP_SECRET: Meta answers this only to the app\'s own token';
    add('webhook_messages', 'Webhook subscribed to `messages`', 'unknown', why);
    add('webhook_calls', 'Webhook subscribed to `calls`', 'unknown', why);
  }

  const need = ['messaging_limit', 'payment_method', 'calling_enabled', 'can_send', 'cloud_api', 'waba_subscription', 'webhook_calls'];
  const states = need.map((id) => items.find((i) => i.id === id)?.state ?? 'unknown');
  const callingReady: CheckState = states.includes('fail') ? 'fail' : states.includes('unknown') ? 'unknown' : 'pass';

  return {
    checkedAt: now.toISOString(),
    graphVersion: e.graphVersion ?? GRAPH_VERSION_DEFAULT,
    configured: { token: !!e.token, phoneNumberId: !!e.phoneNumberId, wabaId: !!e.wabaId, appId: !!e.appId, appSecret: !!e.appSecret },
    number: { masked, countryDialCode: dial, country: dial ? COUNTRY_BY_DIAL[dial] ?? null : null },
    items,
    webhookReady,
    callingReady,
  };
}
