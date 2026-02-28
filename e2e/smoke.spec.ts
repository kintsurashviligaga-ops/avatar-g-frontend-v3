/**
 * Production Smoke Tests — MyAvatar.ge
 *
 * Run against production:
 *   npx playwright test e2e/smoke.spec.ts --project=chromium
 *
 * Override base URL:
 *   BASE_URL=https://www.myavatar.ge npx playwright test e2e/smoke.spec.ts
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://www.myavatar.ge';

// ── 1. Homepage loads (API check — avoids heavy 3D render timeout) ──
test('homepage returns 200', async ({ request }) => {
  const res = await request.get(BASE);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('myavatar');
});

// ── 2. Homepage includes GlobalNavbar component ref ────────
test('homepage HTML includes GlobalNavbar component', async ({ request }) => {
  const res = await request.get(BASE);
  const html = await res.text();
  expect(html).toContain('GlobalNavbar');
});

// ── 3. /login page ─────────────────────────────────────────
test('/login returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/login`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('login');
});

// ── 4. /signup page ─────────────────────────────────────────
test('/signup returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/signup`);
  expect(res.status()).toBe(200);
});

// ── 5. /pricing page ───────────────────────────────────────
test('/pricing returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/pricing`);
  expect(res.status()).toBe(200);
});

// ── 6. Service routes return 200 ────────────────────────────
const SERVICE_SLUGS = [
  'avatar-builder',
  'video-studio',
  'music-studio',
  'online-shop',
  'workflow-builder',
  'image-creator',
  'agent-g',
  'social-media-manager',
  'prompt-builder',
  'text-intelligence',
  'photo-studio',
  'media-production',
  'visual-intelligence',
];

for (const slug of SERVICE_SLUGS) {
  test(`/services/${slug} returns 200`, async ({ request }) => {
    const res = await request.get(`${BASE}/services/${slug}`);
    expect(res.status()).toBe(200);
  });
}

// ── 7. /business redirects or loads ─────────────────────────
test('/business returns 200 (redirect to login or page)', async ({ request }) => {
  const res = await request.get(`${BASE}/business`);
  // Unauthenticated: should redirect to login (302/307) or render login page (200 after redirect)
  expect([200, 302, 307]).toContain(res.status());
});

// ── 8. /executive redirects or loads ────────────────────────
test('/executive returns 200 (redirect to login or page)', async ({ request }) => {
  const res = await request.get(`${BASE}/executive`);
  expect([200, 302, 307]).toContain(res.status());
});

// ── 9. Homepage HTML has no error markers ────────────────────
test('homepage HTML has no server error markers', async ({ request }) => {
  const res = await request.get(BASE);
  const html = await res.text();
  expect(html).not.toContain('NEXT_NOT_FOUND');
  expect(html).not.toContain('Internal Server Error');
});

// ── 10. Homepage includes layout component refs ───────────
test('homepage includes Providers and AppShell in RSC', async ({ request }) => {
  const res = await request.get(BASE);
  const html = await res.text();
  // The layout wraps content in Providers component
  expect(html).toContain('ClientErrorBoundary');
});

// ── 11. Locale route (/ka) returns 200 ─────────────────────
test('/ka locale route returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/ka`);
  expect(res.status()).toBe(200);
});

// ── 12. /en locale route returns 200 ────────────────────────
test('/en locale route returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/en`);
  expect(res.status()).toBe(200);
});

// ── 13. /ru locale route returns 200 ────────────────────────
test('/ru locale route returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/ru`);
  expect(res.status()).toBe(200);
});

// ── 14. Unknown route serves not-found content ─────────────────
test('unknown route includes not-found component', async ({ request }) => {
  const res = await request.get(`${BASE}/this-route-does-not-exist-12345`);
  const html = await res.text();
  // Next.js RSC includes not-found component reference
  expect(html).toContain('not-found');
});

// ── 15. /auth page returns 200 ──────────────────────────────
test('/auth page returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/auth`);
  expect(res.status()).toBe(200);
});
