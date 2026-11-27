/** @jest-environment node */
/**
 * scripts/omni-checks/run.mjs end to end against a fake myavatar.ge on 127.0.0.1: the free price probe comes first,
 * a dry run starts nothing, a paid run makes C1 → C2 → C3 in order with the quoted price, stops on a price that is not
 * the approved row, and never prints or saves the sign-in.
 */
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRET_COOKIE = 'sb-zwksnayknzggdcenqqxy-auth-token=SECRET-COOKIE-VALUE';
const ID12 = 'interactions/new::9:16::1763000000000::o4m2~gj.sig';
const EXT12 = 'interactions/new2::9:16::1763000000000::ox4m2~gj.sig';
const OLD11 = `interactions/old::9:16::${Date.now() - 3 * 864e5}::o4~gj.sig`;
const EXT11 = 'interactions/old2::9:16::1763000000000::ox4~gj.sig';

type Seen = { method: string; path: string; body: Record<string, unknown> | null; cookie: string | undefined };

function fakeSite(opts: { clipPrice?: number; extendPrice?: number; c3Fails?: boolean; hangStart?: boolean; statusSignedOut?: boolean } = {}) {
  const seen: Seen[] = [];
  let balance = 500;
  const polls: Record<string, number> = {};
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      seen.push({ method: req.method ?? '', path: url.pathname, body, cookie: req.headers.cookie });
      const send = (status: number, json: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (url.pathname === '/api/credits/balance') return send(200, { balance });
      if (url.pathname === '/api/video/clip') {
        const price = opts.clipPrice ?? 20;
        if (body?.expectedCredits !== price) return send(409, { error: 'price_changed', credits: price });
        if (opts.hangStart) return; // never answers: the client's timeout must fire
        balance -= price;
        return send(202, { success: true, jobId: ID12, credits: price });
      }
      if (url.pathname === '/api/video/omni-edit') {
        const ext = opts.extendPrice ?? 25;
        if (body?.expectedCredits !== ext) return send(409, { error: 'price_changed', credits: ext });
        balance -= 25;
        return send(202, { success: true, jobId: body.from === ID12 ? EXT12 : EXT11, credits: 25 });
      }
      if (url.pathname === '/api/genjutsu/status') {
        const id = url.searchParams.get('id') ?? '';
        polls[id] = (polls[id] ?? 0) + 1;
        if (opts.statusSignedOut) return send(401, { error: 'unauthorized' });
        if (polls[id] < 2) return send(200, { success: true, done: false, state: 'processing' });
        if (id === EXT11 && opts.c3Fails) {
          balance += 25;
          return send(200, { success: true, done: true, state: 'failed', error: 'generation_failed', refunded: true });
        }
        return send(200, { success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/v.mp4?token=SIGNED' });
      }
      return send(404, {});
    });
  });
  return new Promise<{ base: string; seen: Seen[]; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ base: `http://127.0.0.1:${port}`, seen, close: () => { server.closeAllConnections?.(); server.close(); } });
    });
  });
}

