/**
 * Voice-to-action catalogue: the declarations Google receives (shape, the plain OpenAPI subset, no empty OBJECT,
 * prepare-only wording) and the validators every toolCall passes through (required fields strict, optional fields
 * normalised and bounded, junk → a structured error, never a throw).
 */
import {
  LIVE_ACTIONS_RULE,
  LIVE_ACTION_NAMES,
  LIVE_AGENT_TASK_MAX_CHARS,
  LIVE_ASPECT_RATIOS,
  LIVE_CODE_LANGUAGES,
  LIVE_CHAT_TEXT_MAX_CHARS,
  LIVE_CODE_MAX_BYTES,
  LIVE_DURATION_MAX_SEC,
  LIVE_FUNCTION_DECLARATIONS,
  LIVE_OPEN_TOOLS,
  LIVE_PROMPT_MAX_CHARS,
  LIVE_STUDIO_TOOLS,
  LIVE_STYLE_MAX_CHARS,
  LIVE_TITLE_MAX_CHARS,
  LIVE_URL_MAX_CHARS,
  asResultRef,
  liveUrlHost,
  utf8ByteLength,
  validateLiveToolCall,
  validateLiveUrl,
  type LiveSchema,
} from './liveTools';
import { isPreviewable, normalizeArtifactLanguage } from '@/components/chat/artifacts/artifactSpec';
import { ALL_TOOLS } from '@/lib/studio/tools';

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
  it('declares every function, in order, each with a description', () => {
    expect(LIVE_FUNCTION_DECLARATIONS.map((d) => d.name)).toEqual([...LIVE_ACTION_NAMES]);
    expect(LIVE_ACTION_NAMES).toEqual([
      'get_screen_state', 'prepare_generation', 'update_settings', 'start_generation', 'open_studio', 'chat_send', 'new_chat',
      'set_chat_model', 'stop', 'scroll_chat', 'open_panel', 'call_view', 'show_code', 'open_url', 'end_call',
      'click', 'type_text', 'download', 'use_result', 'montage', 'read_webpage', 'ask_agent_g', 'extract_audio',
    ]);
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
    // Functions with no arguments carry NO `parameters` (an empty OBJECT is a Gemini 400).
    for (const name of ['end_call', 'get_screen_state', 'new_chat']) {
      expect(LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === name)!.parameters).toBeUndefined();
    }
  });

  it('the argument shapes the brief locked: prepare_generation / show_code / open_studio', () => {
    const byName = Object.fromEntries(LIVE_FUNCTION_DECLARATIONS.map((d) => [d.name, d]));
    const prep = byName.prepare_generation!.parameters!;
    expect(Object.keys(prep.properties!)).toEqual(['tool', 'prompt', 'aspectRatio', 'durationSec', 'style']);
    expect(prep.required).toEqual(['tool', 'prompt']);
    expect(prep.properties!.tool!.enum).toEqual(['video', 'image', 'music', 'avatar', 'presentation', 'model3d']);
    expect(prep.properties!.aspectRatio!.enum).toEqual([...LIVE_ASPECT_RATIOS]);
    expect(prep.properties!.durationSec!.type).toBe('INTEGER');
    const code = byName.show_code!.parameters!;
    expect(code.required).toEqual(['title', 'language', 'code']);
    expect(code.properties!.language!.enum).toEqual([...LIVE_CODE_LANGUAGES]);
    expect(byName.open_studio!.parameters!.required).toEqual(['tool']);
  });

  it('tells the model the money rule: only start_generation spends, and only after the price and a clear yes', () => {
    const prep = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'prepare_generation')!;
    expect(prep.description).toMatch(/does NOT start/);
    expect(prep.description).toMatch(/no credits/);
    const start = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'start_generation')!;
    expect(start.description).toMatch(/SPENDS CREDITS/);
    expect(start.description).toMatch(/ONLY after you told the user the price and they clearly said yes/);
    expect(start.parameters!.required).toEqual(['confirmed']);
    expect(start.parameters!.properties!.confirmed!.enum).toEqual(['yes']);
    expect(LIVE_ACTIONS_RULE).toMatch(/never spend credits/);
    expect(LIVE_ACTIONS_RULE).toMatch(/ONLY after the user clearly says yes to that price/);
    expect(LIVE_ACTIONS_RULE).toMatch(/Never start a generation on your own initiative/);
    expect(LIVE_ACTIONS_RULE).toMatch(/ok:false/);
  });

  it('open_studio reaches every studio tool (kept in step with lib/studio/tools)', () => {
    const open = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'open_studio')!;
    expect([...open.parameters!.properties!.tool!.enum!].sort()).toEqual([...ALL_TOOLS].sort());
    expect([...LIVE_OPEN_TOOLS].sort()).toEqual([...ALL_TOOLS].sort());
  });

  it('is frozen and JSON-round-trip safe (it travels server → Google → browser)', () => {
    expect(Object.isFrozen(LIVE_FUNCTION_DECLARATIONS)).toBe(true);
    const prep = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'prepare_generation')!;
    expect(Object.isFrozen(prep.parameters!.properties!.tool!.enum)).toBe(true);
    expect(JSON.parse(JSON.stringify(LIVE_FUNCTION_DECLARATIONS))).toEqual(LIVE_FUNCTION_DECLARATIONS);
  });

  it('every aspect ratio is one the image studio already offers (no mapping needed downstream)', () => {
    const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'];
    for (const a of LIVE_ASPECT_RATIOS) expect(IMG_ASPECTS).toContain(a);
  });

  it('every code language opens in the canvas, and the canvas previews exactly html and svg of them', () => {
    // The canvas re-validates the event (artifactSpec allowlist): a Live language it refused would be a silent no-op.
    const previewable = LIVE_CODE_LANGUAGES.filter((l) => {
      const canvas = normalizeArtifactLanguage(l);
      expect([l, canvas]).toEqual([l, expect.any(String)]);
      return isPreviewable(canvas!);
    });
    expect(previewable).toEqual(['html', 'svg']);
  });

  it('never claims code is on the user\'s screen — show_code SAVES it (the Live dialog covers the canvas)', () => {
    const show = LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'show_code')!;
    expect(show.description).not.toMatch(/screen/i);
    expect(LIVE_ACTIONS_RULE).not.toMatch(/code (is )?on the screen/i);
    expect(LIVE_ACTIONS_RULE).toMatch(/show_code for code/);
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
    // svg is its own language (the canvas previews it); xml stays xml.
    expect(lang('svg')).toBe('svg');
    expect(lang(' SVG ')).toBe('svg');
    expect(lang('xml')).toBe('xml');
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
    for (const name of ['prepare_generation', 'show_code', 'open_studio', 'open_url']) {
      for (const bad of [null, undefined, 'video', 42, [], ['video', 'p'], hostile]) {
        expect(() => validateLiveToolCall(name, bad)).not.toThrow();
        expect(err(name, bad).code).toBe('invalid_args');
      }
    }
  });
});

