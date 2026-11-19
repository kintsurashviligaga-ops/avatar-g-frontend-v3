/**
 * lib/chat/turnMeta.ts — what a saved chat turn holds beyond its words, in `chat_messages.metadata` (the column the durable
 * history migration 20260801 added for exactly this: „so a resumed transcript restores pictures, not just text"). Pure: no
 * DOM, no network.
 *
 * ⚠️ WHY. The owner, 2026-10-11, on the computer, opening from History a chat run on the iPhone: „the conversation does
 * not show, nor the whole process that was done; it should be like your chat, where nothing is lost and everything shows
 * when a chat is opened from History". The server kept the WORDS of a turn only: the files a turn sent and Agent G's card
 * (its plan, its steps, the finished video) lived in the phone's own storage, so another device saw a lone question.
 * A user turn now saves its files' records, and an Agent G card is saved as one row that follows the card from its plan
 * to its result; a device opening the chat reads them back, and a card still running is followed to its job by id.
 *
 * ⚠️ AND THE RESULTS THEMSELVES (GG 2026-10-26 20:14Z „გაასწორე", on „a chat opened again shows no videos, though the Library
 * has them all"). A delivered clip, picture or song is a bubble with no words and no card, so neither the words nor the
 * card rows ever carried it: the chat opened from History or on another device showed the question and nothing after it.
 * Such a bubble is now one row of its own (resultRowText, its links in the metadata), read back as the same bubble, and a
 * clip Omni made keeps its job id, so „გააგრძელე" in the chat opened again continues THAT clip instead of making a new one.
 *
 * What is read back is the owner's own data, but it is still checked shape by shape: anything malformed is dropped.
 */
import { readAttachedFiles, type AttachedFile } from './attachedFiles';

export const TURN_META_VERSION = 1;
/** A saved turn's metadata stays small: a card with a long plan still fits, anything bigger keeps its words and links only. */
export const TURN_META_MAX_CHARS = 48_000;

const CARD_PHASES = {
  montage: ['reading', 'quoted', 'running', 'done', 'failed', 'cancelled', 'dismissed'],
  audioJob: ['checking', 'quoted', 'running', 'done', 'failed', 'cancelled', 'dismissed'],
  editJob: ['reading', 'quoted', 'running', 'done', 'failed', 'cancelled', 'dismissed'],
  runJob: ['reading', 'planned', 'running', 'ended', 'failed', 'dismissed'],
} as const;
type CardKey = keyof typeof CARD_PHASES;
const CARD_KEYS = Object.keys(CARD_PHASES) as CardKey[];
const URL_KEYS = ['imageUrl', 'videoUrl', 'audioUrl', 'coverUrl', 'glbUrl', 'docUrl'] as const;
const TEXT_KEYS = ['audioName', 'audioInfo', 'editName', 'orientation', 'docName', 'docInfo', 'docPath'] as const;

