/**
 * lib/voice/livePlans.ts — Agent G's cards as a Live call reads them, and what a voice start may run. Pure; the studio
 * (components/studio/OmniStudio) calls it with what is on screen, the call (components/voice/live) never sees a card.
 *
 *   livePlansOf      the montage, MP3 and edit cards in the chat, in the order they appeared (agent_task status,
 *                    get_screen_state): the call numbers the plans from this list (lib/voice/voiceLedger).
 *   quotedPlanNote   the [App] note for a card that just reached 'quoted' while a call is on: its id and kind, so the
 *                    call can number it, and its facts in English for the model.
 *   liveFingerprint  what the studio would start, as one string: the tool, the prompt and the price. The price told and
 *                    the start compare it, so a prompt changed after "it costs 4 credits" is never what a yes runs (V5).
 *   agentAudioPlanOf the MP3 plan an ask_agent_g run handed back (/api/agent/run `audioQuote`), checked for shape only:
 *                    the server checks its signature again when it runs.
 */
import { formatBytes, type AgentAudioState } from '@/lib/agent/media/audioChat';
import type { AudioQuote } from '@/lib/agent/media/audioExtract';
import { editQuoteText, type AgentEditState } from '@/lib/agent/media/editChat';
import { quoteText, type AgentMontageState } from '@/lib/agent/media/montageChat';
import type { LivePlanKind, LivePlanState, LiveResultNote } from './liveTools';

/** The cards of one chat message (OmniStudio's Msg has these fields). */
export interface LivePlanCards {
  id?: string;
  montage?: AgentMontageState;
  audioJob?: AgentAudioState;
  editJob?: AgentEditState;
}

/** At most this many cards go to the call: the newest, oldest first. */
export const LIVE_PLANS_LISTED = 8;

const GO = /\s*Nothing starts until you press Start\.\s*/g;
/** A quote text without its "press Start" line (the call starts it by voice), on one line. */
const oneLine = (s: string) => s.replace(GO, ' ').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** The MP3 plan in words for the model: from where, as what, its size and rights. */
export function audioPlanWhat(q: AudioQuote): string {
  const rights = q.rights.status === 'licensed' ? `licensed${q.rights.license ? ` (${q.rights.license})` : ''}`
    : q.rights.status === 'own' ? 'the user\'s own upload' : 'unverified: starting confirms the file is the user\'s or licensed to them';
  return `the sound of ${q.source === 'file' ? 'the user\'s file' : q.host ?? 'the link'} as "${q.name}"`
    + `${q.bytes ? `, source ${formatBytes(q.bytes, 'en')}` : ''}, MP3 ${q.bitrateKbps} kbps, `
    + `${q.credits > 0 ? `${q.credits} credits` : 'free'}; rights ${rights}`;
}

type Card = { kind: LivePlanKind; phase: string; credits?: number; what: string };

function cardOf(m: LivePlanCards): Card | null {
  if (m.montage) {
    const c = m.montage;
    const what = c.quote ? oneLine(quoteText(c.quote, c.names, 'en')) : c.phase === 'reading' ? 'reading the clips and the track' : `a montage${c.error ? ` (${c.error})` : ''}`;
    return { kind: 'montage', phase: c.phase, what, ...(c.quote ? { credits: c.quote.credits } : {}) };
  }
  if (m.audioJob) {
    const c = m.audioJob;
    const what = c.quote ? audioPlanWhat(c.quote) : c.phase === 'checking' ? 'checking the source' : `an MP3${c.error ? ` (${c.error})` : ''}`;
    return { kind: 'audio', phase: c.phase, what, ...(c.quote ? { credits: c.quote.credits } : {}) };
  }
  if (m.editJob) {
    const c = m.editJob;
    const what = c.quote ? oneLine(editQuoteText(c.quote, 'en', c.source ?? 'file')) : c.phase === 'reading' ? 'reading the video' : `a video edit${c.error ? ` (${c.error})` : ''}`;
    return { kind: 'edit', phase: c.phase, what, ...(c.quote ? { credits: c.quote.credits } : {}) };
  }
  return null;
}

/** One card as the call reads it (null: the message has no Agent G card, or no id to name it by). */
export function livePlanOf(m: LivePlanCards): LivePlanState | null {
  if (!m.id) return null;
  const c = cardOf(m);
  if (!c) return null;
  // 'checking' / 'reading': the plan is still being made (nothing can start yet).
  const phase = c.phase === 'checking' || c.phase === 'reading' ? 'preparing' : c.phase;
  return { id: m.id, kind: c.kind, phase, what: c.what.slice(0, 300), ...(typeof c.credits === 'number' ? { credits: c.credits } : {}) };
}

/** The chat's Agent G cards for the call: the newest LIVE_PLANS_LISTED, oldest first (the order the call numbers new ones). */
export function livePlansOf(msgs: readonly LivePlanCards[], max = LIVE_PLANS_LISTED): LivePlanState[] {
  const out: LivePlanState[] = [];
  for (let i = msgs.length - 1; i >= 0 && out.length < max; i--) {
    const p = livePlanOf(msgs[i]!);
    if (p) out.push(p);
  }
  return out.reverse();
}

/**
 * A card waiting for a yes: its note for the call, and the key it is announced under (the card's id and its signed
 * plan: a plan quoted again — a changed request, ↻ — is a new plan and is announced again). null: not waiting.
 */
export function quotedPlanNote(m: LivePlanCards): { key: string; note: LiveResultNote } | null {
  const p = livePlanOf(m);
  if (!p || p.phase !== 'quoted') return null;
  const token = m.montage?.token ?? m.audioJob?.token ?? m.editJob?.token;
  if (!token) return null;
  return { key: `${p.id}:${token}`, note: { kind: 'plan', what: p.what, planId: p.id, planKind: p.kind } };
}

/**
 * What a studio start would run, as a short stable string: FNV-1a over the tool, the trimmed prompt and the price.
 * Not a secret and not a signature: two screens that would run the same thing give the same string.
 */
export function liveFingerprint(tool: string, prompt: string, price: number | undefined): string {
  const s = `${tool}\u0001${prompt.trim()}\u0001${typeof price === 'number' ? price : ''}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${tool}:${h.toString(16).padStart(8, '0')}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The MP3 plan an ask_agent_g run made: `{quote, request, token}` when it has that shape, else null. */
export function agentAudioPlanOf(raw: unknown): { quote: AudioQuote; request: unknown; token: string } | null {
  if (!isObj(raw) || !isObj(raw.quote) || !isObj(raw.request) || typeof raw.token !== 'string' || !raw.token) return null;
  const q = raw.quote;
  const rights = q.rights;
  if (typeof q.jobId !== 'string' || !q.jobId || typeof q.name !== 'string' || (q.source !== 'link' && q.source !== 'file')
    || typeof q.credits !== 'number' || typeof q.bitrateKbps !== 'number' || !isObj(rights)
    || (rights.status !== 'licensed' && rights.status !== 'own' && rights.status !== 'unverified')) return null;
  return { quote: q as unknown as AudioQuote, request: raw.request, token: raw.token };
}
