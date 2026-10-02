/** @jest-environment node */
import {
  artClientFor, parseShots, pendingShots, providerFromArgv, runQueue, saveInline, saveOutputs, spent, substitute,
  PACKS, PRICES_USD, STOP_AT_USD, JOB_CAP_USD,
  type ArtClient, type Attempt, type Manifest, type Shot,
  throttleWaitMs,
} from './hf-art-pack';
import { createImagenArtClient, createReplicateArtClient, IMAGEN_MODEL, REPLICATE_MODEL } from './art-providers';
import { TEMPLATES_BY_TOOL } from '@/lib/studio/templates';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fresh = (): Manifest => ({ job: 't', capUsd: 5, stopAtUsd: 4.5, spentUsd: 0, attempts: [], selected: {} });
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const reply = (status: number) => ({
  ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'image/png' }),
  arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
}) as unknown as Response;
const md = (blocks: string[]) => blocks.map((b) => `text\n\`\`\`json shot\n${b}\n\`\`\`\n`).join('\n');

describe('the art pack reads its shots from the committed prompt file, nothing else', () => {
  test('parses json shot blocks in order and ignores other code blocks', () => {
    const shots = parseShots(`${md(['{"id":"A1","title":"hero","endpoint":"e/1","input":{"prompt":"p"}}'])}\n\`\`\`json\n{"not":"a shot"}\n\`\`\`\n${md(['{"id":"A2","title":"crop","endpoint":"e/2","input":{"prompt":"q"},"needs":["A1"]}'])}`);
    expect(shots.map((s) => s.id)).toEqual(['A1', 'A2']);
    expect(shots[1]!.needs).toEqual(['A1']);
  });
  test('refuses duplicates and incomplete blocks', () => {
    expect(() => parseShots(md(['{"id":"A1","title":"x","endpoint":"e","input":{}}', '{"id":"A1","title":"y","endpoint":"e","input":{}}']))).toThrow(/duplicate/);
    expect(() => parseShots(md(['{"id":"A1","title":"x","input":{}}']))).toThrow(/missing/);
  });
  test('an id becomes a path under raw/, so it may hold one folder and nothing that climbs out', () => {
    expect(parseShots(md(['{"id":"video/teaser","title":"x","endpoint":"e","input":{}}']))[0]!.id).toBe('video/teaser');
    for (const bad of ['../x', 'a/../../b', 'a/b/c', '/abs', 'a b']) {
      expect(() => parseShots(md([JSON.stringify({ id: bad, title: 'x', endpoint: 'e', input: {} })]))).toThrow(/safe file name/);
    }
  });
  test('the committed spec parses, and every shot keeps text out of the picture', () => {
    const shots = parseShots(readFileSync(join(process.cwd(), 'scripts/hf-art-pack.md'), 'utf8'));
    expect(shots.length).toBeGreaterThanOrEqual(8);
    for (const s of shots) {
      const p = JSON.stringify(s.input).toLowerCase();
      if (s.input.prompt) expect(p).toMatch(/no text/);
    }
  });
});

describe('references and money', () => {
  const m: Manifest = {
    job: 't', capUsd: JOB_CAP_USD, stopAtUsd: STOP_AT_USD, spentUsd: 0, selected: { A1: { url: 'https://cdn.x/a1.png', file: 'raw/A1-1-0.png', attempt: 1 } },
    attempts: [
      { shot: 'A1', attempt: 1, endpoint: 'e', input: {}, requestId: 'r1', usd: 0.03, listUsd: 0.05, status: 'completed', outputs: [], at: '' },
      { shot: 'A2', attempt: 1, endpoint: 'e', input: {}, requestId: 'unknown', usd: 0.02, listUsd: null, status: 'submit_unknown', outputs: [], at: '' },
      { shot: 'A3', attempt: 1, endpoint: 'e', input: {}, requestId: null, usd: 0.5, listUsd: null, status: 'refused', outputs: [], at: '' },
    ],
  };
  test('{{A1}} becomes the selected output URL, deep inside the input', () => {
    expect(substitute({ image_reference: { url: '{{A1}}' }, list: ['{{A1}}'] }, m.selected)).toEqual({ image_reference: { url: 'https://cdn.x/a1.png' }, list: ['https://cdn.x/a1.png'] });
    expect(() => substitute('{{A9}}', m.selected)).toThrow(/no selected output/);
  });
  test('spend counts every SUBMITTED attempt — an ambiguous one too — and never a refused one', () => {
    expect(spent(m)).toBe(0.05);
  });
  test('the stop line sits under the job cap', () => {
    expect(STOP_AT_USD).toBeLessThan(JOB_CAP_USD);
    expect(JOB_CAP_USD).toBe(7);
  });
});

