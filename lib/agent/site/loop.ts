/**
 * lib/agent/site/loop.ts — Agent G working on myavatar.ge in the user's tab: look (snapshot) → ask the model for one
 * action → do it with the visible cursor → look again, until it says done, the user stops it, or the limits run out.
 * Every side effect comes through `io`, so the loop is tested without a browser.
 */
import { needsConfirm, parseSiteAction, siteStepLabel, SITE_LIMITS, type SiteAction, type SiteSnapshot } from './actions';

export interface SiteIO {
  snapshot(): SiteSnapshot;
  /** The model's next action for this goal, history and page (raw JSON or text), or null when it did not answer. */
  next(goal: string, history: string[], snap: SiteSnapshot, signal: AbortSignal): Promise<unknown>;
  /** Do the action on the page (cursor, click, type…); false when the element is gone. */
  act(a: SiteAction, snap: SiteSnapshot): Promise<boolean>;
  /** Ask the user to allow a costly or irreversible click; true = allowed. */
  confirm(label: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export type SiteEvent =
  | { type: 'step'; label: string; state: 'run' | 'ok' | 'fail' }
  | { type: 'thinking' }
  | { type: 'end'; reason: 'done' | 'user' | 'steps' | 'time' | 'ask' | 'failed'; answer?: string };

export async function runSiteTask(io: SiteIO, goal: string, lang: 'ka' | 'en' | 'ru', signal: AbortSignal, on: (e: SiteEvent) => void): Promise<void> {
  const t0 = io.now();
  const history: string[] = [];
  let misses = 0;
  for (let i = 0; i < SITE_LIMITS.steps; i++) {
    if (signal.aborted) return on({ type: 'end', reason: 'user' });
    if (io.now() - t0 > SITE_LIMITS.wallMs) return on({ type: 'end', reason: 'time' });
    const snap = io.snapshot();
    on({ type: 'thinking' });
    let raw: unknown = null;
    try { raw = await io.next(goal, history, snap, signal); } catch { raw = null; }
    if (signal.aborted) return on({ type: 'end', reason: 'user' });
    const a = parseSiteAction(raw, snap);
    if (!a) {
      // One unusable answer is retried with a note; two in a row end the task honestly.
      if (++misses >= 2) return on({ type: 'end', reason: 'failed' });
      history.push('(your last answer was not a valid action on this page; answer with one JSON action using a listed ref)');
      continue;
    }
    misses = 0;
    if (a.op === 'done') return on({ type: 'end', reason: 'done', answer: a.answer });
    if (a.op === 'ask') return on({ type: 'end', reason: 'ask', answer: a.question });
    const label = siteStepLabel(a, snap, lang);
    if (needsConfirm(a, snap)) {
      on({ type: 'step', label, state: 'run' });
      const ok = await io.confirm(siteStepLabel(a, snap, lang, true));
      if (!ok || signal.aborted) { on({ type: 'step', label, state: 'fail' }); return on({ type: 'end', reason: 'user' }); }
    } else {
      on({ type: 'step', label, state: 'run' });
    }
    let ok = false;
    try { ok = await io.act(a, snap); } catch { ok = false; }
    on({ type: 'step', label, state: ok ? 'ok' : 'fail' });
    history.push(`${label}${ok ? '' : ' — FAILED (element not found or not usable)'}${'why' in a && a.why ? ` (${a.why})` : ''}`);
    // Let the page answer the action (a route change, a panel opening) before looking again.
    await io.sleep(a.op === 'wait' ? 0 : a.op === 'go' ? 1500 : 700);
  }
  on({ type: 'end', reason: 'steps' });
}
