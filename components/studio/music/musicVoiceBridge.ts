/**
 * components/studio/music/musicVoiceBridge.ts — Music Studio's cards as Agent G and Live Voice reach them.
 *
 * Every mounted MusicStudioCard registers a handle here (its state, Cancel, edit words, download). The studio's live
 * listener (OmniStudio, `music_studio` action of lib/voice/liveTools) answers a call through `handleMusicVoice`, and the
 * card's own edit box joins tracks through `joinNewestTracks` — one implementation for a tap, a typed word and a word
 * spoken in a call.
 *
 * ⚠️ THE MONEY RULE. Nothing here can start a paid render. `plan` only puts a plan card on screen (the server prices it;
 * nothing is charged); the card's Create button — the user's own authenticated tap — is the only way a Music Studio
 * job starts. Edits, joins and downloads are free (ffmpeg). Cancel only ever returns credits.
 */
import type { MusicRequest } from '@/lib/music/studio/contracts';
import { editCall, type MusicEditResult, type Refusal } from '@/lib/music/studio/client';

export type MusicCardPhase = 'pricing' | 'quoted' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'refused';

export interface MusicCardSnapshot {
  draftId: string;
  phase: MusicCardPhase;
  prompt: string;
  mode: MusicRequest['mode'];
  /** The quoted price (shown on the Create button). */
  credits?: number;
  /** The job's named stage while it runs (never a percentage). */
  stage?: string;
  jobId?: string;
  /** The server's sentence when it refused or failed. */
  message?: string;
  /** Completed tracks of this card, oldest first: the original, then each edit / join version. */
  tracks: Array<{ jobId: string; url: string; durationSec: number; label: string }>;
  /** An edit or join is running on this card. */
  busy: boolean;
}

export interface MusicCardHandle {
  draftId: string;
  mountedAt: number;
  snapshot(): MusicCardSnapshot;
  cancel(): Promise<boolean>;
  /** Apply Agent G edit words ("first 20 seconds", "fade out 3s", "as wav") to this card's newest track. */
  edit(text: string): Promise<{ ok: boolean; message?: string }>;
  /** A version made elsewhere (a join of tracks from several cards) is shown under this card. */
  addVersion(v: { jobId: string; url: string; durationSec: number; label: string }): void;
  /** Download the newest track of this card. */
  download(): boolean;
}

const cards = new Map<string, MusicCardHandle>();
let seq = 0;

export function registerMusicCard(h: Omit<MusicCardHandle, 'mountedAt'>): () => void {
  const handle: MusicCardHandle = { ...h, mountedAt: ++seq };
  cards.set(h.draftId, handle);
  return () => { if (cards.get(h.draftId) === handle) cards.delete(h.draftId); };
}

/** Newest card first. */
export function musicCards(): MusicCardHandle[] {
  return [...cards.values()].sort((a, b) => b.mountedAt - a.mountedAt);
}

/** Every completed track on screen, newest first (a card's versions before its original). */
export function newestTracks(): Array<{ jobId: string; url: string; durationSec: number; label: string; draftId: string }> {
  const out: Array<{ jobId: string; url: string; durationSec: number; label: string; draftId: string }> = [];
  for (const c of musicCards()) {
    const s = c.snapshot();
    for (const t of [...s.tracks].reverse()) out.push({ ...t, draftId: c.draftId });
  }
  return out;
}

/**
 * Join the `count` newest tracks on screen (oldest of them first), optionally crossfaded. The result is a NEW Library
 * version shown under the newest card; no source changes. Free.
 */
export async function joinNewestTracks(
  opts: { count?: number; crossfadeSec?: number; format?: 'mp3' | 'wav' | 'm4a'; locale: 'ka' | 'en' | 'ru' },
  io: { edit?: (body: Record<string, unknown>) => Promise<MusicEditResult | Refusal> } = {},
): Promise<{ ok: true; version: MusicEditResult } | { ok: false; code: string; message: string }> {
  const count = Math.min(6, Math.max(2, Math.round(opts.count ?? 2)));
  const tracks = newestTracks();
  const unique = tracks.filter((t, i) => tracks.findIndex((x) => x.jobId === t.jobId) === i);
  if (unique.length < 2) return { ok: false, code: 'need_two_tracks', message: 'Joining needs two finished tracks on screen.' };
  const picked = unique.slice(0, count).reverse();
  const crossfadeSec = Math.min(10, Math.max(0, opts.crossfadeSec ?? 0));
  const r = await (io.edit ?? editCall)({ v: 1, sources: picked.map((t) => t.jobId), ops: [], crossfadeSec, format: opts.format ?? 'mp3', locale: opts.locale });
  if (!r.ok) return { ok: false, code: r.code, message: r.message ?? 'The join failed. The tracks are unchanged.' };
  const host = cards.get(unique[0]!.draftId);
  host?.addVersion({ jobId: r.jobId, url: r.url, durationSec: r.durationSec, label: r.label });
  return { ok: true, version: r };
}

