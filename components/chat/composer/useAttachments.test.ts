/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, DragEvent as ReactDragEvent } from 'react';
import {
  DEFAULT_TOTAL_CAP_BYTES,
  MAX_DOC_TEXT_CHARS,
  MB,
  PLATFORM_BODY_LIMIT_BYTES,
  capDocText,
  classifyFile,
  dataUrlMimeOf,
  downscaleImageDataUrl,
  filesFromClipboard,
  formatBytes,
  mimeForFile,
  textToDataUrl,
  useAttachments,
  withDataUrlMime,
  type AttachmentDeps,
  type CanvasLike,
  type DataTransferLike,
  type UseAttachmentsOptions,
} from './useAttachments';
import { serializeHistory } from '@/lib/chat/historySerializer';

// ─── Fakes ───────────────────────────────────────────────────────────────────────────────────────────────

/** A File whose `size` is what the test says, without allocating it. */
function fakeFile(name: string, type: string, size = 1000, body = 'x'): File {
  const f = new File([body], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

/** jsdom has no `Response`; the hook only reads ok/status/json(). */
const jsonRes = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const decodeDataUrl = (u: string) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64').toString('utf8');

function fakeCanvas(out = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS') {
  const ctx = { fillStyle: '' as string, fillRect: jest.fn(), drawImage: jest.fn() };
  const canvas: CanvasLike & { ctx: typeof ctx } = {
    width: 0, height: 0, ctx,
    getContext: () => ctx as unknown as ReturnType<CanvasLike['getContext']>,
    toDataURL: jest.fn(() => out),
  };
  return canvas;
}

function deps(over: Partial<AttachmentDeps> = {}): Partial<AttachmentDeps> {
  return {
    // The browser would base64 the file; the fake keeps the declared type in the header like FileReader does.
    readAsDataUrl: async (f) => `data:${(f as File).type || 'application/octet-stream'};base64,${b64('bytes-of-' + ((f as File).name ?? 'blob'))}`,
    readAsText: async () => 'plain text',
    loadImage: async () => ({ width: 4032, height: 3024 }),
    createCanvas: () => fakeCanvas(),
    fetch: jest.fn(async () => jsonRes({ text: '' })) as unknown as typeof fetch,
    createObjectUrl: () => 'blob:preview',
    revokeObjectUrl: jest.fn(),
    ...over,
  };
}

function setup(opts: Partial<UseAttachmentsOptions> = {}) {
  const onReject = jest.fn();
  const hook = renderHook(() => useAttachments({ locale: 'ka', onReject, deps: deps(), ...opts }));
  return { ...hook, onReject };
}

// ─── Pure helpers ────────────────────────────────────────────────────────────────────────────────────────

describe('classifyFile / mimeForFile', () => {
  test.each([
    [{ name: 'IMG_1.HEIC', type: '' }, 'image', 'image/heic'],
    [{ name: 'photo.jpg', type: 'image/jpeg' }, 'image', 'image/jpeg'],
    [{ name: 'report.docx', type: '' }, 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [{ name: 'report.docx', type: 'application/octet-stream' }, 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [{ name: 'notes.md', type: '' }, 'text', 'text/markdown'],
    [{ name: 'notes.txt', type: 'text/plain' }, 'text', 'text/plain'],
    [{ name: 'song.mp3', type: 'audio/mpeg' }, 'audio', 'audio/mpeg'],
    [{ name: 'clip.mov', type: '' }, 'video', 'video/quicktime'],
    [{ name: 'paper.pdf', type: 'application/pdf' }, 'pdf', 'application/pdf'],
    [{ name: 'data.csv', type: 'text/csv' }, 'file', 'text/csv'],
    [{ name: 'archive.zip', type: 'application/zip' }, 'file', 'application/zip'],
  ])('%j → %s (%s)', (file, kind, mime) => {
    expect(classifyFile(file)).toBe(kind);
    expect(mimeForFile(file)).toBe(mime);
  });
});

describe('data URL helpers', () => {
  test('dataUrlMimeOf reads only the header', () => {
    expect(dataUrlMimeOf('data:image/png;base64,AAAA')).toBe('image/png');
    expect(dataUrlMimeOf('data:;base64,AAAA')).toBe('');
    expect(dataUrlMimeOf('https://x/y.png')).toBeNull();
  });

  test('withDataUrlMime rewrites a generic header only', () => {
    expect(withDataUrlMime('data:application/octet-stream;base64,AAAA', 'image/heic')).toBe('data:image/heic;base64,AAAA');
    expect(withDataUrlMime('data:image/png;base64,AAAA', 'image/heic')).toBe('data:image/png;base64,AAAA');
  });

  test('textToDataUrl keeps Georgian as UTF-8', () => {
    const u = textToDataUrl('გამარჯობა, სამყარო');
    expect(u.startsWith('data:text/plain;base64,')).toBe(true);
    expect(decodeDataUrl(u)).toBe('გამარჯობა, სამყარო');
  });

  test('capDocText cuts long text and says so', () => {
    const long = 'word '.repeat(MAX_DOC_TEXT_CHARS);
    const c = capDocText(long);
    expect(c.truncated).toBe(true);
    expect(c.text.length).toBeLessThanOrEqual(MAX_DOC_TEXT_CHARS);
    expect(capDocText('short')).toEqual({ text: 'short', truncated: false });
  });

  test('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.5 * MB)).toBe('3.5 MB');
  });

  test('the default total cap sits under the platform body limit', () => {
    expect(DEFAULT_TOTAL_CAP_BYTES).toBeLessThan(PLATFORM_BODY_LIMIT_BYTES);
  });
});

describe('downscaleImageDataUrl — the MIME fix', () => {
  test('a large photo is re-encoded, and the MIME type is image/jpeg (not the original type)', async () => {
    const canvas = fakeCanvas();
    const out = await downscaleImageDataUrl('data:image/heic;base64,AAAA', { maxDim: 1600 }, {
      loadImage: async () => ({ width: 4032, height: 3024 }),
      createCanvas: () => canvas,
    });
    expect(out.reencoded).toBe(true);
    expect(out.mimeType).toBe('image/jpeg');
    expect(dataUrlMimeOf(out.dataUrl)).toBe('image/jpeg');
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  test('transparency is painted white before the JPEG export', async () => {
    const canvas = fakeCanvas();
    await downscaleImageDataUrl('data:image/png;base64,' + 'A'.repeat(3_000_000), {}, {
      loadImage: async () => ({ width: 800, height: 600 }),
      createCanvas: () => canvas,
    });
    expect(canvas.ctx.fillStyle).toBe('#ffffff');
    expect(canvas.ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    const fillOrder = canvas.ctx.fillRect.mock.invocationCallOrder[0]!;
    const drawOrder = canvas.ctx.drawImage.mock.invocationCallOrder[0]!;
    expect(fillOrder).toBeLessThan(drawOrder);
  });

  test('a small PNG screenshot is kept as is (stays crisp, stays image/png)', async () => {
    const createCanvas = jest.fn(() => fakeCanvas());
    const out = await downscaleImageDataUrl('data:image/png;base64,AAAA', {}, {
      loadImage: async () => ({ width: 1200, height: 800 }),
      createCanvas,
    });
    expect(out).toEqual({ dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png', reencoded: false });
    expect(createCanvas).not.toHaveBeenCalled();
  });

  test('an image the browser cannot decode keeps its bytes, typed by the fallback', async () => {
    const out = await downscaleImageDataUrl('data:application/octet-stream;base64,AAAA', { fallbackMime: 'image/heic' }, {
      loadImage: async () => { throw new Error('decode'); },
      createCanvas: () => fakeCanvas(),
    });
    expect(out.mimeType).toBe('image/heic');
    expect(out.dataUrl).toBe('data:image/heic;base64,AAAA');
  });

  test('a canvas that cannot export ("data:,") falls back to the original', async () => {
    const out = await downscaleImageDataUrl('data:image/jpeg;base64,AAAA', {}, {
      loadImage: async () => ({ width: 5000, height: 5000 }),
      createCanvas: () => fakeCanvas('data:,'),
    });
    expect(out.reencoded).toBe(false);
    expect(out.mimeType).toBe('image/jpeg');
  });
});

// ─── The hook ────────────────────────────────────────────────────────────────────────────────────────────

describe('useAttachments — picker', () => {
  test('a photo keeps its name and size, and is typed by the bytes sent (image/jpeg after downscale)', async () => {
    const { result } = setup();
    const f = fakeFile('IMG_0042.HEIC', 'image/heic', 3 * MB);
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => { res = await result.current.add([f], 'photos'); });
    expect(res.rejected).toEqual([]);
    const it = result.current.items[0]!;
    expect(it).toMatchObject({ name: 'IMG_0042.HEIC', size: 3 * MB, kind: 'image', mimeType: 'image/jpeg', status: 'ready', source: 'photos' });
    expect(dataUrlMimeOf(it.dataUrl)).toBe('image/jpeg');
    expect(it.previewUrl).toBe(it.dataUrl);
    expect(it.payloadBytes).toBe(it.dataUrl.length);
    expect(result.current.processing).toBe(false);
  });

  test('onInputChange adds the picked files and resets the input', async () => {
    const { result } = setup();
    const input = document.createElement('input');
    input.type = 'file';
    const f = fakeFile('a.pdf', 'application/pdf', 2000);
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    await act(async () => {
      result.current.onInputChange('files')({ target: input } as unknown as ChangeEvent<HTMLInputElement>);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.items.map((i) => [i.name, i.kind, i.mimeType])).toEqual([['a.pdf', 'pdf', 'application/pdf']]);
    expect(input.value).toBe('');
  });

  test('a video gets an object-URL preview, revoked on remove', async () => {
    const revoke = jest.fn();
    const { result } = setup({ deps: deps({ revokeObjectUrl: revoke }) });
    await act(async () => { await result.current.add([fakeFile('clip.mp4', 'video/mp4', 500_000)]); });
    const it = result.current.items[0]!;
    expect(it.previewUrl).toBe('blob:preview');
    act(() => result.current.remove(it.id));
    expect(result.current.items).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:preview');
  });
});

describe('useAttachments — caps', () => {
  test('per-file caps by kind: image 10 MB, pdf 15 MB, video 20 MB', async () => {
    const { result, onReject } = setup({ totalCapBytes: Infinity });
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => {
      res = await result.current.add([
        fakeFile('big.jpg', 'image/jpeg', 10 * MB + 1),
        fakeFile('ok.jpg', 'image/jpeg', 10 * MB),
        fakeFile('big.pdf', 'application/pdf', 15 * MB + 1),
        fakeFile('big.mp4', 'video/mp4', 20 * MB + 1),
        fakeFile('ok.mp3', 'audio/mpeg', 20 * MB),
      ]);
    });
    expect(res.rejected.map((r) => [r.name, r.reason])).toEqual([
      ['big.jpg', 'too_large'], ['big.pdf', 'too_large'], ['big.mp4', 'too_large'],
    ]);
    expect(res.rejected[0]!.message).toContain('10');
    expect(res.rejected[1]!.message).toContain('15');
    expect(res.rejected[2]!.message).toContain('20');
    expect(onReject).toHaveBeenCalledTimes(3);
    expect(result.current.items.map((i) => i.name)).toEqual(['ok.jpg', 'ok.mp3']);
  });

  test('the total cap counts ENCODED bytes and refuses the file that would cross it', async () => {
    // Each fake data URL is ~40 chars; a 100-char cap fits two.
    const readAsDataUrl = async (f: Blob) => `data:application/pdf;base64,${'A'.repeat(20)}${(f as File).name}`;
    const { result } = setup({ totalCapBytes: 100, deps: deps({ readAsDataUrl }) });
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => {
      res = await result.current.add([fakeFile('1.pdf', 'application/pdf'), fakeFile('2.pdf', 'application/pdf'), fakeFile('3.pdf', 'application/pdf')]);
    });
    expect(result.current.items.map((i) => i.name)).toEqual(['1.pdf']);
    expect(res.rejected.map((r) => r.reason)).toEqual(['total_too_large', 'total_too_large']);
    expect(result.current.totalBytes).toBe(result.current.items[0]!.dataUrl.length);
  });

  test('one file over the total cap on its own is simply "too large", naming the cap', async () => {
    const { result } = setup({ locale: 'en', totalCapBytes: 2 * MB, deps: deps({ readAsDataUrl: async () => `data:application/pdf;base64,${'A'.repeat(3 * MB)}` }) });
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => { res = await result.current.add([fakeFile('big.pdf', 'application/pdf', 2.3 * MB)]); });
    expect(res.rejected[0]).toMatchObject({ reason: 'too_large' });
    expect(res.rejected[0]!.message).toContain('max 2 MB');
  });

  test('at most 5 attachments', async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => {
      res = await result.current.add(Array.from({ length: 7 }, (_, i) => fakeFile(`${i}.pdf`, 'application/pdf')));
    });
    expect(result.current.items).toHaveLength(5);
    expect(res.rejected.map((r) => r.reason)).toEqual(['too_many', 'too_many']);
  });

  test('an empty (iCloud-not-downloaded) file is refused with a clear message', async () => {
    const { result } = setup({ locale: 'en' });
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => { res = await result.current.add([fakeFile('x.pdf', 'application/pdf', 0)]); });
    expect(res.rejected[0]).toMatchObject({ reason: 'empty' });
    expect(res.rejected[0]!.message).toMatch(/empty/);
  });
});

describe('useAttachments — documents', () => {
  test('.docx goes through /api/utils/extract-text and travels as text/plain under its own name', async () => {
    const fetchMock = jest.fn(async () => jsonRes({ text: 'სცენარი: ღამის თბილისი' }));
    const { result } = setup({ deps: deps({ fetch: fetchMock as unknown as typeof fetch }) });
    await act(async () => { await result.current.add([fakeFile('script.docx', '', 50_000)]); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/utils/extract-text');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { dataUrl: string; mimeType: string };
    expect(body.dataUrl.startsWith('data:')).toBe(true);
    expect(body.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const it = result.current.items[0]!;
    expect(it).toMatchObject({ name: 'script.docx', kind: 'doc', mimeType: 'text/plain', status: 'ready' });
    expect(decodeDataUrl(it.dataUrl)).toBe('სცენარი: ღამის თბილისი');

    const media = result.current.toHistoryMedia();
    expect(media).toEqual([{ kind: 'file', dataUrl: it.dataUrl, mimeType: 'text/plain', name: 'script.docx' }]);

    // End to end with the real serializer: the doc reaches the wire as a readable text/plain file part.
    const wire = serializeHistory([{ role: 'user', text: 'წაიკითხე', medias: media }]);
    const content = wire[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    const filePart = (content as Array<{ type: string; mimeType?: string; name?: string }>).find((p) => p.type === 'file');
    expect(filePart).toMatchObject({ mimeType: 'text/plain' });
  });

  test('a .docx that extracts to nothing is refused as unreadable, not sent as bytes', async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => { res = await result.current.add([fakeFile('empty.docx', '', 10_000)]); });
    expect(res.rejected).toEqual([expect.objectContaining({ name: 'empty.docx', reason: 'unreadable' })]);
    expect(result.current.items).toEqual([]);
  });

  test('a failing extract request is unreadable too', async () => {
    const fetchMock = jest.fn(async () => { throw new TypeError('offline'); });
    const { result } = setup({ deps: deps({ fetch: fetchMock as unknown as typeof fetch }) });
    let res!: Awaited<ReturnType<typeof result.current.add>>;
    await act(async () => { res = await result.current.add([fakeFile('x.docx', '', 10_000)]); });
    expect(res.rejected[0]!.reason).toBe('unreadable');
  });

  test('.txt / .md are decoded in the browser (no request), BOM stripped', async () => {
    const fetchMock = jest.fn();
    const { result } = setup({ deps: deps({ fetch: fetchMock as unknown as typeof fetch, readAsText: async () => '﻿# სათაური\n\nტექსტი' }) });
    await act(async () => { await result.current.add([fakeFile('notes.md', '', 30)]); });
    expect(fetchMock).not.toHaveBeenCalled();
    const it = result.current.items[0]!;
    expect(it).toMatchObject({ kind: 'text', mimeType: 'text/plain', name: 'notes.md' });
    expect(decodeDataUrl(it.dataUrl)).toBe('# სათაური\n\nტექსტი');
  });

  test('a very long document is cut and flagged', async () => {
    const { result } = setup({ totalCapBytes: Infinity, deps: deps({ readAsText: async () => 'a '.repeat(MAX_DOC_TEXT_CHARS) }) });
    await act(async () => { await result.current.add([fakeFile('long.txt', 'text/plain', 200_000)]); });
    expect(result.current.items[0]!.truncated).toBe(true);
  });
});

describe('useAttachments — paste', () => {
  const clip = (over: Partial<DataTransferLike> & { data?: Record<string, string> }): DataTransferLike => ({
    items: [],
    files: [],
    types: [],
    getData: (t: string) => over.data?.[t] ?? '',
    ...over,
  });

  test('a pasted image is attached and the default paste is prevented', async () => {
    const { result } = setup();
    const img = fakeFile('image.png', 'image/png', 50_000);
    const preventDefault = jest.fn();
    await act(async () => {
      result.current.onPaste({
        clipboardData: clip({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }], types: ['Files'] }),
        preventDefault,
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ kind: 'image', source: 'paste' });
  });

  test('a plain text paste is left to the browser', () => {
    const { result } = setup();
    const preventDefault = jest.fn();
    act(() => {
      result.current.onPaste({
        clipboardData: clip({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], types: ['text/plain'], data: { 'text/plain': 'hello' } }),
        preventDefault,
      });
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  test('text copied from Word (text + a rendered PNG) stays a text paste', () => {
    const png = fakeFile('image.png', 'image/png');
    expect(filesFromClipboard(clip({
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }, { kind: 'file', type: 'image/png', getAsFile: () => png }],
      types: ['text/plain', 'text/html', 'text/rtf', 'Files'],
      data: { 'text/plain': 'Quarterly report', 'text/html': '<html xmlns:o="urn:schemas-microsoft-com:office:office">' },
    }))).toEqual([]);
  });

  test('files come from `files` when `items` has none (Firefox)', () => {
    const f = fakeFile('a.pdf', 'application/pdf');
    expect(filesFromClipboard(clip({ files: [f] }))).toEqual([f]);
  });

  test('a nameless pasted image gets a readable name', async () => {
    const { result } = setup();
    const img = fakeFile('', 'image/jpeg', 40_000);
    await act(async () => { await result.current.add([img], 'paste'); });
    expect(result.current.items[0]!.name).toBe('pasted-image.jpg');
  });
});

describe('useAttachments — drag and drop', () => {
  const dragEvent = (files: File[], types = ['Files']) => ({
    dataTransfer: { types, files },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  }) as unknown as ReactDragEvent;

  test('a file drag lights the surface; the drop attaches', async () => {
    const { result } = setup();
    act(() => result.current.dropHandlers.onDragEnter(dragEvent([])));
    expect(result.current.dragActive).toBe(true);
    const drop = dragEvent([fakeFile('d.pdf', 'application/pdf')]);
    await act(async () => {
      result.current.dropHandlers.onDrop(drop);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(drop.preventDefault).toHaveBeenCalled(); // or the tab navigates to the file
    expect(result.current.dragActive).toBe(false);
    expect(result.current.items[0]).toMatchObject({ name: 'd.pdf', source: 'drop' });
  });

  test('a text-selection drag is ignored', () => {
    const { result } = setup();
    const e = dragEvent([], ['text/plain']);
    act(() => result.current.dropHandlers.onDragEnter(e));
    expect(result.current.dragActive).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  test('leaving through a child keeps the overlay; leaving the surface clears it', () => {
    const { result } = setup();
    act(() => { result.current.dropHandlers.onDragEnter(dragEvent([])); result.current.dropHandlers.onDragEnter(dragEvent([])); });
    act(() => result.current.dropHandlers.onDragLeave(dragEvent([])));
    expect(result.current.dragActive).toBe(true);
    act(() => result.current.dropHandlers.onDragLeave(dragEvent([])));
    expect(result.current.dragActive).toBe(false);
  });
});

describe('useAttachments — lifecycle', () => {
  test('toHistoryMedia leaves out items still processing; clear() empties', async () => {
    let release!: (v: string) => void;
    const readAsDataUrl = jest.fn((f: Blob) => ((f as File).name === 'slow.pdf'
      ? new Promise<string>((r) => { release = r; })
      : Promise.resolve('data:application/pdf;base64,QUFB')));
    const { result } = setup({ deps: deps({ readAsDataUrl }) });
    await act(async () => { await result.current.add([fakeFile('fast.pdf', 'application/pdf')]); });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.add([fakeFile('slow.pdf', 'application/pdf')]); });
    expect(result.current.items.map((i) => i.status)).toEqual(['ready', 'processing']);
    expect(result.current.processing).toBe(true);
    expect(result.current.toHistoryMedia().map((m) => m.name)).toEqual(['fast.pdf']);
    await act(async () => { release('data:application/pdf;base64,QkJC'); await pending; });
    expect(result.current.toHistoryMedia().map((m) => m.name)).toEqual(['fast.pdf', 'slow.pdf']);
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
  });

  test('a file removed while processing never comes back', async () => {
    let release!: (v: string) => void;
    const readAsDataUrl = jest.fn(() => new Promise<string>((r) => { release = r; }));
    const { result } = setup({ deps: deps({ readAsDataUrl }) });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.add([fakeFile('x.pdf', 'application/pdf')]); });
    const id = result.current.items[0]!.id;
    act(() => result.current.remove(id));
    await act(async () => { release('data:application/pdf;base64,QUFB'); await pending; });
    expect(result.current.items).toEqual([]);
  });

  test('returned functions are stable across renders', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current.add).toBe(first.add);
    expect(result.current.onPaste).toBe(first.onPaste);
    expect(result.current.remove).toBe(first.remove);
    expect(result.current.dropHandlers).toBe(first.dropHandlers);
  });
});
