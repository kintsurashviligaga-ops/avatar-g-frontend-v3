/**
 * lib/agent/browser/runner.ts — one browser task in its own throwaway sandbox (GG's audit ACTION 3; GG chose "Public
 * sites" 2026-11-06 17:36Z). The same order as the code runner (lib/agent/sandbox/runner), for the same reasons:
 *
 *   1. the task is already checked (./policy checkBrowserTask);
 *   2. the worst case is RESERVED against the shared $20 sandbox ledger before a sandbox exists, so a refused task costs $0;
 *   3. the sandbox starts from the Chromium snapshot with NO env, and a network that reaches public sites only: every
 *      private, loopback, link-local, carrier-grade-NAT and cloud-metadata range is denied (BROWSER_DENY_SUBNETS), and
 *      a deny wins over any allow;
 *   4. the driver (./script) and the task are written in, the driver runs with the wall clock as a hard timeout;
 *   5. result.json and each screenshot are read back; the sandbox is ALWAYS stopped and the reservation settled.
 *
 * Isolation: a new microVM per task, an empty browser profile, nothing of the user's (no cookies, no keys), destroyed
 * after. Two tasks never share a browser.
 */
import { SANDBOX_CAP_USD, usedUsd, worstCaseUsd, type SandboxSpendStore } from '@/lib/agent/sandbox/budget';
import type { SandboxHandle } from '@/lib/agent/sandbox/runner';
import { BROWSER_SCRIPT } from './script';
import { BROWSER_TEXT_MAX, type BrowserPlan, type BrowserResult, type BrowserStepResult } from './policy';

/** A browser task's sandbox: 2 vCPU (Chromium is slow on one), the memory Vercel gives them, the plan's wall clock + start-up. */
export const BROWSER_LIMITS = { cpus: 2, memoryMb: 4096, startSec: 30 } as const;
/** Per step: a page load or a click may take this long before the step fails. */
export const BROWSER_STEP_MS = 15_000;
/**
 * Never reachable from the browser, whatever a page or a DNS answer says. IPv4 only: Vercel's policy refuses IPv6 CIDRs
 * ("Invalid CIDR ::1/128", 2026-11-06), and an IPv6 literal is already refused by ./policy publicUrl. Checked live from
 * the snapshot 2026-11-06: 169.254.169.254, 10.0.0.1, 192.168.1.1 and 127.0.0.1 all blocked, public sites open.
 */
export const BROWSER_DENY_SUBNETS: readonly string[] = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
  '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4',
];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36 MyAvatarAgentG/1.0';

export interface BrowserHostSpec {
  vcpus: number;
  timeoutMs: number;
  denySubnets: readonly string[];
}

export interface BrowserHost {
  /** A sandbox from the Chromium snapshot; its handle's paths are relative to the snapshot's browser folder. */
  create(spec: BrowserHostSpec): Promise<Required<Pick<SandboxHandle, 'writeFile' | 'readBytes' | 'exec' | 'stop'>>>;
}

/** What the browser is doing right now: the steps so far, the page it is on, a small picture of it (JPEG). */
export interface BrowserLive { steps: Array<{ op: string; ok: boolean; url?: string; title?: string }>; url: string; jpeg?: Buffer }
/** How often the live view is read while the driver runs. */
export const BROWSER_LIVE_MS = 1500;

export interface BrowserRunner {
  run(plan: BrowserPlan, signal: AbortSignal, onLive?: (l: BrowserLive) => void): Promise<BrowserResult>;
}

export const disabledBrowser: BrowserRunner = {
  async run() {
    return { ok: false, error: 'browser_disabled', message: 'The browser is switched off on this server.' };
  },
};

export const browserWallSec = (plan: Pick<BrowserPlan, 'wallSec'>) => plan.wallSec + BROWSER_LIMITS.startSec;
export const browserWorstCaseUsd = (plan: Pick<BrowserPlan, 'wallSec'>) =>
  worstCaseUsd({ cpus: BROWSER_LIMITS.cpus, memoryMb: BROWSER_LIMITS.memoryMb, wallSec: browserWallSec(plan) });

