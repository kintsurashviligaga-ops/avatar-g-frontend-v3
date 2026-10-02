/** @jest-environment node */
/**
 * Every route that can start a payment or charge a card must know who the caller is.
 *
 * ⚠️ WHY: /api/stripe/create-checkout-session (deleted 2026-10-02) let ANYONE mint live Stripe Checkout sessions
 * with any amount, currency and product name under our merchant account — card testing and phishing with our
 * name on the bank statement. No route may call a checkout/charge primitive without an auth gate in its own code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const API = join(ROOT, 'app', 'api');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name === 'route.ts' ? [p] : [];
  });

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Calls that create a payment page or move money on a card. */
const MONEY_STARTERS = /\bcheckout\.sessions\.create\s*\(|\bpaymentIntents\.create\s*\(|\bcreateBogOrder\s*\(|\bchargeSavedCard\s*\(|\bcreateUsdTierCheckoutSession\s*\(|\bcreateWalletTopupSession\s*\(/;
/** The ways a route in this repo establishes its caller. */
const AUTH_GATES = /\brequireAuthenticatedUser\s*\(|\brequireUser\s*\(|\bisCronAuthorized\s*\(|\bauthedClientFromRequest\s*\(|\.auth\.getUser\s*\(|\bassertAdminAccess\s*\(/;

test('every route that starts a checkout or charges a card has an auth gate in its own code', () => {
  const offenders = walk(API)
    .filter((f) => MONEY_STARTERS.test(strip(readFileSync(f, 'utf8'))))
    .filter((f) => !AUTH_GATES.test(strip(readFileSync(f, 'utf8'))))
    .map((f) => relative(ROOT, f));
  expect(offenders).toEqual([]);
});

test('the open test-payment route stays deleted', () => {
  expect(() => statSync(join(API, 'stripe', 'create-checkout-session', 'route.ts'))).toThrow();
});

test('the guard actually sees the money-starting routes (it is not vacuously green)', () => {
  const seen = walk(API).filter((f) => MONEY_STARTERS.test(strip(readFileSync(f, 'utf8')))).map((f) => relative(ROOT, f));
  expect(seen).toEqual(expect.arrayContaining(['app/api/billing/bog/checkout/route.ts', 'app/api/cron/bog-billing/route.ts']));
});
