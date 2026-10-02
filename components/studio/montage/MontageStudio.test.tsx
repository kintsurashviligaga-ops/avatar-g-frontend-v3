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

beforeEach(() => {
  uploads.length = 0;
  // jsdom has no Response: a minimal one with what the editor reads.
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/api/v2/montage/render')) return reply({ videoUrl: 'https://cdn.test/master.mp4', warnings: { musicRequestedButMissing: false } });
    return reply({ jobs: [] });
  }) as unknown as typeof fetch;
});

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
