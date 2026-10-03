/** @jest-environment node */
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import {
  CHAT_ERROR_CODES,
  MAX_SSE_LINE_CHARS,
  createFrameParser,
  decodeFrames,
  encodeFrame,
  isChatErrorCode,
  type ChatFrame,
} from './sse';

type Out = ChatFrame | 'DONE';

/** Feeds `chunks` through one parser, calls end(), and returns every frame it produced. */
function run(chunks: string[], { end = true }: { end?: boolean } = {}): Out[] {
  const out: Out[] = [];
  const p = createFrameParser((f) => out.push(f));
  for (const c of chunks) p.push(c);
  if (end) p.end();
  return out;
}

/** Splits `s` into `n` roughly equal pieces. The cut points fall wherever they fall, mid-JSON included. */
function splitInto(s: string, n: number): string[] {
  const size = Math.ceil(s.length / n);
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts;
}

describe('encodeFrame: the exact bytes the legacy client already understands', () => {
  it('text, meta and DONE match what app/api/chat/gemini/route.ts writes by hand today', () => {
    expect(encodeFrame({ text: 'hi' })).toBe('data: {"text":"hi"}\n\n');
    expect(encodeFrame({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } })).toBe(
      'data: {"meta":{"provider":"gemini","model":"gemini-3.8-flash"}}\n\n',
    );
    expect(encodeFrame('DONE')).toBe('data: [DONE]\n\n');
  });

  it('a newline inside the text can never break the frame onto two lines', () => {
    const enc = encodeFrame({ text: 'line one\nline two\r\nline three\rend' });
    // Exactly one line of content plus the blank separator.
    expect(enc.split('\n')).toHaveLength(3);
    expect(enc.endsWith('\n\n')).toBe(true);
    expect(decodeFrames(enc)).toEqual([{ text: 'line one\nline two\r\nline three\rend' }]);
  });

  it('the literal text "[DONE]" is not mistaken for the terminator', () => {
    expect(decodeFrames(encodeFrame({ text: '[DONE]' }))).toEqual([{ text: '[DONE]' }]);
  });
});

describe('the legacy stream parses unchanged', () => {
  it('the exact sequence the current route emits', () => {
    const body =
      'data: {"meta":{"provider":"gemini","model":"gemini-2.5-flash"}}\n\n' +
      'data: {"text":"Hello"}\n\n' +
      'data: {"text":", world"}\n\n' +
      'data: {"meta":{"provider":"anthropic","model":"claude-haiku-4-5","partial":true}}\n\n' +
      'data: [DONE]\n\n';
    expect(decodeFrames(body)).toEqual([
      { meta: { provider: 'gemini', model: 'gemini-2.5-flash' } },
      { text: 'Hello' },
      { text: ', world' },
      { meta: { provider: 'anthropic', model: 'claude-haiku-4-5', partial: true } },
      'DONE',
    ]);
  });

  it('`data:` with no space after the colon (the old client regex accepted it, so this does too)', () => {
    expect(decodeFrames('data:{"text":"x"}\n\ndata:[DONE]\n\n')).toEqual([{ text: 'x' }, 'DONE']);
  });
});

describe('chunk boundaries', () => {
  it('a JSON line split across 3 chunks arrives once, whole', () => {
    const line = encodeFrame({ text: 'split across three network reads' });
    const chunks = splitInto(line, 3);
    expect(chunks).toHaveLength(3);
    // Nothing is dispatched until the line is complete.
    const out: Out[] = [];
    const p = createFrameParser((f) => out.push(f));
    p.push(chunks[0]!);
    p.push(chunks[1]!);
    expect(out).toEqual([]);
    p.push(chunks[2]!);
    expect(out).toEqual([{ text: 'split across three network reads' }]);
    p.end();
    expect(out).toHaveLength(1);
  });

  it('every possible single split point of a frame yields the same result', () => {
    const body = encodeFrame({ meta: { provider: 'gemini', model: 'm' } }) + encodeFrame({ text: 'abc' }) + encodeFrame('DONE');
    const expected = decodeFrames(body);
    for (let i = 1; i < body.length; i++) {
      expect(run([body.slice(0, i), body.slice(i)])).toEqual(expected);
    }
  });

  it('one byte-sized chunk at a time still works', () => {
    const body = encodeFrame({ text: 'drip' }) + encodeFrame('DONE');
    expect(run(body.split(''))).toEqual([{ text: 'drip' }, 'DONE']);
  });

  it('many frames in one chunk are all dispatched, in order', () => {
    const frames: ChatFrame[] = Array.from({ length: 50 }, (_, i) => ({ text: `t${i}` }));
    const body = frames.map((f) => encodeFrame(f)).join('') + encodeFrame('DONE');
    expect(run([body])).toEqual([...frames, 'DONE']);
  });
});

