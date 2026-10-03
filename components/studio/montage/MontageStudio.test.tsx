/**
 * MontageStudio — the CapCut-style editor, end to end in the DOM: start → add files → edit → export.
 * Media decoding and storage are stubbed (jsdom has neither); everything else is the real component.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const uploads: Array<(r: { path: string } | { error: 'fail' | 'auth' }) => void> = [];
jest.mock('../ui/useUpload', () => ({
  ...jest.requireActual('../ui/useUpload'),
  uploadFileToStorage: jest.fn(() => new Promise((resolve) => { uploads.push(resolve); })),
}));
jest.mock('./media', () => ({
  ...jest.requireActual('./media'),
  probeDuration: jest.fn(async (_url: string, kind: string) => (kind === 'audio' ? 20 : 6)),
  extractFrames: jest.fn(async () => []),
  decodePeaks: jest.fn(async () => []),
}));
jest.mock('./useLibrary', () => ({
  ...jest.requireActual('./useLibrary'),
  useLibrary: () => ({ items: [], loading: false, signedOut: false }),
}));

// eslint-disable-next-line import/first
import MontageStudio from './MontageStudio';
// eslint-disable-next-line import/first
import { resamplePeaks, visiblePeaks } from './Timeline';
// eslint-disable-next-line import/first
import { MONTAGE_COMMAND_EVENT } from './voiceCommands';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let n = 0;
  URL.createObjectURL = jest.fn(() => `blob:test-${++n}`);
  URL.revokeObjectURL = jest.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: jest.fn(() => Promise.resolve()) });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: jest.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: jest.fn() });
});

/** When set, the render request waits on this instead of answering at once (an export in flight). */
let renderGate: Promise<void> | null = null;

beforeEach(() => {
  uploads.length = 0;
  renderGate = null;
  // jsdom has no Response: a minimal one with what the editor reads.
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    // A seeded data:/blob: song is read into a File before it uploads.
    if (u.startsWith('data:') || u.startsWith('blob:')) return { ok: true, status: 200, blob: async () => new Blob(['song'], { type: 'audio/mpeg' }) };
    if (u.includes('/api/v2/montage/render')) {
      if (renderGate) await renderGate;
      return reply({ videoUrl: 'https://cdn.test/master.mp4', warnings: { musicRequestedButMissing: false } });
    }
    return reply({ jobs: [] });
  }) as unknown as typeof fetch;
});

const renderBody = () => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes('/api/v2/montage/render'));
  return call ? JSON.parse(call[1].body) : null;
};

/** What a voice call does: dispatch the command and read the editor's synchronous answer. */
function voice(detail: Record<string, unknown>) {
  const d: Record<string, unknown> = { ...detail };
  const ev = new CustomEvent(MONTAGE_COMMAND_EVENT, { detail: d, cancelable: true });
  act(() => { window.dispatchEvent(ev); });
  return { received: ev.defaultPrevented, reply: d.reply as Record<string, unknown> & { state?: Record<string, unknown> } };
}

const file = (name: string, type: string) => new File(['x'], name, { type });

async function addTwoClips() {
  const input = screen.getByTestId('montage-file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file('a.mp4', 'video/mp4'), file('b.jpg', 'image/jpeg')] } });
  });
  await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(2));
}

