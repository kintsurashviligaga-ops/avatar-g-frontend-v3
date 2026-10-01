/**
 * Voice-to-action catalogue: the declarations Google receives (shape, the plain OpenAPI subset, no empty OBJECT,
 * prepare-only wording) and the validators every toolCall passes through (required fields strict, optional fields
 * normalised and bounded, junk → a structured error, never a throw).
 */
import {
  LIVE_ACTIONS_RULE,
  LIVE_ACTION_NAMES,
  LIVE_ASPECT_RATIOS,
  LIVE_CODE_LANGUAGES,
  LIVE_CODE_MAX_BYTES,
  LIVE_DURATION_MAX_SEC,
  LIVE_FUNCTION_DECLARATIONS,
  LIVE_PROMPT_MAX_CHARS,
  LIVE_STUDIO_TOOLS,
  LIVE_STYLE_MAX_CHARS,
  LIVE_TITLE_MAX_CHARS,
  utf8ByteLength,
  validateLiveToolCall,
  type LiveSchema,
} from './liveTools';

const ALLOWED_SCHEMA_KEYS = new Set(['type', 'description', 'enum', 'properties', 'required']);

function walk(schema: LiveSchema, visit: (s: LiveSchema, path: string) => void, path = 'parameters'): void {
  visit(schema, path);
  for (const [k, v] of Object.entries(schema.properties ?? {})) walk(v, visit, `${path}.${k}`);
}

const ok = (name: string, args: unknown) => {
  const r = validateLiveToolCall(name, args);
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.action;
};
const err = (name: string, args: unknown) => {
  const r = validateLiveToolCall(name, args);
  if (r.ok) throw new Error(`expected an error, got ${JSON.stringify(r.action)}`);
  return r.error;
};

describe('LIVE_FUNCTION_DECLARATIONS', () => {
  it('declares exactly the four functions, in order, each with a description', () => {
    expect(LIVE_FUNCTION_DECLARATIONS.map((d) => d.name)).toEqual([...LIVE_ACTION_NAMES]);
    expect(LIVE_ACTION_NAMES).toEqual(['prepare_generation', 'show_code', 'open_studio', 'end_call']);
    for (const d of LIVE_FUNCTION_DECLARATIONS) {
      expect(d.name).toMatch(/^[a-z_]{1,64}$/); // Gemini: a-z, 0-9, _ ; ≤ 64
      expect(d.description.length).toBeGreaterThan(20);
    }
  });

  it('uses only the plain OpenAPI subset with proto enum type names; required ⊆ properties; no empty OBJECT', () => {
    for (const d of LIVE_FUNCTION_DECLARATIONS) {
      if (!d.parameters) continue;
      walk(d.parameters, (s, path) => {
        for (const k of Object.keys(s)) expect([path, k, ALLOWED_SCHEMA_KEYS.has(k)]).toEqual([path, k, true]);
        expect(['OBJECT', 'STRING', 'INTEGER']).toContain(s.type);
        if (s.type === 'OBJECT') {
          // ⚠️ An OBJECT with empty `properties` is a documented Gemini 400.
          expect(Object.keys(s.properties ?? {}).length).toBeGreaterThan(0);
          for (const r of s.required ?? []) expect(Object.keys(s.properties ?? {})).toContain(r);
        }
        if (s.enum) expect(s.type).toBe('STRING');
      });
    }
    expect(LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'end_call')!.parameters).toBeUndefined();
  });

  it('the argument shapes the brief locked: prepare_generation / show_code / open_studio', () => {
    const byName = Object.fromEntries(LIVE_FUNCTION_DECLARATIONS.map((d) => [d.name, d]));
    const prep = byName.prepare_generation!.parameters!;
    expect(Object.keys(prep.properties!)).toEqual(['tool', 'prompt', 'aspectRatio', 'durationSec', 'style']);
    expect(prep.required).toEqual(['tool', 'prompt']);
    expect(prep.properties!.tool!.enum).toEqual(['video', 'image', 'music', 'avatar']);
    expect(prep.properties!.aspectRatio!.enum).toEqual([...LIVE_ASPECT_RATIOS]);
    expect(prep.properties!.durationSec!.type).toBe('INTEGER');
    const code = byName.show_code!.parameters!;
    expect(code.required).toEqual(['title', 'language', 'code']);
    expect(code.properties!.language!.enum).toEqual([...LIVE_CODE_LANGUAGES]);
    expect(byName.open_studio!.parameters!.required).toEqual(['tool']);
  });

  it('tells the model the safety rule: prepare_generation never starts a render or spends credits', () => {
    const prep = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'prepare_generation')!;
    expect(prep.description).toMatch(/does NOT start/);
    expect(prep.description).toMatch(/no credits/);
    expect(LIVE_ACTIONS_RULE).toMatch(/NEVER starts a generation or spends credits/);
    expect(LIVE_ACTIONS_RULE).toMatch(/ok:false/);
  });

  it('is frozen and JSON-round-trip safe (it travels server → Google → browser)', () => {
    expect(Object.isFrozen(LIVE_FUNCTION_DECLARATIONS)).toBe(true);
    expect(Object.isFrozen(LIVE_FUNCTION_DECLARATIONS[0]!.parameters!.properties!.tool!.enum)).toBe(true);
    expect(JSON.parse(JSON.stringify(LIVE_FUNCTION_DECLARATIONS))).toEqual(LIVE_FUNCTION_DECLARATIONS);
  });

  it('every aspect ratio is one the image studio already offers (no mapping needed downstream)', () => {
    const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'];
    for (const a of LIVE_ASPECT_RATIOS) expect(IMG_ASPECTS).toContain(a);
  });
});

