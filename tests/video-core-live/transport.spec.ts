import { test, expect } from '@playwright/test';
import { evidence, transportCuts } from './_live';

/**
 * The api project's last word (its files run in name order): every long synchronous call the specs before it made — the
 * film stitch (billing.spec), the sweep working a render (recovery.spec) — got its answer. A call whose connection broke
 * was already judged where it was made, by what the server did (its money, its job); here it fails the run by name,
 * with its client, how long the connection lived and what the server had done.
 */
test('every long synchronous call got its answer (no connection lost before the response)', () => {
  const cuts = transportCuts();
  evidence('transport', { cuts });
  expect(cuts, JSON.stringify(cuts)).toEqual([]);
});