describe('MontageStudio', () => {
  it('starts as a new project: the format first, then where the footage comes from — no Export yet', () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    expect(screen.getByText('ახალი პროექტი')).toBeInTheDocument();
    const formats = within(screen.getByTestId('montage-aspect')).getAllByRole('radio');
    expect(formats.map((r) => r.getAttribute('data-value'))).toEqual(['9:16', '16:9', '1:1']);
    expect(formats[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('montage-from-device')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-export-btn')).toBeNull();
  });

  it('puts added files on the timeline and holds Export until they have uploaded', async () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    expect(screen.getByTestId('montage-export-btn')).toBeDisabled();
    expect(screen.getByTestId('montage-blocker')).toHaveTextContent('ფაილები იტვირთება');
    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
    expect(screen.queryByTestId('montage-blocker')).toBeNull();
  });

  it('selects the clip under the playhead, deletes it, and undo brings it back', async () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    fireEvent.click(screen.getByTestId('montage-tool-edit'));
    expect(screen.getByTestId('montage-clip-toolbar')).toBeInTheDocument();
    expect(screen.getAllByTestId('montage-clip')[0]).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByTestId('montage-tool-delete'));
    expect(screen.getAllByTestId('montage-clip')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('montage-undo'));
    expect(screen.getAllByTestId('montage-clip')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('montage-redo'));
    expect(screen.getAllByTestId('montage-clip')).toHaveLength(1);
  });

  it('writes text on a clip — it shows on the text track and goes out with the export', async () => {
    const onDelivered = jest.fn();
    render(<MontageStudio locale="ka" onExit={() => {}} onDelivered={onDelivered} />);
    await addTwoClips();
    fireEvent.click(screen.getByTestId('montage-tool-text'));
    fireEvent.change(screen.getByTestId('montage-text-input'), { target: { value: 'ზაფხული' } });
    fireEvent.click(within(screen.getByTestId('montage-text-pos')).getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByTestId('montage-panel-done'));
    expect(screen.getByTestId('montage-text-chip')).toHaveTextContent('ზაფხული');

    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByTestId('montage-export-btn')); });

    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'done'));
    const call = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes('/api/v2/montage/render'));
    const body = JSON.parse(call[1].body);
    expect(body.aspect).toBe('9:16');
    expect(body.shots).toEqual([
      { url: 'u/0', kind: 'video', startSec: 0, endSec: 6, muted: false, transition: 'cut', caption: 'ზაფხული', captionPos: 'center' },
      { url: 'u/1', kind: 'image', startSec: 0, endSec: 3, muted: true, transition: 'cut' },
    ]);
    expect(onDelivered).toHaveBeenCalledWith('https://cdn.test/master.mp4', '9:16');
    expect(screen.getByTestId('montage-result-video')).toHaveAttribute('src', 'https://cdn.test/master.mp4');
  });

  it('a signed-out upload says to sign in, and the clip retries in place', async () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    await act(async () => { uploads.splice(0).forEach((r) => r({ error: 'auth' })); });
    expect(screen.getByTestId('montage-blocker')).toHaveTextContent('შედი სისტემაში');
    fireEvent.click(screen.getByTestId('montage-tool-edit'));
    fireEvent.click(screen.getByTestId('montage-tool-retry'));
    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });
    // The second clip is still failed; retry it too.
    fireEvent.click(screen.getAllByTestId('montage-clip')[1]!);
    fireEvent.click(screen.getByTestId('montage-tool-retry'));
    await act(async () => { uploads.splice(0).forEach((r) => r({ path: 'u/9' })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
  });

  it('asks before closing an edit that was never exported', async () => {
    const onExit = jest.fn();
    render(<MontageStudio locale="ka" onExit={onExit} />);
    await addTwoClips();
    fireEvent.click(screen.getByTestId('montage-close'));
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('montage-leave-yes'));
    expect(onExit).toHaveBeenCalled();
  });

  it('opens with the media it was handed (a chat attachment, a generated video)', async () => {
    render(<MontageStudio locale="en" onExit={() => {}} initialMedia={[{ url: 'https://cdn.test/gen.mp4', kind: 'video' }]} />);
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    // A hosted file needs no upload: Export is ready at once.
    expect(screen.getByTestId('montage-export-btn')).toBeEnabled();
  });
});

