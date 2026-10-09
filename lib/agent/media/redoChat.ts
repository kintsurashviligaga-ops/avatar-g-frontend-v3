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
import { beatMontageAsk, type AgentMontagePhase, type AttachmentKind } from './montageChat';

/** The reply under the ↻: only its Agent G card matters here. */
export interface RedoReply {
  montage?: { phase: AgentMontagePhase };
  audioJob?: { phase: AgentAudioPhase };
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
  | { kind: 'audio'; text: string; ask: AudioAsk; file?: F };

/** A card that has finished: the run is done, failed or stopped, or the plan was dropped. */
const SETTLED: ReadonlySet<string> = new Set(['done', 'failed', 'cancelled', 'dismissed']);

export function attachmentKind(mimeType: string): AttachmentKind {
  return mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('image/') ? 'image' : 'other';
}

/** What ↻ under `reply` does. `open` says which Agent G routes are open to this user now. */
export function agentRedo<F extends { mimeType: string }>(
  reply: RedoReply,
  turn: RedoTurn<F> | undefined,
  open: { montage: boolean; audio: boolean },
): AgentRedo<F> {
  const card = reply.montage ?? reply.audioJob;
  if (!card) return { kind: 'chat' };
  if (!SETTLED.has(card.phase) || !turn || turn.role !== 'user') return { kind: 'none' };
  const files = turn.medias ?? [];
  const kinds = files.map((f) => attachmentKind(f.mimeType));
  if (reply.montage) {
    return open.montage && files.length > 0 && beatMontageAsk(turn.text, kinds)
      ? { kind: 'montage', text: turn.text, files }
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
