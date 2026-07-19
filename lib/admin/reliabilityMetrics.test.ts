import { computeReliability, tierDistribution, type RelJobRow } from './reliabilityMetrics';

describe('tierDistribution — package/subscription buckets', () => {
  const tiers = [{ name: 'Tier 1', priceGel: 40 }, { name: 'Tier 2', priceGel: 267 }, { name: 'Tier 3', priceGel: 807 }];
  it('buckets top-ups to the nearest tier (within ±20%) and Custom otherwise', () => {
    const out = tierDistribution([40, 41, 267, 807, 500], tiers);
    const byTier = Object.fromEntries(out.map((b) => [b.tier, b.count]));
    expect(byTier['Tier 1']).toBe(2);   // 40, 41
    expect(byTier['Tier 2']).toBe(1);   // 267
    expect(byTier['Tier 3']).toBe(1);   // 807
    expect(byTier['Custom']).toBe(1);   // 500 (too far from any tier)
  });
  it('sums GEL per bucket, ignores non-positive/garbage, sorts by value', () => {
    const out = tierDistribution([40, 40, 0, -5, NaN as unknown as number], tiers);
    expect(out[0]).toEqual({ tier: 'Tier 1', count: 2, totalGel: 80 });
    expect(tierDistribution([], tiers)).toEqual([]);
  });
});


const row = (service: string, status: string, createdAt: string, updatedAt: string): RelJobRow => ({
  service_type: service, status, created_at: createdAt, updated_at: updatedAt,
});

describe('computeReliability — per-service success rate + timings', () => {
  it('computes success rate excluding in-flight jobs', () => {
    const rows: RelJobRow[] = [
      row('image', 'completed', '2026-08-01T00:00:00Z', '2026-08-01T00:00:04Z'),
      row('image', 'completed', '2026-08-01T00:01:00Z', '2026-08-01T00:01:06Z'),
      row('image', 'failed', '2026-08-01T00:02:00Z', '2026-08-01T00:02:01Z'),
      row('image', 'processing', '2026-08-01T00:03:00Z', '2026-08-01T00:03:00Z'), // in-flight → excluded from rate
    ];
    const snap = computeReliability(rows, 7);
    const img = snap.perService.find((s) => s.service === 'image')!;
    expect(img.total).toBe(4);
    expect(img.completed).toBe(2);
    expect(img.failed).toBe(1);
    expect(img.inFlight).toBe(1);
    expect(img.successRate).toBeCloseTo(2 / 3, 3); // 2 completed / 3 terminal
    expect(img.avgDurationSec).toBeCloseTo(5, 1); // (4 + 6) / 2
  });

  it('successRate is null when no terminal jobs yet (only in-flight)', () => {
    const snap = computeReliability([row('film', 'processing', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')], 7);
    const film = snap.perService.find((s) => s.service === 'film')!;
    expect(film.successRate).toBeNull();
    expect(film.avgDurationSec).toBeNull();
    expect(film.inFlight).toBe(1);
  });

  it('aggregates totals across services + lists recent failures newest-first', () => {
    const rows: RelJobRow[] = [
      row('video', 'completed', '2026-08-01T00:00:00Z', '2026-08-01T00:05:00Z'),
      row('music', 'failed', '2026-08-01T00:10:00Z', '2026-08-01T00:10:30Z'),
      row('image', 'failed', '2026-08-01T00:20:00Z', '2026-08-01T00:20:05Z'),
    ];
    const snap = computeReliability(rows, 30);
    expect(snap.totals.total).toBe(3);
    expect(snap.totals.completed).toBe(1);
    expect(snap.totals.failed).toBe(2);
    expect(snap.totals.successRate).toBeCloseTo(1 / 3, 3);
    // newest failure first (image @ 00:20 before music @ 00:10)
    expect(snap.recentFailures.map((f) => f.service)).toEqual(['image', 'music']);
  });

  it('is fail-safe on garbage input (bad rows, bad timestamps, empty)', () => {
    const snap = computeReliability(
      [row('image', 'completed', 'not-a-date', 'also-bad'), { service_type: 1 as unknown as string, status: 'completed', created_at: '', updated_at: '' }],
      7,
    );
    const img = snap.perService.find((s) => s.service === 'image');
    expect(img?.avgDurationSec).toBeNull(); // unparseable duration ignored, no crash
    expect(computeReliability(null as unknown as RelJobRow[], 7).totals.total).toBe(0);
    expect(computeReliability([], 7).perService).toEqual([]);
  });

  it('groups by params.subtype when present, isolating hidden subsystems (Track 1)', () => {
    const rows: RelJobRow[] = [
      { service_type: 'film', status: 'completed', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:05:00Z', params: { subtype: 'product' } },
      { service_type: 'film', status: 'failed', created_at: '2026-08-01T00:10:00Z', updated_at: '2026-08-01T00:10:20Z', params: { subtype: 'product' } },
      { service_type: 'film', status: 'completed', created_at: '2026-08-01T00:20:00Z', updated_at: '2026-08-01T00:25:00Z', params: { subtype: 'swap' } },
      { service_type: 'film', status: 'completed', created_at: '2026-08-01T00:30:00Z', updated_at: '2026-08-01T00:35:00Z' }, // no subtype → 'film'
    ];
    const snap = computeReliability(rows, 7);
    const labels = snap.perService.map((s) => s.service).sort();
    expect(labels).toEqual(['film', 'product', 'swap']);
    const product = snap.perService.find((s) => s.service === 'product')!;
    expect(product.total).toBe(2);
    expect(product.successRate).toBeCloseTo(0.5, 3); // 1 completed / 2 terminal
    expect(snap.recentFailures[0]!.service).toBe('product'); // failure labeled by subtype
  });

  it('non-string / empty subtype falls back to service_type', () => {
    const rows: RelJobRow[] = [
      { service_type: 'image', status: 'completed', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:04Z', params: { subtype: '' } },
      { service_type: 'image', status: 'completed', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:04Z', params: { subtype: 42 as unknown as string } },
      { service_type: 'image', status: 'completed', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:04Z', params: null },
    ];
    expect(computeReliability(rows, 7).perService.map((s) => s.service)).toEqual(['image']);
  });

  it('sorts services by volume (busiest first)', () => {
    const rows: RelJobRow[] = [
      row('image', 'completed', '2026-08-01T00:00:00Z', '2026-08-01T00:00:04Z'),
      row('image', 'completed', '2026-08-01T00:00:00Z', '2026-08-01T00:00:04Z'),
      row('film', 'completed', '2026-08-01T00:00:00Z', '2026-08-01T00:05:00Z'),
    ];
    expect(computeReliability(rows, 7).perService.map((s) => s.service)).toEqual(['image', 'film']);
  });
});
