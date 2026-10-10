/**
 * lib/agent/chatTurn.ts — what the chat does with one typed or spoken message BEFORE any tool reads it as a prompt:
 * Agent G's reading of the words (lib/agent/intent) against what is on screen (its cards, the job tray, a reply or a
 * render in flight) gives one step for the studio to carry out. Pure, no React, no network: the studio builds the
 * snapshot, this decides, the studio acts.
 *
 *   pass             the message goes on to the doors that already handle it (focus gate, remix, cards, panels, chat)
 *   say              Agent G answers in words: the user's turn and Agent G's note, nothing runs, nothing is charged
 *   stop             stop what is named (cards, tray jobs, the reply or render in flight), then say what was stopped
 *   continue-stream  the last reply was cut off at the length limit: the model picks it up from there
 *   redo             the last Agent G card stopped or failed: ask Agent G again with the same turn (↻), a fresh plan
 *   requote          the montage plan on screen takes the change („9:16", „20 seconds", „music from 5 s") and is
 *                    priced again; nothing runs before Start
 *   remontage        the montage Agent G just DELIVERED takes the change the same way (the music from 5 s): a new plan
 *                    from the same files and words, nothing runs before Start
 *   edit             Agent G edits one attached video, or its own last video, itself (lib/agent/media/editExec): the
 *                    edits read from the words (./media/editWords), planned on a card, run on Start
 *   run              two steps chained (./run/runChat): the sound of one video or link with the other clips cut to it,
 *                    or a montage and the edits a montage does not do itself; planned on one card, run on Start
 *   resume           „continue" after a run that ended without every result: a new run that keeps what was delivered
 */
import { classifyAgentIntent, type IntentInput } from './intent';
import type { AgentIntent, CapabilityId } from './contracts';
import { mineEdits, type EditAsk } from './media/editWords';
import { editErrorText } from './media/editChat';
import { runChainAsk, type RunChain } from './run/runChat';
import {
  askReply, continueReply, interceptAct, mergeMontagePrompt, statusReply, stopReply, unsupportedReply, type ActIntent, type WorkItem,
} from './intentReply';

/** One Agent G card in the thread (montage, MP3, edit or a multi-step run), in thread order. */
export interface ThreadCard {
  id: string;
  kind: 'montage' | 'audio' | 'edit' | 'run';
  phase: string;
  /** The step in words, already in the UI language (the card's own stage line). */
  stage?: string | null;
  pct?: number | null;
  /** A Stop already went out for it. */
  stopping?: boolean;
  /** Montage: the words the plan was made from. */
  prompt?: string;
}

/** One job in the tray that no card narrates (the card's own jobs are its). */
export interface TrayJob {
  id: string;
  kind: string;
  label: string;
  status: string;
  pct?: number | null;
  stage?: string | null;
  /** Observed from the server (a reload-recovered render): stopped through the task API, when it can be. */
  durable?: boolean;
  cancellable?: boolean;
}

export interface ChatSnapshot {
  /** The composer's tool: 'chat' or a focus tool. */
  mode: string;
  locale: string;
  /** What this message carries, by kind. */
  attachments: IntentInput['attachments'];
  cards: readonly ThreadCard[];
  jobs: readonly TrayJob[];
  /** A chat reply streaming ('reply') or a single-slot render in flight ('render'). */
  foreground: 'reply' | 'render' | null;
  /** The last reply stopped at the output-token limit. */
  lastTruncated: boolean;
  /** ↻ under the last reply would ask Agent G again (its card stopped or failed). */
  lastRedoable: boolean;
  /** The id of the montage card waiting for Start, when it is the latest reply: a change re-quotes it. */
  pendingMontageId: string | null;
  /** The last finished result in the thread. */
  previous: IntentInput['previous'];
  /** Agent G's media routes are open to this user (AGENT_G_MEDIA_EXEC). */
  montageOn: boolean;
  audioOn: boolean;
  editOn?: boolean;
  /** The last result is a montage Agent G delivered in this thread: its card, and the words it was planned from. */
  previousMontage?: { id: string; prompt?: string } | null;
  /** Multi-step runs are open to this user (the same AGENT_G_MEDIA_EXEC door as the montage). */
  runOn?: boolean;
  /** The last reply is a run card that ended without every result: „continue" carries it on. */
  resumableRunId?: string | null;
}