describe('line endings', () => {
  it('CRLF line endings (a proxy rewrote them)', () => {
    const body = 'data: {"text":"a"}\r\n\r\ndata: {"text":"b"}\r\n\r\ndata: [DONE]\r\n\r\n';
    expect(run([body])).toEqual([{ text: 'a' }, { text: 'b' }, 'DONE']);
  });

  it('a CRLF pair split between two chunks yields no duplicate and no lost frame', () => {
    expect(run(['data: {"text":"a"}\r', '\n\r\ndata: {"text":"b"}\r\n\r\n'])).toEqual([{ text: 'a' }, { text: 'b' }]);
  });

  it('bare CR line endings', () => {
    expect(run(['data: {"text":"a"}\r\rdata: [DONE]\r\r'])).toEqual([{ text: 'a' }, 'DONE']);
  });

  it('single LF with no blank separator line (a sloppy producer) still yields every frame', () => {
    expect(run(['data: {"text":"a"}\ndata: {"text":"b"}\n'])).toEqual([{ text: 'a' }, { text: 'b' }]);
  });

  it('a leading BOM does not hide the first frame', () => {
    expect(run(['﻿data: {"text":"a"}\n\n'])).toEqual([{ text: 'a' }]);
  });
});

describe('noise is skipped, never thrown', () => {
  it("':' comment lines (keepalives) are ignored", () => {
    expect(run([': keepalive\n\n', ':\n\ndata: {"text":"a"}\n\n', ': ping 12345\n\n'])).toEqual([{ text: 'a' }]);
  });

  it('a malformed JSON line is skipped and the stream carries on', () => {
    const body = 'data: {"text":"before"}\n\ndata: {"text":"trunc\n\ndata: not json at all\n\ndata: {"text":"after"}\n\n';
    expect(() => run([body])).not.toThrow();
    expect(run([body])).toEqual([{ text: 'before' }, { text: 'after' }]);
  });

  it('other SSE fields (event, id, retry) and non-data lines are ignored', () => {
    const body = 'event: message\nid: 7\nretry: 1000\ndata: {"text":"a"}\n\nrandom garbage line\n';
    expect(run([body])).toEqual([{ text: 'a' }]);
  });

  it('JSON that is not a frame object (array, number, string, null, unknown keys) is ignored', () => {
    const body = ['[1,2]', '42', '"str"', 'null', '{}', '{"type":"ping"}', '{"text":7}', '{"text":""}']
      .map((p) => `data: ${p}\n\n`)
      .join('');
    expect(run([body])).toEqual([]);
  });

  it('empty and non-string pushes are harmless', () => {
    const out: Out[] = [];
    const p = createFrameParser((f) => out.push(f));
    p.push('');
    p.push(undefined as unknown as string);
    p.end();
    p.end();
    expect(out).toEqual([]);
  });
});

describe('end()', () => {
  it('flushes a final line that had no terminator (server closed without a trailing newline)', () => {
    expect(run(['data: {"text":"a"}\n\ndata: {"text":"last"}'], { end: false })).toEqual([{ text: 'a' }]);
    expect(run(['data: {"text":"a"}\n\ndata: {"text":"last"}'])).toEqual([{ text: 'a' }, { text: 'last' }]);
    expect(run(['data: [DO', 'NE]'])).toEqual(['DONE']);
  });

  it('resets, so the parser can be reused for a second stream', () => {
    const out: Out[] = [];
    const p = createFrameParser((f) => out.push(f));
    p.push('data: {"text":"one"}');
    p.end();
    p.push('data: {"text":"two"}\n\n');
    p.end();
    expect(out).toEqual([{ text: 'one' }, { text: 'two' }]);
  });
});

