/**
 * PHASE 57 hotfix — `resolveAssetType` must guarantee that EVERY service whose
 * turn carries a usable asset URL resolves to a renderable kind, so the inline
 * preview / Preview Workspace always mounts. The regression it fixes: a turn
 * that returned a good URL under a non-media `responseType` (or none) collapsed
 * to `null` and the preview silently vanished across all services.
 */

import { resolveAssetType } from './assetType';

describe('resolveAssetType — every service shows a preview', () => {
  describe('responseType is authoritative when it names a media kind', () => {
    it('image / video / audio pass straight through', () => {
      expect(resolveAssetType('image', 'https://x/whatever')).toBe('image');
      expect(resolveAssetType('video', 'https://x/whatever')).toBe('video');
      expect(resolveAssetType('audio', 'https://x/whatever')).toBe('audio');
    });
  });

  describe('falls back to the asset URL when responseType is non-media', () => {
    it("recovers an image even when the turn is tagged 'analysis'", () => {
      expect(
        resolveAssetType('analysis', 'https://replicate.delivery/abc/out-0.webp'),
      ).toBe('image');
    });

    it("recovers a video even when the turn is tagged 'text'", () => {
      expect(resolveAssetType('text', 'https://cdn.example.com/film/master.mp4')).toBe('video');
    });

    it("recovers audio even when the turn is tagged 'action_suggestions'", () => {
      expect(
        resolveAssetType('action_suggestions', 'https://cdn.example.com/track.mp3'),
      ).toBe('audio');
    });

    it('recovers when responseType is missing entirely', () => {
      expect(resolveAssetType(undefined, 'https://cdn.example.com/render.png')).toBe('image');
      expect(resolveAssetType(null, 'https://cdn.example.com/clip.webm')).toBe('video');
    });

    it('tolerates query strings and hashes on the asset URL', () => {
      expect(resolveAssetType(undefined, 'https://cdn/x.jpg?token=abc&exp=1')).toBe('image');
      expect(resolveAssetType(undefined, 'https://cdn/x.mp4#t=3')).toBe('video');
      expect(resolveAssetType(undefined, 'https://cdn/x.m4a?sig=z')).toBe('audio');
    });
  });

  describe('data: URIs are sniffed by their inline MIME type', () => {
    it('image / video / audio data URLs', () => {
      expect(resolveAssetType(undefined, 'data:image/png;base64,iVBORw0KGgo=')).toBe('image');
      expect(resolveAssetType(undefined, 'data:video/mp4;base64,AAAA')).toBe('video');
      expect(resolveAssetType(undefined, 'data:audio/mpeg;base64,SUQz')).toBe('audio');
    });
  });

  describe('mode is the last resort for extension-less / signed URLs', () => {
    it('video mode → video; music mode → audio; image/avatar mode → image', () => {
      const signed = 'https://storage.example.com/o/asset?alt=media&token=uuid';
      expect(resolveAssetType('text', signed, 'video')).toBe('video');
      expect(resolveAssetType('text', signed, 'music')).toBe('audio');
      expect(resolveAssetType('text', signed, 'image')).toBe('image');
      expect(resolveAssetType('text', signed, 'avatar')).toBe('image');
    });

    it('a known media responseType still wins over the mode hint', () => {
      expect(resolveAssetType('audio', 'https://x/no-ext', 'video')).toBe('audio');
    });
  });

  describe('returns null only when there is genuinely nothing to render', () => {
    it('no asset URL', () => {
      expect(resolveAssetType('text', null)).toBeNull();
      expect(resolveAssetType(undefined, undefined)).toBeNull();
      expect(resolveAssetType('analysis', '   ')).toBeNull();
    });

    it('an extension-less URL with no usable mode hint stays text', () => {
      expect(resolveAssetType('text', 'https://x/unknown', 'global')).toBeNull();
      expect(resolveAssetType('text', 'https://x/unknown', 'interior')).toBeNull();
      expect(resolveAssetType('text', 'https://x/unknown')).toBeNull();
    });
  });

  it('never throws on malformed input (pure string inspection)', () => {
    expect(() => resolveAssetType('image', '%%%not-a-url%%%')).not.toThrow();
    expect(() => resolveAssetType(undefined, 'data:')).not.toThrow();
    expect(() => resolveAssetType(undefined, '))((')).not.toThrow();
  });
});
