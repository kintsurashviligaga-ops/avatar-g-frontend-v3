/**
 * @jest-environment jsdom
 *
 * The chat stream store: N chunks inside one animation frame must cost ONE render, not N.
 *
 * ⚠️ WHY THIS IS PINNED. The dashboard chat used to call setMessages once per SSE chunk, which re-rendered
 * the whole ~7,500-line OmniStudio function several times per frame on a fast stream. The browser can only
 * paint once per frame, so everything past the first render in a frame was wasted main-thread time, and
 * that waste is the composer lag users felt while an answer streamed. The store coalesces deltas and
 * commits once per frame; these tests fail if a change makes it commit per chunk again.
 */
import { act, render } from '@testing-library/react';
import { createChatStreamStore, useChatStreamSnapshot, type ChatStreamStore } from './chatStreamStore';

/** A frame scheduler the test drives by hand, standing in for requestAnimationFrame. */
function manualFrames() {
  const queue: Array<() => void> = [];
  return {
    schedule: (cb: () => void) => {
      queue.push(cb);
      return cb;
    },
    cancel: (handle: unknown) => {
      const i = queue.indexOf(handle as () => void);
      if (i >= 0) queue.splice(i, 1);
    },
    pending: () => queue.length,
    run: () => {
      const batch = queue.splice(0, queue.length);
      for (const cb of batch) cb();
    },
  };
}

function Probe({ store, onRender }: { store: ChatStreamStore; onRender: (text: string) => void }) {
  const snap = useChatStreamSnapshot(store);
  onRender(snap.text);
  return <div data-testid="probe">{snap.text}</div>;
}

describe('createChatStreamStore — frame batching', () => {
  it('commits 50 chunks that arrive inside one frame as ONE render', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const renders: string[] = [];
    const { getByTestId } = render(<Probe store={store} onRender={(t) => renders.push(t)} />);

    let writer!: ReturnType<ChatStreamStore['begin']>;
    act(() => {
      writer = store.begin('turn-1');
    });
    const afterBegin = renders.length;

    act(() => {
      for (let i = 0; i < 50; i++) writer.appendText(`w${i} `);
    });
    // Nothing is committed until the frame runs, and only one frame is scheduled for all 50 chunks.
    expect(renders.length).toBe(afterBegin);
    expect(frames.pending()).toBe(1);

    act(() => frames.run());
    expect(renders.length).toBe(afterBegin + 1);
    expect(getByTestId('probe').textContent).toBe(Array.from({ length: 50 }, (_, i) => `w${i} `).join(''));
  });

  it('commits once per frame across several frames', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const listener = jest.fn();
    store.subscribe(listener);
    const w = store.begin();
    listener.mockClear();

    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < 10; i++) w.appendText('x');
      frames.run();
    }
    expect(listener).toHaveBeenCalledTimes(5);
    expect(store.getSnapshot().text).toBe('x'.repeat(50));
    expect(store.getSnapshot().status).toBe('streaming');
  });

  it('folds meta, sources and usage into the same frame as the text', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const listener = jest.fn();
    store.subscribe(listener);
    const w = store.begin();
    listener.mockClear();

    w.setMeta({ provider: 'gemini', model: 'gemini-3.8-flash' });
    w.appendText('hi');
    w.setSources([{ url: 'https://a.example/x', title: 'A' }]);
    w.setUsage({ model: 'gemini-3.8-flash', outputTokens: 3 });
    expect(frames.pending()).toBe(1);
    frames.run();

    expect(listener).toHaveBeenCalledTimes(1);
    const s = store.getSnapshot();
    expect(s.meta).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(s.sources).toEqual([{ url: 'https://a.example/x', title: 'A' }]);
    expect(s.usage).toEqual({ model: 'gemini-3.8-flash', outputTokens: 3 });
  });

  it('keeps every meta field the wire carries: mode, fallback and a Pro-cap downgrade', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const w = store.begin();
    const meta = {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      mode: 'fast',
      fallback: false,
      requestedMode: 'pro',
      reason: 'pro_cap',
      resetAt: '2026-10-01T08:15:00.000Z',
    } as const;
    w.setMeta(meta);
    w.appendText('hi');
    frames.run();
    expect(store.getSnapshot().meta).toEqual(meta);
    // A later meta frame (a rotation, the partial marker) replaces it whole — no stale downgrade notice survives.
    w.setMeta({ provider: 'gemini', model: 'gemini-3.6-flash', mode: 'thinking', fallback: true });
    frames.run();
    expect(store.getSnapshot().meta).toEqual({ provider: 'gemini', model: 'gemini-3.6-flash', mode: 'thinking', fallback: true });
  });

  it('keeps the snapshot identity when nothing changed (useSyncExternalStore requires it)', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    store.begin();
    const a = store.getSnapshot();
    frames.run();
    store.flush();
    expect(store.getSnapshot()).toBe(a);
  });
});

describe('createChatStreamStore — terminal transitions', () => {
  it('finish() flushes pending text synchronously (a hidden tab never runs the frame)', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const w = store.begin();
    w.appendText('final ');
    w.appendText('answer');
    w.finish();
    expect(store.getSnapshot()).toMatchObject({ status: 'done', text: 'final answer' });
    expect(frames.pending()).toBe(0); // the scheduled frame was cancelled, not left dangling
  });

  it('fail() keeps the partial text and records the error', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const w = store.begin();
    w.appendText('partial');
    w.fail({ code: 'quota', retryable: false, message: 'm', reason: 'frame' });
    expect(store.getSnapshot()).toMatchObject({ status: 'error', text: 'partial', error: { code: 'quota' } });
  });

  it('abort() keeps the partial text', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const w = store.begin();
    w.appendText('half an ans');
    w.abort();
    expect(store.getSnapshot()).toMatchObject({ status: 'aborted', text: 'half an ans' });
  });

  it('ignores writes after the stream settled', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const w = store.begin();
    w.appendText('a');
    w.finish();
    w.appendText('b');
    w.fail({ code: 'network', retryable: true, message: 'm', reason: 'network' });
    store.flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'done', text: 'a', error: null });
  });
});

describe('createChatStreamStore — generations', () => {
  it("a superseded stream's late chunks never reach the new stream", () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const oldWriter = store.begin('old');
    oldWriter.appendText('old text');
    const newWriter = store.begin('new');
    oldWriter.appendText(' LEAK');
    oldWriter.finish();
    newWriter.appendText('new text');
    frames.run();
    expect(oldWriter.isCurrent()).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ turnId: 'new', status: 'streaming', text: 'new text' });
  });

  it('reset() returns to idle and stales the writer', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const w = store.begin();
    w.appendText('x');
    store.reset();
    w.appendText('y');
    w.finish();
    expect(store.getSnapshot()).toMatchObject({ status: 'idle', text: '' });
  });

  it('measures time to first token from begin() to the arrival of the first delta', () => {
    let t = 1000;
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel, now: () => t });
    const w = store.begin();
    t = 1450;
    w.appendText('first');
    t = 1900; // the frame runs later; the measurement must not include the frame delay
    frames.run();
    expect(store.getSnapshot().firstTokenMs).toBe(450);
  });
});
