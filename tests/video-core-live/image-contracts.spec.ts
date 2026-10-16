import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { networkInterfaces } from 'node:os';
import sharp from 'sharp';
import { IMAGE_KIND, type ImagePlan } from '../../lib/image/studio/contracts';

// Picked up by the existing Video Core "api" project (contracts.spec.ts suffix).
// Real local Auth/PostgREST/Storage, synthetic seeded images. No quote, confirm or provider call.
test.describe('Image Studio free boundaries on the existing isolated Supabase stack', () => {
  // This suite certifies only the local stack. The shared config also serves an opt-in remote Preview.
  test.skip(process.env.VIDEO_CORE_PREVIEW_E2E === '1', 'Local Supabase Image boundaries only; hosted Preview acceptance remains separate.');
  test.setTimeout(60_000);
  let service: SupabaseClient, a: SupabaseClient, b: SupabaseClient;
  let aToken: string, bToken: string, aId: string, bId: string, origin: string;
  let png: Buffer, digest: string, initialBalance: number, initialLedger: number;
  const ids = [randomUUID(), randomUUID()];
  const paths: string[] = [];
  const userHeaders = (token: string) => ({ Authorization: 'Bearer ' + token });
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });

  test.beforeAll(async () => {
    // No hosted or arbitrary preview environment is accepted by this free test.
    expect(process.env.VIDEO_CORE_LIVE_E2E).toBe('1');
    origin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    expect(new URL(origin).origin).toBe('https://supabase.video-core-e2e.test:54443');
    expect(new URL(process.env.E2E_DB_URL ?? '').hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    const app = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000');
    expect(['localhost', '127.0.0.1']).toContain(app.hostname);
    const ips = (await lookup('supabase.video-core-e2e.test', { all: true, family: 4 })).map(x => x.address);
    expect([...new Set(ips)]).toEqual(['1.2.3.4']);
    expect(Object.values(networkInterfaces()).flat().some(x => x?.address === '1.2.3.4')).toBe(true);
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    expect(anon.length).toBeGreaterThan(20); expect(key.length).toBeGreaterThan(20);
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };
    service = createClient(origin, key, options);
    a = createClient(origin, anon, options); b = createClient(origin, anon, options);
    const users = JSON.parse(process.env.E2E_USERS ?? '{}') as Record<string, { id: string; email: string }>;
    expect(users.desktop).toBeTruthy(); expect(users.mobile).toBeTruthy();
    const signedA = await a.auth.signInWithPassword({ email: users.desktop.email, password: process.env.E2E_PASSWORD ?? '' });
    const signedB = await b.auth.signInWithPassword({ email: users.mobile.email, password: process.env.E2E_PASSWORD ?? '' });
    expect(signedA.error).toBeNull(); expect(signedB.error).toBeNull();
    aToken = signedA.data.session!.access_token; bToken = signedB.data.session!.access_token;
    aId = signedA.data.user!.id; bId = signedB.data.user!.id;
    expect(aId).not.toBe(bId);
    const bucket = await service.storage.getBucket('renders');
    expect(bucket.error).toBeNull(); expect(bucket.data?.public).toBe(false);
    const profile = await service.from('profiles').select('credits_balance').eq('id', aId).single();
    expect(profile.error).toBeNull(); initialBalance = profile.data!.credits_balance;
    const ledger = await service.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('user_id', aId);
    expect(ledger.error).toBeNull(); initialLedger = ledger.count!;
    png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#3377cc' } }).png().toBuffer();
    digest = hash(png);
    for (const [n, id] of ids.entries()) {
      const path = 'image-studio/' + aId + '/' + id + '/result.png';
      paths.push(path);
      const upload = await service.storage.from('renders').upload(path, png, { contentType: 'image/png', upsert: false });
      expect(upload.error).toBeNull();
      const signed = await service.storage.from('renders').createSignedUrl(path, 120);
      expect(signed.error).toBeNull();
      const plan: ImagePlan = {
        v: 1, kind: IMAGE_KIND, transport: 'gemini_api', references: [],
        request: { v: 1, operation: 'generate', originalPrompt: 'SYNTHETIC ISOLATED FIXTURE - not provider output',
          instructions: [], references: [], modelId: 'gemini-3.1-flash-image', aspectRatio: '1:1', resolution: '1K',
          count: 1, locale: 'en', ...(n ? { parentJobId: ids[0] } : {}) },
      };
      const saved = { path, url: signed.data!.signedUrl, width: 1024, height: 1024, bytes: png.length, mime: 'image/png', digest };
      const inserted = await service.from('generation_jobs').insert({
        id, user_id: aId, service_type: 'image', status: 'completed', pct: 100,
        params: { prompt: plan.request.originalPrompt, _job: plan, _image: { saved },
          _exec: { kind: IMAGE_KIND, v: 1, attempt: 1, maxAttempts: 1, owner: null, leaseUntil: null } },
        result: { url: saved.url, qc: { syntheticFixture: true, visualAdherence: 'unverified' } }, signed_url: saved.url,
      });
      expect(inserted.error).toBeNull();
    }
  });

  test.afterAll(async () => {
    if (!service) return;
    if (aId) {
      const profile = await service.from('profiles').select('credits_balance').eq('id', aId).single();
      const ledger = await service.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('user_id', aId);
      expect(profile.error).toBeNull(); expect(ledger.error).toBeNull();
      expect(profile.data!.credits_balance).toBe(initialBalance);
      expect(ledger.count).toBe(initialLedger);
    }
    const removed = await service.from('generation_jobs').delete().in('id', ids);
    expect(removed.error).toBeNull();
    if (paths.length) expect((await service.storage.from('renders').remove(paths)).error).toBeNull();
  });

  test('real Auth identifies the owner; anonymous Image access is refused', async ({ request }) => {
    expect((await request.get('/api/image/models', { timeout: 15_000 })).status()).toBe(401);
    const response = await request.get('/api/image/models', { headers: userHeaders(aToken), timeout: 15_000 });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ userId: aId, liveOperationVerified: false });
  });

  test('real DB RLS, asset signing, version lineage and Library isolate two users', async ({ request }) => {
    const own = await a.from('generation_jobs').select('id').in('id', ids);
    const foreign = await b.from('generation_jobs').select('id').in('id', ids);
    expect(own.error).toBeNull(); expect(own.data).toHaveLength(2);
    expect(foreign.error).toBeNull(); expect(foreign.data).toEqual([]);
    const asset = await request.get('/api/image/assets/' + ids[0], { headers: userHeaders(aToken), timeout: 15_000 });
    expect(asset.status()).toBe(200);
    const data = await asset.json();
    const response = await boundedFetch(data.image.url);
    expect(response.status).toBe(200); expect(hash(Buffer.from(await response.arrayBuffer()))).toBe(digest);
    const versions = await request.get('/api/image/assets/' + ids[0] + '/versions', { headers: userHeaders(aToken), timeout: 15_000 });
    expect(versions.status()).toBe(200);
    expect((await versions.json()).children.map((x: { id: string }) => x.id)).toContain(ids[1]);
    for (const suffix of ['', '/versions']) {
      expect((await request.get('/api/image/assets/' + ids[0] + suffix, { headers: userHeaders(bToken), timeout: 15_000 })).status()).toBe(404);
    }
    for (const [token, visible] of [[aToken, true], [bToken, false]] as const) {
      const library = await request.get('/api/studio/library?kind=image&limit=60', { headers: userHeaders(token), timeout: 15_000 });
      expect(library.status()).toBe(200);
      const found = (await library.json()).items.some((x: { id: string }) => x.id === ids[0]);
      expect(found).toBe(visible);
    }
  });

  test('private Storage refuses public URLs and foreign direct reads or signatures', async ({ request }) => {
    const direct = await request.get(origin + '/storage/v1/object/public/renders/' + paths[0], { timeout: 15_000 });
    expect([400, 401, 403, 404]).toContain(direct.status());
    const download = await b.storage.from('renders').download(paths[0]);
    expect(download.data).toBeNull(); expect(download.error).not.toBeNull();
    const signed = await b.storage.from('renders').createSignedUrl(paths[0], 60);
    expect(signed.data).toBeNull(); expect(signed.error).not.toBeNull();
  });
});