describe('the template thumbnails pack', () => {
  // The interior/ and photoshoot/ shots (the two image workspaces) have their own checks: scripts/templates/thumbs.shoot.test.ts.
  const shots = parseShots(readFileSync(join(process.cwd(), 'scripts/templates/thumbs.md'), 'utf8')).filter((s) => !/^(interior|photoshoot)\//.test(s.id));
  const cards = new Map(Object.entries(TEMPLATES_BY_TOOL).flatMap(([tool, list]) => list.map((t) => [`${tool}/${t.id}`, t.thumb] as const)));

  test('thumbs.md has one shot for each of the 20 cards without a thumbnail, and nothing else', () => {
    expect(shots).toHaveLength(20);
    const missing = [...cards].filter(([, thumb]) => thumb === null).map(([key]) => key);
    expect(shots.map((s) => s.id)).toEqual(expect.arrayContaining(missing));
    for (const s of shots) {
      // A real card that still has no picture — or, once its take is selected, exactly this pack's file.
      expect(cards.has(s.id)).toBe(true);
      expect([null, `/templates/${s.id}.jpg`]).toContain(cards.get(s.id));
    }
  });
  test('every prompt keeps text out of the picture, at the card\'s 3:4', () => {
    for (const s of shots) {
      expect(String(s.input.prompt).toLowerCase()).toContain('no text');
      expect(s.input.aspect_ratio).toBe('3:4');
    }
  });
  test('the templates pack has a $5 cap and a $4.50 stop line', () => {
    expect(PACKS.templates.cap).toBe(5);
    expect(PACKS.templates.stop).toBe(4.5);
  });
  test('no pack keeps its manifest or raw takes under public/ (everything there deploys)', () => {
    const ignored = readFileSync(join(process.cwd(), '.gitignore'), 'utf8').split('\n');
    for (const p of Object.values(PACKS)) {
      expect(p.work).not.toMatch(/^public(\/|$)/);
      expect(ignored).toContain(`/${p.work}/raw/`);
    }
    expect(existsSync(join(process.cwd(), PACKS['brand-v1'].work, 'manifest.json'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public/brand/v1/manifest.json'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'public/templates/manifest.json'))).toBe(false);
  });
});

describe('a run — the provider and fetch stood in for, nothing leaves the machine', () => {
  let work: string;
  beforeEach(() => { work = mkdtempSync(join(tmpdir(), 'art-pack-')); });
  afterEach(() => { rmSync(work, { recursive: true, force: true }); jest.restoreAllMocks(); });

  const shot = (id: string): Shot => ({ id, title: id, endpoint: 'higgsfield-ai/soul/v2/standard', input: { prompt: 'p. No text.' } });
  const take = (shotId: string, status: string, usd = 0.02): Attempt => ({
    shot: shotId, attempt: 1, endpoint: 'e', input: {}, requestId: status === 'refused' ? null : 'r', usd, listUsd: usd, status, outputs: [], at: '',
  });
  const client = (usd: number | null = 0.02) => ({
    estimate: jest.fn(async () => ({ usd, listUsd: usd, providerCredits: usd === null ? null : 1, pricingDescription: null, correlationId: null })),
    submit: jest.fn(async () => ({ requestId: 'req-1', status: 'queued' as const, correlationId: null })),
    status: jest.fn(async (requestId: string) => ({
      requestId, status: 'completed' as const, outputUrls: ['https://cdn.example/out.png'], error: null, correlationId: null,
    })),
  }) satisfies ArtClient;

  test('with fetch mocked, a slash id ("video/teaser") is written into its own folder under raw/', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200));
    const m = fresh();
    const hf = client();
    const save = jest.fn();
    const r = await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { client: hf, work, save, log: () => {} });
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/out.png');
    expect(m.attempts[0]!.outputs).toEqual([{ url: 'https://cdn.example/out.png', file: 'raw/video/teaser-1-0.png' }]);
    expect(readFileSync(join(work, 'raw/video/teaser-1-0.png'))).toEqual(png);
    expect(m.attempts[0]!.status).toBe('completed');
    expect(r).toEqual({ projectedUsd: 0.02, stopped: false });
    expect(save).toHaveBeenCalled();
  });
  test('a 429 throttle waits the named retry_after and resends the SAME attempt (nothing billed, no extra attempt)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200));
    const m = fresh();
    const hf = client();
    const throttled = Object.assign(new Error('concurrency'), { code: 'concurrency', detail: JSON.stringify({ status: 429, retry_after: 8 }) });
    hf.submit.mockRejectedValueOnce(throttled).mockRejectedValueOnce(throttled);
    const waits: number[] = [];
    const r = await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 },
      { client: hf, work, save: jest.fn(), log: () => {}, sleep: async (ms: number) => { waits.push(ms); } });
    expect(hf.submit).toHaveBeenCalledTimes(3);
    expect(waits.slice(0, 2)).toEqual([9000, 9000]);
    expect(m.attempts).toHaveLength(1);
    expect(m.attempts[0]!.status).toBe('completed');
    expect(r.projectedUsd).toBe(0.02);
  });
  test('refused submits (nothing billed) do not use up the 3-attempt cap — the run after funding still goes', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200));
    const m = fresh();
    m.attempts.push(take('video/teaser', 'refused'), { ...take('video/teaser', 'refused'), attempt: 2 }, { ...take('video/teaser', 'refused'), attempt: 3 });
    const hf = client();
    await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { client: hf, work, save: jest.fn(), log: () => {} });
    expect(hf.submit).toHaveBeenCalledTimes(1);
    expect(m.attempts[3]).toMatchObject({ attempt: 4, status: 'completed' });
  });
  test('throttleWaitMs reads retry_after and bounds it', () => {
    expect(throttleWaitMs('{"retry_after":8}')).toBe(9000);
    expect(throttleWaitMs('not json')).toBe(11000);
    expect(throttleWaitMs('{"retry_after":600}')).toBe(60000);
    expect(throttleWaitMs('{"retry_after":0}')).toBe(2000);
  });
  test('a download that fails is said out loud and never recorded as a file', async () => {
    const lines: string[] = [];
    const out = await saveOutputs(['https://cdn.example/x.png'], 'video/noir', 2, work, async () => reply(403), (l) => lines.push(l));
    expect(out).toEqual([{ url: 'https://cdn.example/x.png', file: null }]);
    expect(lines.join('\n')).toMatch(/video\/noir #2: output 0 not saved — HTTP 403/);
    expect(existsSync(join(work, 'raw/video/noir-2-0.png'))).toBe(false);
  });

  test('--dry adds its quotes up and STOPs where a real run would, submitting nothing', async () => {
    const hf = client(0.3);
    const save = jest.fn();
    const lines: string[] = [];
    const r = await runQueue([shot('a/one'), shot('a/two'), shot('a/three')], fresh(), { dry: true, stopUsd: 0.5 }, { client: hf, work, save, log: (l) => lines.push(l) });
    expect(r).toEqual({ projectedUsd: 0.3, stopped: true });
    expect(hf.estimate).toHaveBeenCalledTimes(2); // the second quote crosses the line — the third is never asked for
    expect(lines.some((l) => l.startsWith('STOP: $0.3000 + $0.3000'))).toBe(true);
    expect(hf.submit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  test('--dry under the line prices every shot and projects the total on top of what is already spent', async () => {
    const m = fresh();
    m.attempts.push(take('old', 'completed', 1.0));
    m.selected.old = { url: 'u', file: 'raw/old-1-0.png', attempt: 1 };
    const hf = client(0.02);
    const r = await runQueue([shot('a/one'), shot('a/two'), shot('a/three')], m, { dry: true, stopUsd: 4.5 }, { client: hf, work, save: jest.fn(), log: () => {} });
    expect(r).toEqual({ projectedUsd: 1.06, stopped: false });
    expect(hf.submit).not.toHaveBeenCalled();
    expect(m.attempts).toHaveLength(1);
  });

  test('a take waiting for review holds its shot until --retry; a dead end does not', () => {
    const m = fresh();
    m.attempts.push(take('video/teaser', 'completed'), take('video/anime', 'failed'), take('video/noir', 'submit_unknown'), take('video/reel', 'refused'));
    const all = ['video/teaser', 'video/anime', 'video/noir', 'video/reel', 'video/new'].map(shot);
    const ids = (xs: Shot[]) => xs.map((s) => s.id);
    expect(ids(pendingShots(all, m).queue)).toEqual(['video/anime', 'video/reel', 'video/new']);
    expect(ids(pendingShots(all, m).held)).toEqual(['video/teaser', 'video/noir']);
    expect(ids(pendingShots(all, m, { retry: true }).queue)).toEqual(ids(all));
    expect(pendingShots(all, m, { only: 'video/teaser' }).queue).toEqual([]);
    expect(ids(pendingShots(all, m, { only: 'video/teaser', retry: true }).queue)).toEqual(['video/teaser']);
    m.selected['video/teaser'] = { url: 'u', file: 'raw/video/teaser-1-0.png', attempt: 1 };
    expect(ids(pendingShots(all, m).queue)).not.toContain('video/teaser'); // selected: done, not re-run
  });
  test('a second spend run before review pays for nothing', async () => {
    const m = fresh();
    m.attempts.push(take('video/teaser', 'completed'));
    const hf = client();
    const lines: string[] = [];
    await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { client: hf, work, save: jest.fn(), log: (l) => lines.push(l) });
    expect(hf.estimate).not.toHaveBeenCalled();
    expect(hf.submit).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/video\/teaser: a take is waiting for review/);
  });
});

