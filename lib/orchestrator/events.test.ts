/**
 * Event-broker tests — verifies the topic contract, ports/adapter fan-out,
 * the data-isolation guard (no binary on the bus), and handler isolation.
 */
import {
  InProcessBroker,
  makeEvent,
  nextTopic,
  assertNoBinary,
  TOPIC_ORDER,
  PIPELINE_TOPICS,
} from './events';

describe('event broker', () => {
  test('topic order chains forward and terminates', () => {
    expect(nextTopic('media.pipeline.initiated')).toBe('data.sanitized');
    expect(nextTopic('video.segments.ready')).toBe('pipeline.completed');
    expect(nextTopic('pipeline.completed')).toBeNull();
    expect(TOPIC_ORDER[0]).toBe('media.pipeline.initiated');
    expect(PIPELINE_TOPICS).toContain('pipeline.failed');
  });

  test('publish fans out to all subscribers of the topic only', async () => {
    const broker = new InProcessBroker();
    const got: string[] = [];
    broker.subscribe('data.sanitized', (e) => { got.push(`a:${e.pipelineId}`); });
    broker.subscribe('data.sanitized', (e) => { got.push(`b:${e.pipelineId}`); });
    broker.subscribe('script.compiled', () => { got.push('wrong'); });

    await broker.publish(makeEvent('data.sanitized', 'p1', { gcsUri: 'gs://bucket/x' }));

    expect(got.sort()).toEqual(['a:p1', 'b:p1']);
    expect(got).not.toContain('wrong');
  });

  test('unsubscribe stops delivery', async () => {
    const broker = new InProcessBroker();
    let n = 0;
    const off = broker.subscribe('asset.layout.ready', () => { n++; });
    await broker.publish(makeEvent('asset.layout.ready', 'p', {}));
    off();
    await broker.publish(makeEvent('asset.layout.ready', 'p', {}));
    expect(n).toBe(1);
  });

  test('a throwing handler is isolated, others still run', async () => {
    const errs: unknown[] = [];
    const broker = new InProcessBroker({ onError: (_t, e) => errs.push(e) });
    let reached = false;
    broker.subscribe('pipeline.completed', () => { throw new Error('subscriber boom'); });
    broker.subscribe('pipeline.completed', () => { reached = true; });
    await broker.publish(makeEvent('pipeline.completed', 'p', {}));
    expect(reached).toBe(true);
    expect(errs).toHaveLength(1);
  });

  test('assertNoBinary rejects Buffer, typed arrays, and large base64 strings', () => {
    expect(() => assertNoBinary({ ok: 'gs://bucket/file' })).not.toThrow();
    expect(() => assertNoBinary({ buf: Buffer.from('hi') })).toThrow(/Binary not allowed/);
    expect(() => assertNoBinary({ arr: new Uint8Array([1, 2, 3]) })).toThrow(/Binary not allowed/);
    const bigB64 = 'A'.repeat(100_001);
    expect(() => assertNoBinary({ blob: bigB64 })).toThrow(/base64-like/);
    // A normal long-ish prompt with spaces/punctuation is fine.
    expect(() => assertNoBinary({ prompt: 'make a cinematic 6-second clip of the sea!' })).not.toThrow();
  });

  test('publish enforces the no-binary rule', async () => {
    const broker = new InProcessBroker();
    await expect(
      broker.publish(makeEvent('media.pipeline.initiated', 'p', { audio: Buffer.from('x') as unknown as string })),
    ).rejects.toThrow(/Binary not allowed/);
  });
});
