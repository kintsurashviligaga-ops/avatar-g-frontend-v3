/**
 * lib/agent/sandbox/runner.ts — a SandboxRunner on an isolated host (Master Task v2.0, Phase 2; GG chose Vercel Sandbox
 * 2026-10-30 18:03Z). The host is an interface, so this file holds the rules and a fake host proves them without
 * spending anything. The real Vercel host plugs in behind the same interface.
 *
 * Order, and why:
 *   1. the plan is already checked (policy.checkSandboxJob): language, size, limits, egress, empty env;
 *   2. the worst case is RESERVED against the $20 cap (budget.ts) BEFORE a host exists, so a refused job costs $0;
 *   3. the host is created with the plan's limits, deny-all network unless the plan names allowed hosts, and NO env;
 *   4. the code is written and run with the wall clock as a hard timeout; stdout/stderr are cut to the output limit;
 *   5. the host is ALWAYS stopped (finally), and the reservation settled to what was really used.
 */
import { SANDBOX_CAP_USD, usedUsd, worstCaseUsd, type SandboxSpendStore } from './budget';
import type { SandboxPlan, SandboxResult, SandboxRunner } from './policy';

export interface SandboxHostSpec {
  vcpus: number;
  memoryMb: number;
  timeoutMs: number;
  /** Empty: no network at all. */
  allowedDomains: string[];
  env: Record<string, never>;
}

export interface SandboxHandle {
  writeFile(path: string, content: string): Promise<void>;
  exec(cmd: string, args: string[], signal: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  stop(): Promise<void>;
}

export interface SandboxHost {
  create(spec: SandboxHostSpec): Promise<SandboxHandle>;
}

const ENTRY = { python: { file: 'main.py', cmd: 'python3' }, node: { file: 'main.mjs', cmd: 'node' } } as const;

function cut(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  return buf.length <= maxBytes ? text : `${buf.subarray(0, maxBytes).toString('utf8')}\n…[cut]`;
}

export function hostRunner(host: SandboxHost, spend: SandboxSpendStore, opts: { cap?: number; now?: () => number } = {}): SandboxRunner {
  const cap = opts.cap ?? SANDBOX_CAP_USD;
  const now = opts.now ?? Date.now;
  return {
    async run(plan: SandboxPlan, signal: AbortSignal): Promise<SandboxResult> {
      if (signal.aborted) return { ok: false, error: 'cancelled', message: 'Cancelled before start.' };
      const reserved = worstCaseUsd(plan.limits);
      const ticket = await spend.reserve(reserved, cap).catch(() => null);
      if (!ticket) {
        return { ok: false, error: 'refused', message: `Sandbox budget of $${cap} is used up.` };
      }
      const started = now();
      let handle: SandboxHandle | null = null;
      const timer = new AbortController();
      const timeout = setTimeout(() => timer.abort(), plan.limits.wallSec * 1000);
      const onAbort = () => timer.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        handle = await host.create({
          vcpus: plan.limits.cpus,
          memoryMb: plan.limits.memoryMb,
          timeoutMs: plan.limits.wallSec * 1000,
          allowedDomains: [...plan.egress],
          env: {},
        });
        const entry = ENTRY[plan.language];
        await handle.writeFile(entry.file, plan.code);
        const out = await handle.exec(entry.cmd, [entry.file], timer.signal);
        if (timer.signal.aborted) {
          return signal.aborted
            ? { ok: false, error: 'cancelled', message: 'Cancelled.' }
            : { ok: false, error: 'timeout', message: `Stopped after ${plan.limits.wallSec} s.` };
        }
        return {
          ok: true,
          exitCode: out.exitCode,
          stdout: cut(out.stdout, plan.limits.outputBytes),
          stderr: cut(out.stderr, plan.limits.outputBytes),
          outputs: [],
          wallMs: now() - started,
        };
      } catch (err) {
        if (signal.aborted) return { ok: false, error: 'cancelled', message: 'Cancelled.' };
        if (timer.signal.aborted) return { ok: false, error: 'timeout', message: `Stopped after ${plan.limits.wallSec} s.` };
        return { ok: false, error: 'runner_failed', message: err instanceof Error ? err.message : 'The sandbox failed.' };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        if (handle) await handle.stop().catch(() => undefined);
        // A host that was never created cost nothing; otherwise charge the time it lived, never more than reserved.
        const used = handle ? Math.min(reserved, usedUsd(plan.limits, now() - started)) : 0;
        // If settling fails the worst case stays booked: the cap over-counts, never under-counts.
        await spend.settle(ticket, reserved, used).catch(() => undefined);
      }
    },
  };
}
