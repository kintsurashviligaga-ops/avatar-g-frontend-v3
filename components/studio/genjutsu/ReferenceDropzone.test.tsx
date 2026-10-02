/**
 * The reference dropzone: up to 40 photos, a role chip on each, reorder / remove, the "12 / 40" count, and the
 * "Using 3 of 12" line read BEFORE paying. Decode (canvas) and upload are injected — jsdom has neither — so what is
 * pinned is behaviour: the 40 cap, the checks, the order, and the lazy upload of ONLY the used photos.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { selectReferences } from '@/lib/genjutsu/selection';
import { ReferenceDropzone } from './ReferenceDropzone';
import { useReferencePhotos, type UseReferencePhotosOptions } from './useReferencePhotos';
import type { DownscaleResult } from './media';

let urlSeq = 0;
beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => `blob:test/${urlSeq++}`) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
});

const file = (name: string, type = 'image/jpeg') => new File([new Uint8Array(8)], name, { type });
const bigFile = (name: string, size: number) => {
  const f = file(name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const okDecode = async (): Promise<DownscaleResult> => ({ ok: true, blob: new Blob(['x'], { type: 'image/jpeg' }), width: 1280, height: 960 });

let upload: jest.Mock;
let api: ReturnType<typeof useReferencePhotos> | null = null;

function Harness({ cap = 3, engine = 'Google Veo 3.1', options = {} }: { cap?: number; engine?: string; options?: UseReferencePhotosOptions }) {
  const r = useReferencePhotos({ decode: okDecode, upload, ...options });
  api = r;
  const sel = selectReferences(r.photos.map((p) => ({ id: p.id, role: p.role })), cap);
  return (
    <ReferenceDropzone
      locale="en" photos={r.photos} pending={r.pending} max={r.max} usedIds={new Set(sel.used.map((u) => u.id))} cap={cap} engineLabel={engine}
      skipped={r.skipped} overflow={r.overflow} onAdd={(f) => { void r.add(f); }} onRole={r.setRole} onMove={r.move} onRemove={r.remove} onClear={r.clear}
    />
  );
}

const input = () => screen.getByTestId('vfx-refs-input') as HTMLInputElement;
const addFiles = async (files: File[]) => { await act(async () => { fireEvent.change(input(), { target: { files } }); }); };
const files = (n: number, from = 0) => Array.from({ length: n }, (_, i) => file(`p${from + i}.jpg`));
const count = () => screen.getByTestId('vfx-refs-count').textContent;

beforeEach(() => {
  upload = jest.fn(async (f: File) => ({ path: `omni-uploads/u1/${f.name}` }));
  api = null;
  urlSeq = 0;
  (URL.revokeObjectURL as jest.Mock).mockClear();
});

test('it starts empty: "0 / 40" and the engine\'s cap stated up front', () => {
  render(<Harness />);
  expect(count()).toBe('0 / 40');
  expect(screen.getByTestId('vfx-refs-policy').textContent).toBe('Google Veo 3.1 takes up to 3 photos');
});

test('the picker input is a SIBLING of its label, never a child (a nested input bubbles its click back and iOS cancels the picker)', () => {
  render(<Harness />);
  const label = screen.getByTestId('vfx-refs-drop');
  expect(label.contains(input())).toBe(false);
  expect(label.getAttribute('for')).toBe(input().id);
  expect(input().multiple).toBe(true);
});

test('twelve photos, an engine that takes three: "Using 3 of 12" — before the user pays', async () => {
  render(<Harness />);
  await addFiles(files(12));
  await waitFor(() => expect(count()).toBe('12 / 40'));
  expect(screen.getByTestId('vfx-refs-policy').textContent).toBe('Using 3 of 12 — Google Veo 3.1 takes up to 3');
  expect(document.querySelectorAll('[data-used="true"]')).toHaveLength(3);
  expect(document.querySelectorAll('[data-used="false"]')).toHaveLength(9);
});

test('THE CAP: 40 photos at most — a 41st never lands and the user is told how many were left out', async () => {
  render(<Harness />);
  await addFiles(files(30));
  await waitFor(() => expect(count()).toBe('30 / 40'));
  await addFiles(files(15, 30));
  await waitFor(() => expect(count()).toBe('40 / 40'));
  expect(document.querySelectorAll('[data-testid^="vfx-ref-"][data-role]')).toHaveLength(40);
  expect(screen.getByTestId('vfx-refs-notes').textContent).toContain('Limit is 40 photos — 5 skipped');
  expect(input().disabled).toBe(true);
  expect(screen.getByTestId('vfx-refs-drop').className).toContain('pointer-events-none');
});

test('one drop of 60 files keeps the first 40 and says 20 were skipped', async () => {
  render(<Harness />);
  await addFiles(files(60));
  await waitFor(() => expect(count()).toBe('40 / 40'));
  expect(screen.getByTestId('vfx-refs-notes').textContent).toContain('20 skipped');
});

test('each photo wears its role as a chip (Character by default); the toolbar changes it and the use-marks follow the rule', async () => {
  render(<Harness />);
  await addFiles(files(4));
  await waitFor(() => expect(count()).toBe('4 / 40'));
  const tile = (i: number) => screen.getByTestId(`vfx-ref-${i}`);
  for (let i = 0; i < 4; i++) {
    expect(tile(i).getAttribute('data-role')).toBe('character');
    expect(within(tile(i)).getByText('Character')).toBeTruthy();
  }
  expect([0, 1, 2, 3].map((i) => tile(i).getAttribute('data-used'))).toEqual(['true', 'true', 'true', 'false']);
  fireEvent.click(tile(3));
  fireEvent.click(within(screen.getByTestId('vfx-ref-toolbar')).getByRole('radio', { name: 'Product' }));
  expect(tile(3).getAttribute('data-role')).toBe('product');
  expect([0, 1, 2, 3].map((i) => tile(i).getAttribute('data-used'))).toEqual(['true', 'true', 'false', 'true']);
  expect(within(tile(3)).getByText('Product')).toBeTruthy();
});

test('a photo can be moved earlier and later — that is how the user chooses the "best" one', async () => {
  render(<Harness cap={1} />);
  await addFiles(files(3));
  await waitFor(() => expect(api!.photos).toHaveLength(3));
  const names = () => api!.photos.map((p) => p.name);
  fireEvent.click(screen.getByTestId('vfx-ref-2'));
  const bar = () => screen.getByTestId('vfx-ref-toolbar');
  fireEvent.click(within(bar()).getByRole('button', { name: 'Move earlier' }));
  fireEvent.click(within(bar()).getByRole('button', { name: 'Move earlier' }));
  expect(names()).toEqual(['p2.jpg', 'p0.jpg', 'p1.jpg']);
  expect(screen.getByTestId('vfx-ref-0').getAttribute('data-used')).toBe('true');
  expect(screen.getByTestId('vfx-ref-1').getAttribute('data-used')).toBe('false');
  expect((within(bar()).getByRole('button', { name: 'Move earlier' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(bar()).getByRole('button', { name: 'Move later' }));
  expect(names()).toEqual(['p0.jpg', 'p2.jpg', 'p1.jpg']);
});

test('remove and "remove all" empty the grid and the count, and free the thumbnail URLs', async () => {
  render(<Harness />);
  await addFiles(files(3));
  await waitFor(() => expect(api!.photos).toHaveLength(3));
  fireEvent.click(screen.getByTestId('vfx-ref-1'));
  fireEvent.click(within(screen.getByTestId('vfx-ref-toolbar')).getByRole('button', { name: 'Remove photo' }));
  expect(count()).toBe('2 / 40');
  expect(screen.queryByTestId('vfx-ref-toolbar')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
  expect(count()).toBe('0 / 40');
});

test('files an engine cannot read are refused with their NAME and a reason — they never reach the grid', async () => {
  const decode = jest.fn(async (f: File): Promise<DownscaleResult> => (f.name === 'tiny.jpg' ? { ok: false, reason: 'small' } : f.name === 'broken.jpg' ? { ok: false, reason: 'unreadable' } : okDecode()));
  render(<Harness options={{ decode }} />);
  await addFiles([file('ok.jpg'), file('notes.pdf', 'application/pdf'), bigFile('huge.jpg', 30 * 1024 * 1024), file('tiny.jpg'), file('broken.jpg')]);
  await waitFor(() => expect(count()).toBe('1 / 40'));
  const notes = screen.getByTestId('vfx-refs-notes').textContent!;
  expect(notes).toContain('notes.pdf: only JPG, PNG or WebP');
  expect(notes).toContain('huge.jpg: the file is too large');
  expect(notes).toContain('tiny.jpg: too small (min 300 px)');
  expect(notes).toContain('broken.jpg: could not be read');
  // The type and size checks happen BEFORE any decoding.
  expect(decode.mock.calls.map((c) => (c[0] as File).name)).toEqual(['ok.jpg', 'tiny.jpg', 'broken.jpg']);
});

test('photos appear in the order they were PICKED, even when a later one finishes decoding first', async () => {
  const delay: Record<string, number> = { 'a.jpg': 40, 'b.jpg': 0, 'c.jpg': 10 };
  const decode = (f: File): Promise<DownscaleResult> => new Promise((res) => setTimeout(() => res({ ok: true, blob: new Blob(['x']), width: 800, height: 600 }), delay[f.name] ?? 0));
  render(<Harness options={{ decode }} />);
  await addFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
  await waitFor(() => expect(api!.photos).toHaveLength(3));
  expect(api!.photos.map((p) => p.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
});

test('ONLY the photos the engine will use are uploaded — the other nine never leave the device — and none is sent twice', async () => {
  render(<Harness />);
  await addFiles(files(12));
  await waitFor(() => expect(api!.photos).toHaveLength(12));
  const used = selectReferences(api!.photos.map((p) => ({ id: p.id, role: p.role })), 3).used.map((u) => u.id);
  let res: Awaited<ReturnType<NonNullable<typeof api>['ensureUploaded']>> | undefined;
  await act(async () => { res = await api!.ensureUploaded(used); });
  expect(res).toMatchObject({ ok: true });
  expect(upload).toHaveBeenCalledTimes(3);
  await act(async () => { await api!.ensureUploaded(used); });
  expect(upload).toHaveBeenCalledTimes(3);
  expect((upload.mock.calls[0]![0] as File).type).toBe('image/jpeg');
});

test('an upload failure fails the batch with the upload\'s own reason', async () => {
  upload.mockImplementation(async () => ({ error: 'auth' as const }));
  render(<Harness />);
  await addFiles(files(3));
  await waitFor(() => expect(api!.photos).toHaveLength(3));
  let res: Awaited<ReturnType<NonNullable<typeof api>['ensureUploaded']>> | undefined;
  await act(async () => { res = await api!.ensureUploaded(api!.photos.map((p) => p.id)); });
  expect(res).toEqual({ ok: false, error: 'auth' });
});

test('the labels speak Georgian and Russian too', () => {
  const props = { photos: [], pending: 0, max: 40, usedIds: new Set<string>(), cap: 3, engineLabel: 'Veo', skipped: [], overflow: 0, onAdd: jest.fn(), onRole: jest.fn(), onMove: jest.fn(), onRemove: jest.fn(), onClear: jest.fn() };
  const { rerender } = render(<ReferenceDropzone locale="ka" {...props} />);
  expect(screen.getByTestId('vfx-refs-policy').textContent).toBe('Veo იღებს მაქსიმუმ 3 ფოტოს');
  rerender(<ReferenceDropzone locale="ru" {...props} />);
  expect(screen.getByTestId('vfx-refs-policy').textContent).toBe('Veo принимает до 3 фото');
});
