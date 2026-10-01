/** @jest-environment node */
import {
  parseShots, pendingShots, runQueue, saveOutputs, spent, substitute, PACKS, STOP_AT_USD, JOB_CAP_USD,
  type ArtClient, type Attempt, type Manifest, type Shot,
} from './hf-art-pack';
import { TEMPLATES_BY_TOOL } from '@/lib/studio/templates';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const shots = parseShots(readFileSync(join(process.cwd(), 'scripts/templates/thumbs.md'), 'utf8'));
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

  const fresh = (): Manifest => ({ job: 't', capUsd: 5, stopAtUsd: 4.5, spentUsd: 0, attempts: [], selected: {} });
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
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const reply = (status: number) => ({
    ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'image/png' }),
    arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  }) as unknown as Response;

  test('with fetch mocked, a slash id ("video/teaser") is written into its own folder under raw/', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200));
    const m = fresh();
    const hf = client();
    const save = jest.fn();
    const r = await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { hf, work, save, log: () => {} });
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/out.png');
    expect(m.attempts[0]!.outputs).toEqual([{ url: 'https://cdn.example/out.png', file: 'raw/video/teaser-1-0.png' }]);
    expect(readFileSync(join(work, 'raw/video/teaser-1-0.png'))).toEqual(png);
    expect(m.attempts[0]!.status).toBe('completed');
    expect(r).toEqual({ projectedUsd: 0.02, stopped: false });
    expect(save).toHaveBeenCalled();
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
    const r = await runQueue([shot('a/one'), shot('a/two'), shot('a/three')], fresh(), { dry: true, stopUsd: 0.5 }, { hf, work, save, log: (l) => lines.push(l) });
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
    const r = await runQueue([shot('a/one'), shot('a/two'), shot('a/three')], m, { dry: true, stopUsd: 4.5 }, { hf, work, save: jest.fn(), log: () => {} });
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
    await runQueue([shot('video/teaser')], m, { dry: false, stopUsd: 4.5 }, { hf, work, save: jest.fn(), log: (l) => lines.push(l) });
    expect(hf.estimate).not.toHaveBeenCalled();
    expect(hf.submit).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/video\/teaser: a take is waiting for review/);
  });
});
