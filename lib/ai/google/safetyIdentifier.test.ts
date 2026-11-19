/** @jest-environment node */
jest.mock('server-only', () => ({}));
import {
  runAsEndUser,
  safetyIdentifierEnabled,
  safetyIdentifierFor,
  takesSafetyLabel,
  withSafetyLabel,
} from './safetyIdentifier';

const ON = { SAFETY_IDENTIFIER: '1', SAFETY_IDENTIFIER_SALT: 'test-salt-0123456789abcdef' };
const UID = '3f2a8c4e-1b2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('safetyIdentifier', () => {
  it('is off by default, without a salt, or with a short salt', () => {
    expect(safetyIdentifierEnabled({})).toBe(false);
    expect(safetyIdentifierEnabled({ SAFETY_IDENTIFIER: '1' })).toBe(false);
    expect(safetyIdentifierEnabled({ SAFETY_IDENTIFIER: '1', SAFETY_IDENTIFIER_SALT: 'short' })).toBe(false);
    expect(safetyIdentifierEnabled({ SAFETY_IDENTIFIER: '0', SAFETY_IDENTIFIER_SALT: ON.SAFETY_IDENTIFIER_SALT })).toBe(false);
    expect(safetyIdentifierEnabled(ON)).toBe(true);
  });

  it("makes a stable, Google-valid, non-reversible value (no trace of the id)", () => {
    const v = safetyIdentifierFor(UID, ON) as string;
    expect(v).toMatch(/^[a-z0-9_-]{1,63}$/);
    expect(v).toHaveLength(41);
    expect(safetyIdentifierFor(UID, ON)).toBe(v);
    expect(v).not.toContain(UID.slice(0, 8));
    expect(safetyIdentifierFor('another-user', ON)).not.toBe(v);
    expect(safetyIdentifierFor(UID, { ...ON, SAFETY_IDENTIFIER_SALT: 'other-salt-0123456789' })).not.toBe(v);
  });

  it('gives no value for guests or missing ids', () => {
    for (const id of [null, undefined, '', 'anonymous', 'anon-123']) expect(safetyIdentifierFor(id, ON)).toBeNull();
  });

  it('leaves the body byte-identical when off', () => {
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
    expect(withSafetyLabel(body, UID, {})).toBe(body);
  });

  it('adds labels.safety_identifier at the top level, keeping other labels', () => {
    const body = JSON.stringify({ instances: [{ prompt: 'x' }], parameters: { sampleCount: 1 }, labels: { team: 'video' } });
    const out = JSON.parse(withSafetyLabel(body, UID, ON) as string);
    expect(out.instances).toEqual([{ prompt: 'x' }]);
    expect(out.labels).toEqual({ team: 'video', safety_identifier: safetyIdentifierFor(UID, ON) });
  });

  it('never overrides a caller label and passes through non-JSON bodies', () => {
    const own = JSON.stringify({ labels: { safety_identifier: 'mine' } });
    expect(withSafetyLabel(own, UID, ON)).toBe(own);
    expect(withSafetyLabel('not json', UID, ON)).toBe('not json');
    expect(withSafetyLabel('[1,2]', UID, ON)).toBe('[1,2]');
    const buf = new Uint8Array([1]);
    expect(withSafetyLabel(buf, UID, ON)).toBe(buf);
  });

  it('reads the end user from the request context', () => {
    const prev = { ...process.env };
    Object.assign(process.env, ON);
    try {
      const body = '{"contents":[]}';
      expect(withSafetyLabel(body)).toBe(body);
      const out = runAsEndUser(UID, () => withSafetyLabel(body)) as string;
      expect(JSON.parse(out).labels.safety_identifier).toBe(safetyIdentifierFor(UID, ON));
    } finally {
      process.env = prev;
    }
  });

  it('only labels the methods Google documents', () => {
    expect(takesSafetyLabel('generateContent')).toBe(true);
    expect(takesSafetyLabel('streamGenerateContent')).toBe(true);
    expect(takesSafetyLabel('https://x/models/gemini-3.8-flash:streamGenerateContent?alt=sse')).toBe(true);
    expect(takesSafetyLabel('https://x/models/veo-3.1:predictLongRunning')).toBe(true);
    expect(takesSafetyLabel('countTokens')).toBe(false);
    expect(takesSafetyLabel('predict')).toBe(false);
    expect(takesSafetyLabel('https://x/models/veo:fetchPredictOperation')).toBe(false);
  });
});