// ── the call's side ─────────────────────────────────────────────────────────────────────────────────────────────

export type MusicVoiceOp = 'plan' | 'edit' | 'join' | 'status' | 'cancel' | 'download' | 'save';

export interface MusicVoiceAction {
  action: MusicVoiceOp;
  prompt?: string;
  mode?: 'instrumental' | 'song';
  genre?: string;
  mood?: string;
  tempo?: 'slow' | 'medium' | 'fast';
  bpm?: number;
  lyrics?: string;
  lyricsLanguage?: 'ka' | 'en' | 'ru';
  vocalGender?: 'female' | 'male' | 'duet';
  /** edit: the user's own words, parsed by the same parser as the card's edit box (/api/music/studio/commands). */
  command?: string;
  /** join: how many of the newest tracks (2–6) and the crossfade. */
  count?: number;
  crossfadeSec?: number;
  format?: 'mp3' | 'wav' | 'm4a';
}

export interface MusicVoiceReply { ok: boolean; error?: string; message: string; state?: Record<string, unknown> }

/** How long a second `plan` with the same words is the same request (a repeated tool call, not a new song). */
export const PLAN_DEDUPE_MS = 20_000;
let lastPlan: { key: string; at: number; draftId: string } | null = null;

export function resetMusicVoiceForTests(): void {
  cards.clear();
  lastPlan = null;
  seq = 0;
}

const describe = (s: MusicCardSnapshot) => ({
  phase: s.phase, prompt: s.prompt.slice(0, 120), mode: s.mode,
  ...(typeof s.credits === 'number' ? { credits: s.credits } : {}),
  ...(s.stage ? { stage: s.stage } : {}),
  ...(s.message ? { message: s.message.slice(0, 200) } : {}),
  tracks: s.tracks.length, busy: s.busy,
});

/**
 * Answer one validated `music_studio` call. Synchronous (the call reads `reply` straight after dispatch): slow work
 * (an edit, a join, a cancel) starts here and its outcome reaches the call as an [App] note from the card.
 */