function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, 'run.mjs'), ...args], { env: { PATH: process.env.PATH ?? '', ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

const posts = (seen: Seen[]) => seen.filter((s) => s.method === 'POST').map((s) => `${s.path} ${s.body?.expectedCredits}`);

test('a dry run only asks prices: every POST carries expectedCredits 0 and nothing starts', async () => {
  const site = await fakeSite();
  const r = await run(['--base', site.base, '--from11', OLD11], { MYAVATAR_COOKIE: SECRET_COOKIE });
  site.close();
  expect(r.code).toBe(0);
  expect(posts(site.seen)).toEqual(['/api/video/clip 0', '/api/video/omni-edit 0']);
  expect(r.out).not.toContain('SECRET-COOKIE-VALUE');
});

test('a paid run makes C1, C2, C3 in order at the quoted prices, and the result file holds no secret', async () => {
  const site = await fakeSite();
  const out = mkdtempSync(join(tmpdir(), 'omni-checks-'));
  const r = await run(['--base', site.base, '--go', '--from11', OLD11], { MYAVATAR_COOKIE: SECRET_COOKIE, OMNI_CHECKS_POLL_MS: '5', OMNI_CHECKS_OUT: out });
  site.close();
  expect(posts(site.seen)).toEqual([
    '/api/video/clip 0', '/api/video/clip 20',
    '/api/video/omni-edit 0', '/api/video/omni-edit 25',
    '/api/video/omni-edit 0', '/api/video/omni-edit 25',
  ]);
  const c2 = site.seen.find((s) => s.path === '/api/video/omni-edit' && s.body?.expectedCredits === 25)!;
  expect(c2.body).toMatchObject({ op: 'extend', from: ID12, seconds: 4, resolution: '720p' });
  expect(site.seen.every((s) => s.cookie === SECRET_COOKIE)).toBe(true);
  expect(r.out).toContain('✓ PASS  C1 new clip on 1.2');
  expect(r.out).toContain('✓ PASS  C2 continue on 1.2');
  expect(r.out).toContain('✓ PASS  C3 continue on 1.1');
  expect(r.out).toContain('spent in this run: ✦70');
  expect(r.out).toContain('matches');
  expect(r.code).toBe(0);
  const saved = readFileSync(join(out, readdirSync(out)[0]!), 'utf8');
  for (const leak of ['SECRET-COOKIE-VALUE', 'SIGNED', 'gj.sig']) {
    expect(r.out).not.toContain(leak);
    expect(saved).not.toContain(leak);
  }
});

test('a 1.1 clip Google no longer has ends as a refunded failure, which C3 accepts', async () => {
  const site = await fakeSite({ c3Fails: true });
  const r = await run(['--base', site.base, '--go', '--from11', OLD11], { MYAVATAR_COOKIE: SECRET_COOKIE, OMNI_CHECKS_POLL_MS: '5', OMNI_CHECKS_OUT: mkdtempSync(join(tmpdir(), 'omni-checks-')) });
  site.close();
  expect(r.out).toMatch(/✓ PASS {2}C3 continue on 1\.1: failed_refunded/);
  expect(r.out).toContain('spent in this run: ✦45');
  expect(r.code).toBe(0);
});

test('a price that is not the approved row stops the run before anything is made', async () => {
  const site = await fakeSite({ clipPrice: 29 });
  const r = await run(['--base', site.base, '--go'], { MYAVATAR_COOKIE: SECRET_COOKIE });
  site.close();
  expect(r.code).toBe(1);
  expect(posts(site.seen)).toEqual(['/api/video/clip 0']);
  expect(r.out).toContain('not the approved row');
});

test('refuses a 1.2 clip as --from11, an unknown host, and a run with no sign-in', async () => {
  expect((await run(['--base', 'http://127.0.0.1:9', '--from11', ID12], { MYAVATAR_TOKEN: 't' })).out).toContain('made on 1.2');
  expect((await run(['--base', 'https://evil.example'], { MYAVATAR_TOKEN: 't' })).out).toContain('--base must be');
  expect((await run(['--base', 'http://127.0.0.1:9'], {})).out).toContain('set MYAVATAR_COOKIE or MYAVATAR_TOKEN');
});

test('a C2 price that is not the approved row stops after C1, and C1 (paid) is still saved with its job id', async () => {
  const site = await fakeSite({ extendPrice: 31 });
  const out = mkdtempSync(join(tmpdir(), 'omni-checks-'));
  const r = await run(['--base', site.base, '--go', '--skip-c3'], { MYAVATAR_COOKIE: SECRET_COOKIE, OMNI_CHECKS_POLL_MS: '5', OMNI_CHECKS_OUT: out });
  site.close();
  expect(r.code).toBe(1);
  expect(posts(site.seen)).toEqual(['/api/video/clip 0', '/api/video/clip 20', '/api/video/omni-edit 0']);
  const saved = JSON.parse(readFileSync(join(out, readdirSync(out)[0]!), 'utf8'));
  expect(saved.spent).toBe(20);
  expect(saved.stoppedBecause).toContain('not the approved row');
  expect(saved.results[0]).toMatchObject({ name: 'C1 new clip on 1.2', pass: true, jobId: 'interactions/new::9:16::1763000000000::o4m2' });
  expect(JSON.stringify(saved)).not.toContain('gj.sig');
});

test('a start request with no answer stops the run without retrying it, and says to check the Library', async () => {
  const site = await fakeSite({ hangStart: true });
  const out = mkdtempSync(join(tmpdir(), 'omni-checks-'));
  const r = await run(['--base', site.base, '--go', '--skip-c3'], { MYAVATAR_COOKIE: SECRET_COOKIE, OMNI_CHECKS_OUT: out, OMNI_CHECKS_TIMEOUT_MS: '300' });
  site.close();
  expect(r.code).toBe(1);
  expect(posts(site.seen)).toEqual(['/api/video/clip 0', '/api/video/clip 20']);
  expect(r.out).toContain('nothing is paid twice');
  const saved = JSON.parse(readFileSync(join(out, readdirSync(out)[0]!), 'utf8'));
  expect(saved.results[0]).toMatchObject({ outcome: 'unknown', pass: false });
  expect(saved.results[0].notes[0]).toContain('check the Library');
});

test('a sign-in that expires while polling ends that check at once instead of waiting 6 minutes', async () => {
  const site = await fakeSite({ statusSignedOut: true });
  const r = await run(['--base', site.base, '--go', '--skip-c3'], { MYAVATAR_COOKIE: SECRET_COOKIE, OMNI_CHECKS_POLL_MS: '5', OMNI_CHECKS_OUT: mkdtempSync(join(tmpdir(), 'omni-checks-')) });
  site.close();
  expect(r.code).toBe(1);
  expect(r.out).toContain('no final state (signed_out)');
  expect(r.out).toContain('job: interactions/new::9:16::1763000000000::o4m2');
});
