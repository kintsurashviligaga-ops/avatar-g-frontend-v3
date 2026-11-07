/**
 * lib/agent/browser/quote.ts — "open these pages and do these steps" as a quote the user confirms, then the task (GG's
 * audit ACTION 3). The same two steps as every Agent G action that spends money (lib/agent/sandbox/codeQuote):
 *
 *   quote  the steps are checked (./policy checkBrowserTask) and signed for this user, these steps, this workspace, 0
 *          credits. The card shows the sites it opens. Nothing runs, nothing is spent.
 *   run    the token is verified against the steps sent back (a changed byte is `quote_changed`), claimed ONCE in the
 *          shared idempotency store (fails closed: money is spent), then the runner books its worst case in the $20
 *          ledger and runs it in a fresh sandbox.
 *
 * What it found is kept: every screenshot and every text read is saved in the user's Agent G workspace under
 * `browser/<task>/` as a new version (lib/agent/workspace), with `steps.json` saying what each step did. That is how a
 * later step (a Python run, a PDF) uses it: the files are there, by name.
 */
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { QUOTE_TTL_MS, quoteBinding, signQuote, verifyQuote, type QuoteBinding } from '@/lib/agent/media/quoteToken';
import { isWorkspaceId } from '@/lib/agent/workspace/paths';
import type { WorkspaceStore, WsFile } from '@/lib/agent/workspace/store';
import { checkBrowserTask, type BrowserStep, type BrowserStepResult } from './policy';
import { checkTaskReady, taskRefOf, taskStep, type TaskRef } from '@/lib/agent/taskGraphStore';
import { browserWallSec, browserWorstCaseUsd, type BrowserRunner } from './runner';

export const BROWSER_RUN_CAP = 'agent.browser_run';
export const BROWSER_RUN_MODEL = 'vercel-sandbox-chromium';
/** What the card shows of each text read; the whole text is in the workspace file. */
export const BROWSER_TEXT_SHOWN = 4_000;

export interface BrowserRequest {
  steps: BrowserStep[];
  /** The user's own workspace the results go to; part of the signed plan. */
  workspaceId: string;
  /** The task-graph node this task carries out (lib/agent/taskGraph); signed with the rest. */
  task?: TaskRef;
}

export interface BrowserQuote {
  jobId: string;
  steps: number;
  hosts: string[];
  screenshots: number;
  credits: 0;
  wallSec: number;
  network: 'public-sites';
  worstCaseUsd: number;
  expiresAt: number;
  workspaceId: string;
  folder: string;
}

export type BrowserErrorCode =
  | 'bad_input' | 'not_configured' | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'quote_used'
  | 'guard_unavailable' | 'browser_disabled' | 'refused' | 'timeout' | 'cancelled' | 'runner_failed';

export type BrowserQuoteResult =
  | { ok: true; quote: BrowserQuote; request: BrowserRequest; token: string }
  | { ok: false; error: BrowserErrorCode; message: string };

export type BrowserRunResult =
  | {
    ok: true;
    steps: BrowserStepResult[];
    finalUrl: string;
    wallMs: number;
    workspace: { id: string; folder: string; written: WsFile[]; error?: string };
  }
  | { ok: false; error: BrowserErrorCode; message: string };

export interface BrowserDeps {
  key(): string;
  now(): number;
  newId(): string;
  claim(owner: string, key: string, windowSec: number): Promise<'claimed' | 'held' | 'unavailable'>;
  /** BROWSER_ENABLED=1 and a snapshot id: checked before the claim, so a switched-off host burns no quote. */
  enabled(): boolean;
  runner(userId: string): BrowserRunner;
  workspace(): WorkspaceStore;
}

const fail = (error: BrowserErrorCode, message: string) => ({ ok: false as const, error, message });

const binding = (wallSec: number): QuoteBinding =>
  quoteBinding({ cap: BROWSER_RUN_CAP, model: BROWSER_RUN_MODEL, transport: 'local', units: wallSec });

/** Where one task's files go in the workspace: its own folder, named by its job. */
export const browserFolderOf = (jobId: string) => `browser/${jobId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'task'}`;

export function browserRequestOf(v: unknown): BrowserRequest | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isWorkspaceId(r.workspaceId)) return null;
  const check = checkBrowserTask({ steps: r.steps });
  if (!check.ok) return null;
  const task = taskRefOf(r.task);
  if (r.task !== undefined && !task) return null;
  return { steps: check.plan.steps, workspaceId: r.workspaceId as string, ...(task ? { task } : {}) };
}

export function quoteBrowserTask(deps: Pick<BrowserDeps, 'key' | 'now' | 'newId'>, input: { userId: string; request: unknown }): BrowserQuoteResult {
  const raw = (input.request ?? {}) as Record<string, unknown>;
  const check = checkBrowserTask({ steps: raw.steps });
  if (!check.ok) return fail('bad_input', check.error);
  if (!isWorkspaceId(raw.workspaceId)) return fail('bad_input', 'A workspace is needed for the results.');
  const task = taskRefOf(raw.task);
  if (raw.task !== undefined && !task) return fail('bad_input', 'Task graph: the step reference is not readable.');
  const req: BrowserRequest = { steps: check.plan.steps, workspaceId: raw.workspaceId as string, ...(task ? { task } : {}) };
  const key = deps.key();
  const jobId = deps.newId();
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const wallSec = browserWallSec(check.plan);
  const token = key ? signQuote({ u: input.userId, j: jobId, f: bodyFingerprint(req), c: 0, x: expiresAt }, key, binding(wallSec)) : null;
  if (!token) return fail('not_configured', 'The browser is not configured on this server.');
  return {
    ok: true,
    request: req,
    token,
    quote: {
      jobId,
      steps: req.steps.length,
      hosts: check.plan.hosts,
      screenshots: req.steps.filter((s) => s.op === 'screenshot').length,
      credits: 0,
      wallSec,
      network: 'public-sites',
      worstCaseUsd: browserWorstCaseUsd(check.plan),
      expiresAt,
      workspaceId: req.workspaceId,
      folder: browserFolderOf(jobId),
    },
  };
}

