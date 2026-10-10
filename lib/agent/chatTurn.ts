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
 */
import { classifyAgentIntent, type IntentInput } from './intent';
import type { AgentIntent, CapabilityId } from './contracts';
import {
  askReply, continueReply, interceptAct, mergeMontagePrompt, statusReply, stopReply, unsupportedReply, type WorkItem,
} from './intentReply';

/** One Agent G card in the thread (montage or MP3), in thread order. */
export interface ThreadCard {
  id: string;
  kind: 'montage' | 'audio';
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
  | { kind: 'requote'; cardId: string; prompt: string; intent: AgentIntent };

const LIVE_CARD: ReadonlySet<string> = new Set(['reading', 'checking', 'running']);
const LIVE_JOB: ReadonlySet<string> = new Set(['queued', 'rendering']);

const JOB_WHAT: Record<string, WorkItem['what']> = {
  image: 'image', product: 'image', music: 'music', video: 'video', remix: 'video', avatar: 'avatar', lipsync: 'avatar',
};

const cardItem = (c: ThreadCard): WorkItem => ({
  what: c.kind === 'montage' ? 'montage' : 'audio',
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
    if (s.lastRedoable) return { kind: 'redo', intent };
    // In the chat „continue" after a finished answer is the conversation's own (a story, a list): the model has it.
    return s.mode === 'chat' ? { kind: 'pass', intent } : { kind: 'say', text: continueReply('nothing', locale), intent };
  }

  if (intent.kind === 'act') {
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
