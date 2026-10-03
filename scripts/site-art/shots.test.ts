/** @jest-environment node */
/**
 * The `site` art pack (scripts/site-art/shots.md — site imagery v2): one shot per VFX preset, per video header banner, per
 * /services card that had no picture and per image style; each at the aspect its surface shows, each with the no-text
 * rule, each carried over to FLUX schnell offline — and the whole pack priced far under its stop line. Nothing here
 * spends or calls out.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GENJUTSU_PRESETS } from '../../lib/genjutsu/presets';
import { IMG_STYLES, imageStyleSlug } from '../../lib/studio/imageCreate';
import { SERVICE_VISUALS } from '../../lib/services/visuals';
import { createReplicateArtClient, offlineFetch } from '../art-providers';
import { PACKS, packFromArgv, parseShots, runQueue, type Manifest } from '../hf-art-pack';

const ROOT = process.cwd();
const shots = parseShots(readFileSync(join(ROOT, PACKS.site.spec), 'utf8'));
const group = (g: string) => shots.filter((s) => s.id.startsWith(`${g}/`));
const fresh = (): Manifest => ({ job: 't', capUsd: 3, stopAtUsd: 2.7, spentUsd: 0, attempts: [], selected: {} });

test('--pack site selects this pack: a $3 cap, a $2.70 stop line, a work dir outside public/', () => {
  expect(packFromArgv(['--pack', 'site'])).toBe('site');
  expect(PACKS.site).toMatchObject({ spec: 'scripts/site-art/shots.md', work: 'scripts/site-art', cap: 3, stop: 2.7 });
  expect(PACKS.site.work).not.toMatch(/^public(\/|$)/);
});

test('one shot per VFX preset, per banner, per missing service card and per image style — nothing else', () => {
  expect(group('vfx').map((s) => s.id.slice(4)).sort()).toEqual(GENJUTSU_PRESETS.map((p) => p.id).sort());
  expect(group('hero').map((s) => s.id.slice(5)).sort()).toEqual(['fast', 'lite', 'model', 'musicvideo', 'standard']);
  const services = group('services').map((s) => s.id.slice(9));
  expect(services.sort()).toEqual(['character', 'content-writer', 'event', 'podcast', 'prompt-builder', 'terminal', 'voice']);
  for (const id of services) expect(SERVICE_VISUALS[id]).toBeDefined(); // a card the hub really renders
  // 'Auto' has no look of its own to show — it keeps an icon, not a swatch.
  expect(group('style').map((s) => s.id.slice(6)).sort()).toEqual(IMG_STYLES.filter((s) => s !== 'Auto').map(imageStyleSlug).sort());
  expect(shots).toHaveLength(group('vfx').length + group('hero').length + group('services').length + group('style').length);
});

test('every prompt keeps text out of the picture, at the aspect its surface crops from, on one seed', () => {
  const aspect: Record<string, string> = { vfx: '3:4', hero: '21:9', services: '1:1', style: '1:1' };
  for (const s of shots) {
    const p = String(s.input.prompt);
    expect(p).toMatch(/No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders\.$/);
    expect(p).toMatch(/^[\x20-\x7E·—„"éè]+$/); // plain English (FLUX reads English)
    expect(s.input.aspect_ratio).toBe(aspect[s.id.split('/')[0]!]);
    expect(s.input).toMatchObject({ batch_size: 4, seed: 261102 });
    expect(s.endpoint).toBe('higgsfield-ai/soul/v2/standard');
  }
});

test('--provider replicate --dry prices all of it offline, far under the stop line, and touches nothing', async () => {
  const work = mkdtempSync(join(tmpdir(), 'site-art-'));
  try {
    const client = createReplicateArtClient({ token: '', fetchImpl: offlineFetch });
    const save = jest.fn();
    const lines: string[] = [];
    const r = await runQueue(shots, fresh(), { dry: true, stopUsd: PACKS.site.stop }, { client, work, save, log: (l) => lines.push(l) });
    expect(lines.filter((l) => /: quote \$0\.0120 · projected \$/.test(l))).toHaveLength(shots.length);
    expect(r.stopped).toBe(false);
    expect(r.projectedUsd).toBeCloseTo(shots.length * 0.012, 6);
    expect(r.projectedUsd).toBeLessThan(PACKS.site.stop / 3);
    expect(save).not.toHaveBeenCalled();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
