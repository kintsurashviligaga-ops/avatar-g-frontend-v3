/**
 * components/studio/montage/voiceCommands.ts — how a voice call (or any other host) drives an OPEN Montage.
 *
 * „Make music, trim it in Montage, then put it on the video we generate": the call opens the editor with the song and
 * the clips (MontageStudio `initialMusic` / `initialMedia` / `initialAspect`), then talks to it through ONE window
 * event while it is mounted:
 *
 *   const reply = sendMontageCommand({ command: 'set_music_start', sec: 42 });
 *   // null → no Montage is open · otherwise reply.ok / reply.error / reply.message / reply.state
 *
 * The contract mirrors lib/voice/liveTools `LiveStudioReply`: the event is CANCELABLE; the editor fills
 * `detail.reply` SYNCHRONOUSLY inside its listener and calls `preventDefault()` as the receipt. A receipt with
 * `ok: false` still means "Montage is open and answered" — the error says why it did not act.
 *
 *   export           starts exactly what the Export button does (free, local ffmpeg) — or `blocked` (uploads still
 *                    running, no clips, …) / `busy` (an export is already running), with an English sentence.
 *   set_music_start  moves where the song starts, clamped to the track, as ONE undo step.
 *   state            what is on the timeline.
 *
 * Messages are English, for the model — it answers the user in their own language.
 */
import { MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';
import { fmtClock } from './copy';
import { blockers as blockersOf, exportDurationSec, type Blocker, type Edit, type MediaSource } from './project';

export const MONTAGE_COMMAND_EVENT = 'myavatar:montage-command';

export type MontageCommand =
  | { command: 'export' }
  | { command: 'set_music_start'; sec: number }
  | { command: 'state' };

export interface MontageCommandState {
  /** Clips on the timeline. */
  clips: number;
  /** Length of the video Export would produce, seconds (crossfades overlap, so ≤ the sum of the clips). */
  durationSec: number;
  hasMusic: boolean;
  /** Where the song starts, seconds (0 without music). */
  musicStartSec: number;
  /** '9:16' | '16:9' | '1:1'. */
  aspect: string;
  /** An export is running right now. */
  exporting: boolean;
  /** Why Export cannot run yet, in the order to fix them: 'empty' | 'uploading' | 'failed' | 'tooLong' | 'musicUploading' | 'musicFailed'. */
  blockers: string[];
}

export type MontageCommandError = 'blocked' | 'busy' | 'no_music' | 'invalid_args' | 'unknown_command' | 'failed';

export interface MontageCommandReply {
  ok: boolean;
  error?: MontageCommandError | string;
  /** English, for the model. */
  message?: string;
  state?: MontageCommandState;
}

/** The event detail: the command, plus `reply`, which the editor writes while it handles the event. */
export type MontageCommandDetail = MontageCommand & { reply?: MontageCommandReply };

/** What the editor lends the handler — read at the moment the event fires, never a stale render's copy. */
export interface MontageCommandHost {
  edit: () => Edit;
  sources: () => Record<string, MediaSource>;
  exporting: () => boolean;
  /** Exactly what the Export button runs. Only called once `blockers` is empty and nothing is exporting. */
  startExport: () => void;
  /** Applies the start (clamped to the track, one undo step) and returns the start actually applied. */
  setMusicStart: (sec: number) => number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One blocker, in English for the model. */
export function blockerSentence(b: Blocker): string {
  switch (b.kind) {
    case 'empty': return 'there are no clips on the timeline yet';
    case 'uploading': return `${plural(b.count, 'file is', 'files are')} still uploading`;
    case 'failed': return `${plural(b.count, 'file', 'files')} failed to upload (signing in and retrying the clip fixes a signed-out upload)`;
    case 'tooLong': return `the edit is ${Math.round(b.totalSec)} s, over the ${MAX_TOTAL_SEC} s limit`;
    case 'musicUploading': return 'the music is still uploading';
    case 'musicFailed': return 'the music failed to upload';
  }
}

export function montageCommandState(edit: Edit, sources: Record<string, MediaSource>, exporting: boolean): MontageCommandState {
  const hasMusic = Boolean(edit.musicId && sources[edit.musicId]);
  return {
    clips: edit.clips.length,
    durationSec: Math.round(exportDurationSec(edit, sources) * 10) / 10,
    hasMusic,
    musicStartSec: hasMusic ? edit.musicStartSec : 0,
    aspect: edit.aspect,
    exporting,
    blockers: blockersOf(edit, sources).map((b) => b.kind),
  };
}

/** The whole command surface, as a function of the host: pure enough to test without rendering the editor. */
export function handleMontageCommand(detail: unknown, host: MontageCommandHost): MontageCommandReply {
  const d = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
  const state = () => montageCommandState(host.edit(), host.sources(), host.exporting());
  switch (d.command) {
    case 'state':
      return { ok: true, state: state() };

    case 'export': {
      const before = state();
      if (before.exporting) return { ok: false, error: 'busy', message: 'An export is already running.', state: before };
      const bl = blockersOf(host.edit(), host.sources());
      if (bl.length) {
        return { ok: false, error: 'blocked', message: `Can't export yet: ${bl.map(blockerSentence).join('; ')}.`, state: before };
      }
      host.startExport();
      return {
        ok: true,
        message: 'Export started — it costs no credits; the finished video is posted into the chat when it is ready.',
        state: { ...before, exporting: true },
      };
    }

    case 'set_music_start': {
      const sec = d.sec;
      if (typeof sec !== 'number' || !Number.isFinite(sec)) {
        return { ok: false, error: 'invalid_args', message: '`sec` must be a number of seconds into the song.' };
      }
      const before = state();
      if (!before.hasMusic) return { ok: false, error: 'no_music', message: 'There is no music on the timeline to move.', state: before };
      const applied = host.setMusicStart(sec);
      const asked = Math.round(sec * 10) / 10;
      const note = applied === asked
        ? ''
        : asked < 0
          ? ' (a start before the top of the song is the top)'
          : ` (${fmtClock(asked)} is past what the track allows — at least a second of it has to play)`;
      return { ok: true, message: `The music now starts ${fmtClock(applied)} into the song${note}.`, state: { ...before, musicStartSec: applied } };
    }

    default:
      return { ok: false, error: 'unknown_command', message: 'Unknown montage command — use export, set_music_start or state.' };
  }
}

/**
 * Listen while the editor is mounted. Every command gets a reply and the receipt (`preventDefault`), even one it
 * refuses: the receipt means „Montage is open and answered", the reply says what happened.
 */
export function listenForMontageCommands(getHost: () => MontageCommandHost | null): () => void {
  const onCommand = (e: Event) => {
    const detail = (e as CustomEvent<MontageCommandDetail>).detail;
    if (!detail || typeof detail !== 'object') return;
    const host = getHost();
    if (!host) return;
    let reply: MontageCommandReply;
    try {
      reply = handleMontageCommand(detail, host);
    } catch {
      reply = { ok: false, error: 'failed', message: 'The editor could not run that command.' };
    }
    detail.reply = reply;
    e.preventDefault();
  };
  window.addEventListener(MONTAGE_COMMAND_EVENT, onCommand);
  return () => window.removeEventListener(MONTAGE_COMMAND_EVENT, onCommand);
}

/**
 * For the host: send one command and read the editor's answer. `null` = no Montage is open (nobody took the event).
 */
export function sendMontageCommand(cmd: MontageCommand): MontageCommandReply | null {
  if (typeof window === 'undefined') return null;
  const detail: MontageCommandDetail = { ...cmd };
  const ev = new CustomEvent<MontageCommandDetail>(MONTAGE_COMMAND_EVENT, { detail, cancelable: true });
  window.dispatchEvent(ev);
  if (!ev.defaultPrevented) return null;
  return detail.reply ?? { ok: false, error: 'failed', message: 'The editor took the command but did not answer.' };
}