describe('encode → parse round-trip for every frame kind', () => {
  const frames: ChatFrame[] = [
    { text: 'plain' },
    { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
    { meta: { provider: 'anthropic', model: 'claude-haiku-4-5', partial: true } },
    { meta: { provider: 'gemini', model: 'gemini-3.1-pro-preview', mode: 'pro', fallback: false } },
    { meta: { provider: 'gemini', model: 'gemini-2.5-flash', mode: 'thinking', fallback: true } },
    {
      meta: {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        mode: 'fast',
        fallback: false,
        requestedMode: 'pro',
        reason: 'pro_cap',
        resetAt: '2026-10-01T08:15:00.000Z',
      },
    },
    { sources: [{ url: 'https://example.com/a', title: 'A' }, { url: 'http://example.org/b' }] },
    { usage: { model: 'gemini-3.8-flash', inputTokens: 1200, outputTokens: 340, totalTokens: 1540 } },
    { usage: { model: 'gemini-2.5-flash' } },
    ...CHAT_ERROR_CODES.map((code, i): ChatFrame => ({ error: { code, retryable: i % 2 === 0, message: `m-${code}` } })),
  ];

  it.each(frames.map((f) => [JSON.stringify(f), f] as const))('%s', (_label, frame) => {
    expect(decodeFrames(encodeFrame(frame))).toEqual([frame]);
  });

  it('the whole sequence, re-chunked at an awkward size', () => {
    const body = frames.map((f) => encodeFrame(f)).join('') + encodeFrame('DONE');
    expect(run(splitInto(body, 17))).toEqual([...frames, 'DONE']);
  });
});

describe('Georgian text survives', () => {
  const ka = 'გამარჯობა! როგორ ხარ? — ეს არის ტესტი 🇬🇪';

  it('round-trips through encode → parse unchanged', () => {
    expect(decodeFrames(encodeFrame({ text: ka }))).toEqual([{ text: ka }]);
  });

  it('survives byte chunks cut mid-character when decoded with TextDecoder({stream:true})', () => {
    // A Georgian letter is 3 bytes in UTF-8. Cut the byte stream every 2 bytes so almost every letter
    // straddles a chunk boundary, then decode the way the client must, with stream: true.
    const bytes = new NodeTextEncoder().encode(encodeFrame({ text: ka }) + encodeFrame('DONE'));
    const dec = new NodeTextDecoder('utf-8');
    const out: Out[] = [];
    const p = createFrameParser((f) => out.push(f));
    for (let i = 0; i < bytes.length; i += 2) p.push(dec.decode(bytes.subarray(i, i + 2), { stream: true }));
    p.push(dec.decode());
    p.end();
    expect(out).toEqual([{ text: ka }, 'DONE']);
    expect(JSON.stringify(out)).not.toContain('�');
  });

  it('Georgian in error messages and source titles too', () => {
    const f1: ChatFrame = { error: { code: 'safety', retryable: false, message: 'ამ მოთხოვნაზე პასუხის გაცემა ვერ მოხერხდა.' } };
    const f2: ChatFrame = { sources: [{ url: 'https://ka.wikipedia.org/wiki/თბილისი', title: 'თბილისი' }] };
    expect(decodeFrames(encodeFrame(f1) + encodeFrame(f2))).toEqual([f1, f2]);
  });
});

describe('tolerant decoding of new frames', () => {
  it('sources: non-http(s) links are dropped (a javascript: URL must never become a chip)', () => {
    const body = `data: ${JSON.stringify({
      sources: [
        { url: 'javascript:alert(1)', title: 'x' },
        { url: 'data:text/html,<script>1</script>' },
        { url: 'HTTPS://Example.com/ok', title: 'ok' },
        { url: 42 },
        'nope',
        { title: 'no url' },
        { url: 'https://example.com/blank-title', title: '   ' },
      ],
    })}\n\n`;
    expect(decodeFrames(body)).toEqual([
      { sources: [{ url: 'HTTPS://Example.com/ok', title: 'ok' }, { url: 'https://example.com/blank-title' }] },
    ]);
  });

  it('sources: a list with nothing usable produces no frame', () => {
    expect(decodeFrames('data: {"sources":[{"url":"ftp://x"}]}\n\n')).toEqual([]);
    expect(decodeFrames('data: {"sources":"https://x"}\n\n')).toEqual([]);
  });

  it('usage: non-finite or negative counts are dropped and a missing model drops the frame', () => {
    expect(decodeFrames('data: {"usage":{"model":"m","inputTokens":-1,"outputTokens":"5","totalTokens":9}}\n\n')).toEqual([
      { usage: { model: 'm', totalTokens: 9 } },
    ]);
    expect(decodeFrames('data: {"usage":{"inputTokens":5}}\n\n')).toEqual([]);
  });

  it('meta: a bad partial flag is dropped, a missing model drops the frame', () => {
    expect(decodeFrames('data: {"meta":{"provider":"gemini","model":"m","partial":"yes"}}\n\n')).toEqual([
      { meta: { provider: 'gemini', model: 'm' } },
    ]);
    expect(decodeFrames('data: {"meta":{"provider":"gemini"}}\n\n')).toEqual([]);
  });

  it('meta: the mode fields are validated field by field — the badge survives a bad one', () => {
    const decodeMeta = (meta: Record<string, unknown>) => decodeFrames(`data: ${JSON.stringify({ meta })}\n\n`);
    const base = { provider: 'gemini', model: 'gemini-3.8-flash' };
    // Unknown modes, a model id posing as a mode, non-boolean flags and unknown reasons are dropped.
    expect(decodeMeta({ ...base, mode: 'ultra', fallback: 'yes', requestedMode: 'gemini-3.1-pro-preview', reason: 'budget' })).toEqual([
      { meta: base },
    ]);
    // Every catalogue mode passes, as mode and as requestedMode.
    for (const mode of ['fast', 'thinking', 'pro', 'lite'] as const) {
      expect(decodeMeta({ ...base, mode, requestedMode: mode })).toEqual([{ meta: { ...base, mode, requestedMode: mode } }]);
    }
    expect(decodeMeta({ ...base, fallback: true })).toEqual([{ meta: { ...base, fallback: true } }]);
  });

  it('meta: resetAt must be a bounded ISO instant', () => {
    const resetOf = (resetAt: unknown) => {
      const [f] = decodeFrames(`data: ${JSON.stringify({ meta: { provider: 'gemini', model: 'm', resetAt } })}\n\n`);
      return f !== 'DONE' && f && 'meta' in f ? f.meta.resetAt : 'no frame';
    };
    expect(resetOf('2026-10-01T08:15:00.000Z')).toBe('2026-10-01T08:15:00.000Z');
    expect(resetOf('2026-10-01T12:15:00+04:00')).toBe('2026-10-01T12:15:00+04:00');
    expect(resetOf('2026-10-01T08:15Z')).toBe('2026-10-01T08:15Z');
    for (const bad of [
      'tomorrow',
      '2026-10-01', // a date is not an instant
      '2026-13-45T99:99:00Z', // shaped right, not a real time
      `2026-10-01T08:15:00.000Z${' '.repeat(30)}`,
      '<img src=x onerror=alert(1)>',
      1759306500,
      null,
    ]) {
      expect([bad, resetOf(bad)]).toEqual([bad, undefined]);
    }
  });

  it('error: never dropped. An unknown code becomes unavailable and retryable falls back to the code default', () => {
    expect(decodeFrames('data: {"error":{"code":"teapot","message":"x"}}\n\n')).toEqual([
      { error: { code: 'unavailable', retryable: true, message: 'x' } },
    ]);
    expect(decodeFrames('data: {"error":{"code":"quota"}}\n\n')).toEqual([
      { error: { code: 'quota', retryable: false, message: '' } },
    ]);
    expect(decodeFrames('data: {"error":{"code":"rate_limited","message":"slow down"}}\n\n')).toEqual([
      { error: { code: 'rate_limited', retryable: true, message: 'slow down' } },
    ]);
    expect(decodeFrames('data: {"error":"upstream exploded"}\n\n')).toEqual([
      { error: { code: 'unavailable', retryable: true, message: 'upstream exploded' } },
    ]);
  });

  it('an object carrying several known keys is split into frames, meta first then text', () => {
    expect(decodeFrames('data: {"text":"a","meta":{"provider":"gemini","model":"m"}}\n\n')).toEqual([
      { meta: { provider: 'gemini', model: 'm' } },
      { text: 'a' },
    ]);
  });

  it('isChatErrorCode', () => {
    for (const c of CHAT_ERROR_CODES) expect(isChatErrorCode(c)).toBe(true);
    expect(isChatErrorCode('quota_402')).toBe(false);
    expect(isChatErrorCode(undefined)).toBe(false);
  });
});

describe('bounded memory', () => {
  it('an unterminated line longer than the cap is dropped up to its line break, and the stream recovers', () => {
    const out: Out[] = [];
    const p = createFrameParser((f) => out.push(f));
    const junk = 'x'.repeat(MAX_SSE_LINE_CHARS / 2);
    p.push('data: {"text":"before"}\n\ndata: ');
    p.push(junk);
    p.push(junk);
    p.push(junk); // past the cap now, so the buffer is dropped
    p.push(junk + '"}\n\ndata: {"text":"after"}\n\n');
    p.end();
    expect(out).toEqual([{ text: 'before' }, { text: 'after' }]);
  });

  it('a complete but oversized line is dropped too', () => {
    const huge = encodeFrame({ text: 'y'.repeat(MAX_SSE_LINE_CHARS + 10) });
    expect(run([huge + encodeFrame({ text: 'ok' })])).toEqual([{ text: 'ok' }]);
  });

  it('an oversized unterminated tail is not flushed by end()', () => {
    expect(run(['data: {"text":"' + 'z'.repeat(MAX_SSE_LINE_CHARS + 1)])).toEqual([]);
  });
});

describe('callback errors', () => {
  it('a throwing onFrame surfaces to the caller and leaves the parser consistent', () => {
    const seen: Out[] = [];
    let explode = true;
    const p = createFrameParser((f) => {
      seen.push(f);
      if (explode) {
        explode = false;
        throw new Error('consumer bug');
      }
    });
    expect(() => p.push(encodeFrame({ text: 'a' }) + encodeFrame({ text: 'b' }))).toThrow('consumer bug');
    // The buffer already moved past the dispatched chunk, so nothing is replayed or duplicated.
    p.push(encodeFrame({ text: 'c' }));
    p.end();
    expect(seen).toEqual([{ text: 'a' }, { text: 'c' }]);
  });
});

describe('the {truncated} frame (the answer hit the output-token limit)', () => {
  it('encodes as one data line and decodes back', () => {
    expect(encodeFrame({ truncated: true })).toBe('data: {"truncated":true}\n\n');
    expect(decodeFrames(encodeFrame({ truncated: true }))).toEqual([{ truncated: true }]);
  });

  it('only the literal `true` makes a frame', () => {
    for (const v of [false, 'true', 1, null, {}, []]) {
      expect([v, decodeFrames(`data: ${JSON.stringify({ truncated: v })}\n\n`)]).toEqual([v, []]);
    }
  });

  it('a success tail that ends truncated: text → sources → usage → truncated → DONE, re-chunked', () => {
    const frames: ChatFrame[] = [
      { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
      { text: 'A long answer that stops mid-' },
      { sources: [{ url: 'https://example.com/a', title: 'A' }] },
      { usage: { model: 'gemini-3.8-flash', inputTokens: 10, outputTokens: 8192, totalTokens: 8202 } },
      { truncated: true },
    ];
    const body = frames.map((f) => encodeFrame(f)).join('') + encodeFrame('DONE');
    expect(run(splitInto(body, 7))).toEqual([...frames, 'DONE']);
  });

  it('in one combined object it comes after usage and before error', () => {
    const payload = {
      error: { code: 'quota', message: 'x' },
      truncated: true,
      usage: { model: 'm', outputTokens: 5 },
      text: 'partial',
      meta: { provider: 'gemini', model: 'm' },
      sources: [{ url: 'https://example.com/s' }],
    };
    expect(decodeFrames(`data: ${JSON.stringify(payload)}\n\n`)).toEqual([
      { meta: { provider: 'gemini', model: 'm' } },
      { text: 'partial' },
      { sources: [{ url: 'https://example.com/s' }] },
      { usage: { model: 'm', outputTokens: 5 } },
      { truncated: true },
      { error: { code: 'quota', retryable: false, message: 'x' } },
    ]);
    expect(decodeFrames('data: {"truncated":true,"usage":{"model":"m"}}\n\n')).toEqual([{ usage: { model: 'm' } }, { truncated: true }]);
  });
});

describe('the policy error codes (daily_cap, guest_limit, too_long)', () => {
  const NEW_CODES = ['daily_cap', 'guest_limit', 'too_long'] as const;

  it('are known codes, listed after the original ones', () => {
    for (const c of NEW_CODES) expect(isChatErrorCode(c)).toBe(true);
    expect(CHAT_ERROR_CODES.slice(-3)).toEqual([...NEW_CODES]);
  });

  it.each(NEW_CODES)('%s decodes as itself (not `unavailable`) and is not retryable by default', (code) => {
    expect(decodeFrames(`data: ${JSON.stringify({ error: { code, message: 'm' } })}\n\n`)).toEqual([
      { error: { code, retryable: false, message: 'm' } },
    ]);
  });

  it.each(NEW_CODES)('%s round-trips through the encoder with an explicit retryable', (code) => {
    const frame: ChatFrame = { error: { code, retryable: false, message: `notice ${code}` } };
    expect(decodeFrames(encodeFrame(frame))).toEqual([frame]);
  });
});

describe('error `lang` (a notice the route wrote in that locale)', () => {
  it.each(['ka', 'en', 'ru'] as const)('lang %s is kept and round-trips', (lang) => {
    const frame: ChatFrame = { error: { code: 'daily_cap', retryable: false, message: 'დღევანდელი ლიმიტი ამოიწურა.', lang } };
    expect(decodeFrames(encodeFrame(frame))).toEqual([frame]);
  });

  it('any other value is dropped — the key is absent, the error itself survives', () => {
    for (const lang of ['fr', 'KA', 'en-US', '', 1, null, true, ['ka'], { ka: 1 }]) {
      const [f] = decodeFrames(`data: ${JSON.stringify({ error: { code: 'too_long', retryable: false, message: 'm', lang } })}\n\n`);
      expect([lang, f]).toEqual([lang, { error: { code: 'too_long', retryable: false, message: 'm' } }]);
      expect(f !== 'DONE' && f && 'error' in f && 'lang' in f.error).toBe(false);
    }
  });

  it('a bare-string error never carries a lang', () => {
    expect(decodeFrames('data: {"error":"boom"}\n\n')).toEqual([{ error: { code: 'unavailable', retryable: true, message: 'boom' } }]);
  });
});

describe('meta `reason`: pro_cap | pro_busy | guest', () => {
  const base = { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' as const };

  it.each(['pro_cap', 'pro_busy', 'guest'] as const)('%s is kept and round-trips', (reason) => {
    const frame: ChatFrame = { meta: { ...base, requestedMode: 'pro', reason } };
    expect(decodeFrames(encodeFrame(frame))).toEqual([frame]);
  });

  it('every other value is dropped field by field; the badge survives', () => {
    for (const reason of ['budget', 'PRO_CAP', 'pro-busy', 'guests', '', 1, null, true, ['guest'], { guest: true }]) {
      const [f] = decodeFrames(`data: ${JSON.stringify({ meta: { ...base, reason } })}\n\n`);
      expect([reason, f]).toEqual([reason, { meta: base }]);
    }
  });

  it('a pro_busy downgrade (no resetAt) decodes without inventing one', () => {
    expect(decodeFrames(`data: ${JSON.stringify({ meta: { ...base, requestedMode: 'pro', reason: 'pro_busy', fallback: false } })}\n\n`)).toEqual([
      { meta: { ...base, requestedMode: 'pro', reason: 'pro_busy', fallback: false } },
    ]);
  });
});
