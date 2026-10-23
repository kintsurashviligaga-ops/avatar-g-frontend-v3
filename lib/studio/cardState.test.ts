/** @jest-environment node */
/**
 * The card's nine states (MASTER TASK v3.1 §3.1, Phase 2 PR 5): every move is listed and tested, every other move is
 * refused, each state has one primary action, a late answer cannot overwrite a newer draft, and every old vocabulary
 * maps in and back out unchanged.
 */
import type { ProgressState } from '@/components/studio/ui/GenerationProgress';
import type { ResultState } from '@/components/studio/ui/ResultCard';
import type { JobStatus } from '@/lib/jobs/jobQueue';
import type { MusicJobView } from '@/lib/music/studio/client';
import type { ImageTileView } from '@/lib/studio/imageResults';
import { TASK_STATUSES } from '@/lib/tasks/statusModel';
import {
  CARD_STATES, CARD_TRANSITIONS, DETAIL_STATE, PRIMARY_ACTION, canMove, fromMusicPhase, fromProgressState, fromResultState,
  fromTaskStatus, fromTileStatus, fromTiles, isSettledCard, move, newCard, onEvent, primaryAction, restoreCard, toMusicPhase,
  toProgressState, toQueueStatus, toResultState, toTaskStatus, toTileStatus,
  type Card, type CardDetail, type CardState, type CardView, type LegacyMusicJobStatus, type LegacyMusicPhase,
  type LegacyProgressState, type LegacyQueueStatus, type LegacyResultState, type LegacyTileStatus,
} from './cardState';

/** The mapped vocabularies are the cards' own types: a word added to one of them fails typecheck here until it is mapped. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const SAME_TYPES: [
  Same<LegacyResultState, ResultState>, Same<LegacyProgressState, ProgressState>, Same<LegacyQueueStatus, JobStatus>,
  Same<LegacyTileStatus, ImageTileView['status']>, Same<LegacyMusicJobStatus, MusicJobView['status']>,
] = [true, true, true, true, true];

/** Every legal move. Adding or removing one is a decision, so it changes this list too. */
const ALLOWED: ReadonlyArray<[CardState, CardState]> = [
  ['draft', 'quoting'],
  ['quoting', 'awaiting_approval'], ['quoting', 'failed'], ['quoting', 'draft'],
  ['awaiting_approval', 'queued'], ['awaiting_approval', 'quoting'], ['awaiting_approval', 'draft'], ['awaiting_approval', 'failed'],
  ['queued', 'running'], ['queued', 'cancelling'], ['queued', 'failed'], ['queued', 'awaiting_approval'],
  ['running', 'completed'], ['running', 'partially_verified'], ['running', 'failed'], ['running', 'cancelling'], ['running', 'awaiting_approval'],
  ['cancelling', 'draft'], ['cancelling', 'running'], ['cancelling', 'completed'], ['cancelling', 'partially_verified'], ['cancelling', 'failed'],
  ['failed', 'quoting'], ['failed', 'draft'],
  ['partially_verified', 'quoting'], ['partially_verified', 'draft'],
  ['completed', 'draft'],
];
const allowed = new Set(ALLOWED.map(([a, b]) => `${a}>${b}`));

/** A card sitting in `state`, on try "t1" unless it is a draft. */
const at = (state: CardState, detail: CardDetail | null = null): Card => ({ state, detail, attempt: state === 'draft' ? null : 't1' });

describe('the nine states', () => {
  test("are the spec's, in its order", () => {
    expect(CARD_STATES).toEqual(['draft', 'quoting', 'awaiting_approval', 'queued', 'running', 'cancelling', 'failed', 'partially_verified', 'completed']);
  });

  test('the transition table is exactly the listed moves', () => {
    const table = CARD_STATES.flatMap((from) => CARD_TRANSITIONS[from].map((to) => `${from}>${to}`));
    expect(new Set(table)).toEqual(allowed);
    expect(table).toHaveLength(ALLOWED.length);
  });

  test.each(CARD_STATES.flatMap((from) => CARD_STATES.filter((to) => to !== from).map((to) => [from, to] as const)))(
    '%s → %s is moved only if listed',
    (from, to) => {
      const ok = allowed.has(`${from}>${to}`);
      expect(canMove(from, to)).toBe(ok);
      const next = move(at(from), to, { attempt: 't2' });
      if (!ok) expect(next).toBeNull();
      else expect(next).toMatchObject({ state: to, detail: null });
    },
  );

  test('every state is reachable from a draft, and every state can get back to a draft', () => {
    const reach = (start: CardState) => {
      const seen = new Set<CardState>([start]);
      const todo = [start];
      while (todo.length) for (const n of CARD_TRANSITIONS[todo.pop()!]) if (!seen.has(n)) { seen.add(n); todo.push(n); }
      return seen;
    };
    expect([...reach('draft')].sort()).toEqual([...CARD_STATES].sort());
    for (const s of CARD_STATES) expect([s, reach(s).has('draft')]).toEqual([s, true]);
  });

  test('settled: a draft, a failure, a partial result or a finished one', () => {
    expect(CARD_STATES.filter(isSettledCard)).toEqual(['draft', 'failed', 'partially_verified', 'completed']);
  });
});

