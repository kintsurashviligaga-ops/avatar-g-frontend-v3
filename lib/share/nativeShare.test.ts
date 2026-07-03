import { detectShareCaps, pickShareStrategy, deriveFilename } from './nativeShare';

describe('native share strategy (STEP 4, pure)', () => {
  it('detectShareCaps reflects navigator support (injected)', () => {
    expect(detectShareCaps(undefined)).toEqual({ hasShare: false, canShareFiles: false });
    expect(detectShareCaps({} as never)).toEqual({ hasShare: false, canShareFiles: false });
    const navUrlOnly = { share: () => Promise.resolve() } as never;
    expect(detectShareCaps(navUrlOnly)).toEqual({ hasShare: true, canShareFiles: false });
    const f = { name: 'a.mp4' } as unknown as File;
    const navFiles = { share: () => Promise.resolve(), canShare: (d: { files?: unknown }) => Array.isArray(d.files) } as never;
    expect(detectShareCaps(navFiles, f)).toEqual({ hasShare: true, canShareFiles: true });
  });

  it('pickShareStrategy prefers files → url → download', () => {
    expect(pickShareStrategy({ hasShare: true, canShareFiles: true }, true)).toBe('web-share-files');
    // has file support but no bytes in hand → cannot file-share
    expect(pickShareStrategy({ hasShare: true, canShareFiles: true }, false)).toBe('web-share-url');
    expect(pickShareStrategy({ hasShare: true, canShareFiles: false }, true)).toBe('web-share-url');
    expect(pickShareStrategy({ hasShare: false, canShareFiles: false }, true)).toBe('download');
  });

  it('deriveFilename uses mime, then url extension, then kind default', () => {
    expect(deriveFilename({ url: 'https://x.test/a/b.mp4', mime: 'video/quicktime', title: 'My Clip' })).toBe('my-clip.mov');
    expect(deriveFilename({ url: 'https://x.test/renders/xyz.webm?token=1', title: 'Weekend Sale!' })).toBe('weekend-sale.webm');
    expect(deriveFilename({ url: 'https://x.test/nofext', kind: 'image' })).toBe('myavatar-image.jpg');
    expect(deriveFilename({ url: 'https://x.test/nofext', kind: 'video' })).toBe('myavatar-video.mp4');
  });

  it('deriveFilename slugs unicode titles and strips a stray extension in the base', () => {
    expect(deriveFilename({ url: 'https://x.test/v.mp4', filename: 'clip.mp4', mime: 'video/mp4' })).toBe('clip.mp4');
    const ka = deriveFilename({ url: 'https://x.test/v.mp4', title: 'ახალი დღე', mime: 'video/mp4' });
    expect(ka.endsWith('.mp4')).toBe(true);
    expect(ka.length).toBeGreaterThan(4);
  });
});