/** The fields of a (lean) chat message this module saves and restores. */
export interface TurnLike {
  id?: string;
  files?: AttachedFile[];
  montage?: unknown;
  audioJob?: unknown;
  editJob?: unknown;
  runJob?: unknown;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  coverUrl?: string;
  glbUrl?: string;
  /** A PDF Agent G wrote (app/api/documents/create): its signed link, its file name, its facts (pages · size). */
  docUrl?: string;
  docName?: string;
  docInfo?: string;
  /** Its storage path: the card opens it through /api/documents/file, which checks the owner and signs a fresh link. */
  docPath?: string;
  audioName?: string;
  audioInfo?: string;
  editName?: string;
  orientation?: string;
  noRetry?: boolean;
  /** A clip Omni made: its signed job id (lib/video/omniEdit omniSourceOfJob). The server checks it on every use. */
  omniJob?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isHttps = (v: unknown): v is string => typeof v === 'string' && v.length <= 4_000 && /^https:\/\/[^\s"'<>]+$/i.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,80}$/.test(v);
const isJobId = (v: unknown): v is string => typeof v === 'string' && v.length <= 4_000 && /^[^\s"'<>\\]+$/.test(v);

/** Does this message carry an Agent G card? */
export function hasCard(m: TurnLike): boolean {
  return CARD_KEYS.some((k) => m[k] !== undefined);
}

const RESULT_KEYS = ['videoUrl', 'imageUrl', 'audioUrl', 'glbUrl', 'docUrl'] as const;
const resultKeyOf = (m: TurnLike) => RESULT_KEYS.find((k) => isHttps(m[k]));
/** A delivered result's link (the clip, the picture, the song, the 3D model, the PDF), or null. Its cover is not one: it goes with its song. */
export function resultUrlOf(m: TurnLike): string | null {
  const k = resultKeyOf(m);
  return k ? (m[k] as string) : null;
}

/** A reply that IS a result (no Agent G card): saved as its own row when it lands, read back as the same bubble. */
export function isResultTurn(m: TurnLike & { role?: string }): boolean {
  return m.role === 'assistant' && !hasCard(m) && resultUrlOf(m) !== null;
}

/**
 * The words a result's row is saved with: the bubble's own, or a short mark of what it is. A row needs words, and these
 * are what a voice call opened from the chat reads (lib/voice/liveThread): „You: [video]" tells it a clip was made.
 */
const RESULT_MARK: Record<(typeof RESULT_KEYS)[number], string> = {
  videoUrl: '[video]', imageUrl: '[image]', audioUrl: '[audio]', glbUrl: '[3D model]', docUrl: '[PDF]',
};
export function resultRowText(m: TurnLike & { text?: string }): string {
  const k = resultKeyOf(m);
  return (m.text ?? '').trim() || (k ? RESULT_MARK[k] : '…');
}

/** A saved row's words as its bubble shows them: the mark a wordless result or card was saved with is no words at all. */
export function savedTurnText(content: string, meta: TurnLike): string {
  const card = hasCard(meta);
  const k = resultKeyOf(meta);
  if (content === '…' && (card || k)) return '';
  return !card && k && content === RESULT_MARK[k] ? '' : content;
}

/** When a result's saved row must be rewritten: its words or what it holds changed (a film's scene shot again, a cover). */
export function resultSignature(m: TurnLike & { text?: string }): string {
  return `${resultRowText(m)}\n${JSON.stringify(turnMetaOf(m))}`;
}

/**
 * A (lean) message's metadata row, or null when it holds nothing beyond its words. A card's metadata carries the card's
 * id too, so the device that reads it back patches and follows the same card.
 */
export function turnMetaOf(m: TurnLike): Record<string, unknown> | null {
  const out: Record<string, unknown> = { v: TURN_META_VERSION };
  if (m.files?.length) out.files = m.files.slice(0, 16);
  const card = hasCard(m);
  if (card && isId(m.id)) out.id = m.id;
  for (const k of CARD_KEYS) if (m[k] !== undefined) out[k] = m[k];
  for (const k of URL_KEYS) if (isHttps(m[k])) out[k] = m[k];
  for (const k of TEXT_KEYS) if (typeof m[k] === 'string' && m[k]) out[k] = (m[k] as string).slice(0, 300);
  if (isJobId(m.omniJob)) out.omniJob = m.omniJob;
  if (m.noRetry) out.noRetry = true;
  if (Object.keys(out).length === 1) return null;
  if (JSON.stringify(out).length <= TURN_META_MAX_CHARS) return out;
  // Too big to keep whole: the card goes, the files and the links stay (a reopened chat still shows the result).
  for (const k of CARD_KEYS) delete out[k];
  delete out.id;
  return Object.keys(out).length > 1 && JSON.stringify(out).length <= TURN_META_MAX_CHARS ? out : null;
}

/** A saved turn's metadata read back into message fields; anything malformed is dropped, an unknown version is ignored. */
export function readTurnMeta(raw: unknown): TurnLike {
  if (!isObj(raw) || raw.v !== TURN_META_VERSION) return {};
  const out: TurnLike = {};
  const files = readAttachedFiles(raw.files);
  if (files?.length) out.files = files;
  let card = false;
  for (const k of CARD_KEYS) {
    const c = raw[k];
    if (isObj(c) && typeof c.phase === 'string' && (CARD_PHASES[k] as readonly string[]).includes(c.phase)) {
      out[k] = c;
      card = true;
    }
  }
  if (card && isId(raw.id)) out.id = raw.id;
  // A card without its id can be shown but not patched or followed: it is dropped rather than left spinning.
  if (card && !out.id) for (const k of CARD_KEYS) delete out[k];
  for (const k of URL_KEYS) if (isHttps(raw[k])) out[k] = raw[k] as string;
  for (const k of TEXT_KEYS) if (typeof raw[k] === 'string' && raw[k]) out[k] = (raw[k] as string).slice(0, 300);
  if (isJobId(raw.omniJob)) out.omniJob = raw.omniJob;
  if (raw.noRetry === true) out.noRetry = true;
  return out;
}

/**
 * When a card's saved row must be rewritten: its phase, and once it is no longer running its words and result. Progress
 * (the percent, the stage, the clock) is left out on purpose: a montage would otherwise write its row every few seconds.
 */
export function cardSignature(m: TurnLike & { text?: string }): string {
  for (const k of CARD_KEYS) {
    const c = m[k];
    if (!isObj(c)) continue;
    const phase = String(c.phase ?? '');
    if (phase === 'running') return `${k}:running:${String((c as { runId?: unknown }).runId ?? '')}`;
    return `${k}:${phase}:${m.text ?? ''}:${m.videoUrl ?? ''}:${m.audioUrl ?? ''}`;
  }
  return '';
}

// ── a chat opened again: what the other device added ─────────────────────────────────────────────────────────────────

/** A message as the merge reads it (a chat Msg has all of these). */
export interface MergeTurn extends TurnLike {
  role: 'user' | 'assistant';
  text: string;
  cloudRowId?: string;
}

const ENDED = new Set(['done', 'failed', 'cancelled', 'dismissed', 'ended']);
const phaseOf = (m: TurnLike): string | undefined => {
  for (const k of CARD_KEYS) {
    const c = m[k];
    if (isObj(c) && typeof c.phase === 'string') return c.phase;
  }
  return undefined;
};
const keyOf = (m: MergeTurn): string => (hasCard(m) && m.id ? `card:${m.id}`
  : isResultTurn(m) ? `result:${resultUrlOf(m)}` : `${m.role}:${m.text.trim()}`);

/**
 * A chat this device already holds, brought up to date with the account's saved copy (`server`, oldest first): a card
 * that ended elsewhere takes its end, and what another device added after the last turn both copies share is put at the
 * end. Nothing this device holds is dropped (its own results, notices and files stay).
 *
 * The copies are lined up on what is saved word for word: the user's turns, the cards (by id) and the results (by their
 * link: a wordless clip would otherwise read as every other wordless clip). A reply's saved words
 * can differ from its bubble (a routing block is saved cleaned), so replies are never what the copies are lined up on:
 * the replies after the last shared turn come in only when this device has no reply there yet. Copies that share no
 * turn at all are left as this device has them (there is no telling where the saved one belongs); an empty one takes
 * the saved copy whole. Returns `local` itself when nothing changed.
 */
export function mergeServerTurns<M extends MergeTurn>(local: M[], server: M[]): M[] {
  if (!server.length) return local;
  if (!local.length) return [...server];
  const at = new Map<string, number>();
  local.forEach((m, i) => { const k = keyOf(m); if (!at.has(k)) at.set(k, i); });
  let out = local;
  const edit = (i: number, m: M) => {
    if (out === local) out = [...local];
    out[i] = m;
  };
  for (const s of server) {
    if (isResultTurn(s)) {
      // The same result here: it takes its row, so a change to it here rewrites that row instead of saving another.
      const r = at.get(keyOf(s));
      if (r !== undefined && !out[r]!.cloudRowId && s.cloudRowId) edit(r, { ...out[r]!, cloudRowId: s.cloudRowId });
      continue;
    }
    if (!hasCard(s) || !s.id) continue;
    const i = at.get(`card:${s.id}`);
    if (i === undefined) continue;
    const l = out[i]!;
    const lp = phaseOf(l);
    const sp = phaseOf(s);
    if (sp && ENDED.has(sp) && !(lp && ENDED.has(lp))) edit(i, { ...l, ...s });
    else if (!l.cloudRowId && s.cloudRowId) edit(i, { ...l, cloudRowId: s.cloudRowId });
  }
  const stable = (m: MergeTurn) => m.role === 'user' || (hasCard(m) && !!m.id) || isResultTurn(m);
  let j = -1;
  server.forEach((s, k) => { if (stable(s) && at.has(keyOf(s))) j = k; });
  if (j < 0) return out;
  const i = at.get(keyOf(server[j]!))!;
  const tail = server.slice(j + 1);
  const answeredHere = out.slice(i + 1).some((m) => m.role === 'assistant');
  const firstNew = tail.findIndex((s) => stable(s) && !at.has(keyOf(s)));
  const from = answeredHere ? (firstNew < 0 ? tail.length : firstNew) : 0;
  const added = tail.slice(from).filter((s) => !at.has(keyOf(s)));
  return added.length ? [...out, ...added] : out;
}
