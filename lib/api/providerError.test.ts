/** @jest-environment node */
/**
 * The guarantee: nothing a supplier says ever reaches a user's screen.
 *
 * ⚠️ THE BUG THIS PINS. A real Georgian user pressing Generate was shown, in English, the literal string
 * `Replicate API 402: {"title":"Insufficient credit","detail":"… Go to https://replicate.com/account/billing"}`
 * — our supplier's name, their JSON, and an invitation to top up OUR vendor account. The test that matters
 * most here is not that the copy is nice; it is that the provider's body cannot get out.
 */
import { classifyProviderError, providerError, providerErrorBody } from './providerError';

const REAL_402 = '{"title":"Insufficient credit","detail":"You have insufficient credit to run this model. '
  + 'Go to https://replicate.com/account/billing to add credit.","status":402}';

describe('the provider body never escapes', () => {
  it('is absent from .message — so even a route that echoes err.message cannot leak it', () => {
    const err = providerError(402, REAL_402);
    expect(err.message).toBe('provider_unfunded');
    expect(err.message).not.toMatch(/replicate|billing|credit/i);
  });

  // ⚠️ This is how the original leak escaped: an error serialised whole into a JSON response.
  it('is absent from JSON.stringify(err), which is how errors leak by accident', () => {
    const err = providerError(402, REAL_402);
    expect(JSON.stringify(err)).not.toMatch(/replicate|billing/i);
  });

  it('is still reachable for logs — diagnosis must not get harder', () => {
    expect((providerError(402, REAL_402) as unknown as { detail: string }).detail).toBe(REAL_402);
  });

  it.each([
    ['unfunded', 402, REAL_402],
    ['rate limited', 429, '{"detail":"Rate limit exceeded"}'],
    ['server error', 500, '<html>replicate.com 500</html>'],
    ['bad request', 400, '{"detail":"Invalid version"}'],
  ])('%s: no supplier name in the user-facing body', (_label, status, body) => {
    const out = providerErrorBody(providerError(status, body));
    expect(out.message).not.toMatch(/replicate|http|api|[{}]/i);
  });
});

describe('a provider 402 is OUR outage, not the user being broke', () => {
  // ⚠️ THE MOST EXPENSIVE MISTAKE AVAILABLE HERE. The user's own balance is checked upstream and returns
  // its own 402. Passing the PROVIDER's 402 through would fire the client's insufficient-credit handling
  // and tell someone with a healthy balance to go and pay again.
  it('classifies as an outage', () => {
    expect(classifyProviderError(providerError(402, REAL_402))).toBe('provider_unfunded');
  });

  it('is re-mapped to 503 so no client mistakes it for the user being out of credit', () => {
    expect(providerErrorBody(providerError(402, REAL_402)).status).toBe(503);
  });

  it.each([['ka'], ['en'], ['ru']])('tells the %s user they were NOT charged', (locale) => {
    const { message } = providerErrorBody(providerError(402, REAL_402), locale);
    expect(message).toMatch(/არ ჩამოგეჭრა|not been charged|не списаны/);
  });

  it('never suggests the user pays for our empty supplier account', () => {
    for (const locale of ['ka', 'en', 'ru']) {
      expect(providerErrorBody(providerError(402, REAL_402), locale).message)
        .not.toMatch(/top ?up|შეავსე|пополни/i);
    }
  });
});

describe('classification', () => {
  it.each([
    [429, 'rate limited', 'provider_rate_limited'],
    [500, 'boom', 'provider_unavailable'],
    [503, 'unavailable', 'provider_unavailable'],
    [400, 'invalid input', 'provider_rejected'],
    [422, 'unprocessable', 'provider_rejected'],
  ])('%i → %s', (status, body, expected) => {
    expect(classifyProviderError(providerError(status, body))).toBe(expected);
  });

  // Only the request-shaped failure should invite a rewrite; blaming the prompt for our outage is a lie.
  it('suggests rewording ONLY when the request itself was refused', () => {
    const reword = /პრომპტის შეცვლა|rewording|переформулир/;
    expect(providerErrorBody(providerError(400, 'nsfw')).message).toMatch(reword);
    expect(providerErrorBody(providerError(402, REAL_402)).message).not.toMatch(reword);
    expect(providerErrorBody(providerError(500, 'boom')).message).not.toMatch(reword);
  });

  it('survives a rethrow through a cascade without re-deriving a different answer', () => {
    const once = providerError(402, REAL_402);
    expect(classifyProviderError(new Error(once.message))).toBe('provider_unfunded');
  });

  it.each([[null], [undefined], ['a bare string'], [new Error('')], [{}]])(
    'degrades to an outage for %p rather than throwing', (input) => {
      expect(() => providerErrorBody(input)).not.toThrow();
      expect(providerErrorBody(input).message.length).toBeGreaterThan(10);
    },
  );

  it('defaults to Georgian, the primary locale, for unknown/absent locales', () => {
    expect(providerErrorBody(providerError(500, 'x')).message)
      .toBe(providerErrorBody(providerError(500, 'x'), 'zz').message);
    expect(providerErrorBody(providerError(500, 'x')).message).toMatch(/[Ⴀ-ჿ]/);
  });
});