describe('validateLiveToolCall — prepare_generation', () => {
  it('a full, clean call → the typed action', () => {
    expect(ok('prepare_generation', { tool: 'video', prompt: 'A cat surfing at sunset', aspectRatio: '9:16', durationSec: 24, style: 'cinematic' }))
      .toEqual({ type: 'prepare_generation', tool: 'video', prompt: 'A cat surfing at sunset', aspectRatio: '9:16', durationSec: 24, style: 'cinematic' });
  });

  it('required: tool and a non-empty prompt (structured errors name the field and the allowed values)', () => {
    expect(err('prepare_generation', { prompt: 'x' })).toMatchObject({ code: 'invalid_args', field: 'tool', allowed: LIVE_STUDIO_TOOLS });
    expect(err('prepare_generation', { tool: 'podcast', prompt: 'x' })).toMatchObject({ field: 'tool' });
    expect(err('prepare_generation', { tool: 'image' })).toMatchObject({ field: 'prompt' });
    expect(err('prepare_generation', { tool: 'image', prompt: '   \n\t ' })).toMatchObject({ field: 'prompt' });
    expect(err('prepare_generation', { tool: 'image', prompt: 42 })).toMatchObject({ field: 'prompt' });
  });

  it('tool: case, whitespace and plain-word aliases normalise; prompt is bounded to 2,000 characters', () => {
    expect(ok('prepare_generation', { tool: ' Photo ', prompt: 'p' })).toMatchObject({ tool: 'image' });
    expect(ok('prepare_generation', { tool: 'SONG', prompt: 'p' })).toMatchObject({ tool: 'music' });
    expect(ok('prepare_generation', { tool: 'lipsync', prompt: 'p' })).toMatchObject({ tool: 'avatar' });
    const long = ok('prepare_generation', { tool: 'video', prompt: 'ა'.repeat(5000) }) as { prompt: string };
    expect(long.prompt.length).toBe(LIVE_PROMPT_MAX_CHARS);
    // A cut never leaves half an emoji (surrogate pair) behind.
    const emoji = ok('prepare_generation', { tool: 'video', prompt: `${'a'.repeat(LIVE_PROMPT_MAX_CHARS - 1)}😀😀` }) as { prompt: string };
    expect(emoji.prompt.length).toBe(LIVE_PROMPT_MAX_CHARS - 1);
  });

  it('prompt: control characters and bidi overrides are stripped, line breaks kept (at most one blank line)', () => {
    const a = ok('prepare_generation', { tool: 'image', prompt: 'a\u0000b‮c\u0007\r\nline 2\n\n\n\nline 3' }) as { prompt: string };
    expect(a.prompt).toBe('abc\nline 2\n\nline 3');
  });

  it('aspectRatio: enum + unambiguous spellings; anything else is an error listing the allowed shapes', () => {
    const asp = (aspectRatio: unknown) => (ok('prepare_generation', { tool: 'image', prompt: 'p', aspectRatio }) as { aspectRatio?: string }).aspectRatio;
    expect(asp('16:9')).toBe('16:9');
    expect(asp('9x16')).toBe('9:16');
    expect(asp('4 / 5')).toBe('4:5');
    expect(asp('Portrait')).toBe('9:16');
    expect(asp('square')).toBe('1:1');
    expect(asp(undefined)).toBeUndefined();
    expect(asp(null)).toBeUndefined();
    expect(asp('')).toBeUndefined();
    expect(err('prepare_generation', { tool: 'image', prompt: 'p', aspectRatio: '21:9' })).toMatchObject({ field: 'aspectRatio', allowed: LIVE_ASPECT_RATIOS });
    expect(err('prepare_generation', { tool: 'image', prompt: 'p', aspectRatio: 1.77 })).toMatchObject({ field: 'aspectRatio' });
  });

  it('durationSec: numbers (and "24s" strings) rounded and clamped to 1-120; junk is an error', () => {
    const dur = (durationSec: unknown) => (ok('prepare_generation', { tool: 'video', prompt: 'p', durationSec }) as { durationSec?: number }).durationSec;
    expect(dur(24)).toBe(24);
    expect(dur(7.6)).toBe(8);
    expect(dur('24s')).toBe(24);
    expect(dur('30 seconds')).toBe(30);
    expect(dur(0)).toBe(1);
    expect(dur(-5)).toBe(1);
    expect(dur(10_000)).toBe(LIVE_DURATION_MAX_SEC);
    for (const bad of ['long', Number.NaN, Number.POSITIVE_INFINITY, true, {}, []]) {
      expect(err('prepare_generation', { tool: 'video', prompt: 'p', durationSec: bad })).toMatchObject({ field: 'durationSec' });
    }
  });

  it('style: one line, bounded to 60 characters; blank → omitted; non-text → error', () => {
    const sty = (style: unknown) => (ok('prepare_generation', { tool: 'music', prompt: 'p', style }) as { style?: string }).style;
    expect(sty('  lo-fi \n  hip hop ')).toBe('lo-fi hip hop');
    expect(sty('x'.repeat(500))).toHaveLength(LIVE_STYLE_MAX_CHARS);
    expect(sty('   ')).toBeUndefined();
    expect(err('prepare_generation', { tool: 'music', prompt: 'p', style: ['jazz'] })).toMatchObject({ field: 'style' });
  });

  it('unknown extra arguments are ignored, never forwarded', () => {
    const a = ok('prepare_generation', { tool: 'video', prompt: 'p', run: true, credits: 999, __proto__: { polluted: 1 } });
    expect(Object.keys(a).sort()).toEqual(['prompt', 'tool', 'type']);
  });
});

