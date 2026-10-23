/**
 * lib/studio/cardState.ts — ONE set of states for every studio card that makes something (MASTER TASK v3.1 §3.1,
 * Phase 2 PR 5).
 *
 * The cards disagree today. The image tile is pending · done · failed (lib/studio/imageResults), the in-chat result
 * card is queued · rendering · finalizing · ready · error (ui/ResultCard), the loading card and the job queue are
 * running · queued · done · failed · canceled (ui/GenerationProgress, lib/jobs/jobQueue), the music card walks
 * quoting · quoted · starting · job · refused (music/MusicStudioCard) and a durable task speaks lib/tasks/statusModel.
 * Each picks its own words and its own buttons, so the same moment reads differently on each service.
 *
 * The spec's nine states, the moves between them, and the ONE primary action each state offers (§3.1: "propose,
 * approve/start, stop, or use result"). Every old vocabulary maps in here and back out again unchanged, so a card can
 * move onto this model without losing a word it shows today. Pure, isomorphic, no UI.
 *
 * Four words have no state of their own in the nine, and are kept as a `detail` instead:
 *   · starting   — approved, and the start request is on its way; the run has no id yet (the music card says so);
 *   · finalizing — still running, the asset is being stored (the result card says so);
 *   · stopped    — the owner stopped it; the card is a draft again with its inputs (§3.1: preserve inputs);
 *   · refused    — the server or the policy said no before any work; a failure that is not an error.
 */
import type { TaskStatus } from '@/lib/tasks/statusModel';

export type CardState =
  | 'draft' | 'quoting' | 'awaiting_approval' | 'queued' | 'running' | 'cancelling' | 'failed' | 'partially_verified' | 'completed';

export const CARD_STATES: readonly CardState[] = [
  'draft', 'quoting', 'awaiting_approval', 'queued', 'running', 'cancelling', 'failed', 'partially_verified', 'completed',
];

/**
 * Where a card may go from each state. Nothing else is a legal move.
 *
 *  · quoting → draft, awaiting_approval → draft: the user edited the prompt; the old price no longer applies.
 *  · awaiting_approval → quoting: the quote expired or the price changed, so it is asked again.
 *  · awaiting_approval → failed: the start was refused (credits, an expired quote) before any work.
 *  · queued / running → awaiting_approval: a later step of a run costs more than was approved (lib/agent/contracts).
 *  · cancelling → running: the stop lost its race and the job is still going (F-12: never a false "finished").
 *  · cancelling → completed / partially_verified / failed: the job ended before the stop reached it.
 *  · cancelling → draft: stopped; the inputs are back for another try.
 *  · failed / partially_verified / completed → draft: the user edits and goes again; the old try's answers no longer
 *    reach the card (see `onEvent`). failed / partially_verified → quoting: try again with the same inputs.
 */
export const CARD_TRANSITIONS: Readonly<Record<CardState, readonly CardState[]>> = {
  draft: ['quoting'],
  quoting: ['awaiting_approval', 'failed', 'draft'],
  awaiting_approval: ['queued', 'quoting', 'draft', 'failed'],
  queued: ['running', 'cancelling', 'failed', 'awaiting_approval'],
  running: ['completed', 'partially_verified', 'failed', 'cancelling', 'awaiting_approval'],
  cancelling: ['draft', 'running', 'completed', 'partially_verified', 'failed'],
  failed: ['quoting', 'draft'],
  partially_verified: ['quoting', 'draft'],
  completed: ['draft'],
};

export function canMove(from: CardState, to: CardState): boolean {
  return CARD_TRANSITIONS[from].includes(to);
}

/** What a state's one primary button does (§3.1). */
export type PrimaryAction = 'propose' | 'approve' | 'stop' | 'use';

/** One per state. `busy` states show the same button pressed and waiting, so it does not move under the user's finger. */
export const PRIMARY_ACTION: Readonly<Record<CardState, { action: PrimaryAction; busy: boolean }>> = {
  draft: { action: 'propose', busy: false },
  quoting: { action: 'propose', busy: true },
  awaiting_approval: { action: 'approve', busy: false },
  queued: { action: 'stop', busy: false },
  running: { action: 'stop', busy: false },
  cancelling: { action: 'stop', busy: true },
  failed: { action: 'propose', busy: false },
  partially_verified: { action: 'use', busy: false },
  completed: { action: 'use', busy: false },
};

