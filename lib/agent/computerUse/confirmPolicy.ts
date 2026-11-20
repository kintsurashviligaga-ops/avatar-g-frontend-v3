/**
 * lib/agent/computerUse/confirmPolicy.ts — the confirmation policy for Computer Use actions (v5.1 Phase 6, spec §27).
 * PREPARED, NOT WIRED: no route calls this yet; Computer Use itself is unbuilt (D-09/D-16 pilot not run) and admin-only.
 *
 * Model: Gemini Computer Use only PROPOSES one action at a time (each may carry a `safety_decision`); our own Playwright
 * runner executes it. Before anything runs, every proposed action gets one verdict from `judgeAction`:
 *
 *   allow    the runner may execute it now;
 *   confirm  the run pauses and the user sees a card with the action, the host and the reason; only an explicit TAP
 *            on that card (never a typed or spoken "yes", never the model itself) lets it run;
 *   refuse   never executed; the run stops that branch and the model is told it was refused.
 *
 * Fail closed: a `require_confirmation` decision, an unknown decision value, an unknown action name, or a field that may
 * hold a secret is never `allow`. A host that is not public (lib/agent/browser/policy isPublicHost) is `refuse`.
 * A confirmation is bound to (runId, actionIndex, actionHash) and expires after CONFIRM_TTL_MS, so a tap cannot be
 * replayed onto a different action or a later step. `safety_acknowledgement` goes back to Google only after that tap.
 * Docs: docs/v5.1-phase6/04-computer-use-confirmation.md.
 */
import { createHash } from 'node:crypto';
import { isPublicHost } from '../browser/policy';

export const CU_MAX_ACTIONS = 20;
export const CU_WALL_SEC = 120;
export const CONFIRM_TTL_MS = 2 * 60_000;

/** The action names we map to our runner. Anything else is refused (an unmapped action cannot be executed safely). */
const KNOWN = new Set([
  'open_web_browser', 'wait_5_seconds', 'go_back', 'go_forward', 'search', 'navigate', 'click_at', 'hover_at',
  'type_text_at', 'key_combination', 'scroll_document', 'scroll_at', 'drag_and_drop',
]);

/** Words on or near the target that mean money moves, data leaves, or something is destroyed. */
const RISKY_WORDS =
  /\b(buy|purchase|order|checkout|pay|payment|subscribe|donate|transfer|send|submit|post|publish|delete|remove|erase|cancel subscription|confirm|sign up|register|book)\b|ყიდვა|გადახდა|შეკვეთა|გაგზავნა|წაშლა|დადასტურება|купить|оплат|заказ|отправ|удал|подтверд/i;
/** Fields that may hold a secret or payment data: we never let the model type into them on its own. */
const SECRET_FIELD = /pass(word)?|pwd|otp|one[-_ ]?time|2fa|mfa|cvv|cvc|card|iban|account.?number|pin\b|ssn|secret|token|პაროლ|ბარათ|пароль|карт/i;

export type CuVerdict =
  | { verdict: 'allow' }
  | { verdict: 'confirm'; reason: ConfirmReason }
  | { verdict: 'refuse'; reason: RefuseReason };
export type ConfirmReason = 'model_requires_confirmation' | 'unknown_safety_decision' | 'secret_field' | 'risky_action' | 'leaves_site';
export type RefuseReason = 'unknown_action' | 'not_public_host' | 'over_budget' | 'bad_args';

export interface ProposedAction {
  name: string;
  args?: Record<string, unknown>;
  /** As Google sends it: { decision, explanation }. Absent = the model raised nothing. */
  safetyDecision?: { decision?: unknown; explanation?: unknown } | null;
}

