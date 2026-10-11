/**
 * lib/agent/media/workingCard.ts — which of Agent G's cards in the chat is still working, for the composer's Stop.
 *
 * ⚠️ WHY. The owner on the Preview, 2026-10-11 (iPhone, a montage rendering): „during a process the send button does not
 * turn into a square, so you cannot feel it running; a red Stop would sit better". The composer's Stop knew only a chat
 * reply streaming; a card's job (minutes, not seconds) left the box looking idle. The composer now shows a red Stop while
 * a card works, and it stops the newest such card exactly as that card's own Stop does. Pure, safe in the browser.
 */
import type { CardMessage } from './cardPersist';

export type WorkingKind = 'montage' | 'audio' | 'edit' | 'run';

export interface WorkingCard {
  id: string;
  kind: WorkingKind;
  /** Still reading its files or checking its source: no job yet, so a Stop closes the card and nothing runs. */
  reading: boolean;
  /** A Stop is already on its way to the server. */
  stopping: boolean;
}

/** One message's working card, if it has one: reading its files (no plan yet) or its job running. */
export function workingOf(m: CardMessage & { id?: string }): WorkingCard | null {
  if (!m.id) return null;
  const { montage: mo, audioJob: a, editJob: e, runJob: r } = m;
  if (mo && (mo.phase === 'reading' || mo.phase === 'running')) return { id: m.id, kind: 'montage', reading: mo.phase === 'reading', stopping: !!mo.stopping };
  if (a && (a.phase === 'checking' || a.phase === 'running')) return { id: m.id, kind: 'audio', reading: a.phase === 'checking', stopping: !!a.stopping };
  if (e && (e.phase === 'reading' || e.phase === 'running')) return { id: m.id, kind: 'edit', reading: e.phase === 'reading', stopping: !!e.stopping };
  if (r && (r.phase === 'reading' || r.phase === 'running')) return { id: m.id, kind: 'run', reading: r.phase === 'reading', stopping: !!r.stopping };
  return null;
}

/** The newest card in the chat that is still working, or null when nothing is. */
export function newestWorkingCard(messages: ReadonlyArray<CardMessage & { id?: string }>): WorkingCard | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const w = workingOf(messages[i]!);
    if (w) return w;
  }
  return null;
}
