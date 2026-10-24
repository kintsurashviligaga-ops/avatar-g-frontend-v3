/**
 * @jest-environment jsdom
 */
import { BUFFER_MAX_BYTES, SAME_SAVE_MS, belongsInPhotos, extensionFor, fileNameFor, forgetSavesForTests, isAppleTouch, saveMedia, shareFile } from './saveMedia';
import { AUDIO_ACCEPT, withAudioTypes } from './accept';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('which device gets the share sheet', () => {
  it('an iPhone, and an iPad that calls itself a Mac with a touch screen', () => {
    expect(isAppleTouch({ userAgent: IPHONE_UA })).toBe(true);
    expect(isAppleTouch({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  });
  it('not a desktop Mac, not Android, not an unknown navigator', () => {
    expect(isAppleTouch({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isAppleTouch({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(false);
    expect(isAppleTouch(undefined)).toBe(false);
  });
  it('only pictures and videos belong in Photos', () => {
    expect(belongsInPhotos('image/jpeg')).toBe(true);
    expect(belongsInPhotos('video/mp4')).toBe(true);
    expect(belongsInPhotos('audio/mpeg')).toBe(false);
    expect(belongsInPhotos('application/pdf')).toBe(false);
    expect(belongsInPhotos('')).toBe(false);
  });
});

describe('the saved file has one extension, the right one', () => {
  it('reads it from the bytes first', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('video/quicktime')).toBe('mov');
    expect(extensionFor('video/mp4')).toBe('mp4');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/mpeg')).toBe('mp3');
  });
  it('a 3D model, a PDF and the less common picture, film and sound types (§4.3)', () => {
    expect(extensionFor('model/gltf-binary')).toBe('glb');
    expect(extensionFor('model/gltf+json')).toBe('gltf');
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('image/avif')).toBe('avif');
    expect(extensionFor('video/mpeg')).toBe('mpg'); // not .mp3
    expect(extensionFor('audio/x-m4a')).toBe('m4a');
    expect(extensionFor('audio/wav')).toBe('wav');
    expect(extensionFor('audio/flac')).toBe('flac');
    expect(extensionFor('audio/ogg; codecs=opus')).toBe('ogg');
    expect(fileNameFor('myavatar-image-chair', 'application/octet-stream', 'https://s/renders/chair.glb?token=1', 'png')).toBe('myavatar-image-chair.glb');
  });
  it('a JPEG behind a ".png" name is saved as .jpg, not "x.png.jpeg"', () => {
    expect(fileNameFor('myavatar-image.png', 'image/jpeg', 'https://s/x.png?token=1')).toBe('myavatar-image.jpg');
  });
  it('falls back to the URL, then the name it was given, then the fallback', () => {
    expect(fileNameFor('clip', 'application/octet-stream', 'https://s/a/b.webm?sig=1')).toBe('clip.webm');
    expect(fileNameFor('track.mp3', 'application/octet-stream', 'https://s/a/b')).toBe('track.mp3');
    expect(fileNameFor('myavatar-video', '', 'https://s/a/b', 'mp4')).toBe('myavatar-video.mp4');
    expect(fileNameFor('', '', '')).toBe('myavatar.bin');
  });
});

describe('an iPhone picker can pick music', () => {
  it('names the audio types and extensions next to the wildcard', () => {
    for (const t of ['audio/*', 'audio/mpeg', 'audio/x-m4a', '.mp3', '.m4a', '.wav']) expect(AUDIO_ACCEPT.split(',')).toContain(t);
  });
  it('widens a bare audio/* once and leaves other lists alone', () => {
    const wide = withAudioTypes('image/*,audio/*,video/*');
    expect(wide.split(',')).toEqual(expect.arrayContaining(['image/*', 'video/*', '.mp3', 'audio/mpeg']));
    expect(wide.split(',').filter((p) => p === 'audio/*')).toHaveLength(1);
    expect(withAudioTypes('image/*,video/*')).toBe('image/*,video/*');
  });
});

describe('saving', () => {
  const realFetch = global.fetch;
  const realNav = Object.getOwnPropertyDescriptor(window, 'navigator');
  let clicked: string[];
  let clickedUrls: string[];
  let opened: string[];
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;

  function setNavigator(nav: Record<string, unknown>) {
    Object.defineProperty(window, 'navigator', { configurable: true, value: { ...nav } });
  }
  function respond(type: string) {
    global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type }) })) as unknown as typeof fetch;
  }

  beforeEach(() => {
    forgetSavesForTests();
    clicked = [];
    clickedUrls = [];
    opened = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); clickedUrls.push(this.href); });
    jest.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return null; });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = realFetch;
    if (storageOrigin === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = storageOrigin;
    if (realNav) Object.defineProperty(window, 'navigator', realNav);
  });

  const signedAsset = 'https://example.supabase.co/storage/v1/object/sign/renders/clip.mp4?token=signed-token&download=old.mp4&cache=1';

  it('starts a trusted storage attachment after headers, without waiting for file bytes', async () => {
    setNavigator({ userAgent: MAC_UA });
    const blob = jest.fn(() => new Promise<Blob>(() => {}));
    global.fetch = jest.fn(async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'image/jpeg' }), blob })) as unknown as typeof fetch;
    await expect(saveMedia(signedAsset, 'myavatar-image.png')).resolves.toBe('started');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
    expect(blob).not.toHaveBeenCalled();
    expect(clicked).toEqual(['myavatar-image.jpg']);
    const link = new URL(clickedUrls[0]!);
    expect(link.origin).toBe('https://example.supabase.co');
    expect(link.pathname).toBe('/storage/v1/object/sign/renders/clip.mp4');
    expect(link.searchParams.get('token')).toBe('signed-token');
    expect(link.searchParams.get('cache')).toBe('1');
    expect(link.searchParams.getAll('download')).toEqual(['myavatar-image.jpg']);
    expect(opened).toEqual([]);
  });

  it.each([
    'https://other.supabase.co/storage/v1/object/sign/renders/clip.mp4?token=t',
    'https://example.supabase.co.evil.test/storage/v1/object/sign/renders/clip.mp4?token=t',
    'https://example.supabase.co/api/clip.mp4?token=t',
    'https://example.supabase.co/storage/v1/object/sign/renders/clip.mp4',
    'https://user:password@example.supabase.co/storage/v1/object/sign/renders/clip.mp4?token=t',
  ])('keeps the byte-based path for an unqualified URL: %s', async (url) => {
    setNavigator({ userAgent: MAC_UA });
    respond('video/mp4');
    await expect(saveMedia(url, 'clip')).resolves.toBe('downloaded');
    expect(global.fetch).toHaveBeenCalledWith(url, { cache: 'no-store' });
    expect(clickedUrls).toEqual(['blob:x']);
  });

  it.each([false, true])('falls back to bytes when storage does not return usable media metadata (HTTP ok=%s)', async (ok) => {
    setNavigator({ userAgent: MAC_UA });
    const fetcher = jest.fn()
      .mockResolvedValueOnce({ ok, headers: new Headers({ 'Content-Type': 'text/html' }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['x'], { type: 'video/mp4' }) });
    global.fetch = fetcher as unknown as typeof fetch;
    await expect(saveMedia(signedAsset, 'clip')).resolves.toBe('downloaded');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(clickedUrls).toEqual(['blob:x']);
  });

  it('a stalled metadata request is aborted after two seconds and uses the existing byte path', async () => {
    jest.useFakeTimers();
    setNavigator({ userAgent: MAC_UA });
    let signal: AbortSignal | undefined;
    const fetcher = jest.fn().mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })).mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['x'], { type: 'video/mp4' }) });
    global.fetch = fetcher as unknown as typeof fetch;
    try {
      const saving = saveMedia(signedAsset, 'clip');
      expect(signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(2000);
      await expect(saving).resolves.toBe('downloaded');
      expect(signal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(clickedUrls).toEqual(['blob:x']);
    } finally { jest.useRealTimers(); }
  });

  it('keeps iPhone Photos sharing for trusted storage links, with no metadata request', async () => {
    respond('video/mp4');
    const share = jest.fn(async () => undefined);
    setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
    await expect(saveMedia(signedAsset, 'clip')).resolves.toBe('shared');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(signedAsset, { cache: 'no-store' });
    expect(share).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([]);
  });

  it('on an iPhone a video goes to the share sheet as a file (→ "Save Video" → Photos), not a download', async () => {
    respond('video/mp4');
    const share = jest.fn(async (_d: { files?: File[] }) => undefined);
    setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
    await expect(saveMedia('https://s/clip.mp4?sig=1', 'myavatar-video')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const file = share.mock.calls[0]![0].files![0]!;
    expect(file.name).toBe('myavatar-video.mp4');
    expect(file.type).toBe('video/mp4');
    expect(clicked).toEqual([]);
  });

  it('a closed sheet is the user saying no: nothing is downloaded behind it', async () => {
    respond('image/png');
    const share = jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); });
    setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
    await expect(saveMedia('https://s/a.png', 'img')).resolves.toBe('cancelled');
    expect(clicked).toEqual([]);
  });

  it('when the tap expired during a long fetch, the file is offered again behind one tap', async () => {
    respond('video/mp4');
    const share = jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); });
    setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
    const ready = jest.fn();
    window.addEventListener('myavatar:save-ready', ready);
    await expect(saveMedia('https://s/a.mp4', 'v')).resolves.toBe('needs-tap');
    window.removeEventListener('myavatar:save-ready', ready);
    expect(ready).toHaveBeenCalledTimes(1);
    expect((ready.mock.calls[0]![0] as CustomEvent<{ file: File }>).detail.file.name).toBe('v.mp4');
    expect(clicked).toEqual([]);
  });

  it('on an iPhone an MP3 still downloads (Photos cannot hold audio)', async () => {
    respond('audio/mpeg');
    const share = jest.fn();
    setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
    await expect(saveMedia('https://s/t', 'myavatar-track.mp3')).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['myavatar-track.mp3']);
  });

  it('a desktop downloads even where the browser could share', async () => {
    respond('image/jpeg');
    const share = jest.fn();
    setNavigator({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0, share, canShare: () => true });
    await expect(saveMedia('https://s/a.png', 'myavatar-image.png')).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['myavatar-image.jpg']);
  });

  it('a URL that cannot be fetched is opened rather than doing nothing', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('cors'); }) as unknown as typeof fetch;
    setNavigator({ userAgent: IPHONE_UA });
    await expect(saveMedia('https://s/a.mp4', 'v')).resolves.toBe('opened');
    expect(opened).toEqual(['https://s/a.mp4']);
  });

  describe('a double click (§4.3)', () => {
    it('saves one file: the second tap gets the first one\'s outcome', async () => {
      setNavigator({ userAgent: MAC_UA });
      global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'video/mp4' }) })) as unknown as typeof fetch;
      const first = saveMedia(signedAsset, 'clip');
      const second = saveMedia(`${signedAsset}#t=0.1`, 'clip');
      expect(second).toBe(first);
      await expect(first).resolves.toBe('started');
      await expect(saveMedia(signedAsset, 'clip')).resolves.toBe('started'); // a tap just after: still the same save
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(clicked).toHaveLength(1);
    });

    it('a later tap saves again', async () => {
      jest.useFakeTimers();
      try {
        setNavigator({ userAgent: MAC_UA });
        global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'image/png' }) })) as unknown as typeof fetch;
        await expect(saveMedia(signedAsset, 'a')).resolves.toBe('started');
        await jest.advanceTimersByTimeAsync(SAME_SAVE_MS);
        await expect(saveMedia(signedAsset, 'a')).resolves.toBe('started');
        expect(clicked).toHaveLength(2);
      } finally { jest.useRealTimers(); }
    });

    it('a closed share sheet lets the next tap open it again', async () => {
      respond('image/png');
      const share = jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); });
      setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
      await expect(saveMedia('https://s/a.png', 'img')).resolves.toBe('cancelled');
      await expect(saveMedia('https://s/a.png', 'img')).resolves.toBe('cancelled');
      expect(share).toHaveBeenCalledTimes(2);
    });
  });

  describe('a link that ran out (§4.3)', () => {
    const fresh = 'https://example.supabase.co/storage/v1/object/sign/renders/clip.mp4?token=fresh-token';
    const answers = (...list: { status: number; type?: string; blob?: string }[]) => jest.fn(async () => {
      const a = list.shift() ?? { status: 500 };
      return { ok: a.status >= 200 && a.status < 300, status: a.status, headers: new Headers(a.type ? { 'Content-Type': a.type } : {}),
        blob: async () => new Blob([a.blob ?? 'x'], { type: a.type ?? '' }) };
    });

    it('a link Storage refuses is replaced once, and the save goes on with the fresh one', async () => {
      setNavigator({ userAgent: MAC_UA });
      const fetcher = answers({ status: 400 }, { status: 200, type: 'video/mp4' });
      global.fetch = fetcher as unknown as typeof fetch;
      const relink = jest.fn(async () => fresh);
      await expect(saveMedia(signedAsset, 'clip', { relink })).resolves.toBe('started');
      expect(relink).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls.map((c) => (c as unknown[])[1])).toEqual([expect.objectContaining({ method: 'HEAD' }), expect.objectContaining({ method: 'HEAD' })]);
      expect(new URL(clickedUrls[0]!).searchParams.get('token')).toBe('fresh-token');
      expect(opened).toEqual([]);
    });

    it('a link already out is replaced before anything is asked', async () => {
      setNavigator({ userAgent: MAC_UA });
      const fetcher = answers({ status: 200, type: 'image/jpeg' });
      global.fetch = fetcher as unknown as typeof fetch;
      const relink = jest.fn(async () => fresh);
      await expect(saveMedia(signedAsset, 'a', { relink, expiresAt: new Date(Date.now() + 5_000).toISOString() })).resolves.toBe('started');
      expect(relink).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('token=fresh-token');
    });

    it('a link with time left is not replaced', async () => {
      setNavigator({ userAgent: MAC_UA });
      global.fetch = answers({ status: 200, type: 'image/jpeg' }) as unknown as typeof fetch;
      const relink = jest.fn(async () => fresh);
      await expect(saveMedia(signedAsset, 'a', { relink, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })).resolves.toBe('started');
      expect(relink).not.toHaveBeenCalled();
    });

    it('on an iPhone the refused file is read again from the fresh link and still goes to the share sheet', async () => {
      const fetcher = answers({ status: 403 }, { status: 200, type: 'video/mp4' });
      global.fetch = fetcher as unknown as typeof fetch;
      const share = jest.fn(async () => undefined);
      setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
      await expect(saveMedia(signedAsset, 'clip', { relink: async () => fresh })).resolves.toBe('shared');
      expect(fetcher.mock.calls.map((c) => (c as unknown[])[0])).toEqual([signedAsset, fresh]);
    });

    it('with no fresh link to be had, it does what it did before: one fresh-link ask, then the byte path', async () => {
      setNavigator({ userAgent: MAC_UA });
      const fetcher = answers({ status: 400 }, { status: 400 });
      global.fetch = fetcher as unknown as typeof fetch;
      const relink = jest.fn(async () => null);
      await expect(saveMedia(signedAsset, 'clip', { relink })).resolves.toBe('opened');
      expect(relink).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(clicked).toEqual([]);
    });
  });

  describe('a large file is never held in memory off an iPhone (§4.3)', () => {
    const foreign = 'https://cdn.example.com/films/long.mp4?sig=1';
    function answer(headers: Record<string, string>) {
      const blob = jest.fn(async () => new Blob(['x'], { type: headers['Content-Type'] ?? '' }));
      const cancel = jest.fn(async () => undefined);
      global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(headers), body: { cancel }, blob })) as unknown as typeof fetch;
      return { blob, cancel };
    }

    it('a file over the limit opens in a tab: its bytes are never read', async () => {
      setNavigator({ userAgent: MAC_UA });
      const { blob, cancel } = answer({ 'Content-Type': 'video/mp4', 'Content-Length': String(BUFFER_MAX_BYTES + 1) });
      await expect(saveMedia(foreign, 'film')).resolves.toBe('opened');
      expect(blob).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalled();
      expect(opened).toEqual([foreign]);
      expect(clicked).toEqual([]);
    });

    it('so does a video of unknown size', async () => {
      setNavigator({ userAgent: MAC_UA });
      const { blob } = answer({ 'Content-Type': 'video/mp4' });
      await expect(saveMedia(foreign, 'film')).resolves.toBe('opened');
      expect(blob).not.toHaveBeenCalled();
    });

    it('a small file still downloads', async () => {
      setNavigator({ userAgent: MAC_UA });
      const { blob } = answer({ 'Content-Type': 'video/mp4', 'Content-Length': '2048' });
      await expect(saveMedia(foreign, 'film')).resolves.toBe('downloaded');
      expect(blob).toHaveBeenCalled();
      expect(clicked).toEqual(['film.mp4']);
    });

    it('an iPhone still reads a large video: its share sheet needs the whole file', async () => {
      const { blob } = answer({ 'Content-Type': 'video/mp4', 'Content-Length': String(BUFFER_MAX_BYTES * 2) });
      const share = jest.fn(async () => undefined);
      setNavigator({ userAgent: IPHONE_UA, share, canShare: () => true });
      await expect(saveMedia(foreign, 'film')).resolves.toBe('shared');
      expect(blob).toHaveBeenCalled();
    });
  });

  it.each([
    ['model/gltf-binary', 'https://example.supabase.co/storage/v1/object/sign/renders/chair.glb?token=t', 'myavatar-image-chair.glb'],
    ['application/octet-stream', 'https://example.supabase.co/storage/v1/object/sign/renders/chair.glb?token=t', 'myavatar-image-chair.glb'],
    ['application/pdf', 'https://example.supabase.co/storage/v1/object/sign/renders/plan.pdf?token=t', 'myavatar-image-chair.pdf'],
    ['audio/mpeg', 'https://example.supabase.co/storage/v1/object/sign/renders/song?token=t', 'myavatar-image-chair.mp3'],
  ])('a Storage %s starts as an attachment too, with the right name', async (type, url, name) => {
    setNavigator({ userAgent: MAC_UA });
    const blob = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': type }), blob })) as unknown as typeof fetch;
    await expect(saveMedia(url, 'myavatar-image-chair', { fallbackExt: 'png' })).resolves.toBe('started');
    expect(blob).not.toHaveBeenCalled();
    expect(clicked).toEqual([name]);
    expect(new URL(clickedUrls[0]!).searchParams.get('download')).toBe(name);
  });

  it('the second tap hands the kept file to the sheet', async () => {
    const share = jest.fn(async () => undefined);
    const f = new File(['x'], 'v.mp4', { type: 'video/mp4' });
    await expect(shareFile(f, { share })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [f] });
  });
});
