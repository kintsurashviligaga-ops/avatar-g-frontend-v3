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
const caps = async () => (await (await GET()).json()) as { stripe: boolean; bog: boolean };

beforeEach(() => {
  mockIsAdmin = false;
  mockSchemaReady = true;
  process.env.BOG_CLIENT_ID = 'client-id';
  process.env.BOG_SECRET_KEY = 'secret';
  delete process.env.BOG_CHECKOUT_MODE;
  delete process.env.BOG_ENV;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
});
afterAll(() => {
  process.env = { ...ENV };
});

test('creds + schema, mode unset → BOG offered to everyone (Production today)', async () => {
  expect(await caps()).toEqual({ stripe: true, bog: true });
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