export function handleMusicVoice(
  a: MusicVoiceAction,
  ctx: { locale: 'ka' | 'en' | 'ru'; addDraft: (request: MusicRequest) => string; now?: () => number; note?: (what: string) => void },
): MusicVoiceReply {
  const now = (ctx.now ?? Date.now)();
  const list = musicCards();
  switch (a.action) {
    case 'plan': {
      const prompt = (a.prompt ?? '').trim();
      if (!prompt) return { ok: false, error: 'no_prompt', message: 'Say what the music should be (a short description) first.' };
      const mode = a.mode ?? 'instrumental';
      const lyrics = mode === 'song' ? a.lyrics?.trim() : undefined;
      const request: MusicRequest = {
        v: 1, prompt: prompt.slice(0, 2000), mode,
        ...(a.genre ? { genre: a.genre } : {}), ...(a.mood ? { mood: a.mood } : {}),
        ...(a.bpm ? { bpm: a.bpm } : a.tempo ? { tempo: a.tempo } : {}),
        ...(mode === 'song' && a.vocalGender ? { vocalGender: a.vocalGender } : {}),
        // The contract refuses a lyrics language without lyrics; a song without lyrics lets the model write them.
        ...(lyrics ? { lyrics: lyrics.slice(0, 3000), ...(a.lyricsLanguage ? { lyricsLanguage: a.lyricsLanguage } : {}) } : {}),
        modelId: 'lyria-3-clip-preview', durationSec: 30, locale: ctx.locale,
      };
      const key = JSON.stringify(request);
      if (lastPlan && lastPlan.key === key && now - lastPlan.at < PLAN_DEDUPE_MS && cards.has(lastPlan.draftId)) {
        return { ok: true, message: 'That plan card is already on screen; no second card was made. Read its price with action "status".' };
      }
      const draftId = ctx.addDraft(request);
      lastPlan = { key, at: now, draftId };
      return {
        ok: true,
        message: (mode === 'song'
          ? 'A song plan card is on screen and is being priced. Sung vocals may not be available yet: if the card refuses, say so plainly — never offer an instrumental as if it were the song. '
          : 'The plan card is on screen and is being priced (about 30 seconds of music). ')
          + 'Nothing is charged by you: the user starts it only by tapping Create on the card, which shows the exact credits. '
          + 'Tell them the price once the card shows it (action "status"), and ask them to tap Create.',
      };
    }
    case 'status': {
      if (!list.length) return { ok: true, message: 'There is no Music Studio card in this chat.', state: { cards: [] } };
      return { ok: true, message: 'Music Studio cards, newest first. A "quoted" card waits for the user\'s tap on Create.', state: { cards: list.slice(0, 6).map((c) => describe(c.snapshot())) } };
    }
    case 'cancel': {
      const running = list.find((c) => ['running', 'starting'].includes(c.snapshot().phase));
      if (!running) return { ok: false, error: 'nothing_running', message: 'No music is being made right now.' };
      void running.cancel().then((ok) => ctx.note?.(ok ? 'The music job was cancelled; its reserved credits are returned.' : 'The music job could not be cancelled (it may have just finished).'));
      return { ok: true, message: 'Cancelling the music job; reserved credits are returned automatically. You will get an [App] note.' };
    }
    case 'edit': {
      const target = list.find((c) => c.snapshot().tracks.length > 0);
      if (!target) return { ok: false, error: 'no_track', message: 'There is no finished track to edit yet.' };
      if (target.snapshot().busy) return { ok: false, error: 'busy', message: 'An edit is already running on that track; wait for it.' };
      const words = (a.command ?? '').trim();
      if (!words) return { ok: false, error: 'no_command', message: 'Say the edit: e.g. "first 20 seconds", "fade out 3 seconds", "quieter by 6 dB", "as WAV".' };
      void target.edit(words).then((r) => ctx.note?.(r.ok ? 'The edited version is ready under the original (free; the original is unchanged).' : `The edit was not made: ${r.message ?? 'it failed'}.`));
      return { ok: true, message: 'Editing the newest track (free). The original stays; the new version appears under it. You will get an [App] note.' };
    }
    case 'join': {
      if (newestTracks().length < 2) return { ok: false, error: 'need_two_tracks', message: 'Joining needs two finished tracks on screen.' };
      if (list.some((c) => c.snapshot().busy)) return { ok: false, error: 'busy', message: 'An edit is already running; wait for it.' };
      void joinNewestTracks({ count: a.count, crossfadeSec: a.crossfadeSec, format: a.format, locale: ctx.locale })
        .then((r) => ctx.note?.(r.ok ? `The joined track is ready (${Math.round(r.version.durationSec)} s, free).` : `The join was not made: ${r.message}`));
      return { ok: true, message: `Joining the ${Math.min(6, Math.max(2, a.count ?? 2))} newest tracks${a.crossfadeSec ? ` with a ${a.crossfadeSec} s crossfade` : ''} (free). You will get an [App] note.` };
    }
    case 'download': {
      const target = list.find((c) => c.snapshot().tracks.length > 0);
      if (!target) return { ok: false, error: 'no_track', message: 'There is no finished track to download yet.' };
      return target.download() ? { ok: true, message: 'The download of the newest track started.' } : { ok: false, error: 'download_failed', message: 'The download could not start; ask the user to tap Download.' };
    }
    case 'save': {
      const has = list.some((c) => c.snapshot().tracks.length > 0);
      return has
        ? { ok: true, message: 'Every Music Studio track and version is already saved in the user\'s Library; nothing else is needed.' }
        : { ok: false, error: 'no_track', message: 'There is no finished track yet; it is saved to the Library automatically when it is made.' };
    }
    default:
      return { ok: false, error: 'unknown_action', message: 'Unknown Music Studio action.' };
  }
}
