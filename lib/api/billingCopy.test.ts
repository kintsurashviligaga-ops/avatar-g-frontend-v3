/** @jest-environment node */
/**
 * The money copy a paid route writes itself: the caller's language, and the 503 that replaced "render it for free".
 */
import { NextRequest } from 'next/server';
import { billingLocale, ledgerUnavailableBody, ledgerUnavailableMessage, replayRefusedBody } from './billingCopy';

test('reads NEXT_LOCALE from a NextRequest and from a plain Request’s cookie header; ka otherwise', () => {
  expect(billingLocale(new NextRequest('https://myavatar.ge/x', { headers: { cookie: 'NEXT_LOCALE=ru' } }))).toBe('ru');
  expect(billingLocale(new Request('https://myavatar.ge/x', { headers: { cookie: 'a=1; NEXT_LOCALE=en; b=2' } }))).toBe('en');
  expect(billingLocale(new Request('https://myavatar.ge/x', { headers: { cookie: 'NEXT_LOCALE=de' } }))).toBe('ka');
  expect(billingLocale(new Request('https://myavatar.ge/x'))).toBe('ka');
  expect(billingLocale(null)).toBe('ka');
});

test('the ledger-outage body is the code the studio maps, plus a sentence that promises only what is true', () => {
  for (const lang of ['ka', 'en', 'ru'] as const) {
    const body = ledgerUnavailableBody(lang);
    expect(body).toMatchObject({ success: false, error: 'billing_unavailable', code: 'billing_unavailable' });
    expect(body.message).toBe(ledgerUnavailableMessage(lang));
  }
  expect(ledgerUnavailableMessage('ka')).toMatch(/კრედიტი არ ჩამოგეჭრა/);
  expect(ledgerUnavailableMessage('en')).toMatch(/nothing was charged/);
  expect(ledgerUnavailableMessage('ru')).toMatch(/ничего не списано/);
});

test('a replay is refused with the duplicate code the studio already translates', () => {
  expect(replayRefusedBody()).toEqual({ success: false, error: 'duplicate_request', code: 'duplicate_request' });
});
