/** @jest-environment node */
import { auditConfig, productionReadiness, type IntegrationAudit } from './config-audit';

// Snapshot + restore env around each case so we control presence precisely.
const SAVED = { ...process.env };
const VARS = [
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN',
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'ELEVENLABS_API_KEY', 'OPENAI_API_KEY', 'RUNPOD_API_TOKEN',
  'HEYGEN_API_KEY', 'REPLICATE_API_TOKEN', 'LTX_API_KEY', 'LTX2_API_KEY', 'LTX_VIDEO_API_KEY', 'UDIO_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
];
function clearAll() { for (const v of VARS) delete process.env[v]; }
const byId = (a: IntegrationAudit[], id: string) => a.find((x) => x.id === id)!;

beforeEach(() => clearAll());
afterAll(() => { process.env = SAVED; });

describe('auditConfig', () => {
  test('all integrations missing when no env is set', () => {
    const audits = auditConfig();
    expect(audits.length).toBeGreaterThanOrEqual(12);
    expect(audits.every((a) => a.status === 'missing')).toBe(true);
  });

  test('multi-group integration is degraded when only one group is present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    // service role key still missing → degraded
    expect(byId(auditConfig(), 'supabase').status).toBe('degraded');
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    expect(byId(auditConfig(), 'supabase').status).toBe('live');
  });

  test('Stripe needs BOTH the API key and the webhook secret (revenue loop)', () => {
    process.env.STRIPE_SECRET_KEY = 'sk';
    // webhook secret missing → degraded: a top-up would charge yet never credit.
    expect(byId(auditConfig(), 'stripe').status).toBe('degraded');
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
    expect(byId(auditConfig(), 'stripe').status).toBe('live');
  });

  test('OR-aliases satisfy a group (KV_* counts for Upstash)', () => {
    process.env.KV_REST_API_URL = 'https://x.upstash.io';
    process.env.KV_REST_API_TOKEN = 'tok';
    expect(byId(auditConfig(), 'upstash').status).toBe('live');
  });

  test('single-key integrations flip live when present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    expect(byId(auditConfig(), 'anthropic').status).toBe('live');
  });

  test('never returns secret values — only id/label/status/effect/failOpen', () => {
    process.env.ANTHROPIC_API_KEY = 'super-secret-value';
    const a = byId(auditConfig(), 'anthropic');
    expect(JSON.stringify(a)).not.toContain('super-secret-value');
    expect(Object.keys(a).sort()).toEqual(['effect', 'failOpen', 'id', 'label', 'status']);
  });
});

describe('productionReadiness', () => {
  test('ready=false when a hard-required integration is missing', () => {
    const r = productionReadiness();
    expect(r.ready).toBe(false);
    expect(r.hardMissing).toEqual(expect.arrayContaining(['heygen', 'replicate', 'ltx', 'udio', 'stripe']));
  });

  test('fail-open integrations degrade but do NOT block readiness', () => {
    // Provision only the hard-required (non-fail-open) integrations.
    process.env.HEYGEN_API_KEY = 'h';
    process.env.REPLICATE_API_TOKEN = 'r';
    process.env.LTX_API_KEY = 'l';
    process.env.UDIO_API_KEY = 'u';
    process.env.STRIPE_SECRET_KEY = 's';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec'; // revenue loop needs BOTH keys
    const r = productionReadiness();
    expect(r.hardMissing).toEqual([]);
    expect(r.ready).toBe(true);
    // Upstash/Supabase/etc. still degraded but fail-open → reported, not blocking.
    expect(r.degraded).toEqual(expect.arrayContaining(['supabase', 'upstash', 'anthropic', 'gemini']));
  });
});
