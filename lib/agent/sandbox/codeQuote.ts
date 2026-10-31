/**
 * lib/agent/sandbox/codeQuote.ts — "run this exact code" as a quote the user confirms, then the run (Master Task v2.0,
 * Phase 3). The same two steps as every Agent G action that changes state or costs money (lib/agent/tools/registry):
 *
 *   quote  the code is checked against the sandbox policy (./policy checkSandboxJob) with the limits THIS server sets
 *          for a chat run (CODE_RUN_LIMITS, never the client's), and signed (lib/agent/media/quoteToken) for this user,
 *          this code, this engine, 0 credits. Nothing runs and nothing is spent.
 *   run    the token is verified against the code sent back (a changed byte is `quote_changed`), then claimed once in the
 *          shared idempotency store for the quote's whole life: a double tap, a retry or a replayed token runs nothing
 *          a second time. When the store cannot answer, the run is REFUSED (money is spent here, so the guard fails
 *          closed, unlike the paid-start guard that fails open behind a ledger debit). Then the runner (./index
 *          getSandboxRunner) books the worst case against the $20 cap and runs it.
 *
 * Every effect is injected, so the rules are tested offline; the route wires the real ones.
 */
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { QUOTE_TTL_MS, quoteBinding, signQuote, verifyQuote, type QuoteBinding } from '@/lib/agent/media/quoteToken';
import { worstCaseUsd } from './budget';
import { checkSandboxJob, SANDBOX_MAX, type SandboxLanguage, type SandboxLimits, type SandboxResult, type SandboxRunner } from './policy';

/** A chat run: one vCPU, the memory Vercel gives it, one minute. Worst case about $0.003 (budget.ts). */
export const CODE_RUN_LIMITS: Readonly<SandboxLimits> = { ...SANDBOX_MAX, cpus: 1, memoryMb: 2048, wallSec: 60 };
export const CODE_RUN_CAP = 'agent.code_run';
export const CODE_RUN_MODEL = 'vercel-sandbox';
/** What the card shows of stdout / stderr; the runner already cuts at 1 MB. */
export const CODE_OUTPUT_SHOWN = 64 * 1024;

export interface CodeRequest {
  language: SandboxLanguage;
  code: string;
}

export interface CodeQuote {
  jobId: string;
  language: SandboxLanguage;
  codeBytes: number;
  credits: 0;
  wallSec: number;
  network: 'none';
  worstCaseUsd: number;
  expiresAt: number;
}

export type CodeErrorCode =
  | 'bad_input' | 'not_configured' | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'quote_used'
  | 'guard_unavailable' | 'sandbox_disabled' | 'refused' | 'timeout' | 'cancelled' | 'runner_failed';

export type CodeQuoteResult = { ok: true; quote: CodeQuote; request: CodeRequest; token: string } | { ok: false; error: CodeErrorCode; message: string };

export type CodeRunResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string; wallMs: number }
  | { ok: false; error: CodeErrorCode; message: string };

export interface CodeDeps {
  key(): string;
  now(): number;
  newId(): string;
  /** lib/orchestrator/idempotencyStore storeClaim. */
  claim(owner: string, key: string, windowSec: number): Promise<'claimed' | 'held' | 'unavailable'>;
  /** The host is switched on (./index sandboxEnabled): checked before the claim, so a switched-off host burns no quote. */
  enabled(): boolean;
  runner(userId: string): SandboxRunner;
}

const fail = (error: CodeErrorCode, message: string) => ({ ok: false as const, error, message });

function binding(): QuoteBinding {
  return quoteBinding({ cap: CODE_RUN_CAP, model: CODE_RUN_MODEL, transport: 'local', units: CODE_RUN_LIMITS.wallSec });
}

/** The request as the server reads it: a language it knows and the code as a string, nothing else. */
export function codeRequestOf(v: unknown): CodeRequest | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const lang = r.language === 'js' || r.language === 'javascript' ? 'node' : r.language === 'py' ? 'python' : r.language;
  if ((lang !== 'python' && lang !== 'node') || typeof r.code !== 'string') return null;
  return { language: lang, code: r.code };
}

export function quoteCodeRun(deps: CodeDeps, input: { userId: string; request: unknown }): CodeQuoteResult {
  const req = codeRequestOf(input.request);
  if (!req) return fail('bad_input', 'Python or JavaScript code is needed.');
  const check = checkSandboxJob({ language: req.language, code: req.code, limits: { ...CODE_RUN_LIMITS } });
  if (!check.ok) return fail('bad_input', check.error);
  const key = deps.key();
  const jobId = deps.newId();
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = key ? signQuote({ u: input.userId, j: jobId, f: bodyFingerprint(req), c: 0, x: expiresAt }, key, binding()) : null;
  if (!token) return fail('not_configured', 'Running code is not configured on this server.');
  return {
    ok: true,
    request: req,
    token,
    quote: {
      jobId,
      language: req.language,
      codeBytes: Buffer.byteLength(req.code, 'utf8'),
      credits: 0,
      wallSec: CODE_RUN_LIMITS.wallSec,
      network: 'none',
      worstCaseUsd: worstCaseUsd(CODE_RUN_LIMITS),
      expiresAt,
    },
  };
}

const cutShown = (s: string) => {
  const b = Buffer.from(s, 'utf8');
  return b.length <= CODE_OUTPUT_SHOWN ? s : `${b.subarray(0, CODE_OUTPUT_SHOWN).toString('utf8')}\n…[cut]`;
};

export async function runCodeQuote(
  deps: CodeDeps,
  input: { userId: string; request: unknown; token: unknown },
  signal: AbortSignal,
): Promise<CodeRunResult> {
  const req = codeRequestOf(input.request);
  if (!req) return fail('bad_input', 'Python or JavaScript code is needed.');
  const key = deps.key();
  if (!key) return fail('not_configured', 'Running code is not configured on this server.');
  const v = verifyQuote(input.token, key, { userId: input.userId, fingerprint: bodyFingerprint(req), now: deps.now(), credits: 0, binding: binding() });
  if (!v.ok) {
    if (v.reason === 'expired') return fail('quote_expired', 'The plan expired; ask again.');
    if (v.reason === 'changed') return fail('quote_changed', 'The code changed after it was planned; ask again.');
    return fail('quote_invalid', 'This plan cannot be run.');
  }
  // Checked again: a token is only as good as the policy at the time it runs.
  const check = checkSandboxJob({ language: req.language, code: req.code, limits: { ...CODE_RUN_LIMITS } });
  if (!check.ok) return fail('bad_input', check.error);

  if (!deps.enabled()) return fail('sandbox_disabled', 'Running code is switched off on this server.');
  const claim = await deps.claim(input.userId, `code_run:${v.claims.j}`, Math.ceil(QUOTE_TTL_MS / 1000)).catch(() => 'unavailable' as const);
  if (claim === 'held') return fail('quote_used', 'This plan already ran.');
  if (claim !== 'claimed') return fail('guard_unavailable', 'The duplicate guard cannot be read right now, so nothing ran. Try again in a minute.');

  const r: SandboxResult = await deps.runner(input.userId).run(check.plan, signal);
  if (!r.ok) return fail(r.error, r.message);
  return { ok: true, exitCode: r.exitCode, stdout: cutShown(r.stdout), stderr: cutShown(r.stderr), wallMs: r.wallMs };
}