describe('validateLiveToolCall — show_code', () => {
  it('a clean call → the typed action; code is kept verbatim apart from line endings', () => {
    const code = 'def f():\r\n    return 1\r\n\r\n\r\n# end\n';
    expect(ok('show_code', { title: 'Fib', language: 'python', code })).toEqual({ type: 'show_code', title: 'Fib', language: 'python', code: 'def f():\n    return 1\n\n\n# end\n' });
  });

  it('language: allowlisted ids, aliases mapped, an unknown name → plaintext, junk → error', () => {
    const lang = (language: unknown) => (ok('show_code', { title: 't', language, code: 'x' }) as { language: string }).language;
    expect(lang('TypeScript')).toBe('typescript');
    expect(lang('js')).toBe('javascript');
    expect(lang('C++')).toBe('cpp');
    expect(lang('sh')).toBe('bash');
    expect(lang('brainfuck')).toBe('plaintext');
    expect(err('show_code', { title: 't', language: 7, code: 'x' })).toMatchObject({ field: 'language', allowed: LIVE_CODE_LANGUAGES });
    expect(err('show_code', { title: 't', language: '', code: 'x' })).toMatchObject({ field: 'language' });
    expect(err('show_code', { title: 't', language: 'x'.repeat(100), code: 'x' })).toMatchObject({ field: 'language' });
  });

  it('code: required, non-blank, at most 200 KB of UTF-8 (bytes, not characters)', () => {
    expect(err('show_code', { title: 't', language: 'go' })).toMatchObject({ field: 'code' });
    expect(err('show_code', { title: 't', language: 'go', code: ' \n ' })).toMatchObject({ field: 'code' });
    expect(ok('show_code', { title: 't', language: 'go', code: 'a'.repeat(LIVE_CODE_MAX_BYTES) })).toMatchObject({ type: 'show_code' });
    expect(err('show_code', { title: 't', language: 'go', code: 'a'.repeat(LIVE_CODE_MAX_BYTES + 1) })).toMatchObject({ code: 'too_large', field: 'code' });
    // 70,000 Georgian letters are 210,000 bytes: over, although the character count is far under.
    expect(err('show_code', { title: 't', language: 'plaintext', code: 'ა'.repeat(70_000) })).toMatchObject({ code: 'too_large' });
  });

  it('title: one line, bounded; missing → "Code"; non-text → error', () => {
    const title = (t: unknown) => (ok('show_code', { title: t, language: 'css', code: 'a{}' }) as { title: string }).title;
    expect(title(' My\nstyles ')).toBe('My styles');
    expect(title('t'.repeat(500))).toHaveLength(LIVE_TITLE_MAX_CHARS);
    expect(title(undefined)).toBe('Code');
    expect(title('  ')).toBe('Code');
    expect(err('show_code', { title: 5, language: 'css', code: 'a{}' })).toMatchObject({ field: 'title' });
  });
});

