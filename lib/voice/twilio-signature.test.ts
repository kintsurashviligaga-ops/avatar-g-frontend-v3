import { computeTwilioSignature, verifyTwilioRequest } from './twilio-signature';

/**
 * Canonical Twilio example. The expected signature was derived independently (openssl dgst -sha1 -hmac
 * and node crypto both produce it) so this pins our helper to Twilio's documented algorithm, not to a
 * value our own code generated.
 */
const CANONICAL = {
  authToken: '12345',
  url: 'https://mycompany.com/myapp.php?foo=1&bar=2',
  params: {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+14158675310',
    Digits: '1234',
    From: '+14158675310',
    To: '+18005551212',
  } as Record<string, string>,
  signature: 'GvWf1cFY/Q7PnoempGyD5oXAezc=',
};

describe('twilio-signature', () => {
  it('computes the documented HMAC-SHA1 signature for the canonical example', () => {
    expect(computeTwilioSignature(CANONICAL.authToken, CANONICAL.url, CANONICAL.params)).toBe(CANONICAL.signature);
  });

  it('is independent of the object key insertion order (params are sorted by key)', () => {
    const shuffled: Record<string, string> = {
      To: CANONICAL.params.To,
      Digits: CANONICAL.params.Digits,
      CallSid: CANONICAL.params.CallSid,
      From: CANONICAL.params.From,
      Caller: CANONICAL.params.Caller,
    };
    expect(computeTwilioSignature(CANONICAL.authToken, CANONICAL.url, shuffled)).toBe(CANONICAL.signature);
  });

  it('accepts array entries equivalently to the object form', () => {
    const entries: Array<[string, string]> = Object.entries(CANONICAL.params);
    expect(computeTwilioSignature(CANONICAL.authToken, CANONICAL.url, entries)).toBe(CANONICAL.signature);
  });

  it('verifies a valid signature', () => {
    expect(verifyTwilioRequest(CANONICAL.authToken, CANONICAL.signature, CANONICAL.url, CANONICAL.params)).toBe(true);
  });

  it('rejects a tampered parameter (would let a forged SpeechResult through)', () => {
    const tampered = { ...CANONICAL.params, Digits: '9999' };
    expect(verifyTwilioRequest(CANONICAL.authToken, CANONICAL.signature, CANONICAL.url, tampered)).toBe(false);
  });

  it('rejects a mismatched URL (proxy reconstruction must reproduce the exact public URL)', () => {
    const otherUrl = 'https://mycompany.com/myapp.php?foo=1&bar=3';
    expect(verifyTwilioRequest(CANONICAL.authToken, CANONICAL.signature, otherUrl, CANONICAL.params)).toBe(false);
  });

  it('rejects a signature made with the wrong auth token', () => {
    expect(verifyTwilioRequest('not-the-token', CANONICAL.signature, CANONICAL.url, CANONICAL.params)).toBe(false);
  });

  it('fails closed when the auth token is empty', () => {
    expect(verifyTwilioRequest('', CANONICAL.signature, CANONICAL.url, CANONICAL.params)).toBe(false);
  });

  it('fails closed when the signature header is missing', () => {
    expect(verifyTwilioRequest(CANONICAL.authToken, null, CANONICAL.url, CANONICAL.params)).toBe(false);
    expect(verifyTwilioRequest(CANONICAL.authToken, undefined, CANONICAL.url, CANONICAL.params)).toBe(false);
  });

  it('does not throw on a length-mismatched (garbage) signature header', () => {
    expect(verifyTwilioRequest(CANONICAL.authToken, 'short', CANONICAL.url, CANONICAL.params)).toBe(false);
  });

  it('handles a URL with no query string and no params', () => {
    const url = 'https://myavatar.ge/api/webhooks/phone';
    const sig = computeTwilioSignature(CANONICAL.authToken, url, {});
    expect(verifyTwilioRequest(CANONICAL.authToken, sig, url, {})).toBe(true);
    expect(verifyTwilioRequest(CANONICAL.authToken, sig, url, { From: '+1' })).toBe(false);
  });
});
