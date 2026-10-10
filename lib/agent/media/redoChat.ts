/**
 * lib/agent/media/redoChat.ts — what the chat's ↻ (regenerate) does under one of Agent G's replies (the montage card,
 * the MP3 card). Pure, no network, safe in the browser.
 *
 * ⚠️ WHY. ↻ re-streams a TEXT answer from the turns before the reply. Under Agent G's bubble that handed the user's
 * clips, track and words to the chat model, which answered with advice („use the Montage tool in the menu…") in place
 * of the card: seen on the Preview admin run of 2026-10-09 (Stop on a running montage, then ↻). Under such a reply ↻ now
 * asks Agent G again with the same turn: a fresh plan card, nothing runs before Start and nothing is charged. While the
 * card is still open (reading / checking / quoted / running) there is no ↻ at all: the card's own buttons are the way,
 * and a re-stream would have dropped a live card.
 */
import { audioExtractAsk, type AgentAudioPhase, type AudioAsk } from './audioChat';
import type { AgentEditPhase } from './editChat';
import type { EditAsk } from './editWords';
import { beatMontageAsk, type AgentMontagePhase, type AttachmentKind } from './montageChat';

/** The reply under the ↻: only its Agent G card matters here. */
export interface RedoReply {
  /** `prompt`: the words the card was planned from. A plan changed in the chat carries them merged with the change. */
  montage?: { phase: AgentMontagePhase; prompt?: string; quote?: unknown };
  audioJob?: { phase: AgentAudioPhase; quote?: unknown };
  /** `ask`: the edits it was planned with, and the video it edits when that is Agent G's own last result. */
  editJob?: { phase: AgentEditPhase; source?: 'file' | 'previous'; ask?: { edits: EditAsk[]; url?: string }; quote?: unknown };
  /** A multi-step run: its own Retry and „continue" carry it on, never ↻ (that would ask the chat model without its files). */
  runJob?: { phase: string };
  /** A whole-file analysis: ↻ asks the same file again (the studio's analyzeAgain), not while it is still reading. */
  analyzeJob?: { phase: string };
}

/** The user turn the reply answered, with the files it carried (in memory: their bytes are never persisted). */
export interface RedoTurn<F extends { mimeType: string }> {
  role: string;
  text: string;
  medias?: F[];
}

export type AgentRedo<F> =
  /** Not an Agent G reply: the usual text regenerate. */
  | { kind: 'chat' }
  /** An Agent G reply that cannot be asked again here (its card is open, the files are gone, the route is closed): no ↻. */
  | { kind: 'none' }
  | { kind: 'montage'; text: string; files: F[] }
  | { kind: 'audio'; text: string; ask: AudioAsk; file?: F }
  | { kind: 'edit'; source: 'file' | 'previous'; edits: EditAsk[]; file?: F; url?: string };

/** A card that has finished: the run is done, failed or stopped, or the plan was dropped. */
const SETTLED: ReadonlySet<string> = new Set(['done', 'failed', 'cancelled', 'dismissed']);

export function attachmentKind(mimeType: string): AttachmentKind {
  return mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('image/') ? 'image' : 'other';
}

/** What ↻ under `reply` does. `open` says which Agent G routes are open to this user now. */
export function agentRedo<F extends { mimeType: string }>(
  reply: RedoReply,
  turn: RedoTurn<F> | undefined,
  open: { montage: boolean; audio: boolean; edit?: boolean },
): AgentRedo<F> {
  if (reply.runJob) return { kind: 'none' };
  if (reply.analyzeJob) return reply.analyzeJob.phase === 'reading' ? { kind: 'none' } : { kind: 'chat' };
  const card = reply.montage ?? reply.audioJob ?? reply.editJob;
  if (!card) return { kind: 'chat' };
  if (!SETTLED.has(card.phase) || !turn || turn.role !== 'user') return { kind: 'none' };
  const files = turn.medias ?? [];
  if (reply.editJob) {
    // The same edits of the same video: the one attached to that turn, or Agent G's own result it named by link.
    const e = reply.editJob;
    if (!open.edit || !e.ask?.edits.length) return { kind: 'none' };
    if (e.source === 'previous') return e.ask.url ? { kind: 'edit', source: 'previous', edits: e.ask.edits, url: e.ask.url } : { kind: 'none' };
    const file = files.find((f) => attachmentKind(f.mimeType) === 'video');
    return file ? { kind: 'edit', source: 'file', edits: e.ask.edits, file } : { kind: 'none' };
  }
  const kinds = files.map((f) => attachmentKind(f.mimeType));
  if (reply.montage) {
    // A plan changed in the chat („მუსიკა 5 წამიდან დაიწყე" under the card) was quoted from the card's own words plus the
    // change; the turn above it holds only the change. ↻ asks again with what the card was planned from.
    const text = reply.montage.prompt?.trim() || turn.text;
    return open.montage && files.length > 0 && beatMontageAsk(text, kinds)
      ? { kind: 'montage', text, files }
      : { kind: 'none' };
  }
  if (!open.audio) return { kind: 'none' };
  const ask = audioExtractAsk(turn.text, kinds);
  if (!ask) return { kind: 'none' };
  if (ask.source === 'file') {
    const file = files[0];
    return file ? { kind: 'audio', text: turn.text, ask, file } : { kind: 'none' };
  }
  return { kind: 'audio', text: turn.text, ask };
}

/**
 * The card's own Retry: a card that was stopped, or that failed while it ran, is asked again in place with what it was
 * asked (a fresh plan, nothing runs before Start). A card refused before it had a plan (a platform link, a file that does
 * not fit, a closed route) would only be refused again; a finished card and a plan the user cancelled offer none.
 */
export function cardRetry<F extends { mimeType: string }>(
  reply: RedoReply,
  turn: RedoTurn<F> | undefined,
  open: { montage: boolean; audio: boolean; edit?: boolean },
): AgentRedo<F> {
  const card = reply.montage ?? reply.audioJob ?? reply.editJob;
  if (!card || !(card.phase === 'cancelled' || (card.phase === 'failed' && card.quote))) return { kind: 'none' };
  const redo = agentRedo(reply, turn, open);
  return redo.kind === 'chat' ? { kind: 'none' } : redo;
}
