/** @jest-environment node */
/**
 * lib/video/contracts — the video lanes' contracts, pinned to the repository they describe: every catalogue / tool /
 * capability id in the registry is real, every route and module it names exists, every refusal code is emitted by the
 * file the vocabulary names, and the consolidation plan names every lane. A registry that drifts from the code fails here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_LANES, VIDEO_REFUSALS, laneContract, refusalsOf } from './contracts';
import { SERVICE_CATALOGUE } from '../services/serviceCatalogue';
import { CAPABILITIES } from '../agent/capabilities';
import { ALL_TOOLS } from '../studio/tools';

const at = (p: string) => join(process.cwd(), p);

describe('every id in the registry is a real one', () => {
  const services = new Set(SERVICE_CATALOGUE.map((s) => s.id));
  test.each(VIDEO_LANES.map((l) => [l.id, l] as const))('%s', (_id, lane) => {
    if (lane.service) expect(services.has(lane.service)).toBe(true);
    for (const t of lane.tools) expect(ALL_TOOLS).toContain(t);
    for (const c of lane.capabilities) expect(CAPABILITIES[c]).toBeDefined();
    for (const p of [...lane.routes, ...lane.modules]) expect({ path: p, exists: existsSync(at(p)) }).toEqual({ path: p, exists: true });
    for (const r of lane.refusals) expect(VIDEO_REFUSALS.some((v) => v.code === r && v.lanes.includes(lane.id))).toBe(true);
  });
  test('the lane ids are unique and the three video tiles are covered', () => {
    expect(new Set(VIDEO_LANES.map((l) => l.id)).size).toBe(VIDEO_LANES.length);
    expect(new Set(VIDEO_LANES.map((l) => l.service).filter(Boolean))).toEqual(new Set(['video', 'remix', 'montage']));
  });
  test('every video.* capability Agent G knows is in exactly one or more lanes', () => {
    const videoCaps = Object.keys(CAPABILITIES).filter((k) => k.startsWith('video.'));
    for (const cap of videoCaps) expect(VIDEO_LANES.some((l) => (l.capabilities as readonly string[]).includes(cap))).toBe(true);
  });
});

describe('every refusal in the vocabulary is emitted by the file it names', () => {
  test.each(VIDEO_REFUSALS.map((r) => [r.code, r] as const))('%s', (code, r) => {
    expect(existsSync(at(r.where))).toBe(true);
    expect(readFileSync(at(r.where), 'utf8')).toContain(`'${code}'`);
    for (const lane of r.lanes) expect(laneContract(lane).refusals).toContain(code);
  });
  test('the vocabulary names each code once, and every lane has at least one refusal before any charge', () => {
    expect(new Set(VIDEO_REFUSALS.map((r) => r.code)).size).toBe(VIDEO_REFUSALS.length);
    for (const lane of VIDEO_LANES) expect(refusalsOf(lane.id).some((r) => r.charge === 'before any charge')).toBe(true);
  });
});

describe('the contracts the lanes share', () => {
  test('every contracted length is checked frame-exact, and every frame-exact lane carries the QC gate refusal or its own', () => {
    for (const lane of VIDEO_LANES.filter((l) => l.duration === 'contract' && l.id !== 'longform' && l.id !== 'storyboard')) {
      expect(lane.qc).toBe('frame-exact');
    }
    expect(laneContract('film').refusals).toContain('qc_rejected');
    expect(laneContract('montage').refusals).toContain('qc_failed');
  });
  test('a quote-token lane never charges before Start; a saga lane refunds once on failure', () => {
    for (const lane of VIDEO_LANES.filter((l) => l.approval === 'quote-token')) expect(lane.billing).toBe('quote-then-job');
    for (const lane of VIDEO_LANES.filter((l) => l.billing === 'single-charge-saga' && l.qc === 'frame-exact')) {
      expect(refusalsOf(lane.id).some((r) => r.charge === 'refunded once')).toBe(true);
    }
  });
});

describe('the consolidation plan names every lane and touches no other studio', () => {
  const plan = readFileSync(at('docs/handoffs/video-core/consolidation-plan.md'), 'utf8');
  test.each(VIDEO_LANES.map((l) => l.id))('lane %s is in the plan', (id) => {
    expect(plan).toMatch(new RegExp(`\\b${id}\\b`));
  });
  test('the plan keeps the canonical ids and leaves the other studios alone', () => {
    expect(plan).toMatch(/canonical[\s\S]{0,200}?\*\*kept\*\*/i);
    expect(plan).toMatch(/Image Studio/);
    expect(plan).toMatch(/not (touched|changed)/i);
  });
});
