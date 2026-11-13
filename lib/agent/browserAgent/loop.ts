/**
 * lib/agent/browserAgent/loop.ts — the Browser Agent's loop (v5.1 Phase 4, PREPARED, NOT WIRED). Pure over injected
 * effects: nothing here opens a browser, calls a model or spends money, and no route calls it yet.
 *
 * Today's browser (lib/agent/browser) runs a FIXED list of steps Agent G planned up front. The Browser Agent decides one
 * step at a time from what the page shows now, like a person:
 *
 *   observe   the session reports the page (url, title, visible text cut short, links, which fields are secret)
 *   decide    a Decider picks the next action, or says it is done / stuck. Two deciders share this contract:
 *               'planner'       Gemini reads the observation as text and answers one action (the default executor)
 *               'computer-use'  Gemini Computer Use reads a screenshot (D-16: an admin-only pilot, < $1, Playwright stays
 *                               the executor; the model only proposes, this loop still checks every action)
 *   check     every action goes through the SAME rules as a planned task (lib/agent/browser/policy checkBrowserTask):
 *             public hosts only, no IP literals, short waits, short typing. On top of that, the loop itself:
 *               - stops for the user before anything sensitive: typing into a secret field, a payment or sign-in page,
 *                 a "buy / pay / delete / send" click (the user confirms; the agent never does it alone);
 *               - stops when it repeats itself (the same action 3 times without the page changing);
 *               - stops at its budget: MAX_ACTIONS actions, the wall-clock deadline, MAX_SHOTS screenshots.
 *   act       the session performs the action and the loop observes again.
 *
 * The result is the full trail (every observation summary, decision and outcome), which is what the run card shows
 * and what is saved to the workspace, as browser/<task>/steps.json is today.
 */
import { BROWSER_MAX_SHOTS, checkBrowserTask, isPublicHost, type BrowserStep, type BrowserStepResult } from '@/lib/agent/browser/policy';

export const AGENT_MAX_ACTIONS = 25;
export const AGENT_WALL_MS = 5 * 60_000;
export const AGENT_REPEAT_LIMIT = 3;
const OBS_TEXT_MAX = 4_000;
const OBS_LINKS_MAX = 40;

export interface Observation {
  url: string;
  title: string;
  /** Visible text, cut to OBS_TEXT_MAX before it reaches the decider. */
  text: string;
  links: { text: string; href: string }[];
  /** CSS selectors of password / card-number / one-time-code fields on the page now. */
  secretFields: string[];
}

export type Decision =
  | { kind: 'act'; step: BrowserStep; why: string }
  | { kind: 'done'; answer: string }
  | { kind: 'stuck'; why: string };

export interface Decider {
  readonly name: 'planner' | 'computer-use';
  decide(input: { goal: string; observation: Observation; history: readonly TrailEntry[] }, signal: AbortSignal): Promise<Decision>;
}

/** One live browser for the whole loop (unlike today's runner, which runs a plan and is destroyed). */
export interface BrowserSession {
  observe(signal: AbortSignal): Promise<Observation>;
  act(step: BrowserStep, signal: AbortSignal): Promise<BrowserStepResult>;
}

export type StopReason =
  | 'done' | 'stuck' | 'needs_user' | 'refused' | 'repeating' | 'max_actions' | 'deadline' | 'aborted' | 'error';

export interface TrailEntry {
  at: number;
  url: string;
  decision: Decision;
  /** Present when the action ran. */
  result?: BrowserStepResult;
  /** Present when the loop refused or held the action. */
  held?: { reason: StopReason; detail: string };
}

export interface LoopResult {
  stop: StopReason;
  detail: string;
  answer?: string;
  /** The action the user must confirm, when stop = needs_user. */
  pending?: BrowserStep;
  trail: TrailEntry[];
  actions: number;
}

export interface LoopDeps {
  now(): number;
  decider: Decider;
  session: BrowserSession;
}

/** Pages that are never acted on without the user: sign-in, checkout, payment, account deletion. */
const SENSITIVE_URL = /(login|signin|sign-in|log-in|checkout|payment|billing|\/pay\b|password|account\/delete|oauth|authorize)/i;
/** Clicks that commit something on the user's behalf. Matched against the selector (text= selectors carry the label). */
const COMMIT_CLICK = /(buy|purchase|pay\b|order|checkout|delete|remove account|send|submit payment|subscribe|confirm|შეძენა|ყიდვა|გადახდა|წაშლა|გაგზავნა|купить|оплат|удалить|отправить)/i;

/** Cut what the decider sees: the page is data, never instructions, and it is kept short. */
export function boundObservation(o: Observation): Observation {
  return {
    url: o.url.slice(0, 2_000),
    title: o.title.slice(0, 300),
    text: o.text.slice(0, OBS_TEXT_MAX),
    links: o.links.slice(0, OBS_LINKS_MAX).map((l) => ({ text: l.text.slice(0, 120), href: l.href.slice(0, 500) })),
    secretFields: o.secretFields.slice(0, 20),
  };
}