describe('validateLiveToolCall — open_studio, end_call, junk', () => {
  it('open_studio needs a known studio', () => {
    expect(ok('open_studio', { tool: 'music' })).toEqual({ type: 'open_studio', tool: 'music' });
    expect(err('open_studio', {})).toMatchObject({ field: 'tool' });
    expect(err('open_studio', { tool: 'settings' })).toMatchObject({ field: 'tool' });
  });

  it('end_call ignores any arguments', () => {
    expect(ok('end_call', {})).toEqual({ type: 'end_call' });
    expect(ok('end_call', undefined)).toEqual({ type: 'end_call' });
    expect(ok('end_call', { reason: 'bye' })).toEqual({ type: 'end_call' });
  });

  it('unknown function names → unknown_tool (never executed)', () => {
    for (const name of ['make_video', 'charge_credits', '', undefined, 42, 'PREPARE_GENERATION']) {
      expect(err(name as string, {})).toMatchObject({ code: 'unknown_tool' });
    }
  });

  it('non-object args, arrays and hostile proxies → invalid_args, never a throw', () => {
    const hostile = new Proxy({}, { get() { throw new Error('boom'); }, getOwnPropertyDescriptor() { throw new Error('boom'); } });
    for (const name of ['prepare_generation', 'show_code', 'open_studio']) {
      for (const bad of [null, undefined, 'video', 42, [], ['video', 'p'], hostile]) {
        expect(() => validateLiveToolCall(name, bad)).not.toThrow();
        expect(err(name, bad).code).toBe('invalid_args');
      }
    }
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes like TextEncoder', () => {
    for (const s of ['', 'abc', 'ქართული', 'Русский', '😀x', 'a\uD800b']) {
      expect(utf8ByteLength(s)).toBe(Buffer.byteLength(s, 'utf8'));
    }
  });
});