describe('validateLiveToolCall — the screen-control functions', () => {
  it('open_studio: every tool, plus spoken aliases', () => {
    for (const t of ALL_TOOLS) expect(ok('open_studio', { tool: t })).toEqual({ type: 'open_studio', tool: t });
    expect(ok('open_studio', { tool: 'Photographer' })).toEqual({ type: 'open_studio', tool: 'photoshoot' });
    expect(ok('open_studio', { tool: 'video editor' })).toEqual({ type: 'open_studio', tool: 'montage' });
    expect(ok('open_studio', { tool: 'slides' })).toEqual({ type: 'open_studio', tool: 'presentation' });
    expect(err('open_studio', { tool: 'settings' })).toMatchObject({ field: 'tool' });
  });

  it('update_settings: at least one setting, each validated like prepare_generation; instrumental is on/off', () => {
    expect(ok('update_settings', { aspectRatio: 'portrait', durationSec: '30s', instrumental: 'on' }))
      .toEqual({ type: 'update_settings', aspectRatio: '9:16', durationSec: 30, instrumental: true });
    expect(ok('update_settings', { instrumental: 'off' })).toEqual({ type: 'update_settings', instrumental: false });
    expect(ok('update_settings', { style: '  lo-fi  ' })).toEqual({ type: 'update_settings', style: 'lo-fi' });
    expect(err('update_settings', {})).toMatchObject({ code: 'invalid_args' });
    expect(err('update_settings', { aspectRatio: '1080x1920' })).toMatchObject({ field: 'aspectRatio' });
    expect(err('update_settings', { instrumental: 'maybe' })).toMatchObject({ field: 'instrumental' });
  });

  it('start_generation: refused unless the model asserts the user said yes', () => {
    expect(ok('start_generation', { confirmed: 'yes' })).toEqual({ type: 'start_generation' });
    expect(ok('start_generation', { confirmed: ' YES ' })).toEqual({ type: 'start_generation' });
    for (const bad of [{}, { confirmed: 'no' }, { confirmed: 'maybe' }, null, undefined, 'yes']) {
      expect(err('start_generation', bad)).toMatchObject({ code: 'invalid_args', field: 'confirmed' });
    }
  });

  it('chat_send: a non-empty text, bounded; get_screen_state / new_chat take no arguments', () => {
    expect(ok('chat_send', { text: '  დამიწერე გეგმა  ' })).toEqual({ type: 'chat_send', text: 'დამიწერე გეგმა' });
    expect((ok('chat_send', { text: 'ა'.repeat(9000) }) as { text: string }).text.length).toBe(LIVE_CHAT_TEXT_MAX_CHARS);
    expect(err('chat_send', { text: '   ' })).toMatchObject({ field: 'text' });
    expect(ok('get_screen_state', { anything: 1 })).toEqual({ type: 'get_screen_state' });
    expect(ok('new_chat', undefined)).toEqual({ type: 'new_chat' });
  });

  it('the enum functions accept exactly their values (case-insensitive) and name them on an error', () => {
    expect(ok('set_chat_model', { model: 'PRO' })).toEqual({ type: 'set_chat_model', model: 'pro' });
    expect(err('set_chat_model', { model: 'gpt' })).toMatchObject({ field: 'model', allowed: ['fast', 'thinking', 'pro', 'lite'] });
    expect(ok('stop', { what: 'generation' })).toEqual({ type: 'stop', what: 'generation' });
    expect(err('stop', {})).toMatchObject({ field: 'what' });
    expect(ok('scroll_chat', { to: 'top' })).toEqual({ type: 'scroll_chat', to: 'top' });
    expect(err('scroll_chat', { to: 'left' })).toMatchObject({ field: 'to' });
    expect(ok('open_panel', { panel: 'credits' })).toEqual({ type: 'open_panel', panel: 'credits' });
    expect(err('open_panel', { panel: 'billing-admin' })).toMatchObject({ field: 'panel' });
    expect(ok('call_view', { view: 'screen' })).toEqual({ type: 'call_view', view: 'screen' });
    expect(err('call_view', { view: 'tiny' })).toMatchObject({ field: 'view' });
  });
});