/** Why an action must wait for the user (null: it may run). */
export function sensitiveReason(step: BrowserStep, page: Observation): string | null {
  if (step.op === 'type' && page.secretFields.includes(step.selector)) return 'typing into a password or payment field';
  if (step.op === 'goto') {
    try {
      const u = new URL(step.url);
      if (SENSITIVE_URL.test(u.pathname + u.search)) return 'opening a sign-in or payment page';
    } catch { /* the policy check refuses it */ }
  }
  if ((step.op === 'click' || step.op === 'press' || step.op === 'type') && SENSITIVE_URL.test(page.url)) return 'acting on a sign-in or payment page';
  if (step.op === 'click' && COMMIT_CLICK.test(step.selector)) return 'a click that buys, sends or deletes something';
  return null;
}

const sameStep = (a: BrowserStep, b: BrowserStep) => JSON.stringify(a) === JSON.stringify(b);

/** Run the loop until the goal is done, the agent is stuck, the user is needed, or a budget ends. Never throws. */
export async function runBrowserAgent(deps: LoopDeps, input: { goal: string; signal: AbortSignal; maxActions?: number; wallMs?: number }): Promise<LoopResult> {
  const started = deps.now();
  const maxActions = Math.min(input.maxActions ?? AGENT_MAX_ACTIONS, AGENT_MAX_ACTIONS);
  const deadline = started + Math.min(input.wallMs ?? AGENT_WALL_MS, AGENT_WALL_MS);
  const trail: TrailEntry[] = [];
  let actions = 0;
  let shots = 0;
  const end = (stop: StopReason, detail: string, extra: Partial<LoopResult> = {}): LoopResult => ({ stop, detail, trail, actions, ...extra });

  try {
    let page = boundObservation(await deps.session.observe(input.signal));
    for (;;) {
      if (input.signal.aborted) return end('aborted', 'stopped by the user');
      if (deps.now() >= deadline) return end('deadline', `${Math.round((deadline - started) / 1000)} s budget used`);
      if (actions >= maxActions) return end('max_actions', `${maxActions} actions used`);

      const decision = await deps.decider.decide({ goal: input.goal, observation: page, history: trail }, input.signal);
      if (input.signal.aborted) return end('aborted', 'stopped by the user');
      const entry: TrailEntry = { at: deps.now(), url: page.url, decision };
      trail.push(entry);
      if (decision.kind === 'done') return end('done', 'goal reached', { answer: decision.answer.slice(0, 4_000) });
      if (decision.kind === 'stuck') return end('stuck', decision.why.slice(0, 300));

      // The same rules as a planned task, one action at a time.
      // (checkBrowserTask wants a plan that opens a page first; a fixed public page stands in for "the page we are on".)
      const check = checkBrowserTask({ steps: [{ op: 'goto', url: 'https://example.com/' }, decision.step] });
      if (!check.ok) {
        const detail = check.error.replace(/^step 2: /, '');
        entry.held = { reason: 'refused', detail };
        return end('refused', detail);
      }
      const step = check.plan.steps[1]!;
      if (step.op === 'goto' && !isPublicHost(new URL(step.url).hostname)) {
        entry.held = { reason: 'refused', detail: 'not a public host' };
        return end('refused', 'not a public host');
      }
      if (step.op === 'screenshot' && shots >= BROWSER_MAX_SHOTS) {
        entry.held = { reason: 'refused', detail: `at most ${BROWSER_MAX_SHOTS} screenshots` };
        return end('refused', `at most ${BROWSER_MAX_SHOTS} screenshots`);
      }
      const why = sensitiveReason(step, page);
      if (why) {
        entry.held = { reason: 'needs_user', detail: why };
        return end('needs_user', why, { pending: step });
      }
      // Repeating itself: the last AGENT_REPEAT_LIMIT - 1 actions were this one, on this same page, and changed nothing.
      const recent = trail.slice(-AGENT_REPEAT_LIMIT, -1);
      if (recent.length === AGENT_REPEAT_LIMIT - 1 && recent.every((t) => t.result && t.decision.kind === 'act' && sameStep(t.decision.step, step) && t.url === page.url)) {
        entry.held = { reason: 'repeating', detail: `${step.op} ${AGENT_REPEAT_LIMIT} times without progress` };
        return end('repeating', entry.held.detail);
      }

      entry.result = await deps.session.act(step, input.signal);
      actions += 1;
      if (step.op === 'screenshot' && entry.result.ok) shots += 1;
      if (input.signal.aborted) return end('aborted', 'stopped by the user');
      page = boundObservation(await deps.session.observe(input.signal));
    }
  } catch (e) {
    return end(input.signal.aborted ? 'aborted' : 'error', e instanceof Error ? e.message.slice(0, 300) : 'browser agent failed');
  }
}
