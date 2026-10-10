/**
 * @jest-environment node
 *
 * The read-only Meta readiness check against a MOCKED Graph API (no network). Pinned: only GETs; the token, app secret,
 * SIP credentials, payment-method id and full number never appear in the report; an unreadable value says exactly why;
 * Calling is ready only when every documented prerequisite passes (webhook `messages` alone is not enough).
 */
import { maskNumber, metaCheckEnv, runMetaCheck, type MetaCheckEnv } from './whatsappMetaCheck';

const TOKEN = 'EAAG-test-access-token-xyz';
const SECRET = 'app-secret-0123456789abcdef';
const ENV: MetaCheckEnv = { token: TOKEN, phoneNumberId: '1111', graphVersion: 'v25.0', wabaId: '2222', appId: '3333', appSecret: SECRET };

type Reply = { status?: number; body: unknown };
type Routes = Record<string, Reply>;

const READY: Routes = {
  '1111?fields': { body: { id: '1111', display_phone_number: '+995 555 12 34 12', verified_name: 'MyAvatar', quality_rating: 'GREEN', code_verification_status: 'VERIFIED', name_status: 'APPROVED', status: 'CONNECTED', whatsapp_business_manager_messaging_limit: 'TIER_2K', health_status: { can_send_message: 'AVAILABLE' } } },
  'debug_token': { body: { data: { is_valid: true, expires_at: 0, scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['2222'] }] } } },
  '2222?fields': { body: { id: '2222', name: 'MyAvatar', account_review_status: 'APPROVED', business_verification_status: 'verified', country: 'GE', currency: 'USD', status: 'ACTIVE', primary_funding_id: 'fund-987654' } },
  '2222/phone_numbers': { body: { data: [{ id: '1111', account_mode: 'LIVE', host_platform: 'CLOUD_API', country_code: 'GE', country_dial_code: '995' }] } },
  '2222/subscribed_apps': { body: { data: [{ whatsapp_business_api_data: { id: '3333', name: 'MyAvatar app' } }] } },
  '1111/settings': { body: { calling: { status: 'ENABLED', call_icon_visibility: 'DEFAULT', callback_permission_status: 'ENABLED', sip: { status: 'ENABLED', servers: [{ hostname: 'sip.example', sip_user_password: 'sip-pass-should-never-show' }] } } } },
  '3333/subscriptions': { body: { data: [{ object: 'whatsapp_business_account', callback_url: 'https://myavatar.ge/api/webhooks/whatsapp?secret=path', active: true, fields: [{ name: 'messages', version: 'v25.0' }, { name: 'calls', version: 'v25.0' }] }] } },
};

