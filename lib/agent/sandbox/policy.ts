/**
 * lib/agent/sandbox/policy.ts — what any runner for code Agent G writes (Python or Node) must enforce. A CONTRACT, NOT
 * A RUNTIME: no such code runs today, and the only runner is `disabledSandbox`, which refuses every job.
 *
 * Why no runner yet: isolation means a separate host (a microVM or a gVisor container), never this function's own
 * process, and every such host is paid infrastructure (Vercel Sandbox, a Cloud Run job, E2B). That is the owner's
 * decision first (docs/handoffs/2026-10-09-agent-g-execution-foundation.md, phase 2). What is fixed here is the policy,
 * so the choice of host cannot loosen it:
 *
 *   language  python or node, nothing else; the code is at most 64 KB.
 *   limits    at most 2 vCPU, 2 GB memory, 300 s wall clock, 1 MB of stdout/stderr, 10 output files of 50 MB each.
 *             A job may ask for less, never for more.
 *   network   DENIED. A job may name hosts it needs; each must be on SANDBOX_EGRESS_ALLOWLIST, which is empty, so
 *             today every job that asks for the network is refused.
 *   files     in: only the caller's own media (lib/security/callerMedia checks each before a runner sees it), mounted
 *             read-only; out: only what the job writes to its output directory, copied to the caller's own storage.
 *   secrets   none. The job's environment is empty; no key, token or service credential is ever passed in.
 *
 * Who may start a job is the tool registry's rule (lib/agent/tools/registry): running code changes state and costs
 * money, so it would be a confirmed action the user presses, never a tool the model calls.
 */

export type SandboxLanguage = 'python' | 'node';

export interface SandboxLimits {
  cpus: number;
  memoryMb: number;
  wallSec: number;
  outputBytes: number;
  files: number;
  fileBytes: number;
}

export const SANDBOX_MAX: Readonly<SandboxLimits> = {
  cpus: 2,
  memoryMb: 2048,
  wallSec: 300,
  outputBytes: 1024 * 1024,
  files: 10,
  fileBytes: 50 * 1024 * 1024,
};
export const SANDBOX_MAX_CODE_BYTES = 64 * 1024;
/** Hosts a job may reach. Empty: no job gets the network. Adding one is a reviewed change, never configuration. */
export const SANDBOX_EGRESS_ALLOWLIST: readonly string[] = [];

export interface SandboxJob {
  language: unknown;
  code: unknown;
  /** The caller's own media, already checked (lib/security/callerMedia), mounted read-only. */
  files?: unknown;
  limits?: unknown;
  egress?: unknown;
}

export interface SandboxPlan {
  language: SandboxLanguage;
  code: string;
  files: string[];
  limits: SandboxLimits;
  /** Always present: the hosts the runner lets through. Empty means no network at all. */
  egress: string[];
  env: Record<string, never>;
}

export type SandboxCheck = { ok: true; plan: SandboxPlan } | { ok: false; error: string };

/** Turn a requested job into the plan a runner must enforce, or refuse it. Pure. */
export function checkSandboxJob(job: SandboxJob, allow: readonly string[] = SANDBOX_EGRESS_ALLOWLIST): SandboxCheck {
  if (job.language !== 'python' && job.language !== 'node') return { ok: false, error: 'language: python or node only' };
  if (typeof job.code !== 'string' || !job.code.trim()) return { ok: false, error: 'code: empty' };
  if (Buffer.byteLength(job.code, 'utf8') > SANDBOX_MAX_CODE_BYTES) return { ok: false, error: `code: over ${SANDBOX_MAX_CODE_BYTES} bytes` };

  const files = job.files ?? [];
  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string' && f.length > 0)) return { ok: false, error: 'files: a list of paths' };
  if (files.length > SANDBOX_MAX.files) return { ok: false, error: `files: at most ${SANDBOX_MAX.files}` };

  const asked = (job.limits ?? {}) as Partial<Record<keyof SandboxLimits, unknown>>;
  if (typeof asked !== 'object' || Array.isArray(asked)) return { ok: false, error: 'limits: an object' };
  const limits = { ...SANDBOX_MAX };
  for (const key of Object.keys(asked) as Array<keyof SandboxLimits>) {
    if (!(key in SANDBOX_MAX)) return { ok: false, error: `limits: unknown ${String(key)}` };
    const v = asked[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return { ok: false, error: `limits: ${key} must be a positive number` };
    if (v > SANDBOX_MAX[key]) return { ok: false, error: `limits: ${key} is over ${SANDBOX_MAX[key]}` };
    limits[key] = v;
  }

  const egress = job.egress ?? [];
  if (!Array.isArray(egress) || !egress.every((h) => typeof h === 'string')) return { ok: false, error: 'egress: a list of hosts' };
  const denied = (egress as string[]).filter((h) => !allow.includes(h.toLowerCase()));
  if (denied.length) return { ok: false, error: `egress: not allowed (${denied.slice(0, 3).join(', ')})` };

  return {
    ok: true,
    plan: { language: job.language, code: job.code, files: files as string[], limits, egress: (egress as string[]).map((h) => h.toLowerCase()), env: {} },
  };
}

export type SandboxResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string; outputs: string[]; wallMs: number }
  | { ok: false; error: 'sandbox_disabled' | 'refused' | 'timeout' | 'cancelled' | 'runner_failed'; message: string };

export interface SandboxRunner {
  run(plan: SandboxPlan, signal: AbortSignal): Promise<SandboxResult>;
}

/** The only runner until an isolated host is approved: it refuses, and says why. */
export const disabledSandbox: SandboxRunner = {
  async run() {
    return { ok: false, error: 'sandbox_disabled', message: 'Running code needs an isolated host that is not set up yet.' };
  },
};
