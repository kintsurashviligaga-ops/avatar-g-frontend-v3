/**
 * The Montage voice contract (voiceCommands.ts), without rendering the editor: the handler as a function of a host,
 * and the window event — cancelable, the reply written synchronously, preventDefault() as the receipt.
 */
import {
  MONTAGE_COMMAND_EVENT,
  handleMontageCommand,
  listenForMontageCommands,
  montageCommandState,
  sendMontageCommand,
  type MontageCommandDetail,
  type MontageCommandHost,
} from './voiceCommands';
import { clipForSource, emptyEdit, insertClips, setMusic, setMusicStart, type Edit, type MediaSource } from './project';

const video = (id: string, over: Partial<MediaSource> = {}): MediaSource => ({
  id, kind: 'video', name: `${id}.mp4`, previewUrl: `blob:${id}`, ref: `u/${id}`, status: 'ready', durationSec: 6, ...over,
});
const song = (over: Partial<MediaSource> = {}): MediaSource => ({
  id: 'm', kind: 'audio', name: 'song', previewUrl: 'blob:m', ref: 'u/m', status: 'ready', durationSec: 120, ...over,
});

/** A host over plain data, with the same semantics MontageStudio gives it. */
function fakeHost(edit: Edit, sources: Record<string, MediaSource>, exporting = false) {
  const state = { edit, sources, exporting };
  const startExport = jest.fn(() => { state.exporting = true; });
  const host: MontageCommandHost = {
    edit: () => state.edit,
    sources: () => state.sources,
    exporting: () => state.exporting,
    startExport,
    setMusicStart: (sec) => {
      const m = state.edit.musicId ? state.sources[state.edit.musicId] : undefined;
      state.edit = setMusicStart(state.edit, sec, m?.durationSec ?? 0);
      return state.edit.musicStartSec;
    },
  };
  return { host, state, startExport };
}

function project(srcs: MediaSource[], music?: MediaSource): { edit: Edit; sources: Record<string, MediaSource> } {
  const visual = srcs.filter((s) => s.kind !== 'audio');
  let edit = insertClips(emptyEdit('16:9'), visual.map(clipForSource)).edit;
  if (music) edit = setMusic(edit, music.id, 0, music.durationSec);
  const sources = Object.fromEntries([...srcs, ...(music ? [music] : [])].map((s) => [s.id, s]));
  return { edit, sources };
}

