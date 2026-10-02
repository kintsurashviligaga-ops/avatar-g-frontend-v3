/** @jest-environment node */
/**
 * API LOCKDOWN GUARD (2026-10-02 launch security pass) — static, deterministic, no network.
 *
 * __tests__/api-security.test.ts scans each route's OWN source for a provider string, which is how a route that drains
 * a paid provider through a helper (`lib/gemini`, `lib/veo`, `@ai-sdk/*`, `lib/agentg/personality`, `providerRouter` …)
 * stayed invisible: /api/orbit/[service] called ElevenLabs through lib/ai/elevenlabs with no session, no limit and no
 * length cap, and /api/audio/georgian-song spent ElevenLabs TTS + Music for anyone — neither carried a provider string.
 * This guard follows the IMPORT GRAPH instead: a route that can reach a paid-provider module at any depth must carry a
 * gate signal in its own code, or sit on a reasoned allowlist. It also fails CI for:
 *   · a debug / test / diag / probe endpoint with no production guard (404 in prod, admin, ops or token gate);
 *   · identity taken from a client header (`x-user-id`) — the shape of the deleted mock shop / seller routes;
 *   · a secret-looking NEXT_PUBLIC_* variable (Next inlines those into browser bundles);
 *   · a shared-secret check that is SKIPPED when its env var is unset (the Agent G / Telegram / WhatsApp fail-open);
 *   · the security headers going missing from next.config.js.
 *
 * Every rule reads COMMENT-STRIPPED source: a fix's own comment quoting the bad pattern (this repo's comments do,
 * deliberately) must neither trip nor satisfy a guard.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'];

const stripComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/(^|[^:'"`\\])\/\/[^\n'"`]*$/, '$1')))
    .join('\n');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXTS.includes(path.extname(e.name)) && !/\.(test|spec)\.[jt]sx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/');

// ── The module graph (app/ + lib/ + services/ + store/ + workers/) ────────────────────────────────────────────────────
const FILES = ['app', 'lib', 'services', 'store', 'workers'].flatMap((d) => walk(path.join(ROOT, d)));
const SRC = new Map<string, string>(FILES.map((f) => [f, stripComments(fs.readFileSync(f, 'utf8'))]));

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, ...EXTS.map((x) => base + x), ...EXTS.map((x) => path.join(base, 'index' + x))]) {
    if (SRC.has(c)) return c;
  }
  return null;
}

const IMPORT_RE =
  /(?:import\s+(?!type\s)(?:[^'";]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const GRAPH = new Map<string, string[]>();
for (const [f, s] of SRC) {
  const deps: string[] = [];
  for (const m of s.matchAll(IMPORT_RE)) {
    const r = resolveImport(f, m[1]!);
    if (r) deps.push(r);
  }
  GRAPH.set(f, deps);
}

/** A module that talks to a PAID (or abusable messaging) provider directly: an endpoint host or the vendor SDK. */
const PROVIDER_MODULE_SIGNALS: RegExp[] = [
  /generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|texttospeech\.googleapis\.com|speech\.googleapis\.com/,
  /from\s+['"]@ai-sdk\/|from\s+['"]ai['"]|from\s+['"]@google\/genai['"]|from\s+['"]@google\/generative-ai['"]/,
  /api\.openai\.com|from\s+['"]openai['"]|openrouter\.ai/,
  /api\.anthropic\.com|from\s+['"]@anthropic-ai\/sdk['"]/,
  /api\.deepseek\.com/,
  /api\.replicate\.com|from\s+['"]replicate['"]/,
  /api\.elevenlabs\.io|from\s+['"]@elevenlabs\//,
  /api\.heygen\.com|upload\.heygen\.com|api\.liveavatar\.com/,
  /klingai\.com|runwayml\.com|higgsfield\.ai|from\s+['"]@higgsfield\//,
  /udioapi|UDIO_API_KEY|fal\.run|from\s+['"]@fal-ai\//,
  /api\.stability\.ai|lumalabs\.ai|api\.ltx\.video|api\.worldlabs\.ai|api\.x\.ai|api\.cartesia\.ai|api\.tavily\.com/,
  /api\.deepgram\.com|api\.vapi\.ai|api\.twilio\.com|verify\.twilio\.com|api\.resend\.com|from\s+['"]resend['"]/,
  /graph\.facebook\.com|api\.telegram\.org/,
];
const DIRECT_PROVIDER = new Set<string>();
for (const [f, s] of SRC) if (PROVIDER_MODULE_SIGNALS.some((r) => r.test(s))) DIRECT_PROVIDER.add(f);

/** Shortest import chain from `start` to any direct-provider module, or null. */
function providerChain(start: string): string[] | null {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (DIRECT_PROVIDER.has(cur)) {
      const chain: string[] = [];
      for (let c: string | null = cur; c; c = prev.get(c) ?? null) chain.unshift(rel(c));
      return chain;
    }
    for (const d of GRAPH.get(cur) ?? []) {
      if (prev.has(d)) continue;
      prev.set(d, cur);
      queue.push(d);
    }
  }
  return null;
}

/** A gate in the route's own code: a session, an admin check, a signature / shared-secret / cron / ops check. */
const GATE_SIGNALS: RegExp[] = [
  /\b(requireUser|requireAuthenticatedUser|getAuthenticatedUser|authedClientFromRequest|guardGeneration|getAuthContext|requireAuthContext|sessionUserId|resolveTwinCaller)\s*\(/,
  /auth\.getUser\s*\(/,
  /\b(mustSignInToGenerate|mustSignInToChat|requireAuthForGeneration)\s*\(/,
  /\b(isAdmin|requireAdmin|isAdminUser|assertAdminAccess|hasValidAdminKey|effectiveAdminAllowlist|adminKeyHeaderMatches|opsCallerAllowed|isCronAuthorized|secretMatches)\s*\(/,
  /\b(constructEvent|verifyWebhookSignature|verifyBogCallbackSignature|verifyVapiWebhookSignature|verifyTwilioRequest|verifyJobSignature|verifyHandoffToken|consumeHandoffToken|verifyRealtimeSessionToken|verifyMetaSignature)\s*\(/,
  /timingSafeEqual\s*\(/,
  /x-internal-worker-token|x-admin-key|process\.env\.(CRON_SECRET|ADMIN_KEY|ADMIN_API_TOKEN|MIGRATION_RUN_KEY|OBSERVABILITY_DASHBOARD_TOKEN|TELEGRAM_SETUP_SECRET|WORKER_INTERNAL_TOKEN)\b/,
];

/**
 * Routes that can reach a provider module WITHOUT a gate in their own code — each with the reason it is safe.
 * A new entry is a reviewed decision; shrinking this list is the goal.
 */
const PROVIDER_ROUTE_ALLOWLIST: Record<string, string> = {
  'app/api/agent-g/telegram/route.ts':
    'Telegram webhook — the secret header is checked FAIL-CLOSED inside lib/agent-g/channels/telegram-webhook-handler (guarded below)',
  'app/api/agent-g/telegram/webhook/route.ts': 're-export of the canonical Telegram webhook (/api/agent-g/telegram)',
  'app/api/agent-g/webhook/telegram/route.ts': 're-export of the canonical Telegram webhook (/api/agent-g/telegram)',
  'app/api/agent-g/webhook/whatsapp/route.ts': 're-export of /api/webhooks/whatsapp — Meta signature verified, fail-closed (guarded below)',
  'app/api/auth/email-otp/send/route.ts': 'sign-in code e-mail (Resend) — public by design; AUTH / AUTH_IP / OTP_ADDRESS limits',
  'app/api/health/public/route.ts': 'aggregate status pings of provider status endpoints (no generation), 60 s cache',
  'app/api/support/route.ts': 'public support form (Resend e-mail to our own inbox) — per-IP SUPPORT bucket',
  'app/api/video/engine/route.ts': 'Veo capability flags (env reads only), no provider call',
  'app/api/research/capabilities/route.ts': 'Deep Research availability probe — env flags + a table probe + the price; no provider call, no user data (IP READ bucket)',
  'app/api/connectors/route.ts': 'Connectors states — static registry + a table probe; no provider call; a guest sees statuses only (IP READ bucket)',
  'app/api/genjutsu/capabilities/route.ts': 'VFX open/soon flags (env + credential-PRESENCE reads only: it builds no request and calls no provider); coarse open|soon on the wire',
  'app/api/ai/music/engines/route.ts': 'music engine availability (env presence checks + the circuit-breaker flags), booleans only, no provider call — IP READ bucket',
};

const ROUTES = FILES.filter((f) => /^app\/api\/.+\/route\.[jt]sx?$/.test(rel(f)));

describe('API lockdown — every route that can reach a paid provider is gated', () => {
  it('the scanner sees the app (sanity)', () => {
    expect(ROUTES.length).toBeGreaterThan(300);
    expect(DIRECT_PROVIDER.size).toBeGreaterThan(30);
    // The two drains this guard exists for are found through their helpers, not a string in the route.
    expect(providerChain(path.join(ROOT, 'app/api/orbit/[service]/route.ts'))).not.toBeNull();
    expect(providerChain(path.join(ROOT, 'app/api/audio/georgian-song/route.ts'))).not.toBeNull();
  });

  it('no ungated provider-reaching route outside the reasoned allowlist', () => {
    const violations: string[] = [];
    for (const f of ROUTES) {
      const chain = providerChain(f);
      if (!chain) continue;
      const src = SRC.get(f)!;
      if (GATE_SIGNALS.some((r) => r.test(src))) continue;
      if (rel(f) in PROVIDER_ROUTE_ALLOWLIST) continue;
      violations.push(`${rel(f)}  via  ${chain.join(' > ')}`);
    }
    // A failure: a route can spend a provider with no session / admin / signature / secret gate in its own code. Gate
    // it (mustSignInToGenerate + a per-account cap, opsCallerAllowed for diagnostics, a signature for webhooks), or —
    // if it truly cannot spend — add it to PROVIDER_ROUTE_ALLOWLIST with the reason.
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const stale: string[] = [];
    for (const r of Object.keys(PROVIDER_ROUTE_ALLOWLIST)) {
      const abs = path.join(ROOT, r);
      if (!SRC.has(abs)) { stale.push(`${r} — gone`); continue; }
      if (!providerChain(abs)) { stale.push(`${r} — no longer reaches a provider`); continue; }
      if (GATE_SIGNALS.some((x) => x.test(SRC.get(abs)!))) stale.push(`${r} — now gated in its own code (remove it)`);
    }
    expect(stale).toEqual([]);
  });
});

// ── Debug / test / diagnostic endpoints ────────────────────────────────────────────────────────────────────────────────
const DEBUG_SEGMENT = /(^|[-_])(tests?|debug|dev|seed|demo|mocks?|playground|e2e|probes?|diag|diagnostics|selftest|sandbox|fixtures?)([-_]|$)|^env(-check|_integrity_status)?$|^validate-env$/i;

/** What makes a debug endpoint safe to ship: 404 in production, or an admin / ops / token gate. */
const DEBUG_GUARDS: RegExp[] = [
  /NODE_ENV\s*={2,3}\s*['"]production['"][\s\S]{0,240}(404|[Nn]ot found)/,
  /\b(opsCallerAllowed|isAdmin|requireAdmin|isAdminUser|assertAdminAccess|effectiveAdminAllowlist|adminKeyHeaderMatches|isCronAuthorized)\s*\(/,
  /process\.env\.(ADMIN_API_TOKEN|ADMIN_KEY|CRON_SECRET)\b/,
];

/**
 * User FEATURES whose name only looks like a debug endpoint. Each is a reviewed decision with its reason, and the
 * exemption holds only while the route verifies a session in its own code (it acts for the signed-in user alone).
 */
const DEBUG_NAMED_USER_FEATURES: Record<string, string> = {
  'app/api/push/test/route.ts':
    '"Send me a test notification" on the push opt-in card — session required, reaches only the caller\'s own devices, per-account limit (PUSH_TEST_USER)',
};
const SESSION_GATE = /\b(getAuthenticatedUser|requireAuthenticatedUser|requireUser|authedClientFromRequest)\s*\(/;

describe('API lockdown — debug / test / diag endpoints never answer the public in production', () => {
  it('every debug-named route is production-guarded', () => {
    const offenders: string[] = [];
    for (const f of ROUTES) {
      const segs = rel(f).replace(/^app\/api\//, '').split('/').slice(0, -1);
      if (!segs.some((s) => DEBUG_SEGMENT.test(s))) continue;
      if (rel(f) in DEBUG_NAMED_USER_FEATURES && SESSION_GATE.test(SRC.get(f)!)) continue;
      if (!DEBUG_GUARDS.some((r) => r.test(SRC.get(f)!))) offenders.push(rel(f));
    }
    // Remove the endpoint when nothing calls it; otherwise return 404 in production unless the caller is an admin
    // (lib/security/opsAccess: opsCallerAllowed + opsNotFound).
    expect(offenders).toEqual([]);
  });

  it('the endpoints removed on 2026-10-02 stay removed', () => {
    for (const gone of [
      'app/api/tests/smoke/route.ts', 'app/api/tests/stripe-webhook/route.ts', 'app/api/validate-env/route.ts',
      'app/api/shop/products/route.ts', 'app/api/seller/kpi/route.ts', 'app/api/pipeline/direct/route.ts',
      'app/api/pipeline/qa/route.ts', 'app/api/pipeline/assets/route.ts', 'app/api/pipeline/overlay/route.ts',
    ]) {
      expect({ gone, exists: fs.existsSync(path.join(ROOT, gone)) }).toEqual({ gone, exists: false });
    }
  });

  it('the retired Twilio SMS-code routes stay retired (410, no provider reachable — SMS pumping is billed to us)', () => {
    for (const r of ['app/api/auth/otp/send/route.ts', 'app/api/auth/otp/check/route.ts']) {
      const abs = path.join(ROOT, r);
      expect({ r, status410: /status:\s*410/.test(SRC.get(abs)!), reachesProvider: providerChain(abs) !== null })
        .toEqual({ r, status410: true, reachesProvider: false });
    }
  });

  it('the operator endpoints are gated by opsCallerAllowed', () => {
    for (const r of ['app/api/app/health/route.ts', 'app/api/system/film-readiness/route.ts', 'app/api/system/film-selftest/route.ts']) {
      expect({ r, gated: /\bopsCallerAllowed\s*\(/.test(SRC.get(path.join(ROOT, r))!) }).toEqual({ r, gated: true });
    }
  });
});

// ── Identity, secrets, fail-open checks ───────────────────────────────────────────────────────────────────────────────
describe('API lockdown — trust rules', () => {
  it('no route takes its caller identity from a client header (x-user-id)', () => {
    const offenders = ROUTES.filter((f) => /headers\.get\(\s*['"]x-user-id['"]\s*\)/i.test(SRC.get(f)!)).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no admin / internal key is accepted from the query string', () => {
    const offenders = ROUTES.filter((f) =>
      /searchParams\.get\(\s*['"](key|admin_key|secret|token|admin_id)['"]\s*\)/.test(SRC.get(f)!)
      && /ADMIN_KEY|ADMIN_API|MIGRATION_RUN_KEY|INTERNAL|ADMIN_ID/.test(SRC.get(f)!),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no secret-looking NEXT_PUBLIC_* variable is referenced (Next inlines them into browser bundles)', () => {
    const PUBLIC_BY_DESIGN = new Set([
      'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_VAPI_PUBLIC_KEY', 'NEXT_PUBLIC_POSTHOG_KEY',
      // The Web Push applicationServerKey: every subscribing browser and every push service receives it. Its private half
      // is VAPID_PRIVATE_KEY (server-only).
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    ]);
    const offenders: string[] = [];
    for (const f of [...FILES, ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'hooks'))]) {
      const src = SRC.get(f) ?? stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|API_KEY|_TOKEN|PASSWORD|_KEY)\b/g)) {
        if (!PUBLIC_BY_DESIGN.has(m[0])) offenders.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('shared-secret checks fail CLOSED when their env var is unset', () => {
    const read = (r: string) => SRC.get(path.join(ROOT, r))!;
    // Agent G's internal dispatch used `if (secret && header !== secret)` — skipped entirely when unset.
    for (const r of ['app/api/agent-g/delegate/route.ts', 'app/api/agent-g/run-task/route.ts']) {
      expect({ r, usesSecretMatches: /\bsecretMatches\s*\(/.test(read(r)) }).toEqual({ r, usesSecretMatches: true });
      expect({ r, skipsWhenUnset: /if\s*\(\s*(internalSecret|secret)\s*&&/.test(read(r)) }).toEqual({ r, skipsWhenUnset: false });
    }
    // Telegram: the header used to be checked only `if (expectedSecret)`.
    const tg = read('lib/agent-g/channels/telegram-webhook-handler.ts');
    expect(/if\s*\(\s*expectedSecret\s*\)/.test(tg)).toBe(false);
    expect(/secretMatches\s*\(\s*providedSecret\s*,\s*expectedSecret\s*\)/.test(tg)).toBe(true);
    // WhatsApp: verifyMetaSignature returned `true` with no app secret.
    const wa = read('app/api/webhooks/whatsapp/route.ts');
    expect(/if\s*\(\s*!appSecret\s*\)\s*\{?\s*return\s+true/.test(wa)).toBe(false);
    expect(/if\s*\(\s*!appSecret\s*\)\s*\{?\s*return\s+false/.test(wa)).toBe(true);
  });

  it('a client-sent demo flag never stands in for a session in production', () => {
    const smm = SRC.get(path.join(ROOT, 'lib/smm/server.ts'))!;
    expect(/const\s+isDemo\s*=\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*&&/.test(smm)).toBe(true);
    const ai = SRC.get(path.join(ROOT, 'app/api/ai/route.ts'))!;
    expect(/supabaseConfigured\s*=\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]\s*\|\|/.test(ai)).toBe(true);
  });

  it('every anonymous text-chat route spends the shared guest allowance', () => {
    for (const r of ['app/api/agent-g/chat/route.ts', 'app/api/chat/orchestrate/route.ts']) {
      expect({ r, spends: /\bspendGuestTurn\s*\(/.test(SRC.get(path.join(ROOT, r))!) }).toEqual({ r, spends: true });
    }
    // …the same buckets /api/chat/gemini uses (one allowance per guest, whichever chat they type into).
    const g = SRC.get(path.join(ROOT, 'lib/chat/guestAllowance.ts'))!;
    expect(g).toMatch(/guestChatDailyLimit\(\)/);
    expect(g).toMatch(/checkRateLimitByKey\(\s*GUEST_GLOBAL_KEY\s*,\s*guestChatGlobalDailyLimit\(\)\s*\)/);
  });
});

describe('API lockdown — response security headers (next.config.js)', () => {
  const cfg = stripComments(fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8'));
  it.each([
    ['X-Content-Type-Options', /'X-Content-Type-Options',\s*value:\s*'nosniff'/],
    ['Referrer-Policy', /'Referrer-Policy',\s*value:\s*'strict-origin-when-cross-origin'/],
    ['X-Frame-Options', /'X-Frame-Options',\s*value:\s*'(SAMEORIGIN|DENY)'/],
    ['Strict-Transport-Security', /'Strict-Transport-Security',\s*value:\s*'max-age=\d{8,}/],
    ['X-Permitted-Cross-Domain-Policies', /'X-Permitted-Cross-Domain-Policies',\s*value:\s*'none'/],
  ])('%s is set', (_name, re) => {
    expect(cfg).toMatch(re);
  });

  it('Permissions-Policy keeps camera + microphone for self only and denies the powerful features nothing uses', () => {
    const block = cfg.slice(cfg.indexOf("'Permissions-Policy'"), cfg.indexOf("'Permissions-Policy'") + 600);
    for (const f of ["'camera=(self)'", "'microphone=(self)'", "'geolocation=()'", "'payment=()'", "'usb=()'", "'display-capture=()'"]) {
      expect(block).toContain(f);
    }
  });

  it('the CSP still forbids framing by other origins', () => {
    const csp = fs.readFileSync(path.join(ROOT, 'lib/security/csp.js'), 'utf8');
    expect(csp).toMatch(/'frame-ancestors':\s*\["'self'"\]/);
  });
});
