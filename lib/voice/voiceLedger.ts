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
 *   told        the model's own words, as the call's transcript of its voice streams them, and when each first named a
 *               price in credits. ⚠️ GG 2026-10-26 08:17Z: the model said "It'll cost you 5 credits. Shall we proceed?"
 *               BEFORE prepare_generation, the user said "Yes.", and only then the card (and the studio's price time)
 *               came: the yes was before it, so nothing started. A yes said after the model named exactly the card's
 *               price, just before the card, is a yes to that price (components/voice/live/liveActions judgeRun).
 */
import type { HeardUtterance } from './spokenYes';
import { LIVE_PLAN_MAX, type LivePlanKind } from './liveTools';

/** Closed utterances kept: a call's last few minutes of talk is all a yes can come from. */
export const HEARD_MAX = 30;
/** One utterance longer than this is cut (a monologue is never a yes anyway). */
export const HEARD_TEXT_MAX = 600;
/** The model's closed utterances kept: only the newest that named a price can be the price a yes answered. */
export const TOLD_MAX = 10;
/** A price the model named longer ago than this before the card is no price the user just said yes to. */
export const SPOKEN_PRICE_MAX_MS = 60_000;

const CREDIT_WORD = '(?:credits?|კრედიტ\\p{L}*|кредит\\p{L}*)';
/** Small amounts the model may say as words (ka / en / ru); larger ones come back from the transcription as digits. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20,
  'ერთი': 1, 'ორი': 2, 'სამი': 3, 'ოთხი': 4, 'ხუთი': 5, 'ექვსი': 6, 'შვიდი': 7, 'რვა': 8, 'ცხრა': 9, 'ათი': 10, 'ოცი': 20,
  'один': 1, 'одна': 1, 'одного': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7,
  'восемь': 8, 'девять': 9, 'десять': 10, 'двадцать': 20,
};
const AMOUNT = new RegExp(`(?<![\\p{N}.,])(\\p{N}{1,5}|\\p{L}+)\\s*-?\\s*${CREDIT_WORD}`, 'giu');

/** The credit amounts a sentence names ("It'll cost you 5 credits", „ხუთი კრედიტი", „4 кредита"), each once. */
export function creditAmounts(text: string): number[] {
  if (typeof text !== 'string') return [];
  const out = new Set<number>();
  for (const m of text.normalize('NFKC').toLowerCase().matchAll(AMOUNT)) {
    const w = m[1]!;
    const n = /^\p{N}+$/u.test(w) ? Number(w) : NUMBER_WORDS[w];
    if (typeof n === 'number' && Number.isFinite(n)) out.add(n);
  }
  return [...out];
}

/** One thing the model said: its words, and when they first named a credit amount (0 = they never did). */
interface ToldUtterance {
  text: string;
  pricedAt: number;
}

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
  /**
   * When the model itself named `credits` as the price, shortly before `before` (the card's price time): the newest of
   * its words that named any price, when that price was exactly `credits`. 0 when it named none, or another one.
   */
  pricedAt?: (credits: number, before: number) => number;
}

export interface VoiceLedger extends LiveVoicePort {
  /** The session's transcript stream. Returns the open utterance's text after it (null once closed). */
  hear: (e: LiveHeardEvent) => string | null;
  /** A plan card reached the call (its [App] note is queued): its number. Re-registering keeps the number. */
  registerPlan: (id: string, kind: LivePlanKind, what?: string) => number;
  /** Its [App] note was sent to the model now. */
  planTold: (id: string) => void;
  /** The model's own words as the call's transcript streams them (cumulative), or that its turn closed. */
  tell: (e: LiveHeardEvent) => void;
}

export function createVoiceLedger(clock: () => number = () => Date.now()): VoiceLedger {
  let closed: HeardUtterance[] = [];
  let open: HeardUtterance | null = null;
  let studio: StudioQuote = { at: 0 };
  const plans = new Map<string, LivePlanEntry>();
  let nextN = 1;
  let told: ToldUtterance[] = [];
  let telling: ToldUtterance | null = null;

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
    tell: (e) => {
      if ('end' in e) {
        if (telling && telling.text.trim()) told = [...told, telling].slice(-TOLD_MAX);
        telling = null;
        return;
      }
      const text = typeof e.text === 'string' ? e.text.slice(0, HEARD_TEXT_MAX) : '';
      if (!text.trim()) return;
      const pricedAt = telling?.pricedAt || (creditAmounts(text).length ? clock() : 0);
      telling = { text, pricedAt };
    },
    pricedAt: (credits, before) => {
      const all = telling ? [...told, telling] : told;
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const u = all[i]!;
        if (!u.pricedAt || u.pricedAt >= before) continue;
        if (before - u.pricedAt > SPOKEN_PRICE_MAX_MS) return 0;
        const named = creditAmounts(u.text);
        return named.length === 1 && named[0] === credits ? u.pricedAt : 0;
      }
      return 0;
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
