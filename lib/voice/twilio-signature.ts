import crypto from 'node:crypto';

/**
 * Twilio request-signature validation (`X-Twilio-Signature`) implemented with node crypto — no
 * `twilio` package. Mirrors Twilio's documented algorithm for form-encoded POST webhooks:
 *
 *   signature = base64( HMAC-SHA1( authToken, fullUrl + Σ (key + value) over params sorted by key ) )
 *
 * The `fullUrl` is the EXACT public URL Twilio was configured to POST to (scheme + host + path +
 * query), and the appended block is every POST body parameter, its key immediately followed by its
 * (URL-decoded) value, with the parameters ordered lexicographically by key and no delimiters.
 *
 * https://www.twilio.com/docs/usage/security#validating-requests
 *
 * Cross-checked against openssl + node for the canonical Twilio example (see twilio-signature.test.ts):
 *   url    = https://mycompany.com/myapp.php?foo=1&bar=2
 *   params = { CallSid, Caller, Digits, From, To }
 *   token  = 12345
 *   => GvWf1cFY/Q7PnoempGyD5oXAezc=
 */

export type TwilioParams = Array<[string, string]> | Record<string, string>;

function toEntries(params: TwilioParams): Array<[string, string]> {
  return Array.isArray(params) ? [...params] : Object.entries(params);
}

/** Build the base64 HMAC-SHA1 signature Twilio would send for `url` + `params` under `authToken`. */
export function computeTwilioSignature(authToken: string, url: string, params: TwilioParams): string {
  // Sort by key (lexicographic on the UTF-16 code units, matching Twilio's helper libraries which
  // sort the parameter keys). Then concatenate key+value with no separators onto the full URL.
  const data = toEntries(params)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .reduce((acc, [key, value]) => acc + key + value, url);

  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

/**
 * Constant-time verification of an inbound `X-Twilio-Signature` header. Returns false — never throws —
 * for any missing input, so callers can treat a false result as "reject". Fail-closed by construction:
 * an empty `authToken` or `signatureHeader` yields false.
 */
export function verifyTwilioRequest(
  authToken: string,
  signatureHeader: string | null | undefined,
  url: string,
  params: TwilioParams,
): boolean {
  if (!authToken || !signatureHeader) {
    return false;
  }

  const expected = computeTwilioSignature(authToken, url, params);
  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const candidateBuffer = Buffer.from(signatureHeader, 'utf-8');

  // timingSafeEqual throws on length mismatch, so gate on length first (the length itself is not secret:
  // a valid Twilio signature is always a fixed-width base64 SHA-1 digest).
  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}
