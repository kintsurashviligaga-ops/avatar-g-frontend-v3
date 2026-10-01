/**
 * @jest-environment node
 *
 * Guards against Google's retired Gemini ids coming back. On 2026-09-29 /api/chat/gemini still rotated through
 * gemini-2.0-flash(-lite): Google answered 404 "This model … is no longer available", so every chat turn burned a
 * failed attempt before reaching a live model. These tests fail if a retired id re-enters the chat rotation (by
 * code default OR env override) or appears as a string literal anywhere in shipped source.
 */
import fs from 'fs';
import path from 'path';

import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_REST_TIER_MODELS,
  chatModelChain,
  geminiTierModel,
  type ChatTier,
} from './models';

/** Retired generations (404). 1.0 is included alongside the 1.5 / 2.0 families that actually broke chat. */
const RETIRED = /gemini-(1\.0|1\.5|2\.0)-/;

const ENV_KEYS = ['GEMINI_CHAT_MODELS', 'GEMINI_CHAT_PRO_MODELS', 'GEMINI_MODEL_PRO', 'GEMINI_MODEL_FLASH'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const TIERS: ChatTier[] = ['standard', 'pro'];

describe('the chat rotation never contains a retired model', () => {
  it.each(TIERS)('the %s default chain', (tier) => {
    expect(DEFAULT_CHAT_MODELS[tier].length).toBeGreaterThan(0);
    for (const id of DEFAULT_CHAT_MODELS[tier]) expect(id).not.toMatch(RETIRED);
    for (const id of chatModelChain(tier)) expect(id).not.toMatch(RETIRED);
  });

  it('the standard chain starts on a fast (flash) model', () => {
    expect(chatModelChain('standard')[0]).toMatch(/flash/);
  });

  it.each(TIERS)('a %s env override made only of retired ids falls back to the defaults', (tier) => {
    const retiredList = 'gemini-2.0-flash,gemini-2.0-flash-lite,models/gemini-1.5-pro,gemini-1.5-flash-8b';
    if (tier === 'pro') process.env.GEMINI_CHAT_PRO_MODELS = retiredList;
    else process.env.GEMINI_CHAT_MODELS = retiredList;
    const chain = chatModelChain(tier);
    expect(chain).toEqual([...DEFAULT_CHAT_MODELS[tier]]);
    for (const id of chain) expect(id).not.toMatch(RETIRED);
  });

  // Each chain keeps only live ids OF ITS OWN CLASS (chatModelClass: a Flash-Lite id is not a Flash-chain member, a
  // Flash id is not a Pro-chain member) — so the mixed lists are per class.
  it.each([
    ['standard', 'gemini-2.0-flash, gemini-3.6-flash, gemini-1.5-pro-latest, gemini-3.8-flash, gemini-2.0-flash-lite', ['gemini-3.6-flash', 'gemini-3.8-flash']],
    ['pro', 'gemini-1.5-pro-latest, gemini-2.5-pro, gemini-2.0-pro-exp, gemini-3.1-pro-preview', ['gemini-2.5-pro', 'gemini-3.1-pro-preview']],
  ] as const)('a mixed %s env override keeps only the live ids, in order', (tier, mixed, expected) => {
    if (tier === 'pro') process.env.GEMINI_CHAT_PRO_MODELS = mixed;
    else process.env.GEMINI_CHAT_MODELS = mixed;
    expect(chatModelChain(tier)).toEqual([...expected]);
    for (const id of chatModelChain(tier)) expect(id).not.toMatch(RETIRED);
  });
});

describe('geminiTierModel (lib/gemini/client.ts tiers)', () => {
  it('defaults are live ids', () => {
    expect(geminiTierModel('pro')).toBe(DEFAULT_REST_TIER_MODELS.pro);
    expect(geminiTierModel('flash')).toBe(DEFAULT_REST_TIER_MODELS.flash);
    for (const id of Object.values(DEFAULT_REST_TIER_MODELS)) expect(id).not.toMatch(RETIRED);
  });

  it('ignores the retired values the old .env.example shipped', () => {
    process.env.GEMINI_MODEL_PRO = 'gemini-1.5-pro-latest';
    process.env.GEMINI_MODEL_FLASH = 'gemini-1.5-flash-8b';
    expect(geminiTierModel('pro')).toBe(DEFAULT_REST_TIER_MODELS.pro);
    expect(geminiTierModel('flash')).toBe(DEFAULT_REST_TIER_MODELS.flash);
  });

  it('treats an empty or malformed value as unset (the old `env ?? default` sent "" as the model)', () => {
    process.env.GEMINI_MODEL_PRO = '';
    process.env.GEMINI_MODEL_FLASH = 'gemini 3 flash';
    expect(geminiTierModel('pro')).toBe(DEFAULT_REST_TIER_MODELS.pro);
    expect(geminiTierModel('flash')).toBe(DEFAULT_REST_TIER_MODELS.flash);
  });

  it('honours a live override, models/ prefix tolerated', () => {
    process.env.GEMINI_MODEL_PRO = ' models/gemini-3.1-pro-preview ';
    process.env.GEMINI_MODEL_FLASH = 'gemini-3.8-flash';
    expect(geminiTierModel('pro')).toBe('gemini-3.1-pro-preview');
    expect(geminiTierModel('flash')).toBe('gemini-3.8-flash');
  });
});

// ─── Repo sweep ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../../..');
const SOURCE_DIRS = ['app', 'lib', 'components', 'hooks', 'scripts', 'store', 'workers', 'services', 'apps', 'i18n', 'types'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.claude', '__snapshots__']);
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
/** Tests keep retired ids on purpose, as negative fixtures. */
const TEST_FILE = /\.(?:test|spec)\.[jt]sx?$/;
/** A retired id as a whole string literal, optionally `models/`-prefixed. */
const RETIRED_LITERAL = /(['"`])(?:models\/)?gemini-(?:1\.0|1\.5|2\.0)-[^'"`\s]*\1/g;

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(e.name) && !TEST_FILE.test(e.name)) out.push(full);
  }
}

/** Drops block and line comments, so prose about the retirement ("'gemini-2.0-flash' was RETIRED") is allowed. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('no retired Gemini id ships in source', () => {
  it('no source file names a retired model in a string literal', () => {
    const files: string[] = [];
    for (const d of SOURCE_DIRS) walk(path.join(ROOT, d), files);
    expect(files.length).toBeGreaterThan(500); // the walk really ran over the repo

    const hits: string[] = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of code.matchAll(RETIRED_LITERAL)) hits.push(`${path.relative(ROOT, file)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('.env.example does not suggest a retired model as a value', () => {
    const lines = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').split('\n');
    const hits = lines.filter((l) => !l.trim().startsWith('#') && RETIRED.test(l));
    expect(hits).toEqual([]);
  });
});