function stepsOf(raw: unknown): BrowserStepResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((s) => {
    const r = (s ?? {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    return {
      op: (str(r.op, 20) ?? 'goto') as BrowserStepResult['op'],
      ok: r.ok === true,
      ...(str(r.url, 2000) ? { url: str(r.url, 2000) } : {}),
      ...(str(r.title, 200) ? { title: str(r.title, 200) } : {}),
      ...(typeof r.text === 'string' ? { text: r.text.slice(0, BROWSER_TEXT_MAX + 20) } : {}),
      ...(str(r.shot, 40) ? { shot: str(r.shot, 40) } : {}),
      ...(str(r.error, 300) ? { error: str(r.error, 300) } : {}),
    };
  });
}

export function hostBrowserRunner(host: BrowserHost, spend: SandboxSpendStore, opts: { cap?: number; now?: () => number } = {}): BrowserRunner {
  const cap = opts.cap ?? SANDBOX_CAP_USD;
  const now = opts.now ?? Date.now;
  return {
    async run(plan, signal, onLive) {
      if (signal.aborted) return { ok: false, error: 'cancelled', message: 'Cancelled before start.' };
      const wallSec = browserWallSec(plan);
      const reserved = browserWorstCaseUsd(plan);
      const ticket = await spend.reserve(reserved, cap).catch(() => null);
      if (!ticket) return { ok: false, error: 'refused', message: `Sandbox budget of $${cap} is used up.` };
      const started = now();
      let handle: Awaited<ReturnType<BrowserHost['create']>> | null = null;
      const timer = new AbortController();
      const timeout = setTimeout(() => timer.abort(), wallSec * 1000);
      const onAbort = () => timer.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        handle = await host.create({ vcpus: BROWSER_LIMITS.cpus, timeoutMs: (wallSec + 30) * 1000, denySubnets: BROWSER_DENY_SUBNETS });
        const task = {
          steps: plan.steps,
          limits: { textMax: BROWSER_TEXT_MAX, stepMs: BROWSER_STEP_MS, locale: 'ka-GE', userAgent: UA },
        };
        await handle.writeFile('task.json', JSON.stringify(task));
        await handle.writeFile('run.mjs', BROWSER_SCRIPT);
        const running = handle.exec('node', ['run.mjs'], timer.signal);
        if (onLive) {
          // Read the driver's progress while it runs: result.json is rewritten after every step, live.jpg with it.
          const h = handle;
          let done = false;
          let seen = -1;
          void running.finally(() => { done = true; }).catch(() => undefined);
          void (async () => {
            while (!done && !timer.signal.aborted) {
              await new Promise((r) => setTimeout(r, BROWSER_LIVE_MS));
              if (done) break;
              const raw = await h.readBytes('result.json').catch(() => null);
              let p: { steps?: unknown; finalUrl?: unknown } | null = null;
              try { p = raw ? JSON.parse(raw.toString('utf8')) : null; } catch { p = null; }
              const steps = stepsOf(p?.steps);
              if (!p || steps.length === seen) continue;
              seen = steps.length;
              const jpeg = await h.readBytes('live.jpg').catch(() => null);
              try {
                onLive({
                  steps: steps.map(({ op, ok, url, title }) => ({ op, ok, ...(url ? { url } : {}), ...(title ? { title } : {}) })),
                  url: typeof p.finalUrl === 'string' ? p.finalUrl.slice(0, 2000) : '',
                  ...(jpeg && jpeg.length < 400_000 ? { jpeg } : {}),
                });
              } catch { /* a listener that throws never stops the run */ }
            }
          })();
        }
        const out = await running;
        if (timer.signal.aborted) {
          return signal.aborted
            ? { ok: false, error: 'cancelled', message: 'Cancelled.' }
            : { ok: false, error: 'timeout', message: `Stopped after ${wallSec} s.` };
        }
        const raw = await handle.readBytes('result.json');
        let parsed: { steps?: unknown; finalUrl?: unknown; error?: unknown } | null = null;
        try { parsed = raw ? JSON.parse(raw.toString('utf8')) : null; } catch { parsed = null; }
        if (!parsed) {
          const why = (out.stderr || out.stdout).split('\n').find((l) => l.trim()) ?? `exit ${out.exitCode}`;
          return { ok: false, error: 'runner_failed', message: `The browser did not answer: ${why.slice(0, 300)}` };
        }
        if (typeof parsed.error === 'string' && parsed.error) {
          return { ok: false, error: 'runner_failed', message: `The browser failed to start: ${parsed.error.slice(0, 300)}` };
        }
        const steps = stepsOf(parsed.steps);
        const shots: Array<{ name: string; bytes: Buffer }> = [];
        for (const s of steps) {
          if (!s.shot) continue;
          const bytes = await handle.readBytes(`shots/${s.shot}.png`);
          if (bytes) shots.push({ name: s.shot, bytes });
        }
        return {
          ok: true,
          steps,
          shots,
          finalUrl: typeof parsed.finalUrl === 'string' ? parsed.finalUrl.slice(0, 2000) : '',
          wallMs: now() - started,
        };
      } catch (err) {
        if (signal.aborted) return { ok: false, error: 'cancelled', message: 'Cancelled.' };
        if (timer.signal.aborted) return { ok: false, error: 'timeout', message: `Stopped after ${wallSec} s.` };
        return { ok: false, error: 'runner_failed', message: err instanceof Error ? err.message : 'The browser sandbox failed.' };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        if (handle) await handle.stop().catch(() => undefined);
        const used = handle
          ? Math.min(reserved, usedUsd({ cpus: BROWSER_LIMITS.cpus, memoryMb: BROWSER_LIMITS.memoryMb }, now() - started))
          : 0;
        await spend.settle(ticket, reserved, used).catch(() => undefined);
      }
    },
  };
}
