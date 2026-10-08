/**
 * The Part 1 foundation contracts (lib/contracts): the validators are the build-time gates PROJECT_MASTER asks for
 * (D5 catalog schema, §11 pricing, §12 registry, §8 not-configured), so each rule is pinned here.
 */
import {
  AGENT_CAPABILITIES,
  NotConfiguredError,
  createToolRegistry,
  isAgentCapability,
  isForbiddenModelName,
  isNotConfiguredError,
  isPermittedModelProvider,
  resolveModelPreference,
  uiModelEntries,
  validateModelCatalog,
  validatePricingConfig,
  validateToolDefinitions,
  type AgentToolDefinition,
  type ModelCatalog,
  type ModelCatalogEntry,
  type PricingConfig,
} from './index';

const entry = (over: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry => ({
  id: 'gemini-3.8-flash',
  label: 'Gemini 3.8 Flash',
  provider: 'google',
  family: 'gemini',
  capabilities: ['text'],
  focusModes: ['code'],
  transport: 'vertex',
  enabled: true,
  verifiedAt: '2026-10-08T11:52:00Z',
  ...over,
});
const catalog = (entries: ModelCatalogEntry[]): ModelCatalog => ({ entries, updatedAt: '2026-10-08T00:00:00Z', version: '1' });

describe('agent capabilities (§6.2)', () => {
  test('the ten capabilities, as written in the master', () => {
    expect(AGENT_CAPABILITIES).toEqual(['code', 'terminal', 'browser', 'search', 'files', 'media', 'voice', 'avatar', 'stt', 'video_storyboard']);
    expect(isAgentCapability('video_storyboard')).toBe(true);
    expect(isAgentCapability('image')).toBe(false);
  });
});

describe('provider boundary (Section A)', () => {
  test('only Google and ElevenLabs are model providers', () => {
    expect(isPermittedModelProvider('google')).toBe(true);
    expect(isPermittedModelProvider('elevenlabs')).toBe(true);
    for (const p of ['openai', 'anthropic', 'replicate', 'udio', 'heygen', 'xai']) expect(isPermittedModelProvider(p)).toBe(false);
  });
});

describe('Gemini transport (§8): not configured is an error, never a fallback', () => {
  test('NotConfiguredError names the transport and the missing variables', () => {
    const e = new NotConfiguredError('vertex', ['GCP_PROJECT_ID', 'GCP_VEO_BUCKET']);
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ code: 'not_configured', transportKind: 'vertex', missingVars: ['GCP_PROJECT_ID', 'GCP_VEO_BUCKET'] });
    expect(e.message).toBe('vertex transport is not configured: missing GCP_PROJECT_ID, GCP_VEO_BUCKET');
    expect(isNotConfiguredError(e)).toBe(true);
    expect(isNotConfiguredError({ code: 'not_configured' })).toBe(true);
    expect(isNotConfiguredError(new Error('x'))).toBe(false);
  });
});

