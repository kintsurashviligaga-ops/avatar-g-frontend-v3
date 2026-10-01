/** @jest-environment node */
/**
 * lib/gemini/client.ts model selection: a retired or malformed id — from GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH (the
 * old .env.example shipped gemini-1.5-pro-latest / gemini-1.5-flash-8b) or from a per-call `model` — never reaches the
 * Google URL; the tier default answers instead. No network: fetch is a stub.
 */

type ClientModule = typeof import('./client');

const ENV = { ...process.env };
const realFetch = global.fetch;

/** GEMINI_MODELS is read at import, so each case loads a fresh copy of the module under its own env. */
function load(): ClientModule {
  let mod: ClientModule | undefined;
  jest.isolateModules(() => {
    mod = require('./client') as ClientModule;
  });
  return mod!;
}

beforeEach(() => {
  process.env = { ...ENV };
  delete process.env.GEMINI_MODEL_PRO;
  delete process.env.GEMINI_MODEL_FLASH;
});

afterEach(() => {
  process.env = { ...ENV };
  global.fetch = realFetch;
});

describe('GEMINI_MODELS', () => {
  it('defaults to the current GA models', () => {
    expect(load().GEMINI_MODELS).toEqual({ pro: 'gemini-2.5-pro', flash: 'gemini-2.5-flash' });
  });

  it('ignores the retired ids the old .env.example shipped (and a models/ prefix on them)', () => {
    process.env.GEMINI_MODEL_PRO = 'gemini-1.5-pro-latest';
    process.env.GEMINI_MODEL_FLASH = 'models/gemini-1.5-flash-8b';
    expect(load().GEMINI_MODELS).toEqual({ pro: 'gemini-2.5-pro', flash: 'gemini-2.5-flash' });
  });

  it.each(['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini 3 flash', '../../v1/files', ''])(
    'GEMINI_MODEL_FLASH=%p falls back to the default',
    (v) => {
      process.env.GEMINI_MODEL_FLASH = v;
      expect(load().GEMINI_MODELS.flash).toBe('gemini-2.5-flash');
    },
  );

  it('honours a current id, trimmed and without a models/ prefix', () => {
    process.env.GEMINI_MODEL_PRO = 'models/gemini-3.1-pro-preview';
    process.env.GEMINI_MODEL_FLASH = ' gemini-3.8-flash\n';
    expect(load().GEMINI_MODELS).toEqual({ pro: 'gemini-3.1-pro-preview', flash: 'gemini-3.8-flash' });
  });
});

describe('generateWithGemini — the model in the URL', () => {
  async function urlFor(model: string | undefined): Promise<string> {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      text: async () => '',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await load().generateWithGemini({ prompt: 'hi', tier: 'pro', model });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toContain(`/models/${out.model}:generateContent`);
    return url;
  }

  it.each(['gemini-2.0-flash', 'models/gemini-1.5-pro', '../../v1/files?key=1', '   '])(
    'a per-call model %p is replaced by the tier default',
    async (model) => {
      const url = await urlFor(model);
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
      expect(url).not.toMatch(/gemini-(1\.5|2\.0)-/);
    },
  );

  it('a current per-call model is used (a models/ prefix no longer doubles into models/models/)', async () => {
    expect(await urlFor('models/gemini-3.8-flash')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
  });

  it('no per-call model → the tier default', async () => {
    expect(await urlFor(undefined)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
  });
});
