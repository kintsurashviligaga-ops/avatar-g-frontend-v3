/** @jest-environment node */
import { awaitDroppedJob, isDroppedConnection } from './awaitDroppedJob';

const noSleep = () => Promise.resolve();
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('isDroppedConnection', () => {
  it('a network TypeError ("Load failed") is a drop; a user stop or an HTTP error is not', () => {
    expect(isDroppedConnection(new TypeError('Load failed'))).toBe(true);
    const ac = new AbortController(); ac.abort();
    expect(isDroppedConnection(new TypeError('Load failed'), ac.signal)).toBe(false);
    expect(isDroppedConnection(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(false);
    expect(isDroppedConnection(new Error('music failed'))).toBe(false);
  });
});

describe('awaitDroppedJob — the phone dropped the request, the server kept rendering (Production 2026-10-16)', () => {
  it('waits through a still-running row and an offline round, then delivers the url', async () => {
    const answers: Array<Response | Error> = [
      new TypeError('offline'),
      res(404, { ok: false }),
      res(200, { ok: true, task: { status: 'running' } }),
      res(200, { ok: true, task: { status: 'completed', result: { url: 'https://x/track.mp3' } } }),
    ];
    const calls: string[] = [];
    const fetchImpl = (async (u: string) => { calls.push(u); const a = answers.shift()!; if (a instanceof Error) throw a; return a; }) as unknown as typeof fetch;
    expect(await awaitDroppedJob('music_1', { fetchImpl, sleep: noSleep })).toEqual({ url: 'https://x/track.mp3' });
    expect(calls[0]).toBe('/api/tasks?id=music_1');
  });
  it('a failed row is reported as failed with its reason', async () => {
    const fetchImpl = (async () => res(200, { task: { status: 'failed', error: 'render_failed' } })) as unknown as typeof fetch;
    expect(await awaitDroppedJob('j', { fetchImpl, sleep: noSleep })).toEqual({ failed: true, error: 'render_failed' });
  });
  it('gives up after the wait (null) and stops at once when the user stops', async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return res(200, { task: { status: 'running' } }); }) as unknown as typeof fetch;
    expect(await awaitDroppedJob('j', { fetchImpl, sleep: noSleep, maxMs: 30_000, everyMs: 6000 })).toBeNull();
    expect(n).toBe(5);
    const ac = new AbortController(); ac.abort();
    expect(await awaitDroppedJob('j', { fetchImpl, sleep: noSleep, signal: ac.signal })).toBeNull();
  });
});
