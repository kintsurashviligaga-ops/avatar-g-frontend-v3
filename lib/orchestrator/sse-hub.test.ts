/** @jest-environment node */
jest.mock('@upstash/redis', () => ({ Redis: class {} }));
import { subscribe, publish, subscriberCount, readPipelineEvents, hubUsesRedis } from './sse-hub';

describe('sse-hub durable layer (no Upstash env → fail-open)', () => {
  test('hubUsesRedis is false without UPSTASH env', () => {
    expect(hubUsesRedis()).toBe(false);
  });
  test('readPipelineEvents fails open to an empty batch + preserves cursor', async () => {
    const { events, nextIndex } = await readPipelineEvents('p-none', 7);
    expect(events).toEqual([]);
    expect(nextIndex).toBe(7);
  });
  test('publish still delivers in-memory when Redis is absent', () => {
    const got: string[] = [];
    const off = subscribe('pmem', (e) => got.push(String(e.payload.k)));
    publish({ topic: 'data.sanitized', pipelineId: 'pmem', payload: { k: 'x' } });
    expect(got).toEqual(['x']);
    off();
  });
});

describe('sse-hub fan-out', () => {
  test('publish reaches only same-pipeline subscribers', () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = subscribe('p1', (e) => a.push(String(e.payload.k)));
    const offB = subscribe('p2', (e) => b.push(String(e.payload.k)));

    publish({ topic: 'data.sanitized', pipelineId: 'p1', payload: { k: '1' } });
    expect(a).toEqual(['1']);
    expect(b).toEqual([]);
    offA(); offB();
  });

  test('unsubscribe removes the subscriber + cleans empty pipelines', () => {
    let n = 0;
    const off = subscribe('p3', () => { n++; });
    expect(subscriberCount('p3')).toBe(1);
    publish({ topic: 'pipeline.completed', pipelineId: 'p3', payload: {} });
    off();
    expect(subscriberCount('p3')).toBe(0);
    publish({ topic: 'pipeline.completed', pipelineId: 'p3', payload: {} });
    expect(n).toBe(1);
  });

  test('publish to no subscribers returns 0 delivered', () => {
    expect(publish({ topic: 'pipeline.failed', pipelineId: 'ghost', payload: {} })).toBe(0);
  });

  test('a throwing subscriber is isolated', () => {
    let reached = false;
    const off1 = subscribe('p4', () => { throw new Error('boom'); });
    const off2 = subscribe('p4', () => { reached = true; });
    const delivered = publish({ topic: 'data.sanitized', pipelineId: 'p4', payload: {} });
    expect(reached).toBe(true);
    expect(delivered).toBe(1);
    off1(); off2();
  });
});