export interface ActionContext {
  /** 0-based index of this action in the run. */
  index: number;
  /** Seconds the run has used so far. */
  elapsedSec: number;
  /** Host of the page the browser is on now (for navigation that leaves it). */
  currentHost?: string | null;
  /** What our runner sees at the target point: label/role/name/type attributes, never the user's typed values. */
  target?: { label?: string; name?: string; type?: string; autocomplete?: string } | null;
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** One verdict for one proposed action. Pure. */
export function judgeAction(action: ProposedAction, ctx: ActionContext): CuVerdict {
  if (ctx.index >= CU_MAX_ACTIONS || ctx.elapsedSec >= CU_WALL_SEC) return { verdict: 'refuse', reason: 'over_budget' };
  if (!KNOWN.has(action.name)) return { verdict: 'refuse', reason: 'unknown_action' };
  const args = action.args ?? {};

  if (action.name === 'navigate') {
    const host = hostOf(args.url);
    if (!host) return { verdict: 'refuse', reason: 'bad_args' };
    if (!isPublicHost(host)) return { verdict: 'refuse', reason: 'not_public_host' };
  }

  const sd = action.safetyDecision;
  if (sd && sd.decision !== undefined && sd.decision !== null) {
    if (sd.decision === 'require_confirmation') return { verdict: 'confirm', reason: 'model_requires_confirmation' };
    if (sd.decision !== 'allowed' && sd.decision !== 'regular') return { verdict: 'confirm', reason: 'unknown_safety_decision' };
  }

  const t = ctx.target ?? {};
  const targetText = [t.label, t.name, t.type, t.autocomplete].filter((v) => typeof v === 'string').join(' ');
  if (action.name === 'type_text_at') {
    if (typeof args.text !== 'string') return { verdict: 'refuse', reason: 'bad_args' };
    if (t.type === 'password' || SECRET_FIELD.test(targetText)) return { verdict: 'confirm', reason: 'secret_field' };
    if (args.press_enter === true && RISKY_WORDS.test(targetText)) return { verdict: 'confirm', reason: 'risky_action' };
  }
  if ((action.name === 'click_at' || action.name === 'key_combination') && RISKY_WORDS.test(targetText)) {
    return { verdict: 'confirm', reason: 'risky_action' };
  }
  if (action.name === 'navigate' && ctx.currentHost) {
    const host = hostOf(args.url)!;
    const site = (h: string) => h.split('.').slice(-2).join('.');
    if (site(host) !== site(ctx.currentHost.toLowerCase())) return { verdict: 'confirm', reason: 'leaves_site' };
  }
  return { verdict: 'allow' };
}

/** A stable hash of the action exactly as proposed, so a confirmation cannot be moved onto a different action. */
export function actionHash(action: ProposedAction): string {
  const canon = JSON.stringify([action.name, Object.keys(action.args ?? {}).sort().map((k) => [k, (action.args ?? {})[k]])]);
  return createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 32);
}

export interface PendingConfirmation {
  runId: string;
  actionIndex: number;
  actionHash: string;
  createdAt: number;
  /** True when Google itself asked (require_confirmation): only then does the reply carry safety_acknowledgement. */
  modelAsked: boolean;
}

export function pendingConfirmation(runId: string, actionIndex: number, action: ProposedAction, now = Date.now()): PendingConfirmation {
  return { runId, actionIndex, actionHash: actionHash(action), createdAt: now, modelAsked: action.safetyDecision?.decision === 'require_confirmation' };
}

export type ConfirmAnswer = { via: 'tap' | 'text' | 'voice' | 'model'; runId: string; actionIndex: number; actionHash: string; approve: boolean };

/**
 * May the held action run now? Only a TAP that names this run, this index and this exact action, inside the TTL.
 * Returns whether to send `safety_acknowledgement: true` with the function response (only when the model asked).
 */
export function resolveConfirmation(
  pending: PendingConfirmation,
  answer: ConfirmAnswer,
  now = Date.now(),
): { run: false; why: 'not_a_tap' | 'mismatch' | 'expired' | 'declined' } | { run: true; acknowledge: boolean } {
  if (answer.via !== 'tap') return { run: false, why: 'not_a_tap' };
  if (answer.runId !== pending.runId || answer.actionIndex !== pending.actionIndex || answer.actionHash !== pending.actionHash) {
    return { run: false, why: 'mismatch' };
  }
  if (now - pending.createdAt > CONFIRM_TTL_MS) return { run: false, why: 'expired' };
  if (!answer.approve) return { run: false, why: 'declined' };
  return { run: true, acknowledge: pending.modelAsked };
}