describe('ModelCatalog (Section D)', () => {
  test('D3/D7: forbidden vendors and retired Gemini are caught; Google names and look-alike words are not', () => {
    for (const bad of ['gpt-4o', 'o1-mini', 'o3', 'claude-sonnet', 'Anthropic X', 'flux-1.1-pro', 'DALL·E 3', 'dall-e-3', 'sdxl', 'Stable Diffusion 3', 'mistral-large', 'llama-3', 'deepseek-r1', 'grok-4', 'xai/grok', 'cohere', 'gemini-1.5-pro', 'Gemini 1.0 Pro', 'midjourney']) {
      expect([bad, isForbiddenModelName(bad)]).toEqual([bad, true]);
    }
    for (const ok of ['gemini-3.8-flash', 'imagen-4.0-generate-001', 'veo-3.1-fast-generate-001', 'lyria-3-clip-preview', 'gemma-4-31b', 'Coherent style', 'gemini-3.1-pro', 'Nano Banana 2']) {
      expect([ok, isForbiddenModelName(ok)]).toEqual([ok, false]);
    }
  });

  test('D5: a valid catalog has no problems', () => {
    expect(validateModelCatalog(catalog([entry(), entry({ id: 'veo-3.1-fast-generate-001', label: 'Veo 3 Fast', family: 'veo', capabilities: ['video'], focusModes: ['video_storyboard'] })]))).toEqual([]);
  });

  test('D5: non-Google provider, duplicate id, forbidden id, beta label, unlabeled preview, capability with nothing enabled', () => {
    const problems = validateModelCatalog(
      catalog([
        entry(),
        entry(),
        entry({ id: 'gpt-4o', label: 'GPT-4o' }),
        entry({ id: 'x-1', provider: 'openai' as unknown as 'google' }),
        entry({ id: 'gemini-3.8-flash-beta', label: 'Gemini Beta' }),
        entry({ id: 'lyria-3-clip-preview', label: 'Lyria 3 Clip', family: 'lyria', capabilities: ['music'], enabled: false }),
      ]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        '"gemini-3.8-flash": duplicate id',
        '"gpt-4o": forbidden model (D3)',
        '"x-1": provider must be google (Section A)',
        '"gemini-3.8-flash-beta": "custom" / "beta" labels are not allowed (D3)',
        '"lyria-3-clip-preview": a preview model\'s label must say "Preview" (D6)',
        'capability "music" has no enabled entry (D5)',
      ]),
    );
  });

  test('D5 runtime / D6: the UI gets enabled + verified entries for its focus mode, grouped by family', () => {
    const c = catalog([
      entry({ id: 'veo-3.1-generate-001', label: 'Veo 3', family: 'veo', capabilities: ['video'], focusModes: ['video_storyboard'] }),
      entry({ id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' }),
      entry({ id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', verifiedAt: undefined }),
      entry({ id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', enabled: false }),
    ]);
    expect(uiModelEntries(c).map((e) => e.id)).toEqual(['gemini-3.1-pro', 'veo-3.1-generate-001']);
    expect(uiModelEntries(c, 'code').map((e) => e.id)).toEqual(['gemini-3.1-pro']);
  });

  test('D5: a saved preference that is gone is an explicit answer, never a quiet default', () => {
    const c = catalog([entry(), entry({ id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', verifiedAt: undefined }), entry({ id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', enabled: false })]);
    expect(resolveModelPreference(c, 'gemini-3.8-flash')).toMatchObject({ ok: true });
    expect(resolveModelPreference(c, 'gemini-1.5-pro')).toEqual({ ok: false, reason: 'not_in_catalog' });
    expect(resolveModelPreference(c, 'gemini-3.6-flash')).toEqual({ ok: false, reason: 'disabled' });
    expect(resolveModelPreference(c, 'gemini-3.7-flash')).toEqual({ ok: false, reason: 'not_verified' });
    expect(resolveModelPreference(c, 'gemini-3.8-flash', 'avatar')).toEqual({ ok: false, reason: 'wrong_focus_mode' });
  });
});

describe('PRICING_CONFIG (§11)', () => {
  const cfg = (entries: PricingConfig['entries']): PricingConfig => ({ entries, currency: 'USD', updatedAt: '2026-10-08T00:00:00Z' });
  test('a valid table has no problems', () => {
    expect(
      validatePricingConfig(
        cfg([
          { capability: 'video_storyboard', provider: 'google', unit: 'per_second', priceUSD: 0.15, enabled: true },
          { capability: 'voice', provider: 'elevenlabs', unit: 'per_character', priceUSD: 0.00003, enabled: true },
          { capability: 'search', provider: 'google', unit: 'free', priceUSD: 0, enabled: true },
        ]),
      ),
    ).toEqual([]);
  });
  test('forbidden provider, negative or zero paid price, priced free unit, duplicate, wrong currency', () => {
    const problems = validatePricingConfig({
      ...cfg([
        { capability: 'media', provider: 'replicate' as unknown as 'google', unit: 'per_image', priceUSD: 0.04, enabled: true },
        { capability: 'media', provider: 'google', unit: 'per_image', priceUSD: -1, enabled: true },
        { capability: 'media', provider: 'google', unit: 'per_image', priceUSD: 0.04, enabled: true },
        { capability: 'voice', provider: 'elevenlabs', unit: 'per_request', priceUSD: 0, enabled: true },
        { capability: 'search', provider: 'google', unit: 'free', priceUSD: 0.01, enabled: true },
      ]),
      currency: 'GEL' as unknown as 'USD',
    });
    expect(problems).toEqual([
      'currency must be USD, got GEL',
      'entry 0 (media/replicate): provider not allowed (Section A)',
      'entry 1 (media/google): priceUSD must be a number ≥ 0',
      'entry 2 (media/google): duplicate per_image price',
      'entry 3 (voice/elevenlabs): an enabled paid unit costs 0 (use unit "free")',
      'entry 4 (search/google): a free unit must cost 0',
    ]);
  });
});

describe('Tool registry + routing (§12)', () => {
  const tool = (over: Partial<AgentToolDefinition> = {}): AgentToolDefinition => ({
    name: 'web.search',
    capability: 'search',
    provider: 'google',
    inputSchema: {},
    riskLevel: 'low',
    requiresApproval: false,
    ...over,
  });

  test('routes a capability to its tools, or says it is unavailable (no borrowing another capability)', () => {
    const r = createToolRegistry([tool(), tool({ name: 'veo.shot', capability: 'video_storyboard', riskLevel: 'medium', requiresApproval: true })]);
    expect(r.size).toBe(2);
    expect(r.route('search')).toMatchObject({ ok: true, tools: [expect.objectContaining({ name: 'web.search' })] });
    expect(r.route('browser')).toEqual({ ok: false, capability: 'browser', reason: 'capability_unavailable' });
  });

  test('approval: required tools, and unknown tools, always need a yes', () => {
    const r = createToolRegistry([tool(), tool({ name: 'terminal.run', capability: 'terminal', provider: 'sandbox', riskLevel: 'high', requiresApproval: true })]);
    expect(r.needsApproval('web.search')).toBe(false);
    expect(r.needsApproval('terminal.run')).toBe(true);
    expect(r.needsApproval('not.registered')).toBe(true);
  });

  test('an invalid set is refused at build time', () => {
    expect(validateToolDefinitions([tool(), tool(), tool({ name: 'X', provider: 'openai' as unknown as 'google', riskLevel: 'high' })])).toEqual([
      'tool "web.search": duplicate name',
      'tool "X": name must be lowercase [a-z0-9_.-], 2–64 chars',
      'tool "X": provider not allowed (Section A)',
      'tool "X": a high-risk tool must require approval (E8)',
    ]);
    expect(() => createToolRegistry([tool(), tool()])).toThrow(/duplicate name/);
  });
});
