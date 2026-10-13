/** @jest-environment node */
// Every cron route reads live. Next 14 keeps a GET route's fetches in its Data Cache: `dynamic = 'force-dynamic'` does
// not opt out, and a cron's Bearer check reads req.headers, which does not either. A GET-only route then answers a read
// by the same URL with what its first call saw, in every later call (measured on next 14.2.35 with supabase-js: the same
// select by id returned the same answer within a call and across calls). That is how the media sweep's retries heard
// 'lost' on their first heartbeat (app/api/agent/media/sweep/route.ts). `fetchCache = 'force-no-store'` is the opt-out.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const NO_STORE = /^export const fetchCache = 'force-no-store';$/m;

// Its file lives on the BOG Payments branch, which this one does not touch. It also exports POST, so Next already
// skips the cache for its fetches that carry an Authorization header (the Supabase client's and the bank's).
const OWNED_ELSEWHERE = new Set(['/api/cron/bog-billing']);

const fileOf = (path: string) => join(ROOT, 'app', ...path.replace(/^\//, '').split('/'), 'route.ts');
const scheduled = (JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).crons as { path: string }[]).map((c) => c.path.split('?')[0]);
const cronFolder = readdirSync(join(ROOT, 'app', 'api', 'cron')).map((d) => `/api/cron/${d}`).filter((p) => existsSync(fileOf(p)));
const routes = [...new Set([...scheduled, ...cronFolder])].filter((p) => !OWNED_ELSEWHERE.has(p)).sort();

describe('cron routes opt out of the fetch cache', () => {
  it('finds the scheduled routes, the media sweep among them', () => {
    expect(scheduled).toContain('/api/agent/media/sweep');
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it.each(routes)('%s', (path) => {
    expect(existsSync(fileOf(path))).toBe(true);
    const src = readFileSync(fileOf(path), 'utf8');
    expect(src).toMatch(/^export const dynamic = 'force-dynamic';$/m);
    expect(src).toMatch(NO_STORE);
  });
});