describe('one primary action per state', () => {
  test('each state names one of the four the spec allows', () => {
    for (const s of CARD_STATES) expect(['propose', 'approve', 'stop', 'use']).toContain(PRIMARY_ACTION[s].action);
    expect(Object.fromEntries(CARD_STATES.map((s) => [s, PRIMARY_ACTION[s].action]))).toEqual({
      draft: 'propose', quoting: 'propose', awaiting_approval: 'approve', queued: 'stop', running: 'stop', cancelling: 'stop',
      failed: 'propose', partially_verified: 'use', completed: 'use',
    });
  });

  test('a busy state keeps its button, pressed and disabled', () => {
    expect(primaryAction(at('quoting'))).toEqual({ action: 'propose', enabled: false, busy: true });
    expect(primaryAction(at('cancelling'))).toEqual({ action: 'stop', enabled: false, busy: true });
    expect(primaryAction(at('awaiting_approval', 'starting'))).toEqual({ action: 'approve', enabled: false, busy: true });
    expect(primaryAction(at('awaiting_approval'))).toEqual({ action: 'approve', enabled: true, busy: false });
  });

  test('a job with no cancel route keeps stop as its action, disabled, so no other button takes its place', () => {
    expect(primaryAction(at('running'), { cancellable: false })).toEqual({ action: 'stop', enabled: false, busy: false });
    expect(primaryAction(at('queued'))).toEqual({ action: 'stop', enabled: true, busy: false });
    expect(primaryAction(at('completed'), { cancellable: false })).toEqual({ action: 'use', enabled: true, busy: false });
  });
});

describe('details', () => {
  test('each detail sits on one state, and move refuses it anywhere else', () => {
    for (const [d, s] of Object.entries(DETAIL_STATE) as Array<[CardDetail, CardState]>) {
      for (const to of CARD_STATES) {
        const from = CARD_STATES.find((f) => f === to || canMove(f, to))!;
        const next = move(at(from), to, { detail: d, attempt: 't2' });
        if (to === s) expect(next).toMatchObject({ state: s, detail: d });
        else expect(next).toBeNull();
      }
    }
  });

  test('a detail changes within its state without a move, and a move clears it', () => {
    const r = move(at('running'), 'running', { detail: 'finalizing' })!;
    expect(r).toEqual({ state: 'running', detail: 'finalizing', attempt: 't1' });
    expect(move(r, 'completed')).toEqual({ state: 'completed', detail: null, attempt: 't1' });
  });
});

describe('a try and its answers', () => {
  test('a new try needs its key; a re-quote keeps it; a draft lets it go', () => {
    expect(move(newCard(), 'quoting')).toBeNull();
    const q = move(newCard(), 'quoting', { attempt: 'a' })!;
    expect(q).toEqual({ state: 'quoting', detail: null, attempt: 'a' });
    const ok = move(q, 'awaiting_approval')!;
    expect(move(ok, 'quoting', { attempt: 'ignored' })).toEqual({ state: 'quoting', detail: null, attempt: 'a' });
    expect(move(ok, 'draft')).toEqual(newCard());
    expect(move(at('failed'), 'quoting', { attempt: 'b' })).toMatchObject({ attempt: 'b' });
    expect(move(at('partially_verified'), 'quoting')).toBeNull();
  });

  test('the whole way: propose, approve, start, run, store, done', () => {
    let c: Card | null = move(newCard(), 'quoting', { attempt: 'a' });
    c = onEvent(c!, 'a', 'awaiting_approval');
    c = move(c!, 'awaiting_approval', { detail: 'starting' });
    expect(primaryAction(c!).busy).toBe(true);
    c = onEvent(c!, 'a', 'queued');
    c = onEvent(c!, 'a', 'running');
    c = onEvent(c!, 'a', 'running', 'finalizing');
    c = onEvent(c!, 'a', 'completed');
    expect(c).toEqual({ state: 'completed', detail: null, attempt: 'a' });
  });

  test('a stop that loses its race goes back to running; one that wins is a draft with its inputs', () => {
    const stopping = move(at('running'), 'cancelling')!;
    expect(onEvent(stopping, 't1', 'running')).toMatchObject({ state: 'running' });
    expect(onEvent(stopping, 't1', 'draft', 'stopped')).toEqual({ state: 'draft', detail: 'stopped', attempt: null });
    expect(onEvent(stopping, 't1', 'completed')).toMatchObject({ state: 'completed' });
  });

  test('a late answer cannot overwrite a newer draft', () => {
    const edited = move(at('running'), 'cancelling')!;
    const draft = onEvent(edited, 't1', 'draft', 'stopped')!;
    expect(onEvent(draft, 't1', 'completed')).toBeNull();
    // The user edits after a result and proposes again: the first try's answers no longer reach the card.
    const again = move(move(at('completed'), 'draft')!, 'quoting', { attempt: 't2' })!;
    expect(onEvent(again, 't1', 'awaiting_approval')).toBeNull();
    expect(onEvent(again, 't1', 'failed')).toBeNull();
    expect(onEvent(again, 't2', 'awaiting_approval')).toMatchObject({ state: 'awaiting_approval', attempt: 't2' });
  });

  test('an answer for the right try is still refused when the move is not listed', () => {
    expect(onEvent(at('completed'), 't1', 'running')).toBeNull();
    expect(onEvent(at('quoting'), 't1', 'completed')).toBeNull();
  });

  test('a reload restores a durable task under its own key, and its events reach the card', () => {
    const c = restoreCard(fromTaskStatus('running'), 'task-9');
    expect(onEvent(c, 'task-9', 'completed')).toMatchObject({ state: 'completed' });
    expect(onEvent(c, 'task-8', 'completed')).toBeNull();
    expect(restoreCard(fromTaskStatus('cancelled'), 'task-9')).toEqual({ state: 'draft', detail: 'stopped', attempt: null });
  });
});

