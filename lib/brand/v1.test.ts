/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_V1 } from './v1';

const pub = (src: string) => join(process.cwd(), 'public', src);

describe('brand/v1 — every file the site references exists, and the spend is on record', () => {
  const files: string[] = [
    BRAND_V1.hero16x9.src, BRAND_V1.hero9x16.src, BRAND_V1.plate.src, BRAND_V1.world.src, BRAND_V1.og.src,
    ...Object.values(BRAND_V1.cards).map((c) => c.src),
    ...(BRAND_V1.heroLoop ? [BRAND_V1.heroLoop.src, BRAND_V1.heroLoop.poster] : []),
    ...BRAND_V1.reels.flatMap((r) => [r.src, r.poster]),
  ];
  test.each(files)('%s exists', (src) => {
    expect(existsSync(pub(src))).toBe(true);
  });

  test('the manifest logs every request and stays under the $6.50 stop line', () => {
    const m = JSON.parse(readFileSync(join(process.cwd(), 'public/brand/v1/manifest.json'), 'utf8')) as {
      spentUsd: number; stopAtUsd: number; capUsd: number; attempts: Array<{ shot: string; usd: number | null; requestId: string | null }>;
    };
    expect(m.capUsd).toBe(7);
    expect(m.spentUsd).toBeLessThanOrEqual(m.stopAtUsd);
    for (const a of m.attempts.filter((x) => x.requestId)) expect(typeof a.usd).toBe('number');
    const perShot = new Map<string, number>();
    for (const a of m.attempts) perShot.set(a.shot, (perShot.get(a.shot) ?? 0) + 1);
    for (const [, n] of perShot) expect(n).toBeLessThanOrEqual(3); // the first try + at most 2 retries
  });
});
