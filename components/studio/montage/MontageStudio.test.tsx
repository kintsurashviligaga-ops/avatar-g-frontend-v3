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
// eslint-disable-next-line import/first
import { budgetRefusalMessage } from '@/lib/services/billing/budgetMessage';

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

/** What /api/upload/resign answers for a draft's refs; null = the route is unreachable. */
let resignAnswer: ((refs: string[]) => Array<string | null>) | null = null;

beforeEach(() => {
  uploads.length = 0;
  renderGate = null;
  // The edit kept on this device (draft.ts) must not leak from one test into the next.
  window.localStorage.clear();
  resignAnswer = (refs) => refs.map((r) => `https://signed.test/${r}?token=fresh`);
  // jsdom has no Response: a minimal one with what the editor reads.
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    // A seeded data:/blob: song is read into a File before it uploads.
    if (u.startsWith('data:') || u.startsWith('blob:')) return { ok: true, status: 200, blob: async () => new Blob(['song'], { type: 'audio/mpeg' }) };
    if (u.includes('/api/upload/resign')) {
      const { refs } = JSON.parse(String((init as RequestInit).body)) as { refs: string[] };
      return resignAnswer ? reply({ urls: resignAnswer(refs) }) : { ok: false, status: 503, json: async () => ({}) };
    }
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

  // 2026-10-16: the site's daily AI limit was spent and the export said only that it failed.
  it('an export the platform\'s AI limit refuses says which limit and when it lifts', async () => {
    const message = budgetRefusalMessage('ka', 'daily_limit');
    const base = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => (String(url).includes('/api/v2/montage/render')
      ? { ok: false, status: 503, json: async () => ({ success: false, code: 'platform_budget', error: 'platform_budget', budgetReason: 'daily_limit', message }) }
      : base(url, init))) as unknown as typeof fetch;
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });
    await waitFor(() => expect(screen.getByTestId('montage-export-btn')).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByTestId('montage-export-btn')); });
    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'error'));
    expect(screen.getByTestId('montage-export')).toHaveTextContent(message);
    expect(message).toContain('04:00');
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

  it('a film handed over without a format says „Opening…" while its length is read, never the empty new project', async () => {
    // GG 2026-10-18: a Library film's ✂ showed „New project" for as long as the film's length took to read.
    let release: (sec: number) => void = () => {};
    (jest.requireMock('./media') as { probeDuration: jest.Mock }).probeDuration
      .mockImplementationOnce(() => new Promise<number>((resolve) => { release = resolve; }));
    render(<MontageStudio locale="en" onExit={() => {}} initialMedia={[{ url: 'https://cdn.test/old-film.mp4', kind: 'video' }]} />);
    expect(screen.getByTestId('montage-opening')).toHaveTextContent('Opening…');
    expect(screen.queryByTestId('montage-start')).toBeNull();
    await act(async () => { release(12); });
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    expect(screen.queryByTestId('montage-opening')).toBeNull();
  });

  it('a song handed over on its own says on the start screen that it is in (a Library song\'s ✂)', async () => {
    render(<MontageStudio locale="en" onExit={() => {}} initialMusic={{ url: 'https://cdn.test/old-song.mp3' }} />);
    await act(async () => {}); // its length and waveform are read in the background
    expect(screen.getByTestId('montage-start')).toBeInTheDocument();
    const note = screen.getByTestId('montage-start-music');
    expect(note).toHaveTextContent('Music'); // no name came with it: Montage's own word, in the person's language
    expect(note).toHaveTextContent('The music is in. Add videos or photos and it plays under them.');
  });

  it('an empty new project has no music note', () => {
    render(<MontageStudio locale="en" onExit={() => {}} />);
    expect(screen.queryByTestId('montage-start-music')).toBeNull();
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

describe('the edit survives a reload (kept on this device)', () => {
  const KEY = 'myavatar:montage-draft:v1';
  const resignCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).includes('/api/upload/resign'));

  /** Two clips that finished uploading as u/0 and u/1, kept by the autosave; then the tab goes away. */
  async function keepAnEditAndReload() {
    const first = render(<MontageStudio locale="ka" onExit={() => {}} />);
    await addTwoClips();
    // Still uploading: nothing could come back yet, so nothing is kept.
    await new Promise((r) => setTimeout(r, 700));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await act(async () => { uploads.splice(0).forEach((r, i) => r({ path: `u/${i}` })); });
    await waitFor(() => expect(window.localStorage.getItem(KEY)).not.toBeNull());
    const kept = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(kept.sources.map((s: { ref: string }) => s.ref)).toEqual(['u/0', 'u/1']);
    expect(JSON.stringify(kept)).not.toContain('blob:');
    first.unmount();
  }

  it('reopening brings the edit back, signed again, with a note and a way to start over', async () => {
    await keepAnEditAndReload();
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(2));
    expect(screen.getByTestId('montage-restored')).toHaveTextContent('ბოლო მონტაჟი აღდგა.');
    expect(JSON.parse(resignCalls()[0][1].body)).toEqual({ refs: ['u/0', 'u/1'] });
    // Uploaded paths need no new upload: Export is ready, and the render gets the paths it signs itself.
    expect(screen.getByTestId('montage-export-btn')).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByTestId('montage-export-btn')); });
    await waitFor(() => expect(screen.getByTestId('montage-export')).toHaveAttribute('data-phase', 'done'));
    expect(JSON.stringify(renderBody())).toContain('u/0');
  });

  it('"start over" clears the timeline and forgets the kept edit', async () => {
    await keepAnEditAndReload();
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('montage-start-over')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('montage-start-over'));
    expect(screen.getByTestId('montage-from-device')).toBeInTheDocument();
    expect(screen.queryAllByTestId('montage-clip')).toHaveLength(0);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('a file that no longer signs is left out, and the note says how many', async () => {
    await keepAnEditAndReload();
    resignAnswer = (refs) => refs.map((r) => (r === 'u/1' ? null : `https://signed.test/${r}`));
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    expect(screen.getByTestId('montage-restored')).toHaveTextContent('ამოვარდა: 1');
  });

  it('when the route cannot be reached the editor starts fresh and the kept edit waits for next time', async () => {
    await keepAnEditAndReload();
    resignAnswer = null;
    render(<MontageStudio locale="ka" onExit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('montage-from-device')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 700));
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it('opening on handed media does not wait for, or ask about, the kept edit', async () => {
    await keepAnEditAndReload();
    render(<MontageStudio locale="en" onExit={() => {}} initialMedia={[{ url: 'https://cdn.test/gen.mp4', kind: 'video' }]} />);
    await waitFor(() => expect(screen.getAllByTestId('montage-clip')).toHaveLength(1));
    expect(resignCalls()).toHaveLength(0);
    expect(screen.queryByTestId('montage-restored')).toBeNull();
  });
});
