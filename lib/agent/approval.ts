/**
 * lib/agent/approval.ts — how a person said yes to what a run starts, as the server records it (lib/agent/contracts
 * AgentApproval). Every Agent G run request (montage, MP3, edit) may carry `approval`; none means the card's own Start
 * tap, as before. A Live call's start carries `{ channel: 'voice-transcript', said }`: the user's own words after the
 * plan was told, as the call heard them (components/voice/live/liveActions). The server judges those words again
 * (lib/voice/spokenYes) and refuses the run when they are not a clear yes, so no record ever says "voice yes" about
 * words that are not one. The channel and the words go on the job row (`_approval`, never shown to the client) and in
 * its audit row.
 *
 * What this does not do: prove the words came from a microphone. A hand-made request can claim them, exactly as it can
 * claim a tap: it is the same signed-in user, the same signed quote, the same balance checks. The voice gate exists
 * against the MODEL (a misheard or invented yes, an instruction read from a web page), and that gate is in the browser,
 * where the user's own transcript is.
 */
import type { AgentApproval } from './contracts';
import { SAID_MAX_CHARS, judgeUtterance, saidOf } from '@/lib/voice/spokenYes';

export type ApprovalChannel = AgentApproval['channel'];
export const APPROVAL_CHANNELS: readonly ApprovalChannel[] = ['tap', 'panel-button', 'voice-transcript'];

/** How the yes to one run was given. `said` only for a voice yes: the user's words, cut at SAID_MAX_CHARS. */
export interface RunApproval {
  channel: ApprovalChannel;
  said?: string;
}

export type ApprovalError = 'approval_unclear' | 'bad_approval';
export type ParsedApproval = { ok: true; approval: RunApproval } | { ok: false; error: ApprovalError; message: string };

export const TAP: RunApproval = Object.freeze({ channel: 'tap' as const });

/** A run request's `approval` → the approval to record, or why the run is refused. Absent → the card's Start tap. */
export function parseRunApproval(raw: unknown): ParsedApproval {
  if (raw === undefined || raw === null) return { ok: true, approval: TAP };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'bad_approval', message: 'approval must be an object.' };
  const { channel, said } = raw as { channel?: unknown; said?: unknown };
  if (channel === 'tap' || channel === 'panel-button') return { ok: true, approval: { channel } };
  if (channel !== 'voice-transcript') return { ok: false, error: 'bad_approval', message: 'Unknown approval channel.' };
  if (typeof said !== 'string' || !said.trim() || said.length > SAID_MAX_CHARS * 2) {
    return { ok: false, error: 'approval_unclear', message: 'A voice approval needs the user\'s own words.' };
  }
  if (judgeUtterance(said) !== 'yes') {
    return { ok: false, error: 'approval_unclear', message: 'The user\'s words are not a clear yes, so nothing was started.' };
  }
  return { ok: true, approval: { channel, said: saidOf(said) } };
}

/** What a job row keeps (`params._approval`). */
export function approvalParams(a: RunApproval): { _approval: RunApproval } {
  return { _approval: a.said ? { channel: a.channel, said: a.said } : { channel: a.channel } };
}

/** The audit row's words for it: '' for a tap, `voice "…"` for a voice yes (the words cut shorter). */
export function approvalNote(a: RunApproval): string {
  return a.channel === 'voice-transcript' ? `voice "${(a.said ?? '').slice(0, 80)}"` : a.channel === 'panel-button' ? 'panel button' : '';
}

/** An audit row's detail with how it was approved appended (a tap adds nothing: it is the default). */
export function withNote(detail: string, a: RunApproval): string {
  const note = approvalNote(a);
  return note ? `${detail}; approved by ${note}` : detail;
}