describe('handleMontageCommand', () => {
  it('state: what is on the timeline', () => {
    const { edit, sources } = project([video('a'), video('b')], song());
    const { host } = fakeHost(setMusicStart(edit, 42, 120), sources);
    expect(handleMontageCommand({ command: 'state' }, host)).toEqual({
      ok: true,
      state: { clips: 2, durationSec: 12, hasMusic: true, musicStartSec: 42, aspect: '16:9', exporting: false, blockers: [] },
    });
  });

  it('export: starts exactly once when nothing holds it back', () => {
    const { edit, sources } = project([video('a')]);
    const { host, startExport } = fakeHost(edit, sources);
    const reply = handleMontageCommand({ command: 'export' }, host);
    expect(reply).toMatchObject({ ok: true, state: { exporting: true, clips: 1 } });
    expect(reply.message).toMatch(/Export started/);
    expect(startExport).toHaveBeenCalledTimes(1);
  });

  it('export: busy while one is running — never a second render', () => {
    const { edit, sources } = project([video('a')]);
    const { host, startExport } = fakeHost(edit, sources, true);
    expect(handleMontageCommand({ command: 'export' }, host)).toMatchObject({ ok: false, error: 'busy', message: 'An export is already running.' });
    expect(startExport).not.toHaveBeenCalled();
  });

  it('export: blocked, with every reason in one English sentence', () => {
    const empty = fakeHost(emptyEdit(), {});
    expect(handleMontageCommand({ command: 'export' }, empty.host)).toMatchObject({
      ok: false, error: 'blocked', message: "Can't export yet: there are no clips on the timeline yet.", state: { blockers: ['empty'] },
    });

    const { edit, sources } = project(
      [video('a', { status: 'uploading', ref: null }), video('b', { status: 'uploading', ref: null }), video('c', { status: 'error', ref: null })],
      song({ status: 'uploading', ref: null }),
    );
    const busy = fakeHost(edit, sources);
    const reply = handleMontageCommand({ command: 'export' }, busy.host);
    expect(reply).toMatchObject({ ok: false, error: 'blocked', state: { blockers: ['failed', 'uploading', 'musicUploading'] } });
    expect(reply.message).toBe(
      "Can't export yet: 1 file failed to upload (signing in and retrying the clip fixes a signed-out upload); 2 files are still uploading; the music is still uploading.",
    );
    expect(busy.startExport).not.toHaveBeenCalled();
  });

  it('set_music_start: applies, clamps to the track, and says what it did', () => {
    const { edit, sources } = project([video('a')], song({ durationSec: 30 }));
    const { host, state } = fakeHost(edit, sources);
    expect(handleMontageCommand({ command: 'set_music_start', sec: 12.34 }, host)).toMatchObject({
      ok: true, message: 'The music now starts 0:12.3 into the song.', state: { musicStartSec: 12.3, hasMusic: true },
    });
    expect(state.edit.musicStartSec).toBe(12.3);

    const late = handleMontageCommand({ command: 'set_music_start', sec: 95 }, host);
    expect(late).toMatchObject({ ok: true, state: { musicStartSec: 29 } });
    expect(late.message).toBe('The music now starts 0:29 into the song (1:35 is past what the track allows — at least a second of it has to play).');

    expect(handleMontageCommand({ command: 'set_music_start', sec: -5 }, host)).toMatchObject({ ok: true, state: { musicStartSec: 0 } });
  });

  it('set_music_start: refuses a missing song or a start that is not a number', () => {
    const noMusic = fakeHost(project([video('a')]).edit, project([video('a')]).sources);
    expect(handleMontageCommand({ command: 'set_music_start', sec: 10 }, noMusic.host)).toMatchObject({ ok: false, error: 'no_music' });
    const { edit, sources } = project([video('a')], song());
    const { host, state } = fakeHost(edit, sources);
    for (const sec of ['10', Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
      expect(handleMontageCommand({ command: 'set_music_start', sec }, host)).toMatchObject({ ok: false, error: 'invalid_args' });
    }
    expect(state.edit).toBe(edit);
  });

  it('anything else: unknown_command', () => {
    const { host } = fakeHost(emptyEdit(), {});
    expect(handleMontageCommand({ command: 'render_now' }, host)).toMatchObject({ ok: false, error: 'unknown_command' });
    expect(handleMontageCommand(null, host)).toMatchObject({ ok: false, error: 'unknown_command' });
  });

  it('the state reports no start without a song', () => {
    const { edit, sources } = project([video('a')]);
    expect(montageCommandState({ ...edit, musicStartSec: 7 }, sources, false)).toMatchObject({ hasMusic: false, musicStartSec: 0 });
  });
});

describe('the window event', () => {
  it('no Montage open: nobody takes it, and the sender is told so (null)', () => {
    expect(sendMontageCommand({ command: 'state' })).toBeNull();
  });

  it('while listening: the reply is written synchronously and preventDefault() is the receipt', () => {
    const { edit, sources } = project([video('a')], song());
    const { host } = fakeHost(edit, sources);
    const stop = listenForMontageCommands(() => host);
    try {
      const detail: MontageCommandDetail = { command: 'set_music_start', sec: 8 };
      const ev = new CustomEvent(MONTAGE_COMMAND_EVENT, { detail, cancelable: true });
      expect(window.dispatchEvent(ev)).toBe(false); // canceled = received
      expect(ev.defaultPrevented).toBe(true);
      expect(detail.reply).toMatchObject({ ok: true, state: { musicStartSec: 8 } });
      // The helper does the same in one call.
      expect(sendMontageCommand({ command: 'state' })).toMatchObject({ ok: true, state: { musicStartSec: 8, clips: 1 } });
      // A refusal is still a receipt: Montage is open, and says why it did not act.
      expect(sendMontageCommand({ command: 'set_music_start', sec: Number.NaN })).toMatchObject({ ok: false, error: 'invalid_args' });
    } finally {
      stop();
    }
    expect(sendMontageCommand({ command: 'state' })).toBeNull();
  });

  it('a host that throws answers `failed` instead of leaving the caller waiting', () => {
    const stop = listenForMontageCommands(() => ({
      edit: () => { throw new Error('boom'); },
      sources: () => ({}),
      exporting: () => false,
      startExport: () => {},
      setMusicStart: () => 0,
    }));
    try {
      expect(sendMontageCommand({ command: 'state' })).toEqual({ ok: false, error: 'failed', message: 'The editor could not run that command.' });
    } finally {
      stop();
    }
  });
});
