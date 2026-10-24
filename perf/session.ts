/**
 * perf/session.ts — the signed-in Library the browser benchmarks run against (mock environment).
 *
 * The same edge stubs tests/library-signed-in.spec.ts uses: a session cookie for the dev server's dummy Supabase, the
 * auth endpoints answered in the page, and GET /api/studio/library answered from fixture rows after a FIXED delay that
 * stands in for the route's own time. Media sit on the storage host as signed links and are served from the repo's
 * fixture files with the storage default `max-age=3600`. Nothing leaves the machine.
 */
import type { Page, Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000e3', aud: 'authenticated', role: 'authenticated', email: 'perf-library@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };

/** Fixed latency of the stubbed Library API, in ms (PERF_FIXTURE_LIBRARY_MS). Not measured from anything. */
export const LIBRARY_API_MS = (() => {
  const v = Number(process.env.PERF_FIXTURE_LIBRARY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 80;
})();
export const ITEMS_PER_KIND = 12;

const ROOT = path.join(__dirname, '..');
const MEDIA: Record<string, { body: Buffer; type: string }> = {
  film: { body: readFileSync(path.join(ROOT, 'tests/fixtures/clip.webm')), type: 'video/webm' }, // Playwright's Chromium plays no H.264
  image: { body: readFileSync(path.join(ROOT, 'public/brand/v1/card-image.jpg')), type: 'image/jpeg' },
  music: { body: readFileSync(path.join(ROOT, 'tests/fixtures/tone.mp3')), type: 'audio/mpeg' },
};
const EXT: Record<string, string> = { film: 'webm', image: 'jpg', music: 'mp3' };

export interface FixtureItem { id: string; kind: string; url: string; prompt: string; orientation: 'landscape'; createdAt: string }

/** 12 films, 12 pictures, 12 songs, newest first; each on its own signed storage link. */
export function fixtureRows(urlFor: (kind: string, id: string) => string = storageUrl): FixtureItem[] {
  const now = Date.now();
  return ['film', 'image', 'music'].flatMap((kind, k) => Array.from({ length: ITEMS_PER_KIND }, (_, i) => {
    const id = `${kind}_${i}`;
    return { id, kind, url: urlFor(kind, id), prompt: `${kind} ${i}`, orientation: 'landscape' as const, createdAt: new Date(now - (k * ITEMS_PER_KIND + i) * 60_000).toISOString() };
  }));
}

export function storageUrl(kind: string, id: string): string {
  return `${SUPABASE_URL}/storage/v1/object/sign/renders/perf/${id}.${EXT[kind]}?token=perf`;
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'perf-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'perf-refresh', user: USER }))}`;
}

/** What the page asked for, so a benchmark can count the requests one interaction caused. */
export interface Traffic { library: Request[]; media: Request[] }

export async function signedInLibrary(page: Page, baseURL: string | undefined, rows: FixtureItem[] = fixtureRows()): Promise<Traffic> {
  const traffic: Traffic = { library: [], media: [] };
  page.on('request', (r) => {
    const url = r.url();
    if (url.includes('/api/studio/library') && r.method() === 'GET') traffic.library.push(r);
    else if (url.startsWith(`${SUPABASE_URL}/storage/v1/object/sign/renders/perf/`)) traffic.media.push(r);
  });
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/renders/perf/**`, (r) => {
    const kind = /\/(film|image|music)_\d+\./.exec(r.request().url())?.[1] ?? 'image';
    const m = MEDIA[kind]!;
    return r.fulfill({ status: 200, contentType: m.type, headers: { 'access-control-allow-origin': '*', 'cache-control': 'max-age=3600' }, body: m.body });
  });
  await page.route('**/api/studio/library**', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const q = new URL(r.request().url()).searchParams;
    const kinds = (q.get('kind') ?? '').split(',').filter(Boolean);
    const offset = Number(q.get('offset') ?? 0);
    const limit = Number(q.get('limit') ?? 40);
    const items = rows.filter((it) => kinds.length === 0 || kinds.includes(it.kind)).slice(offset, offset + limit);
    await new Promise((done) => setTimeout(done, LIBRARY_API_MS));
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'private, max-age=30' }, body: JSON.stringify({ items }) });
  });
  await page.route('**/api/orchestrator/jobs*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"jobs":[]}' }));
  await page.route(/\/api\/tasks(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tasks":[]}' }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* storage blocked */ }
  });
  return traffic;
}