export type CardDetail = 'starting' | 'finalizing' | 'stopped' | 'refused';

/** The one state each detail may sit on. */
export const DETAIL_STATE: Readonly<Record<CardDetail, CardState>> = {
  starting: 'awaiting_approval', finalizing: 'running', stopped: 'draft', refused: 'failed',
};

/** What a card shows: its state and the word kept from its old vocabulary. */
export interface CardView {
  state: CardState;
  detail: CardDetail | null;
}

/**
 * The card's primary action and whether it can be pressed now. `starting` is the approve button pressed and waiting.
 * A job with no cancel route keeps `stop` as its action but disabled, so no other button takes its place.
 */
export function primaryAction(c: CardView, opts: { cancellable?: boolean } = {}): { action: PrimaryAction; enabled: boolean; busy: boolean } {
  const { action } = PRIMARY_ACTION[c.state];
  const busy = PRIMARY_ACTION[c.state].busy || c.detail === 'starting';
  return { action, busy, enabled: !busy && (action !== 'stop' || opts.cancellable !== false) };
}

/** A card: what it shows, and the try its answers belong to. */
export interface Card extends CardView {
  /**
   * One try at the card's inputs, named by the caller when it proposes (draft → quoting); null for a draft. Every
   * answer for that try (the quote, the start, the run's events) is applied with `onEvent` under this key, so an answer
   * for an older try is refused.
   */
  attempt: string | null;
}

export const newCard = (): Card => ({ state: 'draft', detail: null, attempt: null });

/** A card as a reload finds it: a durable task's state (see `fromTaskStatus`) under that task's own key. */
export const restoreCard = (v: CardView, attempt: string): Card => ({ ...v, attempt: v.state === 'draft' ? null : attempt });

/**
 * Moves a card, or refuses (null) a move CARD_TRANSITIONS does not allow or a detail on the wrong state. A new try
 * (quoting from a draft, a failure or a partial result) takes its `attempt`; a re-quote of an awaiting approval keeps
 * the one it has; a move to `draft` lets it go. A detail may change within a state (running → running · finalizing).
 */
export function move(card: Card, to: CardState, opts: { detail?: CardDetail | null; attempt?: string } = {}): Card | null {
  const detail = opts.detail ?? null;
  if (detail && DETAIL_STATE[detail] !== to) return null;
  if (to === card.state) return { ...card, detail };
  if (!canMove(card.state, to)) return null;
  const newTry = to === 'quoting' && card.state !== 'awaiting_approval';
  if (newTry && !opts.attempt) return null;
  return { state: to, detail, attempt: to === 'draft' ? null : newTry ? opts.attempt! : card.attempt };
}

/**
 * An answer for the try `attempt`: a quote, a start, or the run's progress. It is refused (null) unless it belongs to
 * the try the card is showing, so a late answer cannot overwrite a newer draft or a newer try (§3.1); otherwise it is
 * an ordinary `move`.
 */
export function onEvent(card: Card, attempt: string, to: CardState, detail: CardDetail | null = null): Card | null {
  if (!card.attempt || card.attempt !== attempt) return null;
  return move(card, to, { detail });
}

/** Nothing more will happen unless the user starts it again. */
export const isSettledCard = (s: CardState): boolean => s === 'draft' || s === 'failed' || s === 'partially_verified' || s === 'completed';

// ── The old vocabularies, in and back out ─────────────────────────────────────────────────────────────────────
// Each pair round-trips: toX(fromX(v)) === v for every v the old type allows (cardState.test.ts walks them all).

const view = (state: CardState, detail: CardDetail | null = null): CardView => ({ state, detail });

/** ui/ResultCard's ResultState. */
export type LegacyResultState = 'queued' | 'rendering' | 'finalizing' | 'ready' | 'error';
export function fromResultState(s: LegacyResultState): CardView {
  return s === 'queued' ? view('queued') : s === 'rendering' ? view('running') : s === 'finalizing' ? view('running', 'finalizing')
    : s === 'ready' ? view('completed') : view('failed');
}
export function toResultState(c: CardView): LegacyResultState | null {
  switch (c.state) {
    case 'queued': return 'queued';
    case 'running': return c.detail === 'finalizing' ? 'finalizing' : 'rendering';
    case 'completed': return 'ready';
    case 'failed': return 'error';
    default: return null;
  }
}