describe('open_url — a link the user taps (only a public web address gets through)', () => {
  const url = (u: unknown, extra: Record<string, unknown> = {}) => (ok('open_url', { url: u, ...extra }) as { url: string }).url;
  const refused = (u: unknown) => err('open_url', { url: u });

  it('is declared with url (required) and title, and the instruction tells the model to use it for the browser', () => {
    const d = LIVE_FUNCTION_DECLARATIONS.find((x) => x.name === 'open_url')!;
    expect(Object.keys(d.parameters!.properties!)).toEqual(['url', 'title']);
    expect(d.parameters!.required).toEqual(['url']);
    expect(d.parameters!.properties!.url!.type).toBe('STRING');
    expect(d.parameters!.properties!.title!.type).toBe('STRING');
    // Honest about what happens: a link the user taps, never a tab opened by the call.
    expect(d.description).toMatch(/link they tap/);
    expect(d.description).toMatch(/cannot open tabs by itself/);
    expect(LIVE_ACTIONS_RULE).toMatch(/To open a website, a video or search results in the browser, call open_url/);
    expect(LIVE_ACTIONS_RULE).toContain('https://www.google.com/search?q=');
    expect(LIVE_ACTIONS_RULE).toContain('https://www.youtube.com/results?search_query=');
    expect(LIVE_ACTIONS_RULE).toMatch(/it shows a link the user taps/);
  });

  it('a public https address → the typed action with the normalised href; the title is one clean line; extras ignored', () => {
    expect(ok('open_url', { url: 'https://www.youtube.com/results?search_query=cats', title: '  YouTube:\n  cats ', autoplay: true, newWindow: 'yes' }))
      .toEqual({ type: 'open_url', url: 'https://www.youtube.com/results?search_query=cats', title: 'YouTube: cats' });
    expect(ok('open_url', { url: 'http://example.com' })).toEqual({ type: 'open_url', url: 'http://example.com/' });
    // A Georgian query is percent-encoded, as the browser would send it.
    expect(url('https://www.google.com/search?q=კატები')).toBe(new URL('https://www.google.com/search?q=კატები').href);
    expect(url('https://www.google.com/search?q=კატები')).toMatch(/^https:\/\/www\.google\.com\/search\?q=%E1%83%99/);
    // No title, a blank one, or a long one.
    expect(ok('open_url', { url: 'https://bbc.com' })).not.toHaveProperty('title');
    expect(ok('open_url', { url: 'https://bbc.com', title: '   ' })).not.toHaveProperty('title');
    expect((ok('open_url', { url: 'https://bbc.com', title: 't'.repeat(500) }) as { title: string }).title).toHaveLength(LIVE_TITLE_MAX_CHARS);
    expect(err('open_url', { url: 'https://bbc.com', title: 7 })).toMatchObject({ code: 'invalid_args', field: 'title' });
  });

  it('a bare host gets https:// (the model often drops it); a public IPv4 literal is allowed', () => {
    expect(url('youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc');
    expect(url('WWW.Example.COM')).toBe('https://www.example.com/');
    expect(url('//example.org/x')).toBe('https://example.org/x');
    expect(url('www.example.ge:8443/a')).toBe('https://www.example.ge:8443/a');
    expect(url('http://8.8.8.8/')).toBe('http://8.8.8.8/');
    expect(url('http://172.32.0.1/')).toBe('http://172.32.0.1/'); // just outside 172.16/12
  });

  it('refuses every scheme but http and https — javascript:, data:, file: and the rest', () => {
    const TAB = String.fromCharCode(9);
    for (const bad of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', `java${TAB}script:alert(1)`,
      'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'blob:https://example.com/0f7c', 'mailto:a@b.ge',
      'about:blank', 'intent://scan#Intent;scheme=zxing;end', 'ftp://example.com/x', 'vbscript:msgbox(1)', 'chrome://settings',
    ]) {
      expect([bad, refused(bad)]).toEqual([bad, expect.objectContaining({ code: 'invalid_args', field: 'url' })]);
    }
  });

  it('refuses credentials in the address, this device, the local network and private/loopback IP literals', () => {
    for (const bad of [
      'https://user:pass@example.com', 'https://example.com@evil.example/', 'https://admin@example.com',
      'http://localhost:3000', 'http://LOCALHOST/', 'http://localhost./', 'http://app.localhost', 'localhost:3000',
      'http://127.0.0.1', 'http://127.1', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://0.0.0.0',
      'http://10.0.0.5', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1', 'http://100.64.0.1',
      'http://169.254.169.254/latest/meta-data', 'http://224.0.0.1', 'http://255.255.255.255',
      'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
      'http://router.local', 'http://printer/', 'http://intranet/', 'http://db.internal', 'http://nas.home.arpa',
    ]) {
      expect([bad, refused(bad)]).toEqual([bad, expect.objectContaining({ code: 'invalid_args', field: 'url' })]);
    }
    // IPv6 literals are refused outright, public ones too: no site the agent should open is addressed that way.
    expect(refused('http://[2001:4860:4860::8888]/')).toMatchObject({ code: 'invalid_args', field: 'url' });
  });

  it('strips control and bidi characters from the address; junk is invalid_args; at most 2,048 characters', () => {
    const RLO = String.fromCharCode(0x202e);
    const ZWSP = String.fromCharCode(0x200b);
    const NUL = String.fromCharCode(0);
    expect(url(`https://exa${ZWSP}mple.com/${RLO}pa${NUL}th`)).toBe('https://example.com/path');
    expect((ok('open_url', { url: 'https://bbc.com', title: `${RLO}news` }) as { title: string }).title).toBe('news');
    for (const bad of [undefined, null, '', '   ', 42, ['https://bbc.com'], { href: 'https://bbc.com' }, 'https://', 'not a url at all']) {
      expect(refused(bad)).toMatchObject({ code: 'invalid_args', field: 'url' });
    }
    expect(err('open_url', 'https://bbc.com')).toMatchObject({ code: 'invalid_args' }); // args must be an object
    expect(refused(`https://example.com/${'a'.repeat(LIVE_URL_MAX_CHARS)}`)).toMatchObject({ code: 'too_large', field: 'url' });
    // Short as typed, too long once a Georgian query is percent-encoded (each letter becomes 9 characters).
    expect(refused(`https://www.google.com/search?q=${'ა'.repeat(300)}`)).toMatchObject({ code: 'too_large' });
  });

  it('validateLiveUrl gives the host without www.; liveUrlHost never throws', () => {
    expect(validateLiveUrl('https://www.youtube.com/results?search_query=x')).toEqual({ ok: true, url: 'https://www.youtube.com/results?search_query=x', host: 'youtube.com' });
    expect(validateLiveUrl('javascript:alert(1)')).toMatchObject({ ok: false, code: 'invalid_args' });
    expect(liveUrlHost('https://www.bbc.com/news')).toBe('bbc.com');
    expect(liveUrlHost('not a url')).toBe('');
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes like TextEncoder', () => {
    for (const s of ['', 'abc', 'ქართული', 'Русский', '😀x', 'a\uD800b']) {
      expect(utf8ByteLength(s)).toBe(Buffer.byteLength(s, 'utf8'));
    }
  });
});


