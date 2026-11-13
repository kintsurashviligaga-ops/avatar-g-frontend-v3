/** @jest-environment node */
/**
 * The committed seed SQL and review list stay equal to lib/billing/v5/priceDrafts.ts.
 * Regenerate after editing the drafts: WRITE_PRICE_DRAFTS=1 npx jest lib/billing/v5/priceDrafts.files
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftReviewMarkdown, draftSeedFile } from './priceDrafts';

const ROOT = join(__dirname, '..', '..', '..');
const FILES: [string, () => string][] = [
  ['docs/v5.1-phase5/seed/20261113b_price_drafts.sql', () => draftSeedFile()],
  ['docs/v5.1-phase5/price-drafts.md', () => draftReviewMarkdown()],
];

test.each(FILES)('%s is up to date', (rel, make) => {
  const path = join(ROOT, rel);
  if (process.env.WRITE_PRICE_DRAFTS === '1') writeFileSync(path, make());
  expect(readFileSync(path, 'utf8')).toBe(make());
});