export type ChatStep =
  | { kind: 'pass'; intent: AgentIntent }
  /** keepComposer: the words and files stay in the box (an ask: add what is missing and send again). */
  | { kind: 'say'; text: string; keepComposer?: boolean; intent: AgentIntent }
  | {
    kind: 'stop';
    text: string;
    /** Running cards to stop and waiting plans to drop. */
    cards: string[];
    /** Local tray jobs to cancel. */
    jobs: string[];
    /** Server-observed jobs to stop through the task API. */
    durable: string[];
    /** Stop the reply or render in flight. */
    foreground: boolean;
    intent: AgentIntent;
  }
  | { kind: 'continue-stream'; intent: AgentIntent }
  | { kind: 'redo'; intent: AgentIntent }
  | { kind: 'requote'; cardId: string; prompt: string; intent: AgentIntent }
  | { kind: 'remontage'; cardId: string; prompt: string; intent: AgentIntent }
  /** source: the one video attached to this message, or the last video Agent G made in this thread. */
  | { kind: 'edit'; source: 'file' | 'previous'; edits: EditAsk[]; intent: AgentIntent }
  /** Two steps chained, planned on one card (nothing runs before Start). */
  | { kind: 'run'; chain: RunChain; intent: AgentIntent }
  /** Carry the run card on (a new run that reuses what was delivered). */
  | { kind: 'resume'; cardId: string; intent: AgentIntent };

const LIVE_CARD: ReadonlySet<string> = new Set(['reading', 'checking', 'running']);
const LIVE_JOB: ReadonlySet<string> = new Set(['queued', 'rendering']);

const JOB_WHAT: Record<string, WorkItem['what']> = {
  image: 'image', product: 'image', music: 'music', video: 'video', remix: 'video', avatar: 'avatar', lipsync: 'avatar',
};

const cardItem = (c: ThreadCard): WorkItem => ({
  what: c.kind,
  status: c.phase === 'quoted' ? 'waiting' : 'running',
  ...(c.stage ? { stage: c.stage } : {}),
  ...(typeof c.pct === 'number' ? { pct: c.pct } : {}),
});

const jobItem = (j: TrayJob): WorkItem => ({
  what: JOB_WHAT[j.kind] ?? 'other',
  status: j.status === 'queued' ? 'queued' : 'running',
  ...(j.label ? { label: j.label } : {}),
  ...(j.stage ? { stage: j.stage } : {}),
  ...(typeof j.pct === 'number' ? { pct: j.pct } : {}),
});

const foregroundItem = (f: 'reply' | 'render'): WorkItem => ({ what: f === 'reply' ? 'reply' : 'other', status: 'running' });

/** What is running or waiting right now, in the order the user sees it. */
export function workOf(s: ChatSnapshot): WorkItem[] {
  const cards = s.cards.filter((c) => LIVE_CARD.has(c.phase) || c.phase === 'quoted').map(cardItem);
  const jobs = s.jobs.filter((j) => LIVE_JOB.has(j.status)).map(jobItem);
  return [...cards, ...jobs, ...(s.foreground ? [foregroundItem(s.foreground)] : [])];
}

/**
 * An edit Agent G makes itself, when its route is open: a frame-shape change (media.edit) of the one video attached, or
 * an edit of its own last video (media.edit, or a remix op aimed at the previous result). On an attached video every
 * other edit stays the remix's, as before. Null: not this, the old flow answers.
 */
function editStep(text: string, intent: ActIntent, s: ChatSnapshot): ChatStep | null {
  if (s.mode !== 'chat' || !s.editOn) return null;
  const kinds = s.attachments ?? [];
  const cap = intent.capability;
  const onPrevious = intent.target === 'previous' && !kinds.length;
  // Subtitles are the speech written out (the remix's job), and a music start is the montage's (remontage).
  if (intent.params.editOp === 'captions' || intent.params.editOp === 'music_offset') return null;
  if (!(cap === 'media.edit' || (onPrevious && cap === 'video.remix'))) return null;
  const locale = intent.lang;
  if (intent.missing.includes('previous') || (onPrevious && s.previous?.kind !== 'video')) {
    return { kind: 'say', text: editErrorText('no_previous', locale), keepComposer: true, intent };
  }
  if (intent.missing.includes('video')) return { kind: 'say', text: askReply(intent, locale), keepComposer: true, intent };
  const source = onPrevious ? 'previous' : intent.target === 'attachment' && kinds.length === 1 && kinds[0] === 'video' ? 'file' : null;
  if (!source) return { kind: 'say', text: editErrorText('bad_input', locale), keepComposer: true, intent };
  const mined = mineEdits(text);
  if (mined.unsupported.includes('cut_middle')) return { kind: 'say', text: editErrorText('cut_middle', locale), intent };
  if (mined.missing.includes('caption_text')) return { kind: 'say', text: editErrorText('caption_text', locale), keepComposer: true, intent };
  if (!mined.edits.length) return null;
  return { kind: 'edit', source, edits: mined.edits, intent };
}