function graph(routes: Routes) {
  const calls: Array<{ url: string; method: string; auth: string }> = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? 'GET', auth: headers.Authorization ?? '' });
    const path = url.replace(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\//, '');
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    const r = key ? routes[key]! : { status: 404, body: { error: { code: 100, message: 'Unsupported get request' } } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

const state = (r: Awaited<ReturnType<typeof runMetaCheck>>, id: string) => r.items.find((i) => i.id === id);

describe('Meta readiness check (read only)', () => {
  it('a fully ready setup: every check passes, Calling ready, only GETs', async () => {
    const g = graph(READY);
    const r = await runMetaCheck(ENV, g.f, new Date('2026-10-10T17:00:00Z'));
    expect(r.items.filter((i) => i.state !== 'pass')).toEqual([]);
    expect(r).toMatchObject({ webhookReady: 'pass', callingReady: 'pass', graphVersion: 'v25.0', number: { masked: '+995 ••• ••• •12', countryDialCode: '995', country: 'Georgia (GE)' } });
    expect(g.calls.every((c) => c.method === 'GET')).toBe(true);
    // No request ever asks for SIP credentials.
    expect(g.calls.some((c) => /include_sip_credentials/.test(c.url))).toBe(false);
  });

  it('never returns the token, the app secret, the app token, a SIP password, the funding id, the callback path or the full number', async () => {
    const r = await runMetaCheck(ENV, graph(READY).f);
    const out = JSON.stringify(r);
    for (const leak of [TOKEN, SECRET, `3333|${SECRET}`, 'sip-pass-should-never-show', 'fund-987654', 'secret=path', '/api/webhooks/whatsapp', '555 12 34 12', '995555123412']) {
      expect(out).not.toContain(leak);
    }
    expect(state(r, 'webhook_messages')?.detail).toContain('callback host myavatar.ge');
  });

  it('the app token is used only where Meta requires it (debug_token, app subscriptions)', async () => {
    const g = graph(READY);
    await runMetaCheck(ENV, g.f);
    for (const c of g.calls) {
      const appCall = /debug_token|3333\/subscriptions/.test(c.url);
      expect(c.auth).toBe(appCall ? `Bearer 3333|${SECRET}` : `Bearer ${TOKEN}`);
    }
  });

  it('webhook ready is NOT calling ready: `messages` only, TIER_250, no payment method, calling off → each named', async () => {
    const r = await runMetaCheck(ENV, graph({
      ...READY,
      '1111?fields': { body: { ...(READY['1111?fields']!.body as object), whatsapp_business_manager_messaging_limit: 'TIER_250' } },
      '2222?fields': { body: { ...(READY['2222?fields']!.body as object), primary_funding_id: undefined } },
      '1111/settings': { body: { calling: { status: 'DISABLED', restrictions: { restrictions_list: [{ type: 'RESTRICTED_BOT_ONLY' }] } } } },
      '3333/subscriptions': { body: { data: [{ object: 'whatsapp_business_account', callback_url: 'https://myavatar.ge/x', active: true, fields: ['messages'] }] } },
    }).f);
    expect(r.webhookReady).toBe('pass');
    expect(r.callingReady).toBe('fail');
    expect(state(r, 'messaging_limit')).toMatchObject({ state: 'fail', detail: 'TIER_250' });
    expect(state(r, 'payment_method')).toMatchObject({ state: 'fail' });
    expect(state(r, 'calling_enabled')).toMatchObject({ state: 'fail', detail: expect.stringContaining('RESTRICTED_BOT_ONLY') });
    expect(state(r, 'webhook_calls')).toMatchObject({ state: 'fail', detail: 'not subscribed' });
  });

  it('an unreadable value says exactly why (HTTP status and Meta error code), and readiness stays unknown, never pass', async () => {
    const r = await runMetaCheck(ENV, graph({
      ...READY,
      '1111/settings': { status: 403, body: { error: { code: 200, error_subcode: 2494049, message: 'Permissions error' } } },
    }).f);
    expect(state(r, 'calling_enabled')).toMatchObject({ state: 'unknown', detail: 'settings: HTTP 403, Meta error 200/2494049' });
    expect(r.callingReady).toBe('unknown');
  });

  it('a network failure is an unknown with the reason, not a crash', async () => {
    const f = (async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }) as typeof fetch;
    const r = await runMetaCheck(ENV, f);
    expect(state(r, 'number')).toMatchObject({ state: 'unknown', detail: 'could not read the number: no answer (TimeoutError)' });
    expect(r.callingReady).toBe('unknown');
  });

  it('without WHATSAPP_APP_ID: token and webhook checks name the missing variable, the WABA still comes from its own id', async () => {
    const g = graph(READY);
    const r = await runMetaCheck({ ...ENV, appId: undefined }, g.f);
    expect(state(r, 'token')).toMatchObject({ state: 'unknown', detail: expect.stringContaining('WHATSAPP_APP_ID') });
    expect(state(r, 'webhook_calls')).toMatchObject({ state: 'unknown', detail: expect.stringContaining('WHATSAPP_APP_ID') });
    expect(state(r, 'payment_method')?.state).toBe('pass');
    expect(r.callingReady).toBe('unknown');
    expect(g.calls.some((c) => /debug_token|subscriptions$/.test(c.url))).toBe(false);
  });

  it('without a WABA id it reads it from the token (one target), else says which variable to set', async () => {
    const found = await runMetaCheck({ ...ENV, wabaId: undefined }, graph(READY).f);
    expect(state(found, 'waba')?.state).toBe('pass');
    const none = await runMetaCheck({ ...ENV, wabaId: undefined, appId: undefined }, graph(READY).f);
    expect(state(none, 'payment_method')).toMatchObject({ state: 'unknown', detail: expect.stringContaining('WHATSAPP_BUSINESS_ACCOUNT_ID') });
  });

  it('a token missing a scope fails the token check without printing the token', async () => {
    const r = await runMetaCheck(ENV, graph({ ...READY, debug_token: { body: { data: { is_valid: true, expires_at: 1_790_000_000, scopes: ['whatsapp_business_messaging'] } } } }).f);
    expect(state(r, 'token')).toMatchObject({ state: 'fail', detail: expect.stringContaining('missing scopes: whatsapp_business_management') });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it('a number outside the configured WABA fails the Cloud API check', async () => {
    const r = await runMetaCheck(ENV, graph({ ...READY, '2222/phone_numbers': { body: { data: [{ id: '9999', account_mode: 'LIVE', host_platform: 'CLOUD_API' }] } } }).f);
    expect(state(r, 'cloud_api')).toMatchObject({ state: 'fail', detail: 'the configured number is not in this WABA' });
  });
});

describe('env and masking', () => {
  it('needs a token and a number id; a bad Graph version falls back to the default', () => {
    expect(metaCheckEnv({} as NodeJS.ProcessEnv)).toBeNull();
    const e = metaCheckEnv({ WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: 'p', WHATSAPP_GRAPH_VERSION: 'latest', WHATSAPP_WABA_ID: 'w' } as unknown as NodeJS.ProcessEnv);
    expect(e).toMatchObject({ token: 't', phoneNumberId: 'p', wabaId: 'w' });
    expect(e?.graphVersion).toMatch(/^v\d+\.\d+$/);
  });

  it('masks to the country code and the last two digits', () => {
    expect(maskNumber('+995 555 12 34 12')).toBe('+995 ••• ••• •12');
    expect(maskNumber('+1 415 555 0199')).toBe('+1 ••• ••• •99');
    expect(maskNumber('123')).toBeNull();
    expect(maskNumber(null)).toBeNull();
  });
});
