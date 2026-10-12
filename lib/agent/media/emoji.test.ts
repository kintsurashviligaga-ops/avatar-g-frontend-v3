/** @jest-environment node */
/**
 * lib/agent/media/emoji — colour emoji as Twemoji SVG for the text layers („myavatar.ge🚀"): which characters have a
 * picture, and the markup set in the line.
 */
jest.mock('server-only', () => ({}));

import { clusters, emojiPresentation, twemojiKey, twemojiSvg } from './emoji';
import { TWEMOJI_COUNT } from './emoji-data-twemoji';

describe('Twemoji set', () => {
  test('the rocket, a heart with its selector, a flag, a keycap and a joined family have their pictures', () => {
    expect(twemojiKey('🚀')).toBe('1f680');
    expect(twemojiKey('❤️')).toBe('2764');
    expect(twemojiKey('🇬🇪')).toBe('1f1ec-1f1ea');
    expect(twemojiKey('1️⃣')).toBe('31-20e3');
    expect(twemojiKey('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467');
    expect(TWEMOJI_COUNT).toBeGreaterThan(1800);
  });

  test('letters, digits, and a skin tone (not in the bundled set) have none: the quote names them, nothing blank is drawn', () => {
    expect(twemojiKey('a')).toBeNull();
    expect(twemojiKey('ა')).toBeNull();
    expect(twemojiKey('👍🏽')).toBeNull();
    expect(twemojiKey('')).toBeNull();
  });

  test('a text splits into what a person sees as one character', () => {
    expect(clusters('myavatar.ge🚀').slice(-2)).toEqual(['e', '🚀']);
    expect(clusters('🇬🇪👨‍👩‍👧')).toEqual(['🇬🇪', '👨‍👩‍👧']);
    expect(emojiPresentation('❤️')).toBe(true);
    expect(emojiPresentation('🇬🇪')).toBe(true);
    expect(emojiPresentation('🚀')).toBe(false);
  });

  test('the picture is scaled from 36 px to the line, at its place, with its ids kept apart per emoji', () => {
    const svg = twemojiSvg('1f680', 100, 20, 72, 'e0_');
    expect(svg.startsWith('<g transform="translate(100 20) scale(2)">')).toBe(true);
    expect(svg).toContain('<path');
    expect(twemojiSvg('nope', 0, 0, 10, 'x')).toBe('');
    // Every id inside a picture that has some carries the prefix, and so does every reference to it.
    const withIds = ['1f3f3-fe0f-200d-1f308', '1f9ea', '1f30d'].map((k) => twemojiSvg(k, 0, 0, 36, 'p9_')).find((s) => /id="/.test(s));
    if (withIds) {
      expect(withIds).not.toMatch(/id="(?!p9_)/);
      expect(withIds).not.toMatch(/url\(#(?!p9_)/);
    }
  });
});