describe('the old vocabularies map in and back out unchanged', () => {
  test('they are the cards\' own types', () => {
    expect(SAME_TYPES).toEqual([true, true, true, true, true]);
  });

  const valid = (v: CardView) => v.detail === null || DETAIL_STATE[v.detail] === v.state;

  test.each([
    ['ui/ResultCard', ['queued', 'rendering', 'finalizing', 'ready', 'error'], fromResultState, toResultState],
    ['ui/GenerationProgress', ['running', 'queued', 'done', 'failed', 'canceled'], fromProgressState, toProgressState],
    ['lib/jobs/jobQueue', ['queued', 'rendering', 'done', 'failed', 'canceled'], fromProgressState, toQueueStatus],
    ['image tile', ['pending', 'done', 'failed'], fromTileStatus, toTileStatus],
    ['lib/tasks/statusModel', TASK_STATUSES, fromTaskStatus, toTaskStatus],
  ] as Array<[string, readonly string[], (s: never) => CardView, (c: CardView) => string | null]>)('%s', (_name, words, from, to) => {
    for (const w of words) {
      const v = from(w as never);
      expect([w, valid(v)]).toEqual([w, true]);
      expect([w, to(v)]).toEqual([w, w]);
    }
    // No two old words land on the same card, so nothing is merged away.
    const seen = words.map((w) => JSON.stringify(from(w as never)));
    expect(new Set(seen).size).toBe(words.length);
  });

  test('music/MusicStudioCard: each phase, and each status of its job', () => {
    const pairs: Array<[LegacyMusicPhase, LegacyMusicJobStatus?]> = [
      ['quoting'], ['quoted'], ['starting'], ['refused'],
      ['job', 'queued'], ['job', 'running'], ['job', 'completed'], ['job', 'failed'], ['job', 'cancelled'],
    ];
    for (const [k, job] of pairs) {
      const v = fromMusicPhase(k, job);
      expect(valid(v)).toBe(true);
      expect(toMusicPhase(v)).toEqual(job ? { k, job } : { k });
    }
    expect(new Set(pairs.map(([k, j]) => JSON.stringify(fromMusicPhase(k, j)))).size).toBe(pairs.length);
    // A job recalled after a reload, before its first poll, waits as queued.
    expect(fromMusicPhase('job')).toEqual({ state: 'queued', detail: null });
  });

  test('a refusal and a failure stay apart, and a stop is not a failure', () => {
    expect(fromMusicPhase('refused')).toEqual({ state: 'failed', detail: 'refused' });
    expect(fromMusicPhase('job', 'failed')).toEqual({ state: 'failed', detail: null });
    expect(fromProgressState('canceled')).toEqual({ state: 'draft', detail: 'stopped' });
    expect(primaryAction(fromProgressState('canceled'))).toEqual({ action: 'propose', enabled: true, busy: false });
  });

  test('a state an old card has no word for maps out to null, not to a guess', () => {
    expect(toResultState({ state: 'awaiting_approval', detail: null })).toBeNull();
    expect(toTileStatus({ state: 'cancelling', detail: null })).toBeNull();
    expect(toTaskStatus({ state: 'draft', detail: null })).toBeNull();
    expect(toProgressState({ state: 'quoting', detail: null })).toBeNull();
  });
});

describe('a batch of image tiles as one card', () => {
  const t = (...s: Array<'pending' | 'done' | 'failed'>) => s.map((status) => ({ status }));
  test.each([
    [t(), 'draft'],
    [t('pending', 'done'), 'running'],
    [t('done', 'done'), 'completed'],
    [t('failed', 'failed'), 'failed'],
    [t('done', 'failed', 'done'), 'partially_verified'],
  ] as Array<[Array<{ status: 'pending' | 'done' | 'failed' }>, CardState]>)('%j → %s', (tiles, want) => {
    expect(fromTiles(tiles)).toEqual({ state: want, detail: null });
  });
});
