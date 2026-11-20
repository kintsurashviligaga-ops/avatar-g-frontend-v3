/**
 * lib/agent/browserAgent/sandboxSession.ts — the loop's BrowserSession (./loop) over one sandbox running ./driver
 * (Phase 8.11, PREPARED, NOT WIRED). The sandbox is created by the caller (the same Chromium snapshot the planned
 * browser uses, lib/agent/browser/runner BrowserHost) and handed in; this file only speaks the driver's file protocol:
 *
 *   start()    writes run.mjs + session.json, starts `node run.mjs` (it keeps running), waits for ready.json
 *   act(a)     writes cmd-<n>.json, waits for res-<n>.json, hands the live picture to onLive, returns the result
 *   observe()  the same with {op: 'observe'}: the page as the decider reads it
 *   close()    {op: 'close'}, then the sandbox is stopped (also when anything above failed)
 *
 * Every wait races the caller's signal and its own deadline, so a driver that hangs never holds the run.
 */
import type { BrowserStepResult } from '@/lib/agent/browser/policy';
import type { AgentAction } from './actions';
import { BROWSER_AGENT_DRIVER, DRIVER_LIMITS } from './driver';

export interface DriverHandle {
  writeFile(path: string, content: string): Promise<void>;
  readBytes(path: string): Promise<Buffer | null>;
  exec(cmd: string, args: string[], signal: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  stop(): Promise<void>;
}

/** One visible control on the page, with the selector the driver gave it. */
export interface AgentElement { selector: string; tag: string; role: string; type: string; label: string; secret: boolean; x: number; y: number; w: number; h: number }

export interface AgentObservation {
  url: string;
  title: string;
  text: string;
  links: { text: string; href: string }[];
  secretFields: string[];
  elements: AgentElement[];
  cursor: { x: number; y: number };
}

export interface AgentStepResult extends Omit<BrowserStepResult, 'op'> { op: AgentAction['op'] | 'observe'; cursor?: { x: number; y: number }; filled?: number }

/** What the person sees while it runs: the page, the agent's cursor on it, and what it just did. */
export interface AgentLive { url: string; jpeg?: Buffer; cursor?: { x: number; y: number }; last?: AgentStepResult }

export interface SandboxSessionOptions {
  locale?: string;
  userAgent?: string;
  /** How long one command may take before the session gives up on it. */
  commandMs?: number;
  pollMs?: number;
  onLive?: (l: AgentLive) => void;
  sleep?: (ms: number) => Promise<void>;
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36 MyAvatarAgentG/1.0';
const LIVE_MAX_BYTES = 400_000;

function readObservation(raw: unknown): AgentObservation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  return {
    url: s(o.url, 2000),
    title: s(o.title, 300),
    text: s(o.text, DRIVER_LIMITS.textMax + 20),
    links: (Array.isArray(o.links) ? o.links : []).slice(0, 40).map((l) => ({ text: s((l as Record<string, unknown>)?.text, 120), href: s((l as Record<string, unknown>)?.href, 500) })),
    // Not a list → kept as unknown, so the loop's sensitive check fails closed.
    secretFields: Array.isArray(o.secretFields) ? o.secretFields.filter((x): x is string => typeof x === 'string').slice(0, 20) : (undefined as unknown as string[]),
    elements: (Array.isArray(o.elements) ? o.elements : []).slice(0, DRIVER_LIMITS.elementsMax).map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      return { selector: s(r.selector, 60), tag: s(r.tag, 20), role: s(r.role, 30), type: s(r.type, 30), label: s(r.label, 120), secret: r.secret === true, x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) };
    }),
    cursor: { x: num((o.cursor as Record<string, unknown> | undefined)?.x), y: num((o.cursor as Record<string, unknown> | undefined)?.y) },
  };
}

