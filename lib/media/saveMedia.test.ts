/**
 * @jest-environment jsdom
 */
import { belongsInPhotos, extensionFor, fileNameFor, isAppleTouch, saveMedia, shareFile } from './saveMedia';
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
  let opened: string[];

  function setNavigator(nav: Record<string, unknown>) {
    Object.defineProperty(window, 'navigator', { configurable: true, value: { ...nav } });
  }
  function respond(type: string) {
    global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type }) })) as unknown as typeof fetch;
  }

  beforeEach(() => {
    clicked = [];
    opened = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
    jest.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return null; });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = realFetch;
    if (realNav) Object.defineProperty(window, 'navigator', realNav);
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

  it('the second tap hands the kept file to the sheet', async () => {
    const share = jest.fn(async () => undefined);
    const f = new File(['x'], 'v.mp4', { type: 'video/mp4' });
    await expect(shareFile(f, { share })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [f] });
  });
});
