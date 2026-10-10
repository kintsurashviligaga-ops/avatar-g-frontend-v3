/** @jest-environment node */
import { PlanError, runPlan3d, takeEvents } from './plan3d';

const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
function fakeFetch(status: number, body = '') {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body || null, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('runPlan3d — the Interior designer’s „3D plan" client', () => {
  it('sends the room photo, the brief and the render to file the plan under, and returns the normalised plan', async () => {
    const { impl, calls } = fakeFetch(200, sse(
      { stage: 'extracting', pct: 10 },
      { stage: 'completed', pct: 100, geometry: { floor: { widthM: 5, depthM: 4 }, wallHeightM: 2.7 }, style: { styleName: 'Japandi', palette: ['#eeeeee'] } },
    ));
    const progress: number[] = [];
    const plan = await runPlan3d({ imageUrls: ['data:image/jpeg;base64,AA'], brief: 'Japandi', coverUrl: 'https://cdn.example.com/r.png', fetchImpl: impl, onProgress: (p) => progress.push(p) });
    expect(calls[0].url).toBe('/api/orchestrator/interior/produce');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ imageUrls: ['data:image/jpeg;base64,AA'], brief: 'Japandi', coverUrl: 'https://cdn.example.com/r.png' });
    expect(progress).toEqual([10]);
    expect(plan.geometry.floor).toEqual({ widthM: 5, depthM: 4 });
    expect(plan.style.styleName).toBe('Japandi');
  });

  it('sends no cover when there is none', async () => {
    const { impl, calls } = fakeFetch(200, sse({ stage: 'completed', geometry: {}, style: {} }));
    await runPlan3d({ imageUrls: ['data:image/jpeg;base64,AA'], brief: '', fetchImpl: impl });
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('coverUrl');
  });

  it.each([
    [401, '', 'unauthorized'],
    [429, '', 'rate_limited'],
    [500, '', 'failed'],
    [200, sse({ stage: 'failed', error: 'insufficient_credits' }), 'insufficient_credits'],
    [200, sse({ stage: 'failed', error: 'boom' }), 'failed'],
    [200, sse({ stage: 'styling', pct: 60 }), 'failed'], // the stream ended without a verdict
  ])('HTTP %i %j → PlanError %s', async (status, body, code) => {
    const { impl } = fakeFetch(status, body);
    const err = await runPlan3d({ imageUrls: ['x'], brief: '', fetchImpl: impl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect((err as PlanError).code).toBe(code);
  });

  it('takeEvents keeps an unfinished frame for the next chunk and skips a malformed one', () => {
    expect(takeEvents('data: {"a":1}\n\ndata: oops\n\ndata: {"b"')).toEqual({ events: [{ a: 1 }], rest: 'data: {"b"' });
  });
});