export class SandboxBrowserSession {
  private n = 0;
  private running: Promise<unknown> | null = null;
  private last: AgentObservation | null = null;
  private readonly ctl = new AbortController();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly handle: DriverHandle, private readonly opts: SandboxSessionOptions = {}) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The last page the driver reported (the loop's starting observation comes from observe()). */
  get lastObservation(): AgentObservation | null { return this.last; }

  async start(signal: AbortSignal): Promise<void> {
    const limits = { ...DRIVER_LIMITS, locale: this.opts.locale ?? 'ka-GE', userAgent: this.opts.userAgent ?? UA };
    await this.handle.writeFile('session.json', JSON.stringify({ limits }));
    await this.handle.writeFile('run.mjs', BROWSER_AGENT_DRIVER);
    this.running = this.handle.exec('node', ['run.mjs'], this.ctl.signal).catch((e) => ({ exitCode: -1, stdout: '', stderr: String(e) }));
    await this.waitFor('ready.json', signal, 60_000);
  }

  async observe(signal: AbortSignal): Promise<AgentObservation> {
    const r = await this.send({ op: 'observe' }, signal);
    if (!r.observation) throw new Error('the page could not be read');
    return r.observation;
  }

  async act(action: AgentAction, signal: AbortSignal): Promise<AgentStepResult> {
    return (await this.send(action, signal)).result;
  }

  async close(): Promise<void> {
    try {
      if (this.running) {
        this.n += 1;
        await this.handle.writeFile(`cmd-${this.n}.json`, JSON.stringify({ op: 'close' })).catch(() => undefined);
        let t: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([this.running, new Promise((r) => { t = setTimeout(r, 5_000); })]);
        if (t) clearTimeout(t);
      }
    } finally {
      this.ctl.abort();
      await this.handle.stop().catch(() => undefined);
    }
  }

  private async send(cmd: { op: string }, signal: AbortSignal): Promise<{ result: AgentStepResult; observation: AgentObservation | null }> {
    if (!this.running) throw new Error('the browser was not started');
    this.n += 1;
    const n = this.n;
    await this.handle.writeFile(`cmd-${n}.json`, JSON.stringify(cmd));
    const raw = await this.waitFor(`res-${n}.json`, signal, this.opts.commandMs ?? DRIVER_LIMITS.stepMs * 3);
    let body: { result?: unknown; observation?: unknown };
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw new Error('the browser answered something unreadable'); }
    const r = (body.result ?? {}) as Record<string, unknown>;
    const result: AgentStepResult = {
      op: (typeof r.op === 'string' ? r.op : cmd.op) as AgentStepResult['op'],
      ok: r.ok === true,
      ...(typeof r.url === 'string' ? { url: r.url.slice(0, 2000) } : {}),
      ...(typeof r.text === 'string' ? { text: r.text.slice(0, DRIVER_LIMITS.textMax + 20) } : {}),
      ...(typeof r.shot === 'string' ? { shot: r.shot.slice(0, 40) } : {}),
      ...(typeof r.error === 'string' ? { error: r.error.slice(0, 300) } : {}),
      ...(typeof r.filled === 'number' ? { filled: r.filled } : {}),
      ...(r.cursor && typeof r.cursor === 'object' ? { cursor: { x: Number((r.cursor as { x: unknown }).x) || 0, y: Number((r.cursor as { y: unknown }).y) || 0 } } : {}),
    };
    const observation = readObservation(body.observation);
    if (observation) this.last = observation;
    if (this.opts.onLive) {
      const jpeg = await this.handle.readBytes('live.jpg').catch(() => null);
      try {
        this.opts.onLive({
          url: observation?.url ?? result.url ?? '',
          ...(jpeg && jpeg.length < LIVE_MAX_BYTES ? { jpeg } : {}),
          ...(result.cursor ? { cursor: result.cursor } : {}),
          last: result,
        });
      } catch { /* a listener that throws never stops the run */ }
    }
    return { result, observation };
  }

  private async waitFor(path: string, signal: AbortSignal, ms: number): Promise<Buffer> {
    const until = Date.now() + ms;
    const poll = this.opts.pollMs ?? 150;
    for (;;) {
      if (signal.aborted) throw new Error('aborted');
      const fatal = await this.handle.readBytes('fatal.json').catch(() => null);
      if (fatal) {
        let why = 'the browser stopped';
        try { why = String(JSON.parse(fatal.toString('utf8')).error || why); } catch { /* keep */ }
        throw new Error(why.slice(0, 300));
      }
      const b = await this.handle.readBytes(path).catch(() => null);
      if (b && b.length > 0) return b;
      if (Date.now() >= until) throw new Error(`the browser did not answer in ${Math.round(ms / 1000)} s`);
      await this.sleep(poll);
    }
  }
}