// ─── The provider seam (docs/SUPER_APP_PLAN.md 2c) ──────────────────────────────────────────────────────────────

const templateShots = parseShots(readFileSync(join(process.cwd(), 'scripts/templates/thumbs.md'), 'utf8')).filter((s) => !/^(interior|photoshoot)\//.test(s.id)); // the original 20 (the new ones: thumbs.shoot.test.ts)
const brandShots = parseShots(readFileSync(join(process.cwd(), 'scripts/hf-art-pack.md'), 'utf8'));
const byId = (id: string) => {
  const s = templateShots.find((x) => x.id === id);
  if (!s) throw new Error(`no template shot ${id}`);
  return s;
};
const json = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
type Call = { url: string; init: RequestInit | undefined };
/** One fetch for the provider AND the downloads, so the order of everything that would leave the machine is visible. */
const network = (route: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fn = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return route(String(url), init);
  });
  return { calls, fetchImpl: fn as unknown as typeof fetch, fn };
};
const said = (calls: Call[]) => calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`);
const REPLICATE_POST = 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions';
const TOKEN = 'r8_TestTokenThatMustNeverBePrinted';

describe('--provider', () => {
  test('hf by default; replicate or imagen on request; nothing else', () => {
    expect(providerFromArgv(['--dry'])).toBe('hf');
    expect(providerFromArgv(['--provider', 'replicate', '--dry'])).toBe('replicate');
    expect(providerFromArgv(['--provider', 'imagen'])).toBe('imagen');
    expect(() => providerFromArgv(['--provider', 'openai'])).toThrow(/unknown --provider/);
    expect(() => providerFromArgv(['--provider'])).toThrow(/unknown --provider/);
  });
  test('a spend run without the provider credential refuses to start; a dry run needs none (and never loads hf)', () => {
    const names = ['REPLICATE_API_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEYS'] as const;
    const saved = names.map((k) => [k, process.env[k]] as const);
    for (const k of names) delete process.env[k];
    const noHf = () => { throw new Error('the Higgsfield client must not load'); };
    try {
      expect(() => artClientFor('replicate', { dry: false }, noHf)).toThrow(/REPLICATE_API_TOKEN is not configured/);
      expect(() => artClientFor('imagen', { dry: false }, noHf)).toThrow(/no Gemini API key/);
      expect(artClientFor('replicate', { dry: true }, noHf).provider).toBe('replicate');
      expect(artClientFor('imagen', { dry: true }, noHf).provider).toBe('imagen');
    } finally {
      for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
    }
  });
});

describe('Replicate · FLUX schnell — the mapping and the quote', () => {
  const r = createReplicateArtClient({ token: TOKEN, fetchImpl: async () => { throw new Error('no network in a mapping test'); } });
  afterEach(() => jest.restoreAllMocks());

  test('a Soul shot becomes a flux-schnell body: the prompt, 3:4, four images, the seed — and no Soul-only field', () => {
    const teaser = byId('video/teaser');
    const req = r.prepare!(teaser.endpoint, teaser.input);
    expect(req).toEqual({
      endpoint: 'black-forest-labs/flux-schnell',
      input: { prompt: teaser.input.prompt, aspect_ratio: '3:4', num_outputs: 4, seed: 261001, output_format: 'png' },
    });
    for (const soulOnly of ['resolution', 'batch_size', 'enhance_prompt', 'style_id']) expect(req.input).not.toHaveProperty(soulOnly);
  });
  test('all 20 template shots carry over; no brand shot does (a Soul style, an edit, a video stays on hf)', () => {
    for (const s of templateShots) expect(r.prepare!(s.endpoint, s.input).endpoint).toBe(REPLICATE_MODEL);
    expect(brandShots.length).toBeGreaterThan(0);
    for (const s of brandShots) expect(() => r.prepare!(s.endpoint, s.input)).toThrow();
    expect(() => r.prepare!('higgsfield-ai/soul/v2/standard', { prompt: 'p', aspect_ratio: '7:3' })).toThrow();
    expect(() => r.prepare!('higgsfield-ai/soul/v2/standard', { prompt: 'p' })).toThrow();
  });
  test('the quote is PRICES_USD × images — $0.012 for a four-image shot — and asks nobody', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(PRICES_USD[REPLICATE_MODEL]).toBe(0.003);
    expect(await r.estimate(REPLICATE_MODEL, { num_outputs: 4 })).toMatchObject({ usd: 0.012, listUsd: 0.012, pricingDescription: null });
    expect((await r.estimate('someone/unpriced-model', { num_outputs: 4 })).usd).toBeNull();
    expect((await r.estimate('constructor', { num_outputs: 4 })).usd).toBeNull();
    expect((await r.estimate(REPLICATE_MODEL, {})).usd).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('a run on another provider — every byte that would leave the machine stood in for', () => {
  let work: string;
  beforeEach(() => { work = mkdtempSync(join(tmpdir(), 'art-seam-')); });
  afterEach(() => { rmSync(work, { recursive: true, force: true }); jest.restoreAllMocks(); });

  test('--provider replicate --dry prices all 20 templates offline: 20 quotes, $0.24, no network, nothing saved', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const client = artClientFor('replicate', { dry: true }, () => { throw new Error('the Higgsfield client must not load'); });
    const save = jest.fn();
    const lines: string[] = [];
    const r = await runQueue(templateShots, fresh(), { dry: true, stopUsd: PACKS.templates.stop }, { client, work, save, log: (l) => lines.push(l) });
    expect(lines.filter((l) => /: quote \$0\.0120 · projected \$/.test(l))).toHaveLength(20);
    expect(r).toEqual({ projectedUsd: 0.24, stopped: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    // Even a stray submit could not leave the machine: a dry client holds no credential.
    await expect(client.submit(REPLICATE_MODEL, { prompt: 'p', num_outputs: 1 })).rejects.toMatchObject({ code: 'not_configured' });
  });

  test('a spend run: ONE POST that waits for the take, then its files at once — no poll, no Soul field on the wire', async () => {
    const outs = ['https://replicate.delivery/xezq/a/out-0.png', 'https://replicate.delivery/xezq/a/out-1.png'];
    const net = network((url) => (url === REPLICATE_POST ? json(201, { id: 'p7q2abc9xyz', status: 'succeeded', output: outs }) : reply(200)));
    const client = createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl });
    const m = fresh();
    const r = await runQueue([byId('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { client, work, save: jest.fn(), log: () => {}, fetchImpl: net.fetchImpl });

    expect(said(net.calls)).toEqual([`POST ${REPLICATE_POST}`, `GET ${outs[0]}`, `GET ${outs[1]}`]);
    const post = net.calls[0]!.init!;
    expect((post.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect((post.headers as Record<string, string>).Prefer).toBe('wait=60');
    const body = JSON.parse(String(post.body)) as { input: Record<string, unknown> };
    expect(Object.keys(body.input).sort()).toEqual(['aspect_ratio', 'num_outputs', 'output_format', 'prompt', 'seed']);

    const a = m.attempts[0]!;
    expect(a).toMatchObject({ provider: 'replicate', endpoint: REPLICATE_MODEL, input: body.input, requestId: 'p7q2abc9xyz', usd: 0.012, status: 'completed' });
    expect(a.outputs.map((o) => o.file)).toEqual(['raw/video/teaser-1-0.png', 'raw/video/teaser-1-1.png']);
    expect(readFileSync(join(work, 'raw/video/teaser-1-1.png'))).toEqual(png);
    expect(r).toEqual({ projectedUsd: 0.012, stopped: false });
  });

  test('still running when the wait ends: polled by its id until done, then downloaded', async () => {
    let polls = 0;
    const net = network((url) => {
      if (url === REPLICATE_POST) return json(201, { id: 'p7q2abc9xyz', status: 'processing', output: null });
      if (url === 'https://api.replicate.com/v1/predictions/p7q2abc9xyz') {
        polls += 1;
        return json(200, polls < 2 ? { id: 'p7q2abc9xyz', status: 'processing' } : { id: 'p7q2abc9xyz', status: 'succeeded', output: ['https://replicate.delivery/x/out-0.png'] });
      }
      return reply(200);
    });
    const client = createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl });
    const m = fresh();
    await runQueue([byId('image/poster')], m, { dry: false, stopUsd: 4.5 }, { client, work, save: jest.fn(), log: () => {}, fetchImpl: net.fetchImpl, sleep: async () => {} });
    expect(said(net.calls)).toEqual([
      `POST ${REPLICATE_POST}`,
      'GET https://api.replicate.com/v1/predictions/p7q2abc9xyz',
      'GET https://api.replicate.com/v1/predictions/p7q2abc9xyz',
      'GET https://replicate.delivery/x/out-0.png',
    ]);
    expect(m.attempts[0]).toMatchObject({ status: 'completed', outputs: [{ url: 'https://replicate.delivery/x/out-0.png', file: 'raw/image/poster-1-0.png' }] });
  });

  test('STOP refuses BEFORE the POST: the shot that would cross the line is never sent, nor logged as an attempt', async () => {
    const net = network((url) => (url === REPLICATE_POST ? json(201, { id: 'p7q2abc9xyz', status: 'succeeded', output: [] }) : reply(200)));
    const client = createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl });
    const lines: string[] = [];
    // A $0.02 line: the first shot ($0.012) runs; the second would make $0.024.
    const m = fresh();
    const r = await runQueue([byId('video/anime'), byId('video/noir'), byId('image/anime')], m, { dry: false, stopUsd: 0.02 },
      { client, work, save: jest.fn(), log: (l) => lines.push(l), fetchImpl: net.fetchImpl });
    expect(said(net.calls).filter((c) => c.startsWith('POST'))).toHaveLength(1);
    expect(m.attempts.map((a) => a.shot)).toEqual(['video/anime']);
    expect(lines.some((l) => l.startsWith('STOP: $0.0120 + $0.0120 would pass the $0.02 stop line'))).toBe(true);
    expect(r.stopped).toBe(true);

    // Already at the line: nothing at all is sent.
    const full = fresh();
    full.attempts.push({ shot: 'old', attempt: 1, endpoint: 'e', input: {}, requestId: 'r', usd: 4.49, listUsd: 4.49, status: 'completed', outputs: [], at: '' });
    full.selected.old = { url: 'https://cdn.x/old.png', file: 'raw/old-1-0.png', attempt: 1 };
    const quiet = network(() => { throw new Error('nothing may be sent past the stop line'); });
    const r2 = await runQueue([byId('video/teaser')], full, { dry: false, stopUsd: 4.5 },
      { client: createReplicateArtClient({ token: TOKEN, fetchImpl: quiet.fetchImpl }), work, save: jest.fn(), log: () => {}, fetchImpl: quiet.fetchImpl });
    expect(quiet.fn).not.toHaveBeenCalled();
    expect(full.attempts).toHaveLength(1);
    expect(r2.stopped).toBe(true);
  });

  test.each([
    ['no answer at all', () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))],
    ['a 502', () => json(502, '<html>bad gateway</html>')],
    ['a 2xx it cannot read', () => json(201, 'not json')],
  ])('an ambiguous submit (%s) is COUNTED as spent and never re-POSTed', async (_why, answer) => {
    const net = network((url) => (url === REPLICATE_POST ? answer() : reply(200)));
    const client = createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl });
    const m = fresh();
    const deps = { client, work, save: jest.fn(), log: () => {}, fetchImpl: net.fetchImpl };
    await runQueue([byId('music/georgian-folk')], m, { dry: false, stopUsd: 4.5 }, deps);
    expect(m.attempts[0]).toMatchObject({ provider: 'replicate', status: 'submit_unknown', requestId: 'unknown', usd: 0.012 });
    expect(spent(m)).toBe(0.012);
    await runQueue([byId('music/georgian-folk')], m, { dry: false, stopUsd: 4.5 }, deps); // a second run before review
    expect(net.fn).toHaveBeenCalledTimes(1);
  });

  test('a refused submit (422) costs nothing, and the provider text it prints carries no credential', async () => {
    const net = network(() => json(422, { detail: `input invalid for token ${TOKEN}` }));
    const lines: string[] = [];
    const m = fresh();
    await runQueue([byId('music/rnb-beat')], m, { dry: false, stopUsd: 4.5 },
      { client: createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl }), work, save: jest.fn(), log: (l) => lines.push(l), fetchImpl: net.fetchImpl });
    expect(m.attempts[0]).toMatchObject({ status: 'refused', requestId: null });
    expect(spent(m)).toBe(0);
    expect(lines.join('\n')).toContain('[redacted]');
    expect(`${lines.join('\n')}${JSON.stringify(m)}`).not.toContain(TOKEN);
  });

  test('a brand shot asked of Replicate is refused before any price or call, with the reason', async () => {
    const net = network(() => { throw new Error('nothing may be sent'); });
    const lines: string[] = [];
    const a1 = brandShots.find((s) => s.id === 'A1')!;
    await runQueue([a1], fresh(), { dry: false, stopUsd: 4.5 },
      { client: createReplicateArtClient({ token: TOKEN, fetchImpl: net.fetchImpl }), work, save: jest.fn(), log: (l) => lines.push(l) });
    expect(net.fn).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/A1: not run on replicate — carries style_id, which only Higgsfield understands/);
  });
});

describe('Imagen · the key in a header, the images straight to disk', () => {
  const KEY = 'AQ.TestGeminiKeyThatMustNeverBePrinted';
  const PREDICT = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';
  let work: string;
  beforeEach(() => { work = mkdtempSync(join(tmpdir(), 'art-imagen-')); });
  afterEach(() => { rmSync(work, { recursive: true, force: true }); jest.restoreAllMocks(); });

  test('a Soul shot becomes an Imagen :predict body (no seed, no Soul field), quoted at $0.04 an image, offline', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const c = createImagenArtClient({ apiKey: KEY, fetchImpl: async () => { throw new Error('no network'); } });
    const noir = byId('video/noir');
    const req = c.prepare!(noir.endpoint, noir.input);
    expect(req).toEqual({
      endpoint: IMAGEN_MODEL,
      input: { instances: [{ prompt: noir.input.prompt }], parameters: { sampleCount: 4, aspectRatio: '3:4', personGeneration: 'allow_all' } },
    });
    expect((await c.estimate(req.endpoint, req.input)).usd).toBe(0.16);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('--provider imagen --dry: 20 quotes, $3.20 — under the $4.50 line — and no network', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const lines: string[] = [];
    const r = await runQueue(templateShots, fresh(), { dry: true, stopUsd: PACKS.templates.stop },
      { client: artClientFor('imagen', { dry: true }), work, save: jest.fn(), log: (l) => lines.push(l) });
    expect(lines.filter((l) => /: quote \$0\.1600 · projected \$/.test(l))).toHaveLength(20);
    expect(r).toEqual({ projectedUsd: 3.2, stopped: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a spend run: ONE POST, x-goog-api-key and never ?key=, the base64 written straight to disk — nothing fetched', async () => {
    const a = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
    const b = Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 7]);
    const net = network(() => json(200, { predictions: [
      { bytesBase64Encoded: a.toString('base64'), mimeType: 'image/png' },
      { raiFilteredReason: 'filtered' },
      { bytesBase64Encoded: b.toString('base64'), mimeType: 'image/png' },
    ] }));
    const c = createImagenArtClient({ apiKey: KEY, fetchImpl: net.fetchImpl });
    const m = fresh();
    await runQueue([byId('image/oil-painting')], m, { dry: false, stopUsd: 4.5 }, { client: c, work, save: jest.fn(), log: () => {}, fetchImpl: net.fetchImpl });

    expect(said(net.calls)).toEqual([`POST ${PREDICT}`]);
    expect(net.calls[0]!.url).not.toMatch(/[?&]key=/);
    expect((net.calls[0]!.init!.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(net.calls[0]!.init!.redirect).toBe('manual');
    const at = m.attempts[0]!;
    expect(at).toMatchObject({ provider: 'imagen', endpoint: IMAGEN_MODEL, status: 'completed', usd: 0.16 });
    expect(at.requestId).toMatch(/^imagen-/);
    expect(at.outputs).toEqual([
      { url: 'inline:image/png', file: 'raw/image/oil-painting-1-0.png' },
      { url: 'inline:image/png', file: 'raw/image/oil-painting-1-1.png' },
    ]);
    expect(readFileSync(join(work, 'raw/image/oil-painting-1-0.png'))).toEqual(a);
    expect(readFileSync(join(work, 'raw/image/oil-painting-1-1.png'))).toEqual(b);
    const logged = JSON.stringify(m);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(a.toString('base64')); // the manifest records the file, never the bytes
  });

  test('every sample filtered: a dead end that was still paid for; a timeout: ambiguous and counted', async () => {
    const m = fresh();
    const filtered = network(() => json(200, { predictions: [{ raiFilteredReason: 'filtered' }] }));
    await runQueue([byId('image/anime')], m, { dry: false, stopUsd: 4.5 },
      { client: createImagenArtClient({ apiKey: KEY, fetchImpl: filtered.fetchImpl }), work, save: jest.fn(), log: () => {} });
    expect(m.attempts[0]).toMatchObject({ status: 'nsfw', outputs: [] });

    const slow = network(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })));
    await runQueue([byId('image/social')], m, { dry: false, stopUsd: 4.5 },
      { client: createImagenArtClient({ apiKey: KEY, fetchImpl: slow.fetchImpl }), work, save: jest.fn(), log: () => {} });
    expect(m.attempts[1]).toMatchObject({ status: 'submit_unknown', requestId: 'unknown' });
    expect(spent(m)).toBe(0.32);
  });

  test('a refusal that quotes the key is printed scrubbed, and costs nothing', async () => {
    const net = network(() => json(400, { error: { status: 'INVALID_ARGUMENT', message: `API key ${KEY} not valid` } }));
    const lines: string[] = [];
    const m = fresh();
    await runQueue([byId('image/concept')], m, { dry: false, stopUsd: 4.5 },
      { client: createImagenArtClient({ apiKey: KEY, fetchImpl: net.fetchImpl }), work, save: jest.fn(), log: (l) => lines.push(l) });
    expect(m.attempts[0]).toMatchObject({ status: 'refused' });
    expect(spent(m)).toBe(0);
    expect(lines.join('\n')).toContain('[redacted]');
    expect(lines.join('\n')).not.toContain(KEY);
  });

  test('an inline take is saved under raw/, and can never be handed to another shot as a URL', () => {
    expect(saveInline([{ bytes: png, mimeType: 'image/jpeg' }], 'video/teaser', 2, work, () => {}, 1))
      .toEqual([{ url: 'inline:image/jpeg', file: 'raw/video/teaser-2-1.jpg' }]);
    expect(readFileSync(join(work, 'raw/video/teaser-2-1.jpg'))).toEqual(png);
    expect(() => substitute('{{A1}}', { A1: { url: 'inline:image/png', file: 'raw/A1-1-0.png', attempt: 1 } })).toThrow(/no provider URL/);
  });
});
