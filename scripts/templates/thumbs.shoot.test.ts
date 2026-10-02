/** @jest-environment node */
/**
 * The art-pack shots for the Interior designer's styles and the Photographer's presets (scripts/templates/thumbs.md,
 * `interior/…` and `photoshoot/…`): one per card, 3:4, no text in the picture, carried over to FLUX schnell offline — and
 * the thumb scripts find the cards' `thumb:` lines in their own files. Nothing here spends or calls out.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTERIOR_TEMPLATES } from '../../lib/studio/templates.interior';
import { PHOTOSHOOT_TEMPLATES } from '../../lib/studio/templates.photoshoot';
import { createReplicateArtClient, offlineFetch } from '../art-providers';
import { PACKS, parseShots, runQueue, type Manifest } from '../hf-art-pack';
import { thumbLineChanges } from './build-thumbs.mjs';

const ROOT = process.cwd();
const all = parseShots(readFileSync(join(ROOT, 'scripts/templates/thumbs.md'), 'utf8'));
const mine = all.filter((s) => /^(interior|photoshoot)\//.test(s.id));
const wanted = [
  ...INTERIOR_TEMPLATES.map((t) => `interior/${t.id}`),
  ...PHOTOSHOOT_TEMPLATES.map((t) => `photoshoot/${t.id}`),
];

test('one shot for every interior style and photoshoot preset, and nothing else; ids stay unique across the whole pack', () => {
  expect(mine.map((s) => s.id).sort()).toEqual([...wanted].sort());
  expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  expect(mine.length).toBeGreaterThanOrEqual(22);
});

test('every prompt is plain descriptive English at the card\'s 3:4 with the no-text rule', () => {
  for (const s of mine) {
    const prompt = String(s.input.prompt);
    expect(s.input.aspect_ratio).toBe('3:4');
    expect(prompt.toLowerCase()).toContain('no text');
    expect(prompt.toLowerCase()).toContain('no logos');
    expect(prompt.length).toBeGreaterThan(160);
    expect(prompt.length).toBeLessThan(1200);
    expect(s.endpoint).toBe('higgsfield-ai/soul/v2/standard'); // a plain Soul text-to-image shot: replicate / imagen can carry it
  }
});

test('they price offline on FLUX schnell: $0.012 a shot, well under the $4.50 stop line together with the original 20', async () => {
  const client = createReplicateArtClient({ token: '', fetchImpl: offlineFetch });
  const manifest: Manifest = { job: 'x', capUsd: 5, stopAtUsd: 4.5, spentUsd: 0, attempts: [], selected: {} };
  const lines: string[] = [];
  const r = await runQueue(mine, manifest, { dry: true, stopUsd: PACKS.templates.stop }, { client, work: '/nonexistent', save: () => undefined, log: (l) => lines.push(l) });
  expect(lines.filter((l) => /: quote \$0\.0120 · projected \$/.test(l))).toHaveLength(mine.length);
  expect(r.stopped).toBe(false);
  expect(r.projectedUsd).toBeCloseTo(0.012 * mine.length, 4);
});

test('build-thumbs finds each card\'s `thumb:` line in its own file', () => {
  for (const [tool, file, list] of [
    ['interior', 'lib/studio/templates.interior.ts', INTERIOR_TEMPLATES],
    ['photoshoot', 'lib/studio/templates.photoshoot.ts', PHOTOSHOOT_TEMPLATES],
  ] as const) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const changes = thumbLineChanges(source, list.map((t) => `${tool}/${t.id}`)) as { id: string; state: string; after: string | null }[];
    for (const c of changes) {
      expect({ id: c.id, state: c.state }).toEqual({ id: c.id, state: 'change' }); // thumb: null → the shot's file
      expect(c.after).toContain(`/templates/${c.id}.jpg`);
    }
  }
});