export async function runBrowserQuote(
  deps: BrowserDeps,
  input: { userId: string; request: unknown; token: unknown },
  signal: AbortSignal,
): Promise<BrowserRunResult> {
  const raw = (input.request ?? {}) as Record<string, unknown>;
  const check = checkBrowserTask({ steps: raw.steps });
  if (!check.ok) return fail('bad_input', check.error);
  if (!isWorkspaceId(raw.workspaceId)) return fail('bad_input', 'A workspace is needed for the results.');
  const task = taskRefOf(raw.task);
  if (raw.task !== undefined && !task) return fail('bad_input', 'Task graph: the step reference is not readable.');
  const req: BrowserRequest = { steps: check.plan.steps, workspaceId: raw.workspaceId as string, ...(task ? { task } : {}) };
  const key = deps.key();
  if (!key) return fail('not_configured', 'The browser is not configured on this server.');
  const v = verifyQuote(input.token, key, {
    userId: input.userId, fingerprint: bodyFingerprint(req), now: deps.now(), credits: 0, binding: binding(browserWallSec(check.plan)),
  });
  if (!v.ok) {
    if (v.reason === 'expired') return fail('quote_expired', 'The plan expired; ask again.');
    if (v.reason === 'changed') return fail('quote_changed', 'The steps changed after they were planned; ask again.');
    return fail('quote_invalid', 'This plan cannot be run.');
  }
  if (!deps.enabled()) return fail('browser_disabled', 'The browser is switched off on this server.');
  // A task-graph step runs only when the steps it needs are done: checked before the quote is used up.
  if (req.task) {
    const ready = await checkTaskReady(deps.workspace(), input.userId, req.workspaceId, req.task, 'browser');
    if (!ready.ok) return fail('bad_input', `Task graph: ${ready.error}`);
  }
  const claim = await deps.claim(input.userId, `browser_run:${v.claims.j}`, Math.ceil(QUOTE_TTL_MS / 1000)).catch(() => 'unavailable' as const);
  if (claim === 'held') return fail('quote_used', 'This plan already ran.');
  if (claim !== 'claimed') return fail('guard_unavailable', 'The duplicate guard cannot be read right now, so nothing ran. Try again in a minute.');

  let step: { end(o: { ok: true; outputs: string[] } | { ok: false; error: string }): Promise<void> } | null = null;
  if (req.task) {
    const st = await taskStep(deps.workspace(), input.userId, req.workspaceId, req.task, { kind: 'browser', id: v.claims.j, now: () => new Date(deps.now()) });
    if (!st.ok) return fail('bad_input', `Task graph: ${st.error}`);
    step = st;
  }

  const r = await deps.runner(input.userId).run(check.plan, signal);
  if (!r.ok) {
    await step?.end({ ok: false, error: r.message });
    return fail(r.error, r.message);
  }

  // Everything found goes to the workspace: the screenshots, each text read (with the page it came from), the step log.
  const folder = browserFolderOf(v.claims.j);
  const files: Array<{ path: string; bytes: Buffer }> = r.shots.map((s) => ({ path: `${folder}/${s.name}.png`, bytes: s.bytes }));
  let lastUrl = '';
  let n = 0;
  for (const s of r.steps) {
    if (s.url) lastUrl = s.url;
    if (s.op === 'text' && s.ok && typeof s.text === 'string') {
      files.push({ path: `${folder}/text-${++n}.txt`, bytes: Buffer.from(`${lastUrl}\n\n${s.text}`, 'utf8') });
    }
  }
  const log = r.steps.map(({ text, ...rest }) => (typeof text === 'string' ? { ...rest, textChars: text.length } : rest));
  files.push({ path: `${folder}/steps.json`, bytes: Buffer.from(JSON.stringify({ finalUrl: r.finalUrl, steps: log }, null, 2), 'utf8') });
  const saved = await deps.workspace().writeMany(input.userId, req.workspaceId, files, `browser:${v.claims.j}`);
  await step?.end(saved.ok ? { ok: true, outputs: saved.written.map((f) => f.path) } : { ok: false, error: saved.message });
  const shown = r.steps.map((s) => (typeof s.text === 'string' && s.text.length > BROWSER_TEXT_SHOWN ? { ...s, text: `${s.text.slice(0, BROWSER_TEXT_SHOWN)}\n…` } : s));
  return {
    ok: true,
    steps: shown,
    finalUrl: r.finalUrl,
    wallMs: r.wallMs,
    workspace: saved.ok
      ? { id: req.workspaceId, folder, written: saved.written }
      : { id: req.workspaceId, folder, written: [], error: saved.message },
  };
}
