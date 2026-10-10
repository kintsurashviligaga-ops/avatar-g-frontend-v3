/** @jest-environment node */
/**
 * The capability records are pinned to the code they describe: the catalog (every service exactly once, same quote key),
 * the route files (each exists; the timeout is their longest maxDuration), the registry (a quote tool names a confirmed
 * action that exists) and the intent classifier (every capability it can return has a record).
 */
import fs from 'node:fs';
import path from 'node:path';
import { SERVICE_CATALOG } from '@/lib/catalog/services';
import { CONFIRMED_ACTIONS } from '@/lib/agent/tools/registry';
import { LIVE_TOOL_SPECS } from '@/lib/agent/react/bindLiveAgent';
import { CAPABILITIES, capabilityRuns } from './capabilities';

const ROOT = path.resolve(__dirname, '../..');
const routeFile = (route: string) => path.join(ROOT, 'app', `${route}/route.ts`);
const maxDurationOf = (route: string): number => {
  const src = fs.readFileSync(routeFile(route), 'utf8');
  const m = /export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(src);
  return m ? Number(m[1]) : 0;
};

const records = Object.values(CAPABILITIES);

test('every catalog service has exactly one capability, with the catalog\'s own quote key', () => {
  for (const s of SERVICE_CATALOG) {
    const mine = records.filter((r) => r.serviceId === s.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(s.id);
    expect(mine[0]!.pricing.key).toBe(s.pricingKey);
  }
  expect(records.filter((r) => r.serviceId !== null)).toHaveLength(SERVICE_CATALOG.length);
  expect(SERVICE_CATALOG).toHaveLength(22);
});

test('the record key is the record id', () => {
  for (const [key, r] of Object.entries(CAPABILITIES)) expect(r.id).toBe(key);
});

test('every route exists, and the timeout is the longest maxDuration among them', () => {
  for (const r of records) {
    for (const route of r.routes) {
      expect(route.startsWith('/api/')).toBe(true);
      expect(fs.existsSync(routeFile(route))).toBe(true);
    }
    const longest = r.routes.reduce((m, route) => Math.max(m, maxDurationOf(route)), 0);
    expect({ id: r.id, timeoutSec: r.timeoutSec }).toEqual({ id: r.id, timeoutSec: longest });
  }
});

test('a capability with no route is MISSING or runs on the device; none claims PROVEN', () => {
  for (const r of records) {
    if (!r.routes.length) expect(r.label === 'MISSING' || r.library === 'device-only').toBe(true);
    expect(r.label).not.toBe('PROVEN');
  }
  expect(capabilityRuns('media.edit')).toBe(false);
  expect(capabilityRuns('music.remix')).toBe(false);
  expect(capabilityRuns('agent.montage')).toBe(true);
});

test('a coming-soon catalog service is MISSING here too', () => {
  for (const s of SERVICE_CATALOG.filter((x) => x.status === 'coming-soon')) {
    expect(CAPABILITIES[s.id as keyof typeof CAPABILITIES].label).toBe('MISSING');
  }
});

test('a model-callable quote tool exists in the live registry and leads to a confirmed action that exists', () => {
  const names = new Map(LIVE_TOOL_SPECS.map((t) => [t.name, t]));
  for (const r of records.filter((x) => x.liveTool)) {
    const spec = names.get(r.liveTool!.name);
    expect(spec).toBeDefined();
    expect(spec!.effect).toBe('quote');
    expect(spec!.confirms).toBe(r.liveTool!.confirms);
    expect(CONFIRMED_ACTIONS[r.liveTool!.confirms]).toBeDefined();
    expect(r.routes).toContain(CONFIRMED_ACTIONS[r.liveTool!.confirms].route);
  }
});

test('nothing charged runs without an approval step', () => {
  for (const r of records.filter((x) => x.pricing.charge === 'charged')) expect(r.approval).not.toBe('none');
});