// ── 2026-10-03: the call's hands (click · type_text · download · use_result · montage · read_webpage) ─────────────────
describe('the hands — validators', () => {
  const v = (name: string, args: unknown) => validateLiveToolCall(name, args);

  it('click: an id or a label; a bare number becomes an id; nothing → a structured error', () => {
    expect(v('click', { target: ' c12 ' })).toEqual({ ok: true, action: { type: 'click', target: 'c12' } });
    expect(v('click', { target: 'ვიდეო' })).toEqual({ ok: true, action: { type: 'click', target: 'ვიდეო' } });
    expect(v('click', { target: 7 })).toEqual({ ok: true, action: { type: 'click', target: 'c7' } });
    const bad = v('click', {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatchObject({ code: 'invalid_args', field: 'target' });
  });

  it('type_text: text is cleaned and bounded; submit is opt-in', () => {
    const r = v('type_text', { target: 'c3', text: 'cats\u202E in\nsnow', submit: 'on' });
    expect(r).toEqual({ ok: true, action: { type: 'type_text', target: 'c3', text: 'cats in\nsnow', submit: true } });
    expect(v('type_text', { target: 'c3', text: 'x', submit: 'off' })).toEqual({ ok: true, action: { type: 'type_text', target: 'c3', text: 'x' } });
    expect(v('type_text', { target: 'c3' }).ok).toBe(false);
    expect(v('type_text', { target: 'c3', text: 'x', submit: 'maybe' }).ok).toBe(false);
  });

  it.each([
    [undefined, {}], ['latest', {}], ['the latest', {}], ['ბოლო', {}], ['2', { n: 2 }], [3, { n: 3 }], ['#4', { n: 4 }],
    ['result 5', { n: 5 }], ['video', { kind: 'video' }], ['the music', { kind: 'audio' }], ['მუსიკა', { kind: 'audio' }],
    ['latest image', { kind: 'image' }], ['фото', { kind: 'image' }],
  ])('a result named %j → %j', (raw, ref) => {
    expect(asResultRef(raw)).toEqual(ref);
  });

  it.each(['0', '51', 'the dog', -1, 2.5])('an unknown result %j → null', (raw) => {
    expect(asResultRef(raw)).toBeNull();
  });

  it('download and use_result', () => {
    expect(v('download', {})).toEqual({ ok: true, action: { type: 'download', result: {} } });
    expect(v('download', { result: 'music' })).toEqual({ ok: true, action: { type: 'download', result: { kind: 'audio' } } });
    expect(v('use_result', { result: '2', to: 'montage' })).toEqual({ ok: true, action: { type: 'use_result', result: { n: 2 }, to: 'montage' } });
    expect(v('use_result', { to: 'music video' })).toEqual({ ok: true, action: { type: 'use_result', result: {}, to: 'music_video' } });
    const bad = v('use_result', { result: 'x', to: 'nowhere' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.allowed).toEqual(['video', 'music_video', 'montage', 'editor', 'chat']);
  });

  it('montage open: "latest" means the newest VIDEO / TRACK; a list of numbers; a time said as mm:ss; the format', () => {
    expect(v('montage', { action: 'open', videos: 'latest', music: 'latest', musicStartSec: '0:30', aspectRatio: 'vertical' })).toEqual({
      ok: true,
      action: { type: 'montage', action: 'open', videos: [{ kind: 'video' }], music: { kind: 'audio' }, musicStartSec: 30, aspectRatio: '9:16' },
    });
    expect(v('montage', { action: 'open', videos: '2, 1', music: 'none' })).toEqual({
      ok: true, action: { type: 'montage', action: 'open', videos: [{ n: 2 }, { n: 1 }], music: null },
    });
    expect(v('montage', { action: 'open', aspectRatio: '4:5' }).ok).toBe(false);
    expect(v('montage', { action: 'set_music_start' }).ok).toBe(false);
    expect(v('montage', { action: 'set_music_start', musicStartSec: 99999 })).toEqual({ ok: true, action: { type: 'montage', action: 'set_music_start', musicStartSec: 3600 } });
    expect(v('montage', { action: 'export' })).toEqual({ ok: true, action: { type: 'montage', action: 'export' } });
  });

  it('read_webpage: only a public web address, normalised', () => {
    expect(v('read_webpage', { url: 'example.ge/news' })).toEqual({ ok: true, action: { type: 'read_webpage', url: 'https://example.ge/news' } });
    for (const url of ['http://localhost:3000', 'http://169.254.169.254/latest', 'javascript:alert(1)', 'http://10.0.0.1/']) {
      expect(v('read_webpage', { url }).ok).toBe(false);
    }
  });

  it('the rule tells the model it may click and chain steps — and that other sites\' buttons are not its to press', () => {
    expect(LIVE_ACTIONS_RULE).toMatch(/click and\s+type_text/);
    expect(LIVE_ACTIONS_RULE).toMatch(/\[App\]/);
    expect(LIVE_ACTIONS_RULE).toMatch(/cannot press\s+buttons, fill forms, sign in or pay on other websites/);
    expect(LIVE_ACTIONS_RULE).toMatch(/never\s+spend credits, pay, delete or sign out/);
  });
});

// ── 2026-10-08: ask_agent_g — a research task handed to Agent G's ReAct loop (POST /api/agent/run) ─────────────────
describe('ask_agent_g', () => {
  const decl = () => LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'ask_agent_g')!;

  it('is declared after the older ones (they keep their order) with one required STRING `task`', () => {
    expect(LIVE_FUNCTION_DECLARATIONS[LIVE_FUNCTION_DECLARATIONS.length - 2]!.name).toBe('ask_agent_g');
    const p = decl().parameters!;
    expect(p.type).toBe('OBJECT');
    expect(Object.keys(p.properties!)).toEqual(['task']);
    expect(p.properties!.task!.type).toBe('STRING');
    expect(p.properties!.task!.description).toMatch(/at most 2000 characters/);
    expect(p.required).toEqual(['task']);
    expect(LIVE_AGENT_TASK_MAX_CHARS).toBe(2000);
  });

  it('tells the model what Agent G is for, that it is slow, and what it can never do', () => {
    const d = decl().description;
    expect(d).toMatch(/research or multi-step web task to Agent G, MyAvatar's main agent/);
    expect(d).toMatch(/searches the web and reads pages/);
    expect(d).toMatch(/written answer with its sources/);
    expect(d).toMatch(/one Google search or one page is not enough/);
    expect(d).toMatch(/up to about a minute, so tell the user you are on it/);
    expect(d).toMatch(/cannot render media, spend credits, sign in, buy or press buttons on other sites/);
    expect(LIVE_ACTIONS_RULE).toMatch(/call ask_agent_g with the whole task/);
    expect(LIVE_ACTIONS_RULE).toMatch(/Tell the user you are on it first \(it can take up to a minute\)/);
  });

  it('accepts a task: cleaned like a prompt (controls and bidi overrides out, line breaks kept), trimmed', () => {
    expect(ok('ask_agent_g', { task: '  Compare the three cheapest flights Tbilisi → Paris in May  ' }))
      .toEqual({ type: 'ask_agent_g', task: 'Compare the three cheapest flights Tbilisi → Paris in May' });
    expect(ok('ask_agent_g', { task: 'a\u0000b\u202Ec\r\nline 2\n\n\n\nline 3', extra: 1 }))
      .toEqual({ type: 'ask_agent_g', task: 'abc\nline 2\n\nline 3' });
  });

  it('clamps a long task to 2,000 characters (never half an emoji)', () => {
    const long = ok('ask_agent_g', { task: 'ა'.repeat(5000) }) as { task: string };
    expect(long.task.length).toBe(LIVE_AGENT_TASK_MAX_CHARS);
    const emoji = ok('ask_agent_g', { task: `${'a'.repeat(LIVE_AGENT_TASK_MAX_CHARS - 1)}😀😀` }) as { task: string };
    expect(emoji.task.length).toBe(LIVE_AGENT_TASK_MAX_CHARS - 1);
  });

  it.each([
    ['no arguments', undefined],
    ['an array', ['task']],
    ['a string', 'find hotels'],
    ['no task', {}],
    ['a number', { task: 42 }],
    ['null', { task: null }],
    ['only whitespace', { task: ' \n\t ' }],
    ['only control characters', { task: '\u0000\u202E' }],
  ])('rejects %s with a structured invalid_args error', (_label, args) => {
    const e = err('ask_agent_g', args);
    expect(e.code).toBe('invalid_args');
    if (isObjArgs(args)) expect(e.field).toBe('task');
  });

  it('an inherited `task` is not read (own properties only)', () => {
    expect(err('ask_agent_g', Object.create({ task: 'from the prototype' }))).toMatchObject({ code: 'invalid_args', field: 'task' });
  });
});

// ── 2026-10-09: extract_audio — Agent G's MP3 from a link or the user's file, in the chat, by voice ────────────────────
describe('extract_audio', () => {
  const decl = () => LIVE_FUNCTION_DECLARATIONS.find((d) => d.name === 'extract_audio')!;

  it('is declared LAST with a required action (plan · start · stop), an optional url and the start confirmation', () => {
    expect(LIVE_FUNCTION_DECLARATIONS[LIVE_FUNCTION_DECLARATIONS.length - 1]!.name).toBe('extract_audio');
    const p = decl().parameters!;
    expect(Object.keys(p.properties!)).toEqual(['action', 'url', 'confirmed']);
    expect(p.properties!.action!.enum).toEqual(['plan', 'start', 'stop']);
    expect(p.properties!.confirmed!.enum).toEqual(['yes']);
    expect(p.required).toEqual(['action']);
  });

  it('tells the model it is free, that platforms are refused with no workaround, and that start needs a yes', () => {
    const d = decl().description;
    expect(d).toMatch(/Free, no credits/);
    expect(d).toMatch(/video platforms[\s\S]*refused by their terms: never look for a way around/);
    expect(d).toMatch(/upload their own or a licensed file/);
    expect(d).toMatch(/only after the user clearly says yes/);
    expect(d).toMatch(/starting confirms the file is theirs or licensed/);
    expect(LIVE_ACTIONS_RULE).toMatch(/call extract_audio with action "plan"/);
    expect(LIVE_ACTIONS_RULE).toMatch(/offer the\s+upload instead, never a workaround/);
  });

  it('plan: with a public link (normalised), or none (the studio picks the source)', () => {
    expect(ok('extract_audio', { action: 'plan', url: ' https://media.example.com/talk.mp4 ' }))
      .toEqual({ type: 'extract_audio', action: 'plan', url: 'https://media.example.com/talk.mp4' });
    expect(ok('extract_audio', { action: 'plan' })).toEqual({ type: 'extract_audio', action: 'plan' });
    expect(ok('extract_audio', { action: 'plan', url: '' })).toEqual({ type: 'extract_audio', action: 'plan' });
    expect(err('extract_audio', { action: 'plan', url: 'javascript:alert(1)' })).toMatchObject({ field: 'url' });
    expect(err('extract_audio', { action: 'plan', url: 'http://192.168.0.1/a.mp4' })).toMatchObject({ field: 'url' });
  });

  it('start only with confirmed "yes"; stop needs nothing; anything else is refused', () => {
    expect(ok('extract_audio', { action: 'start', confirmed: 'yes' })).toEqual({ type: 'extract_audio', action: 'start' });
    expect(ok('extract_audio', { action: 'start', confirmed: ' YES ' })).toEqual({ type: 'extract_audio', action: 'start' });
    expect(err('extract_audio', { action: 'start' })).toMatchObject({ code: 'invalid_args', field: 'confirmed' });
    expect(err('extract_audio', { action: 'start', confirmed: 'maybe' })).toMatchObject({ field: 'confirmed' });
    expect(ok('extract_audio', { action: 'stop' })).toEqual({ type: 'extract_audio', action: 'stop' });
    expect(err('extract_audio', { action: 'download' })).toMatchObject({ code: 'invalid_args', field: 'action' });
    expect(err('extract_audio', 'plan')).toMatchObject({ code: 'invalid_args' });
  });
});

function isObjArgs(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
