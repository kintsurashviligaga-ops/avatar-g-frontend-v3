/** @jest-environment node */
/**
 * GET /api/checkout/capabilities — the BOG button shows only when BOG can take AND record a payment, and only to the
 * viewers BOG_CHECKOUT_MODE lets start one.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/monetization/provider', () => ({ getBillingProvider: () => ({ kind: 'stripe' }) }));
let mockIsAdmin = false;
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => mockIsAdmin) }));
let mockSchemaReady = true;
jest.mock('../../../../lib/billing/bogSettlement', () => ({
  ...jest.requireActual('../../../../lib/billing/bogSettlement'),
  bogSchemaReady: jest.fn(async () => mockSchemaReady),
}));
jest.mock('../../../../lib/billing/wallet-ledger', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

import { GET } from './route';

const ENV = { ...process.env };
const caps = async () => (await (await GET()).json()) as { stripe: boolean; bog: boolean; bogPlans: boolean };

beforeEach(() => {
  mockIsAdmin = false;
  mockSchemaReady = true;
  process.env.BOG_CLIENT_ID = 'client-id';
  process.env.BOG_SECRET_KEY = 'secret';
  delete process.env.BOG_CHECKOUT_MODE;
  delete process.env.BOG_SUBSCRIPTION_MODE;
  delete process.env.BOG_ENV;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
});
afterAll(() => {
  process.env = { ...ENV };
});

test('creds + schema, mode unset → BOG offered to everyone; plans through BOG stay admin-only until opened', async () => {
  expect(await caps()).toEqual({ stripe: true, bog: true, bogPlans: false });
});

describe('BOG_SUBSCRIPTION_MODE (plans save the card for automatic payments the bank has not confirmed)', () => {
  test('unset or admin → only an admin may buy a plan through BOG; public → everyone BOG is open to', async () => {
    for (const v of [undefined, 'admin']) {
      if (v) process.env.BOG_SUBSCRIPTION_MODE = v;
      mockIsAdmin = false;
      expect(await caps()).toMatchObject({ bog: true, bogPlans: false });
      mockIsAdmin = true;
      expect(await caps()).toMatchObject({ bog: true, bogPlans: true });
    }
    mockIsAdmin = false;
    process.env.BOG_SUBSCRIPTION_MODE = 'public';
    expect(await caps()).toMatchObject({ bog: true, bogPlans: true });
  });

  test('off or a typo → no BOG plans for anyone; never wider than the checkout (checkout admin + plans public = admin)', async () => {
    mockIsAdmin = true;
    for (const v of ['off', 'publik']) {
      process.env.BOG_SUBSCRIPTION_MODE = v;
      expect(await caps()).toMatchObject({ bog: true, bogPlans: false });
    }
    process.env.BOG_SUBSCRIPTION_MODE = 'public';
    process.env.BOG_CHECKOUT_MODE = 'admin';
    mockIsAdmin = false;
    expect(await caps()).toMatchObject({ bog: false, bogPlans: false });
    mockIsAdmin = true;
    expect(await caps()).toMatchObject({ bog: true, bogPlans: true });
  });
});

test('no creds or no schema → no BOG button', async () => {
  mockSchemaReady = false;
  expect((await caps()).bog).toBe(false);
  mockSchemaReady = true;
  delete process.env.BOG_SECRET_KEY;
  expect((await caps()).bog).toBe(false);
});

test('admin mode → only an admin session sees BOG', async () => {
  process.env.BOG_CHECKOUT_MODE = 'admin';
  expect((await caps()).bog).toBe(false);
  mockIsAdmin = true;
  expect((await caps()).bog).toBe(true);
});

test('off mode, or an unknown value → nobody sees BOG, admins included', async () => {
  mockIsAdmin = true;
  for (const v of ['off', 'yes']) {
    process.env.BOG_CHECKOUT_MODE = v;
    expect((await caps()).bog).toBe(false);
  }
});

test('a Vercel Preview / Development deployment (Production database) → no BOG button, admins included', async () => {
  mockIsAdmin = true;
  for (const v of ['preview', 'development']) {
    process.env.VERCEL_ENV = v;
    expect((await caps()).bog).toBe(false);
  }
  process.env.VERCEL_ENV = 'production';
  expect((await caps()).bog).toBe(true);
});

test('sandbox credentials on a Vercel deployment (Production database) → no BOG button, admins included', async () => {
  mockIsAdmin = true;
  process.env.BOG_ENV = 'sandbox';
  for (const v of ['production', 'preview']) {
    process.env.VERCEL_ENV = v;
    expect((await caps()).bog).toBe(false);
  }
  delete process.env.VERCEL_ENV;
  expect((await caps()).bog).toBe(true); // a local dev server on its own database
});