/** ui/GenerationProgress's ProgressState and lib/jobs/jobQueue's JobStatus (one word apart: running / rendering). */
export type LegacyProgressState = 'running' | 'queued' | 'done' | 'failed' | 'canceled';
export type LegacyQueueStatus = 'queued' | 'rendering' | 'done' | 'failed' | 'canceled';
export function fromProgressState(s: LegacyProgressState | LegacyQueueStatus): CardView {
  return s === 'queued' ? view('queued') : s === 'running' || s === 'rendering' ? view('running') : s === 'done' ? view('completed')
    : s === 'failed' ? view('failed') : view('draft', 'stopped');
}
export function toProgressState(c: CardView): LegacyProgressState | null {
  switch (c.state) {
    case 'queued': return 'queued';
    case 'running': return 'running';
    case 'completed': return 'done';
    case 'failed': return 'failed';
    case 'draft': return c.detail === 'stopped' ? 'canceled' : null;
    default: return null;
  }
}
export function toQueueStatus(c: CardView): LegacyQueueStatus | null {
  const p = toProgressState(c);
  return p === 'running' ? 'rendering' : p;
}

/** One image tile (lib/studio/imageResults). */
export type LegacyTileStatus = 'pending' | 'done' | 'failed';
export function fromTileStatus(s: LegacyTileStatus): CardView {
  return s === 'pending' ? view('running') : s === 'done' ? view('completed') : view('failed');
}
export function toTileStatus(c: CardView): LegacyTileStatus | null {
  return c.state === 'running' ? 'pending' : c.state === 'completed' ? 'done' : c.state === 'failed' ? 'failed' : null;
}

/**
 * A batch of tiles as one card: any still drawing → running; all drawn → completed; none drawn → failed; some drawn
 * and some failed → partially_verified (the drawn ones are usable, §3.3: preserve partial states).
 */
export function fromTiles(tiles: ReadonlyArray<{ status: LegacyTileStatus }>): CardView {
  if (!tiles.length) return view('draft');
  if (tiles.some((t) => t.status === 'pending')) return view('running');
  const done = tiles.filter((t) => t.status === 'done').length;
  return done === tiles.length ? view('completed') : done === 0 ? view('failed') : view('partially_verified');
}

/**
 * music/MusicStudioCard's phase. `job` carries the job's own status (lib/music/studio/client MusicJobView), so the
 * pair (phase, job status) is what round-trips.
 */
export type LegacyMusicPhase = 'quoting' | 'quoted' | 'starting' | 'job' | 'refused';
export type LegacyMusicJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export function fromMusicPhase(k: LegacyMusicPhase, job?: LegacyMusicJobStatus): CardView {
  switch (k) {
    case 'quoting': return view('quoting');
    case 'quoted': return view('awaiting_approval');
    case 'starting': return view('awaiting_approval', 'starting');
    case 'refused': return view('failed', 'refused');
    case 'job': return job === 'running' ? view('running') : job === 'completed' ? view('completed') : job === 'failed' ? view('failed')
      : job === 'cancelled' ? view('draft', 'stopped') : view('queued');
  }
}
export function toMusicPhase(c: CardView): { k: LegacyMusicPhase; job?: LegacyMusicJobStatus } | null {
  switch (c.state) {
    case 'quoting': return { k: 'quoting' };
    case 'awaiting_approval': return { k: c.detail === 'starting' ? 'starting' : 'quoted' };
    case 'failed': return c.detail === 'refused' ? { k: 'refused' } : { k: 'job', job: 'failed' };
    case 'queued': case 'running': case 'completed': return { k: 'job', job: c.state };
    case 'draft': return c.detail === 'stopped' ? { k: 'job', job: 'cancelled' } : null;
    default: return null;
  }
}

/** Canonical durable task status (lib/tasks/statusModel), the vocabulary a reload restores from. */
export function fromTaskStatus(s: TaskStatus): CardView {
  return s === 'partially_completed' ? view('partially_verified') : s === 'cancelled' ? view('draft', 'stopped') : view(s);
}
export function toTaskStatus(c: CardView): TaskStatus | null {
  switch (c.state) {
    case 'queued': case 'awaiting_approval': case 'running': case 'completed': case 'failed': return c.state;
    case 'partially_verified': return 'partially_completed';
    case 'draft': return c.detail === 'stopped' ? 'cancelled' : null;
    default: return null;
  }
}
