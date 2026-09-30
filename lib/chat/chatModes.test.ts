/** @jest-environment node */
/**
 * lib/chat/chatModes.ts — the model-picker catalogue both the header dropdown and /api/chat/gemini read.
 *
 * What is pinned here:
 *   · the catalogue's shape (four modes, in Gemini's menu order, every locale written, Pro alone on the Pro quota);
 *   · resolveChatMode is the ONLY door from a request body to a mode — it can never return a model id;
 *   · the menu subtitle agrees with the model the server actually routes the mode to (lib/ai/google/models.ts), so the
 *     dropdown cannot promise "3.1 Pro" while the chain starts somewhere else;
 *   · displayNameFor (the "which model answered" badge) is readable for known ids and bounded for anything else.
 */
import {
  CHAT_MODES,
  CHAT_MODE_EVENT,
  CHAT_MODE_IDS,
  CHAT_MODE_STORAGE_KEY,
  DEFAULT_CHAT_MODE,
  chatModeOption,
  displayNameFor,
  enabledChatModes,
  isChatModeId,
  resolveChatMode,
  type ChatModeId,
  type ChatModeOption,
} from './chatModes';
import { chatModelChain, chatModelClass } from '@/lib/ai/google/models';

// The chains are env-overridable; these tests pin the code defaults, whatever the machine's env says.
const CHAIN_ENV = ['GEMINI_CHAT_MODELS', 'GEMINI_CHAT_PRO_MODELS', 'GEMINI_CHAT_LITE_MODELS'] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of CHAIN_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterAll(() => {
  for (const k of CHAIN_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('the catalogue', () => {
  it("lists Gemini's modes in menu order, one entry per id, Fast first and the default", () => {
    expect(CHAT_MODE_IDS).toEqual(['fast', 'thinking', 'pro', 'lite']);
    expect(CHAT_MODES.map((m) => m.id)).toEqual([...CHAT_MODE_IDS]);
    expect(DEFAULT_CHAT_MODE).toBe('fast');
    expect(chatModeOption(DEFAULT_CHAT_MODE).enabled).toBe(true);
  });

  it('writes every row in all three locales, with a label and a model name', () => {
    for (const m of CHAT_MODES) {
      expect([m.id, m.label.trim().length > 0, m.displayModel.startsWith('Gemini ')]).toEqual([m.id, true, true]);
      for (const loc of ['ka', 'en', 'ru'] as const) {
        expect([m.id, loc, m.description[loc].trim().length > 0]).toEqual([m.id, loc, true]);
      }
    }
  });

  it('puts only Pro on the Pro allowance, and only the reasoning modes on high thinking', () => {
    const by = (f: (m: ChatModeOption) => boolean) => CHAT_MODES.filter(f).map((m) => m.id);
    expect(by((m) => m.quota === 'pro')).toEqual(['pro']);
    expect(by((m) => m.thinking === 'high')).toEqual(['thinking', 'pro']);
    expect(by((m) => m.thinking === 'low')).toEqual(['fast', 'lite']);
  });

  it('says in the menu which model the server really routes each mode to (no drift from the chains)', () => {
    for (const m of CHAT_MODES) {
      const primary = chatModelChain(m.id)[0]!;
      // Thinking is the Fast model, thought through harder — its subtitle names that model plus "Thinking".
      const expected = m.id === 'thinking' ? `${displayNameFor(primary)} Thinking` : displayNameFor(primary);
      expect([m.id, m.displayModel]).toEqual([m.id, expected]);
    }
    // …and each mode's chain is of the class its name promises.
    expect(chatModelChain('pro').every((id) => chatModelClass(id) === 'pro')).toBe(true);
    expect(chatModelChain('lite').every((id) => chatModelClass(id) === 'lite')).toBe(true);
    expect(chatModelChain('fast').every((id) => chatModelClass(id) === 'flash')).toBe(true);
  });

  it('namespaces the storage key and the sync event like the persona picker', () => {
    expect(CHAT_MODE_STORAGE_KEY).toBe('myavatar:chat-mode');
    expect(CHAT_MODE_EVENT).toMatch(/^myavatar:/);
  });
});

describe('isChatModeId / chatModeOption / enabledChatModes', () => {
  it('accepts exactly the catalogue ids', () => {
    for (const id of CHAT_MODE_IDS) expect(isChatModeId(id)).toBe(true);
    for (const v of ['Fast', 'PRO', ' pro', 'standard', 'gemini-3.1-pro-preview', '', null, undefined, 1, {}, ['pro']]) {
      expect([v, isChatModeId(v)]).toEqual([v, false]);
    }
  });

  it('chatModeOption returns the row, and the first row for an id that slipped past the type', () => {
    expect(chatModeOption('pro').displayModel).toBe('Gemini 3.1 Pro');
    expect(chatModeOption('ultra' as ChatModeId)).toBe(CHAT_MODES[0]);
  });

  it('enabledChatModes keeps menu order and drops a disabled mode', () => {
    expect(enabledChatModes().map((m) => m.id)).toEqual(CHAT_MODES.filter((m) => m.enabled).map((m) => m.id));
    const lite = CHAT_MODES.find((m) => m.id === 'lite') as ChatModeOption;
    const was = lite.enabled;
    try {
      lite.enabled = false;
      expect(enabledChatModes().map((m) => m.id)).not.toContain('lite');
    } finally {
      lite.enabled = was;
    }
  });
});

describe('resolveChatMode — the only door from a request body to a mode', () => {
  it('passes every catalogue mode through', () => {
    for (const id of CHAT_MODE_IDS) expect(resolveChatMode(id)).toBe(id);
  });

  it('maps anything else to the default — including model ids, casing tricks and non-strings', () => {
    for (const v of [undefined, null, '', 'ultra', 'PRO', 'gemini-3.1-pro-preview', 'models/gemini-2.5-pro', 42, { mode: 'pro' }, ['pro']]) {
      expect([v, resolveChatMode(v)]).toEqual([v, DEFAULT_CHAT_MODE]);
    }
  });

  it("honours the legacy body field tier:'pro' only when no valid mode was sent", () => {
    expect(resolveChatMode(undefined, 'pro')).toBe('pro');
    expect(resolveChatMode('junk', 'pro')).toBe('pro');
    expect(resolveChatMode('fast', 'pro')).toBe('fast'); // an explicit mode wins
    expect(resolveChatMode('lite', 'pro')).toBe('lite');
    expect(resolveChatMode(undefined, 'standard')).toBe('fast');
    expect(resolveChatMode(undefined, 'ultra')).toBe('fast');
  });

  it('never returns anything outside the catalogue', () => {
    const inputs: unknown[] = ['fast', 'pro', 'x', null, 0, 'thinking', 'lite', 'gemini-9', undefined];
    for (const a of inputs) for (const b of inputs) expect(isChatModeId(resolveChatMode(a, b))).toBe(true);
  });

  it('a disabled mode resolves to the default (a stale localStorage choice or an old client cannot reach it)', () => {
    const lite = CHAT_MODES.find((m) => m.id === 'lite') as ChatModeOption;
    const was = lite.enabled;
    try {
      lite.enabled = false;
      expect(resolveChatMode('lite')).toBe(DEFAULT_CHAT_MODE);
    } finally {
      lite.enabled = was;
    }
  });
});

describe('displayNameFor — the "answered by" badge', () => {
  it.each([
    ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
    ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite'],
    ['models/gemini-2.5-flash', 'Gemini 2.5 Flash'],
    ['  Gemini-3.8-Flash  ', 'Gemini 3.8 Flash'],
  ])('%p → %p', (id, name) => {
    expect(displayNameFor(id)).toBe(name);
  });

  it('names every model a chat chain can route to (no raw id reaches the badge for our own chains)', () => {
    for (const id of CHAT_MODE_IDS) {
      for (const model of chatModelChain(id)) expect([model, displayNameFor(model)]).not.toEqual([model, model]);
    }
  });

  it('prettifies an unknown Gemini id instead of showing it raw', () => {
    expect(displayNameFor('gemini-4.0-flash')).toBe('Gemini 4.0 Flash');
    expect(displayNameFor('gemini-4.0-pro-preview')).toBe('Gemini 4.0 Pro');
    expect(displayNameFor('gemini-4.0-flash-lite')).toBe('Gemini 4.0 Flash-Lite');
  });

  it('returns other labels as they are, bounded, and nothing for nothing', () => {
    expect(displayNameFor('claude-haiku-4-5')).toBe('claude-haiku-4-5');
    expect(displayNameFor('x'.repeat(500))).toHaveLength(60);
    expect(displayNameFor(`gemini-${'a'.repeat(200)}`).length).toBeLessThanOrEqual(60);
    expect(displayNameFor('')).toBe('');
    expect(displayNameFor('   ')).toBe('');
    expect(displayNameFor(null)).toBe('');
    expect(displayNameFor(undefined)).toBe('');
  });
});
