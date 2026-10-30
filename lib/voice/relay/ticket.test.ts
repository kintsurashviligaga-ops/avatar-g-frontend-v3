/** @jest-environment node */
import { canonicalJson, lockDigests, mintTicket, setupDigest, subjectOf, verifyTicket } from './ticket';

const SECRET = 's'.repeat(40);
const setup = {
  model: 'models/gemini-2.5-flash-native-audio-latest',
  systemInstruction: { parts: [{ text: 'გამარჯობა' }] },
  generationConfig: { responseModalities: ['AUDIO'], temperature: 0.7 },
  inputAudioTranscription: {},
  sessionResumption: {},
  tools: [{ googleSearch: {} }],
};

describe('canonicalJson', () => {
  it('sorts keys at every level, keeps array order, drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: undefined, w: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,{"w":2,"y":1}]},"b":1}');
  });
});

describe('setupDigest / lockDigests', () => {
  it('survives a JSON round trip and key reordering', () => {
    const copy = JSON.parse(JSON.stringify({ tools: setup.tools, ...setup }));
    expect(setupDigest(copy)).toBe(setupDigest(setup));
  });
  it('ignores sessionResumption (the browser fills in the handle)', () => {
    expect(setupDigest({ ...setup, sessionResumption: { handle: 'h1' } })).toBe(setupDigest(setup));
  });
  it('changes with anything else', () => {
    expect(setupDigest({ ...setup, systemInstruction: { parts: [{ text: 'other' }] } })).not.toBe(setupDigest(setup));
    expect(setupDigest({ ...setup, model: 'models/gemini-3.8-live' })).not.toBe(setupDigest(setup));
  });
  it('also accepts the degraded setup (parity fields stripped), and only that', () => {
    const [full, lite] = lockDigests(setup);
    expect(full).toBe(setupDigest(setup));
    const { inputAudioTranscription: _a, sessionResumption: _b, tools: _c, ...degraded } = setup;
    expect(lite).toBe(setupDigest(degraded));
    expect(lockDigests(degraded)).toEqual([lite]);
  });
});

describe('mintTicket / verifyTicket', () => {
  const now = 1_800_000_000_000;
  const mint = () => mintTicket(SECRET, { sub: subjectOf('user-1'), nowMs: now, nseMs: now + 120_000, expMs: now + 1_800_000, digests: lockDigests(setup) });

  it('round-trips its claims', () => {
    const r = verifyTicket(SECRET, mint(), now + 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.claims).toMatchObject({ v: 1, sub: subjectOf('user-1'), iat: now, nse: now + 120_000, exp: now + 1_800_000, d: lockDigests(setup) });
    expect(r.claims.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it('never carries the user id itself', () => {
    expect(Buffer.from(mint().split('.')[1]!, 'base64url').toString()).not.toContain('user-1');
  });
  it('is URL-safe and small', () => {
    const t = mint();
    expect(encodeURIComponent(t)).toBe(t);
    expect(t.length).toBeLessThan(400);
  });
  it('refuses another secret, a tampered payload, expiry and junk', () => {
    const t = mint();
    expect(verifyTicket('x'.repeat(40), t, now)).toEqual({ ok: false, reason: 'bad_signature' });
    const [v, p, s] = t.split('.');
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, exp: now + 9e9 })).toString('base64url');
    expect(verifyTicket(SECRET, `${v}.${forged}.${s}`, now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyTicket(SECRET, t, now + 1_800_000)).toEqual({ ok: false, reason: 'expired' });
    for (const junk of ['', 'v1.a', 'v2.a.b', 'v1..b', 'x'.repeat(3000)]) expect(verifyTicket(SECRET, junk, now).ok).toBe(false);
  });
});
