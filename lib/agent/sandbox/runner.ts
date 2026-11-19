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
import type { SandboxIO, SandboxLanguage, SandboxPlan, SandboxResult, SandboxRunner } from './policy';

export interface SandboxHostSpec {
  language: SandboxLanguage;
  vcpus: number;
  memoryMb: number;
  timeoutMs: number;
  /** Empty: no network at all. */
  allowedDomains: string[];
  env: Record<string, never>;
}

export interface SandboxHandle {
  writeFile(path: string, content: string): Promise<void>;
  /** Bytes in (a workspace file); paths are relative to the working directory. Needed only for a workspace run. */
  writeBytes?(path: string, bytes: Buffer): Promise<void>;
  /** Bytes out (a file the program wrote), or null when it is not there. Needed only for a workspace run. */
  readBytes?(path: string): Promise<Buffer | null>;
  exec(cmd: string, args: string[], signal: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  stop(): Promise<void>;
}

export interface SandboxHost {
  create(spec: SandboxHostSpec): Promise<SandboxHandle>;
}

const ENTRY = {
  python: { file: 'main.py', cmd: 'python3' },
  node: { file: 'main.mjs', cmd: 'node' },
  shell: { file: 'main.sh', cmd: 'bash' },
} as const;

/**
 * A workspace run: the entry file and the start marker take names no workspace file can have (paths.ts refuses every
 * name starting `.ws`), so the user's own `main.py` is never overwritten and never mistaken for the program.
 */
const WS_ENTRY_PREFIX = '.ws_main';
const WS_MARKER = '.ws_start';
/** Folders a program's tools fill on their own: never brought back as results. */
const NOT_RESULTS = ['__pycache__', 'node_modules', '.cache', '.npm', '.local', '.config', '.ipython', '.matplotlib'];
/** Listing what the program wrote: a few seconds, its own clock (the program's may already be spent). */
const COLLECT_MS = 20_000;

/** `find` for every regular file written after the marker, as "size<TAB>path" lines, folders above left out. */
export function collectCommand(): { cmd: string; args: string[] } {
  const prune = NOT_RESULTS.flatMap((d, i) => [...(i ? ['-o'] : []), '-name', d]);
  return {
    cmd: 'find',
    args: ['.', '(', '-type', 'd', '(', ...prune, ')', '-prune', ')', '-o', '-type', 'f', '-newer', WS_MARKER, '-printf', '%s\t%P\n'],
  };
}

/** The lines collectCommand prints → files to read back, within the limits; the rest named in `skipped`. */
export function pickOutputs(listing: string, io: SandboxIO): { take: Array<{ path: string; size: number }>; skipped: string[] } {
  const take: Array<{ path: string; size: number }> = [];
  const skipped: string[] = [];
  for (const line of listing.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const size = Number(line.slice(0, tab));
    const path = line.slice(tab + 1);
    if (!path || !Number.isFinite(size)) continue;
    if (path.startsWith('.ws')) continue;
    if (!io.accept(path)) { skipped.push(`${path} (name not allowed)`); continue; }
    if (size > io.maxFileBytes) { skipped.push(`${path} (over ${Math.round(io.maxFileBytes / 1024 / 1024)} MB)`); continue; }
    if (take.length >= io.maxFiles) { skipped.push(`${path} (more than ${io.maxFiles} files)`); continue; }
    take.push({ path, size });
  }
  return { take, skipped };
}

function cut(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  return buf.length <= maxBytes ? text : `${buf.subarray(0, maxBytes).toString('utf8')}\n…[cut]`;
}

export function hostRunner(host: SandboxHost, spend: SandboxSpendStore, opts: { cap?: number; now?: () => number } = {}): SandboxRunner {
  const cap = opts.cap ?? SANDBOX_CAP_USD;
  const now = opts.now ?? Date.now;
  return {
    async run(plan: SandboxPlan, signal: AbortSignal, io?: SandboxIO): Promise<SandboxResult> {
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
          language: plan.language,
          vcpus: plan.limits.cpus,
          memoryMb: plan.limits.memoryMb,
          timeoutMs: plan.limits.wallSec * 1000,
          allowedDomains: [...plan.egress],
          env: {},
        });
        const entry = ENTRY[plan.language];
        const entryFile = io ? `${WS_ENTRY_PREFIX}.${entry.file.split('.').pop()}` : entry.file;
        if (io) {
          const h = handle;
          if (!h.writeBytes || !h.readBytes) throw new Error('This sandbox host cannot carry workspace files.');
          // Folders first (one command), then each file, then the marker: anything newer than it, the program wrote.
          const dirs = [...new Set(io.inputs.map((f) => f.path.split('/').slice(0, -1).join('/')).filter(Boolean))];
          if (dirs.length) await h.exec('mkdir', ['-p', ...dirs], timer.signal);
          for (const f of io.inputs) await h.writeBytes(f.path, f.bytes);
          await h.writeFile(WS_MARKER, '');
        }
        await handle.writeFile(entryFile, plan.code);
        const out = await handle.exec(entry.cmd, [entryFile], timer.signal);
        if (timer.signal.aborted) {
          return signal.aborted
            ? { ok: false, error: 'cancelled', message: 'Cancelled.' }
            : { ok: false, error: 'timeout', message: `Stopped after ${plan.limits.wallSec} s.` };
        }
        const result = {
          ok: true as const,
          exitCode: out.exitCode,
          stdout: cut(out.stdout, plan.limits.outputBytes),
          stderr: cut(out.stderr, plan.limits.outputBytes),
          outputs: [] as string[],
          wallMs: now() - started,
        };
        if (!io) return result;
        // What the program wrote comes back even when it exited non-zero: a half-made result is still the user's to
        // see, and every write is a new version, so nothing they had is lost.
        const listTimer = AbortSignal.timeout(COLLECT_MS);
        const c = collectCommand();
        const listed = await handle.exec(c.cmd, c.args, listTimer);
        const picked = pickOutputs(listed.stdout, io);
        const collected: Array<{ path: string; bytes: Buffer }> = [];
        for (const f of picked.take) {
          const bytes = await handle.readBytes!(f.path);
          if (bytes) collected.push({ path: f.path, bytes });
          else picked.skipped.push(`${f.path} (could not be read)`);
        }
        return { ...result, outputs: collected.map((f) => f.path), collected, skipped: picked.skipped };
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
