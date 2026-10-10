/**
 * @jest-environment node
 *
 * The bridge's Gemini Live link: the ephemeral-token URL, setup first, setupComplete before audio, usage with its
 * prompt/response split, our own close never reported as a drop, a timeout instead of hanging. The last test runs the
 * real Node WebSocket against a LOCAL server playing Gemini (simulated; no Google call).
 */
import { LiveLink, nodeLiveSocket, usageOf, type LiveSocket } from './liveLink';
import type { LiveServerEvent } from '@/lib/voice/geminiLive';

function fakeOpen(script: { setupReply?: boolean } = {}) {
  const sockets: Array<LiveSocket & { sent: string[]; url: string; closed: boolean; emit(o: unknown): void }> = [];
  const open = (url: string): LiveSocket => {
    const s = {
      url, sent: [] as string[], closed: false,
      onopen: null as (() => void) | null, onmessage: null as ((d: string) => void) | null,
      onclose: null as ((c: number, r: string) => void) | null, onerror: null as ((m: string) => void) | null,
      send(d: string) { this.sent.push(d); if (script.setupReply !== false && d.includes('"setup"')) queueMicrotask(() => this.emit({ setupComplete: {} })); },
      close() { this.closed = true; },
      emit(o: unknown) { this.onmessage?.(JSON.stringify(o)); },
    };
    sockets.push(s);
    queueMicrotask(() => s.onopen?.());
    return s;
  };
  return { open, sockets };
}

const handlers = () => {
  const events: LiveServerEvent[] = [];
  const usage: unknown[] = [];
  const closes: number[] = [];
  return { events, usage, closes, h: { onEvent: (e: LiveServerEvent) => events.push(e), onUsage: (u: unknown) => usage.push(u), onClose: (c: number) => closes.push(c) } };
};

describe('LiveLink', () => {
  it('connects with the ephemeral token, sends the locked setup first, and is ready at setupComplete', async () => {
    const f = fakeOpen();
    const hh = handlers();
    const link = new LiveLink(f.open, hh.h);
    expect(link.sendAudio(new Int16Array(4))).toBe(false); // nothing before setup
    expect(await link.connect('auth_tokens/abc', { setup: { model: 'models/x' } } as never)).toBe(true);
    const s = f.sockets[0]!;
    expect(s.url).toBe('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Fabc');
    expect(JSON.parse(s.sent[0]!)).toEqual({ setup: { model: 'models/x' } });
    expect(link.sendAudio(Int16Array.from([1, -1]))).toBe(true);
    expect(JSON.parse(s.sent[1]!)).toEqual({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AQD//w==' } } });
    expect(link.sendToolResponses([{ id: 'a', name: 'n', response: { x: 1 } }])).toBe(true);
    expect(link.sendToolResponses([])).toBe(false);
    expect(link.sendText('note')).toBe(true);
    expect(JSON.parse(s.sent[3]!)).toEqual({ realtimeInput: { text: 'note' } });
    expect(hh.events).toEqual([{ kind: 'setupComplete' }]);
  });

  it('usage keeps the prompt/response split; a socket that drops is reported, our own close is not', async () => {
    const f = fakeOpen();
    const hh = handlers();
    const link = new LiveLink(f.open, hh.h);
    await link.connect('t', { setup: {} } as never);
    f.sockets[0]!.emit({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 10, responseTokenCount: 2, totalTokenCount: 12 } });
    expect(hh.usage).toEqual([{ prompt: 10, response: 2, total: 12 }]);
    expect(hh.events.map((e) => e.kind)).toEqual(['setupComplete', 'turnComplete']);
    f.sockets[0]!.onclose!(1011, 'x');
    expect(hh.closes).toEqual([1011]);
    expect(link.ready).toBe(false);

    await link.connect('t2', { setup: {} } as never);
    const s2 = f.sockets[1]!;
    link.close();
    s2.onclose?.(1000, 'bridge');
    expect(s2.closed).toBe(true);
    expect(hh.closes).toEqual([1011]);
  });

  it('a setup that never completes times out instead of hanging', async () => {
    const f = fakeOpen({ setupReply: false });
    const link = new LiveLink(f.open, handlers().h);
    expect(await link.connect('t', { setup: {} } as never, 30)).toBe(false);
    expect(f.sockets[0]!.closed).toBe(true);
  });

  it('usageOf ignores frames without usage and bad JSON', () => {
    expect(usageOf('{"serverContent":{}}')).toBeNull();
    expect(usageOf('{"usageMetadata": nope')).toBeNull();
    expect(usageOf('{"usageMetadata":{"totalTokenCount":5,"promptTokenCount":-1}}')).toEqual({ prompt: undefined, response: undefined, total: 5 });
  });
});

describe('real Node WebSocket against a local server playing Gemini (simulated)', () => {
  interface Peer { on(ev: 'message', cb: (raw: Buffer) => void): void; send(d: string | Buffer): void }
  interface Server { on(ev: 'connection', cb: (ws: Peer, req: { url: string }) => void): void; close(cb?: () => void): void; address(): { port: number } }
  let WSS: (new (o: { port: number }) => Server) | null = null;
  // `ws` is only a transitive dependency here; without it this one test is skipped, never failed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { WSS = require('ws').WebSocketServer; } catch { WSS = null; }
  const maybe = WSS && typeof WebSocket === 'function' ? it : it.skip;

  maybe('handshakes on the constrained path with the token, sets up, streams audio, answers a tool', async () => {
    const server = new WSS!({ port: 0 });
    const seen: { url?: string; frames: Array<Record<string, unknown>> } = { frames: [] };
    server.on('connection', (ws, req) => {
      seen.url = req.url;
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString()) as Record<string, unknown>;
        seen.frames.push(m);
        if (m.setup) ws.send(JSON.stringify({ setupComplete: {} }));
        if (m.realtimeInput) ws.send(Buffer.from(JSON.stringify({ toolCall: { functionCalls: [{ id: 'f1', name: 'account_summary', args: {} }] } }))); // binary frame, as Google sends
      });
    });
    const port = server.address().port;
    const hh = handlers();
    const link = new LiveLink(nodeLiveSocket, hh.h, `ws://127.0.0.1:${port}/ws/google.ai.generativelanguage`);
    expect(await link.connect('auth_tokens/real-socket', { setup: { model: 'models/x' } } as never, 3000)).toBe(true);
    link.sendAudio(new Int16Array(640));
    await new Promise((r) => setTimeout(r, 100));
    expect(seen.url).toBe('/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Freal-socket');
    expect(seen.frames.map((f) => Object.keys(f)[0])).toEqual(['setup', 'realtimeInput']);
    expect(hh.events).toContainEqual({ kind: 'toolCall', calls: [{ id: 'f1', name: 'account_summary', args: {} }] });
    link.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
