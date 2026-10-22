/** @jest-environment node */
/**
 * The signed quote (MASTER TASK v3.1, audit F-06): v2 binds the engine and the billing as well as the plan, and a v1
 * token issued before the change still verifies until it expires. Each caller's own tests pin its refusal codes and
 * that a second run of one quote (a replay) finds its job instead of running or charging again.
 */
import { createHmac } from 'node:crypto';
import { PRICING_VERSION } from '@/lib/credits/pricingVersion';
import { QUOTE_TTL_MS, quoteBinding, signQuote, verifyQuote, type QuoteBinding } from './quoteToken';

const KEY = 'key';
const claims = { u: 'u1', j: 'job-1', f: 'fp', c: 3, x: 2000 };
const binding: QuoteBinding = {
  cap: 'music.studio', model: 'lyria-3-clip-preview', transport: 'vertex', project: 'gen-lang-client-0671348730', pricing: PRICING_VERSION, units: 30,
};
const ok = { userId: 'u1', fingerprint: 'fp', now: 1000, credits: 3, binding };
const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;

/** A v1 token, signed the way every quote was signed before v2 shipped. */
function v1Token(c: typeof claims, key = KEY): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...c })).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(`agent-g-media-quote:v1:${payload}`).digest('base64url')}`;
}

describe('v2 quote token', () => {
  test('round-trips for its user, plan, price, engine and time, and says it is v2', () => {
    const t = signQuote(claims, KEY, binding)!;
    expect(t.startsWith('v2.')).toBe(true);
    expect(verifyQuote(t, KEY, ok)).toEqual({ ok: true, claims, version: 2 });
  });

  test('carries the currency, a nonce and the whole binding', () => {
    const t = signQuote(claims, KEY, binding)!;
    expect(decode(t)).toMatchObject({ v: 2, ...claims, cur: 'credits', n: expect.any(String), b: binding });
  });

  test('two quotes of identical claims never share a token (the nonce), and each verifies', () => {
    const a = signQuote(claims, KEY, binding)!;
    const b = signQuote(claims, KEY, binding)!;
    expect(a).not.toBe(b);
    expect(verifyQuote(a, KEY, ok)).toMatchObject({ ok: true });
    expect(verifyQuote(b, KEY, ok)).toMatchObject({ ok: true });
  });

  test('refuses another user, another plan, a late run, another key, a tampered payload, and no key', () => {
    const t = signQuote(claims, KEY, binding)!;
    expect(verifyQuote(t, KEY, { ...ok, userId: 'u2' })).toEqual({ ok: false, reason: 'not_yours' });
    expect(verifyQuote(t, KEY, { ...ok, fingerprint: 'other' })).toEqual({ ok: false, reason: 'changed', field: 'fingerprint' });
    expect(verifyQuote(t, KEY, { ...ok, now: 2000 })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyQuote(t, 'other', ok)).toEqual({ ok: false, reason: 'invalid' });
    const [, payload, mac] = t.split('.');
    expect(verifyQuote(`v2.${payload}.${mac}.x`, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyQuote(`v2.${payload}`, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
    expect(signQuote(claims, '', binding)).toBeNull();
    expect(verifyQuote(t, '', ok)).toEqual({ ok: false, reason: 'invalid' });
  });

  test.each([
    ['a cheaper price', { c: 0 }],
    ['another model', { b: { ...binding, model: 'lyria-3-pro-preview' } }],
    ['another transport', { b: { ...binding, transport: 'gemini_api' } }],
    ['another project', { b: { ...binding, project: 'someone-else' } }],
    ['another price book', { b: { ...binding, pricing: 'p1-000000000000' } }],
    ['fewer units', { b: { ...binding, units: 1 } }],
  ])('a forged token with %s is refused as invalid (the MAC covers every field)', (_what, change) => {
    const t = signQuote(claims, KEY, binding)!;
    const [, , mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...decode(t), ...change })).toString('base64url');
    expect(verifyQuote(`v2.${forged}.${mac}`, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
  });

  test.each([
    ['model', { model: 'lyria-3-pro-preview' }],
    ['transport', { transport: 'gemini_api' }],
    ['project', { project: 'another-project' }],
    ['pricing', { pricing: 'p1-ffffffffffff' }],
    ['units', { units: 60 }],
    ['cap', { cap: 'image.studio' }],
  ] as const)('a run whose %s is not what was quoted is refused, naming the field', (field, change) => {
    const t = signQuote(claims, KEY, binding)!;
    expect(verifyQuote(t, KEY, { ...ok, binding: { ...binding, ...change } })).toEqual({ ok: false, reason: 'changed', field });
  });

  test('a price that moved since the quote is refused (stale pricing)', () => {
    const t = signQuote(claims, KEY, binding)!;
    expect(verifyQuote(t, KEY, { ...ok, credits: 4 })).toEqual({ ok: false, reason: 'changed', field: 'credits' });
  });

  test('signs nothing without a complete binding', () => {
    expect(signQuote(claims, KEY, { ...binding, model: '' })).toBeNull();
    expect(signQuote(claims, KEY, { ...binding, transport: '' })).toBeNull();
    expect(signQuote(claims, KEY, { ...binding, pricing: '' })).toBeNull();
    expect(signQuote(claims, KEY, { ...binding, units: -1 })).toBeNull();
    expect(signQuote(claims, KEY, { ...binding, units: Number.NaN })).toBeNull();
    expect(signQuote(claims, KEY, undefined as unknown as QuoteBinding)).toBeNull();
  });
});

describe('v1 tokens issued before v2', () => {
  test('still verify until they expire, with owner, plan and price checked, and say they are v1', () => {
    const t = v1Token(claims);
    expect(verifyQuote(t, KEY, ok)).toEqual({ ok: true, claims, version: 1 });
    expect(verifyQuote(t, KEY, { ...ok, userId: 'u2' })).toEqual({ ok: false, reason: 'not_yours' });
    expect(verifyQuote(t, KEY, { ...ok, fingerprint: 'other' })).toEqual({ ok: false, reason: 'changed', field: 'fingerprint' });
    expect(verifyQuote(t, KEY, { ...ok, credits: 4 })).toEqual({ ok: false, reason: 'changed', field: 'credits' });
    expect(verifyQuote(t, KEY, { ...ok, now: 2000 })).toEqual({ ok: false, reason: 'expired' });
  });

  test('a v1 token claiming more than one TTL ahead was not issued by this code', () => {
    const t = v1Token({ ...claims, x: 1000 + QUOTE_TTL_MS + 1 });
    expect(verifyQuote(t, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('a v1 signature cannot be presented as v2, nor a v2 one as v1', () => {
    const v1 = v1Token(claims);
    expect(verifyQuote(`v2.${v1}`, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
    const v2 = signQuote(claims, KEY, binding)!;
    expect(verifyQuote(v2.slice(3), KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('a tampered v1 payload is refused', () => {
    const [, mac] = v1Token(claims).split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, ...claims, c: -5 })).toString('base64url');
    expect(verifyQuote(`${forged}.${mac}`, KEY, ok)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('quoteBinding', () => {
  test('bills the Vertex project for a Vertex model and nothing for this server\'s own engines, at today\'s price book', () => {
    const env = { GCP_PROJECT_ID: ' gen-lang-client-0671348730 ' };
    expect(quoteBinding({ cap: 'music.studio', model: 'lyria-3-clip-preview', transport: 'vertex', units: 30 }, env)).toEqual({
      cap: 'music.studio', model: 'lyria-3-clip-preview', transport: 'vertex', project: 'gen-lang-client-0671348730', pricing: PRICING_VERSION, units: 30,
    });
    expect(quoteBinding({ cap: 'media.montage', model: 'ffmpeg-montage', transport: 'local', units: 1 }, env)).toMatchObject({ project: '' });
    expect(quoteBinding({ cap: 'image.studio', model: 'gemini-3.1-flash-image', transport: 'vertex', units: 1 }, {})).toMatchObject({ project: '' });
  });
});
