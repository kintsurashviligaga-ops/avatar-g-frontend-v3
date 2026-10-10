/**
 * @jest-environment node
 *
 * Playout (20 ms frames, barge-in flush) and the call meter (reply latency, percentiles, tokens).
 */
import { CallMeter } from './meter';
import { FRAME_48K } from './pcm';
import { Playout } from './playout';

const tone = (n: number, v = 8000) => new Int16Array(n).fill(v);

describe('playout', () => {
  it('cuts an answer into 20 ms frames; only the first frame of an answer is marked; the tail is padded at the end', () => {
    const p = new Playout();
    p.push(tone(FRAME_48K * 2 + 100), 1000, true);
    expect(p.queuedMs).toBe(40);
    const a = p.next()!;
    const b = p.next()!;
    expect([a.firstOfTurn, b.firstOfTurn]).toEqual([true, false]);
    expect(a.pcm.length).toBe(FRAME_48K);
    expect(p.next()).toBeNull();
    p.endTurn();
    const tail = p.next()!;
    expect(tail.pcm.length).toBe(FRAME_48K);
    expect(Array.from(tail.pcm.slice(0, 100))).toEqual(new Array(100).fill(8000));
    expect(Array.from(tail.pcm.slice(100))).toEqual(new Array(FRAME_48K - 100).fill(0));
  });

  it('joins small chunks across pushes without losing samples', () => {
    const p = new Playout();
    for (let i = 0; i < 10; i += 1) p.push(tone(480, i), 1000 + i, i === 0);
    const frames = [p.next()!, p.next()!, p.next()!, p.next()!, p.next()!];
    expect(frames.every((f) => f.pcm.length === FRAME_48K)).toBe(true);
    expect(p.next()).toBeNull();
    expect(frames[1]!.pcm[0]).toBe(2);
    expect(frames[1]!.receivedAt).toBe(1002);
  });

  it('barge-in: flush drops every frame not yet sent', () => {
    const p = new Playout();
    p.push(tone(FRAME_48K * 50 + 10), 0, true);
    p.next();
    expect(p.flush()).toBe(50);
    expect(p.next()).toBeNull();
    p.endTurn();
    expect(p.next()).toBeNull();
  });

  it('is bounded (60 s); the oldest audio goes first', () => {
    const p = new Playout();
    for (let i = 0; i < 31; i += 1) p.push(tone(FRAME_48K * 100, i), i, i === 0);
    expect(p.queuedMs).toBe(60_000);
    expect(p.next()!.pcm[0]).toBe(1);
  });
});

describe('call meter', () => {
  const voice = tone(640, 6000);
  const quiet = new Int16Array(640);

  it('reply latency: from the end of the caller speaking to the first answer frame', () => {
    const m = new CallMeter();
    let t = 0;
    for (; t < 1000; t += 40) m.heardChunk(voice, t); // speaks until 960
    for (; t < 1400; t += 40) m.heardChunk(quiet, t);
    m.answerStarted(1660);
    expect(m.snapshot().replyLatencyP50Ms).toBe(700);
    // An answer with no new speech before it measures nothing.
    m.answerStarted(3000);
    expect(m.snapshot().replyLatencyP95Ms).toBe(700);
  });

  it('an answer inside the hangover still counts from the last voiced chunk', () => {
    const m = new CallMeter();
    m.heardChunk(voice, 0);
    m.heardChunk(voice, 40);
    m.answerStarted(200);
    expect(m.snapshot().replyLatencyP50Ms).toBe(160);
  });

  it('percentiles, paths, barge-ins, reconnects and token sums', () => {
    const m = new CallMeter();
    for (const v of [10, 20, 30, 40, 1000]) m.inputPath(v);
    m.outputPath(5);
    m.bargeIns = 2;
    m.reconnects = 1;
    m.usage({ prompt: 1000, response: 200, total: 1200 });
    m.usage({ prompt: 1500, response: 100 });
    expect(m.snapshot()).toEqual({ bargeIns: 2, reconnects: 1, promptTokens: 2500, responseTokens: 300, totalTokens: 2800, inputPathP50Ms: 30, outputPathP50Ms: 5 });
  });
});
