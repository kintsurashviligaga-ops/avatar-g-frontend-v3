/** @jest-environment node */
/**
 * lib/services/cardImage.ts against public/services/: every listed still exists, every still is listed, and every service
 * the hub or a /services/<slug> page renders has one — so neither a hub card nor a workspace header falls back to a
 * placeholder (or requests a file that 404s).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_CARD_IMAGE_IDS, serviceCardImage } from './cardImage';
import { SERVICE_VISUALS } from './visuals';

const DIR = join(process.cwd(), 'public/services');

test('every listed still is on disk, and every still on disk is listed', () => {
  for (const id of SERVICE_CARD_IMAGE_IDS) expect(existsSync(join(DIR, `${id}.webp`))).toBe(true);
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, ''));
  expect([...SERVICE_CARD_IMAGE_IDS].sort()).toEqual(onDisk.sort());
});

test('every card the hub renders, and every /services/<slug> page, has a still — the SVG fallback is never the first paint', () => {
  for (const id of Object.keys(SERVICE_VISUALS)) expect(serviceCardImage(id)).toBe(`/services/${id}.webp`);
  const page = readFileSync(join(process.cwd(), 'app/[locale]/services/[slug]/page.tsx'), 'utf8');
  const slugs = [...(page.match(/const SHORT_SLUGS = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
  expect(slugs.length).toBeGreaterThanOrEqual(25);
  for (const slug of slugs) expect(serviceCardImage(slug)).not.toBeNull();
});

test('anything else → null: the caller keeps its own fallback and never requests a missing file', () => {
  for (const id of ['', 'nope', 'constructor', '__proto__', '../avatar', null, undefined]) expect(serviceCardImage(id)).toBeNull();
});