describe('the music start', () => {
  it('the music drawer moves where the song starts: readout, timeline, ONE undo step, and the export carries it', async () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });

    fireEvent.click(screen.getByTestId('montage-tool-music'));
    // No song yet: nothing to start.
    expect(screen.queryByTestId('montage-music-start')).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByTestId('montage-music-input'), { target: { files: [file('song.mp3', 'audio/mpeg')] } });
    });
    const slider = await screen.findByTestId('montage-music-start');
    expect(screen.getByText('დაწყება')).toBeInTheDocument();
    // The probe says 20 s: it may start as late as 19 s, so a second of it still plays.
    expect(slider).toHaveAttribute('max', '19');
    expect(screen.getByTestId('montage-music-start-value')).toHaveTextContent('0:00 / 0:20');
    expect(screen.getByTestId('montage-music-start-earlier')).toBeDisabled();

    fireEvent.change(slider, { target: { value: '7.5' } });
    fireEvent.click(screen.getByTestId('montage-music-start-later'));
    expect(screen.getByTestId('montage-music-start-value')).toHaveTextContent('0:08.5 / 0:20');
    expect(slider).toHaveAttribute('aria-valuetext', '0:08.5');
    fireEvent.click(screen.getByTestId('montage-panel-done'));
    expect(screen.getByTestId('montage-music-bar-start')).toHaveTextContent('0:08.5-დან');

    // The drag and the tap a moment later are ONE step: one undo puts the song back at its top.
    fireEvent.click(screen.getByTestId('montage-undo'));
    expect(screen.queryByTestId('montage-music-bar-start')).toBeNull();
    expect(screen.getByTestId('montage-music-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('montage-redo'));
    expect(screen.getByTestId('montage-music-bar-start')).toHaveTextContent('0:08.5-დან');

    await act(async () => { uploads.splice(0).forEach((r) => r({ path: 'u/song' })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByTestId('montage-export-btn')); });
    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'done'));
    expect(renderBody()).toMatchObject({ musicUrl: 'u/song', musicOnly: false, musicStartSec: 8.5 });
  });

  it('opens with a song and a format (initialMusic · initialAspect): no format question, and Export waits for the song', async () => {
    render(
      <MontageStudio
        locale="en"
        onExit={() => {}}
        initialAspect="16:9"
        initialMedia={[{ url: 'https://cdn.test/gen.mp4', kind: 'video' }]}
        initialMusic={{ url: 'data:audio/mpeg;base64,AAAA', name: 'Generated song', startSec: 12 }}
      />,
    );
    // Straight to the clips: the new-project screen (and its format question) never shows.
    expect(screen.getByTestId('montage-opening')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-start')).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    expect(screen.getByTestId('montage-format-chip')).toHaveTextContent('16:9');
    // The song is registered at once and uploads like a picked file — Export holds until it is up.
    expect(screen.getByTestId('montage-export-btn')).toBeDisabled();
    expect(screen.getByTestId('montage-blocker')).toHaveTextContent('The music is uploading');
    expect(screen.getByTestId('montage-music-bar-start')).toHaveTextContent('from 0:12');
    await waitFor(() => expect(uploads).toHaveLength(1));
    await act(async () => { uploads.splice(0).forEach((r) => r({ path: 'u/generated-song' })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByTestId('montage-export-btn')); });
    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'done'));
    expect(renderBody()).toMatchObject({
      aspect: '16:9',
      shots: [{ url: 'https://cdn.test/gen.mp4', kind: 'video' }],
      musicUrl: 'u/generated-song',
      musicStartSec: 12,
    });
  });

  it('a hosted song is ready at once, and a start past its end is pulled back inside it once its length is known', async () => {
    render(
      <MontageStudio
        locale="en"
        onExit={() => {}}
        initialMedia={[{ url: 'https://cdn.test/gen.mp4', kind: 'video' }]}
        initialMusic={{ url: 'https://cdn.test/song.mp3', startSec: 50 }}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    expect(screen.getByTestId('montage-export-btn')).toBeEnabled();
    // probeDuration says 20 s → the latest start is 19 s.
    await waitFor(() => expect(screen.getByTestId('montage-music-bar-start')).toHaveTextContent('from 0:19'));
    expect(uploads).toHaveLength(0);
  });

  it('the timeline draws the slice of the song that plays', () => {
    const peaks = Array.from({ length: 100 }, (_, i) => i / 100);
    // A 100 s track, starting at 20 s, under a 10 s edit: buckets 20–30.
    expect(visiblePeaks(peaks, 100, 20, 10)).toEqual(peaks.slice(20, 30));
    expect(visiblePeaks(peaks, 100, 0, 100)).toEqual(peaks);
    // Unknown length: the whole waveform, as before.
    expect(visiblePeaks(peaks, 0, 20, 10)).toEqual(peaks);
    expect(visiblePeaks([], 100, 20, 10)).toEqual([]);
    // Redrawn at the bar's width: the loudest of each group going down, a line between neighbours going up.
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
    expect(resamplePeaks([0, 1], 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(resamplePeaks([0.3, 0.6], 1)).toEqual([0.6]);
    expect(resamplePeaks(peaks, 0)).toEqual([]);
    expect(resamplePeaks(peaks, 1e6)).toHaveLength(600);
  });
});

describe('voice: myavatar:montage-command', () => {
  it('answers synchronously with preventDefault as the receipt — state, set_music_start (undoable), export', async () => {
    render(
      <MontageStudio
        locale="en"
        onExit={() => {}}
        initialMedia={[{ url: 'https://cdn.test/gen.mp4', kind: 'video' }]}
        initialMusic={{ url: 'https://cdn.test/song.mp3', name: 'Song' }}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    await waitFor(() => expect(voice({ command: 'state' }).reply.state).toMatchObject({ musicStartSec: 0 }));

    const state = voice({ command: 'state' });
    expect(state.received).toBe(true);
    expect(state.reply).toEqual({
      ok: true,
      state: { clips: 1, durationSec: 6, hasMusic: true, musicStartSec: 0, aspect: '9:16', exporting: false, blockers: [] },
    });

    const moved = voice({ command: 'set_music_start', sec: 7.25 });
    expect(moved.received).toBe(true);
    expect(moved.reply).toMatchObject({ ok: true, state: { musicStartSec: 7.3 } });
    // The same tick already reads it…
    expect(voice({ command: 'state' }).reply.state).toMatchObject({ musicStartSec: 7.3 });
    // …the screen shows it…
    expect(screen.getByTestId('montage-music-bar-start')).toHaveTextContent('from 0:07.3');
    // …and it is an undo step of its own.
    fireEvent.click(screen.getByTestId('montage-undo'));
    expect(voice({ command: 'state' }).reply.state).toMatchObject({ musicStartSec: 0 });
    fireEvent.click(screen.getByTestId('montage-redo'));

    // Export: exactly the button's run; a second one while it renders is `busy`, not a second render.
    let open: () => void = () => {};
    renderGate = new Promise<void>((r) => { open = r; });
    const exp = voice({ command: 'export' });
    expect(exp.reply).toMatchObject({ ok: true, state: { exporting: true } });
    expect(voice({ command: 'export' }).reply).toMatchObject({ ok: false, error: 'busy' });
    expect(voice({ command: 'state' }).reply.state).toMatchObject({ exporting: true });
    await act(async () => { open(); });
    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'done'));
    const renders = (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).includes('/api/v2/montage/render'));
    expect(renders).toHaveLength(1);
    expect(renderBody()).toMatchObject({ musicUrl: 'https://cdn.test/song.mp3', musicStartSec: 7.3 });
    expect(voice({ command: 'state' }).reply.state).toMatchObject({ exporting: false });
  });

  it('export is refused, with the reasons, while there is nothing to export or files are still uploading', async () => {
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    expect(voice({ command: 'export' }).reply).toMatchObject({
      ok: false, error: 'blocked', message: "Can't export yet: there are no clips on the timeline yet.",
    });
    expect(voice({ command: 'set_music_start', sec: 5 }).reply).toMatchObject({ ok: false, error: 'no_music' });
    await addTwoClips();
    const blocked = voice({ command: 'export' });
    expect(blocked.received).toBe(true);
    expect(blocked.reply).toMatchObject({ ok: false, error: 'blocked', message: "Can't export yet: 2 files are still uploading.", state: { blockers: ['uploading'] } });
    expect((global.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/v2/montage/render'))).toBe(false);
  });

  it('stops listening when the editor closes', () => {
    const { unmount } = render(<MontageStudio locale="en" onExit={() => {}} />);
    expect(voice({ command: 'state' }).received).toBe(true);
    unmount();
    const after = voice({ command: 'state' });
    expect(after.received).toBe(false);
    expect(after.reply).toBeUndefined();
  });
});