/** One message, read against the screen: the step the studio takes. */
export function planChatTurn(text: string, s: ChatSnapshot): ChatStep {
  const pending: { capability: CapabilityId } | null = s.pendingMontageId && s.montageOn ? { capability: 'agent.montage' } : null;
  const intent = classifyAgentIntent({
    text,
    attachments: s.attachments ?? [],
    mode: s.mode,
    previous: s.previous ?? null,
    pending,
    locale: s.locale,
  });
  const locale = intent.lang;

  if (intent.kind === 'control') {
    if (intent.op === 'status') return { kind: 'say', text: statusReply(workOf(s), locale), intent };

    if (intent.op === 'stop') {
      const cards = s.cards.filter((c) => (c.phase === 'running' && !c.stopping) || c.phase === 'quoted');
      const live = s.jobs.filter((j) => LIVE_JOB.has(j.status));
      const jobs = live.filter((j) => !j.durable).map((j) => j.id);
      const durable = live.filter((j) => j.durable && j.cancellable).map((j) => j.id);
      // A server job that cannot be stopped from here is not listed as stopped: it was not.
      const stoppedJobs = live.filter((j) => !j.durable || j.cancellable);
      const items = [...cards.map(cardItem), ...stoppedJobs.map(jobItem), ...(s.foreground ? [foregroundItem(s.foreground)] : [])];
      return {
        kind: 'stop', text: stopReply(items, locale), cards: cards.map((c) => c.id), jobs, durable, foreground: !!s.foreground, intent,
      };
    }

    // continue
    if (s.lastTruncated) return { kind: 'continue-stream', intent };
    if (s.cards.some((c) => c.phase === 'quoted')) return { kind: 'say', text: continueReply('plan-waiting', locale), intent };
    if (workOf(s).length) return { kind: 'say', text: continueReply('running', locale), intent };
    // A run that stopped part-way goes on from where it ended: what it delivered is kept, not made again.
    if (s.resumableRunId && s.runOn) return { kind: 'resume', cardId: s.resumableRunId, intent };
    if (s.lastRedoable) return { kind: 'redo', intent };
    // In the chat „continue" after a finished answer is the conversation's own (a story, a list): the model has it.
    return s.mode === 'chat' ? { kind: 'pass', intent } : { kind: 'say', text: continueReply('nothing', locale), intent };
  }

  // Two steps in one message („the sound of the first video, the other clips cut to it"; „cut to the music, black and
  // white"): one run card. Before the one-step readings, which would answer the first with „the track is missing" and cut
  // the second without its edits.
  if (s.mode === 'chat' && s.runOn) {
    const chain = runChainAsk(text, s.attachments ?? []);
    if (chain) return { kind: 'run', chain, intent };
  }

  if (intent.kind === 'act') {
    // „The music from 5 s" on the montage Agent G just delivered: the same files planned again with the change.
    if (s.mode === 'chat' && s.montageOn && s.previousMontage && intent.capability === 'media.edit'
      && intent.params.editOp === 'music_offset' && intent.target === 'previous') {
      return { kind: 'remontage', cardId: s.previousMontage.id, prompt: mergeMontagePrompt(s.previousMontage.prompt, text), intent };
    }
    const edit = editStep(text, intent, s);
    if (edit) return edit;
    const how = interceptAct(intent, { mode: s.mode, montageOn: s.montageOn, audioOn: s.audioOn });
    if (how === 'requote' && s.pendingMontageId) {
      const card = s.cards.find((c) => c.id === s.pendingMontageId);
      return { kind: 'requote', cardId: s.pendingMontageId, prompt: mergeMontagePrompt(card?.prompt, text), intent };
    }
    if (how === 'ask') return { kind: 'say', text: askReply(intent, locale), keepComposer: true, intent };
    if (how === 'unsupported') return { kind: 'say', text: unsupportedReply(intent, locale), intent };
  }

  return { kind: 'pass', intent };
}

/**
 * Words typed in a tool whose Run spends at once (product ad, character swap, remix) that are not a request: talk, a
 * question, feedback, „stop", „where are you?". They go to the chat; only the panel's own Generate runs on them anyway.
 */
export function wordsAreForChat(text: string, mode: string, locale: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const k = classifyAgentIntent({ text: t, mode, locale }).kind;
  return k === 'control' || k === 'talk' || k === 'question' || k === 'feedback';
}
