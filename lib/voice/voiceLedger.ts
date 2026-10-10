/**
 * lib/voice/voiceLedger.ts — what a Live call knows about the user's yes: the user's own words as the call heard them,
 * when the studio's price was told, and Agent G's plans by number. Pure and isomorphic; one ledger per call
 * (components/voice/live/liveActions useLiveActions keeps it), unit-tested without React.
 *
 * Why it exists (Agent G Master Task PART 4, "a voice yes is the user's, never the model's"): Gemini Live hears the
 * user, but the browser never sees the audio, only the input transcription the session streams back. A start
 * (start_generation, extract_audio start, agent_task start) runs only when THESE words, said after the price or plan
 * was told, are a clear yes (lib/voice/spokenYes judgeSince). The model's function call says it heard a yes; the ledger
 * is what the user actually said.
 *
 *   heard       the user's utterances, oldest first. One utterance = one exchange of the session (useGeminiLiveSession
 *               closes it at turnComplete / interrupted); its time is when its first words arrived.
 *   studio      when the studio's current price was told: prepare_generation / update_settings set it, get_screen_state
 *               sets it only when none is set or what is on screen changed (its fingerprint) — so the "get_screen_state
 *               before start_generation" the rule asks for never makes a yes said just before it not count.
 *   plans       Agent G's cards the call heard of, numbered 1, 2, 3 … in the order heard. A plan's time is when the call
 *               TOLD the model about it (the [App] note was sent, or status listed it): a yes before that is not its yes.
 */
import type { HeardUtterance } from './spokenYes';
import { LIVE_PLAN_MAX, type LivePlanKind } from './liveTools';

/** Closed utterances kept: a call's last few minutes of talk is all a yes can come from. */
export const HEARD_MAX = 30;
/** One utterance longer than this is cut (a monologue is never a yes anyway). */
export const HEARD_TEXT_MAX = 600;

/** What the session reports: the open utterance's words so far (cumulative), or that the exchange closed. */
export type LiveHeardEvent = { text: string } | { end: true };

export interface LivePlanEntry {
  id: string;
  kind: LivePlanKind;
  /** The call's number for it (1 = the first plan heard of in this call). */
  n: number;
  /** When it was told to the model (0 = not yet: a yes cannot count for it). */
  at: number;
  what?: string;
}

export interface StudioQuote {
  /** When the price on screen was told (0 = never in this call). */
  at: number;
  fingerprint?: string;
}

/** The ledger as the executor reads and writes it (components/voice/live/liveActions LiveActionEnv.voice). */
export interface LiveVoicePort {
  now: () => number;
  /** The user's words in this call, oldest first (the open utterance last). */
  heard: () => HeardUtterance[];
  studioQuote: () => StudioQuote;
  /** The price on screen was told now. `force`: always (a fresh prepare); else only when none or it changed. */
  quoteStudio: (fingerprint: string | undefined, force: boolean) => void;
  /** Plan `n`, or the newest (of `kind`, when given). */
  plan: (n?: number, kind?: LivePlanKind) => LivePlanEntry | null;
  /** The studio listed these cards (get_screen_state, agent_task status): number the new ones, and they are told now. */
  seePlans: (plans: ReadonlyArray<{ id: string; kind: LivePlanKind; quoted: boolean; what?: string }>) => LivePlanEntry[];
}

export interface VoiceLedger extends LiveVoicePort {
  /** The session's transcript stream. Returns the open utterance's text after it (null once closed). */
  hear: (e: LiveHeardEvent) => string | null;
  /** A plan card reached the call (its [App] note is queued): its number. Re-registering keeps the number. */
  registerPlan: (id: string, kind: LivePlanKind, what?: string) => number;
  /** Its [App] note was sent to the model now. */
  planTold: (id: string) => void;
}

export function createVoiceLedger(clock: () => number = () => Date.now()): VoiceLedger {
  let closed: HeardUtterance[] = [];
  let open: HeardUtterance | null = null;
  let studio: StudioQuote = { at: 0 };
  const plans = new Map<string, LivePlanEntry>();
  let nextN = 1;

  const close = () => {
    if (open && open.text.trim()) closed = [...closed, open].slice(-HEARD_MAX);
    open = null;
  };

  const register = (id: string, kind: LivePlanKind, what?: string): LivePlanEntry | null => {
    const had = plans.get(id);
    if (had) {
      if (what) had.what = what;
      return had;
    }
    if (nextN > LIVE_PLAN_MAX) return null;
    const entry: LivePlanEntry = { id, kind, n: nextN++, at: 0, ...(what ? { what } : {}) };
    plans.set(id, entry);
    return entry;
  };

  return {
    now: clock,
    heard: () => (open ? [...closed, open] : [...closed]),
    hear: (e) => {
      if ('end' in e) { close(); return null; }
      const text = typeof e.text === 'string' ? e.text.slice(0, HEARD_TEXT_MAX) : '';
      if (!text.trim()) return open?.text ?? null;
      open = { text, at: open?.at ?? clock() };
      return text;
    },
    studioQuote: () => studio,
    quoteStudio: (fingerprint, force) => {
      if (!force && studio.at && studio.fingerprint === fingerprint) return;
      studio = { at: clock(), ...(fingerprint ? { fingerprint } : {}) };
    },
    registerPlan: (id, kind, what) => register(id, kind, what)?.n ?? 0,
    planTold: (id) => {
      const p = plans.get(id);
      if (p) p.at = clock();
    },
    plan: (n, kind) => {
      if (typeof n === 'number') {
        for (const p of plans.values()) if (p.n === n) return p;
        return null;
      }
      let best: LivePlanEntry | null = null;
      for (const p of plans.values()) if ((!kind || p.kind === kind) && (!best || p.n > best.n)) best = p;
      return best;
    },
    seePlans: (list) => {
      const out: LivePlanEntry[] = [];
      for (const item of list) {
        const p = register(item.id, item.kind, item.what);
        if (!p) continue;
        // Listed to the model now: a plan waiting for a yes is told by this answer (unless an [App] note already told it).
        if (item.quoted && !p.at) p.at = clock();
        out.push(p);
      }
      return out;
    },
  };
}
