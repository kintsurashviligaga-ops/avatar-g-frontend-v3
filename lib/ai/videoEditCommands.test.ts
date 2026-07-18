import { parseVideoEditCommand } from './videoEditCommands';

describe('parseVideoEditCommand — natural-language video edits drive the sliders', () => {
  it('maps timeline ops (split / mute / reset) across ka/en/ru', () => {
    expect(parseVideoEditCommand('split it here')?.op).toBe('split');
    expect(parseVideoEditCommand('გაჭერი')?.op).toBe('split');
    expect(parseVideoEditCommand('разрежь')?.op).toBe('split');
    expect(parseVideoEditCommand('mute this')?.op).toBe('mute');
    expect(parseVideoEditCommand('დაადუმე')?.op).toBe('mute');
    expect(parseVideoEditCommand('reset everything')?.op).toBe('reset');
    expect(parseVideoEditCommand('გადატვირთე')?.op).toBe('reset');
  });

  it('brightens / darkens with intensity', () => {
    expect(parseVideoEditCommand('brighten it')?.grade?.brightness).toBe(135);
    expect(parseVideoEditCommand('make it much brighter')?.grade?.brightness).toBe(165);
    expect(parseVideoEditCommand('გაანათე')?.grade?.brightness).toBe(135);
    expect(parseVideoEditCommand('darker please')?.grade?.brightness).toBe(70);
  });

  it('handles contrast / saturation / temperature', () => {
    expect(parseVideoEditCommand('add contrast')?.grade?.contrast).toBe(130);
    expect(parseVideoEditCommand('make it black and white')?.grade?.saturation).toBe(0);
    expect(parseVideoEditCommand('more vivid colors')?.grade?.saturation).toBe(150);
    expect(parseVideoEditCommand('warmer')?.grade?.temperature).toBe(45);
    expect(parseVideoEditCommand('cooler tone')?.grade?.temperature).toBe(-45);
    expect(parseVideoEditCommand('гораздо теплее')?.grade?.temperature).toBe(70); // "much warmer"
  });

  it('handles speed', () => {
    expect(parseVideoEditCommand('speed it up')?.speed).toBe(1.5);
    expect(parseVideoEditCommand('make it 2x')?.speed).toBe(2);
    expect(parseVideoEditCommand('slow motion')?.speed).toBe(0.5);
    expect(parseVideoEditCommand('ნელა')?.speed).toBe(0.5);
    expect(parseVideoEditCommand('normal speed')?.speed).toBe(1);
  });

  it('handles fade in / out / both', () => {
    expect(parseVideoEditCommand('fade in')?.fade).toEqual({ inSec: 1 });
    expect(parseVideoEditCommand('fade out')?.fade).toEqual({ outSec: 1 });
    expect(parseVideoEditCommand('add a fade')?.fade).toEqual({ inSec: 1, outSec: 1 });
  });

  it('combines multiple grade adjustments in one command', () => {
    const c = parseVideoEditCommand('brighten and add more contrast and make it warmer');
    expect(c?.grade).toEqual({ brightness: 135, contrast: 130, temperature: 45 });
  });

  it('returns null when nothing is recognised', () => {
    expect(parseVideoEditCommand('hello there, how are you?')).toBeNull();
    expect(parseVideoEditCommand('')).toBeNull();
    expect(parseVideoEditCommand('   ')).toBeNull();
  });

  it('handles a pathologically long input without hanging (input cap + bounded quantifiers — review fix)', () => {
    // ~400k chars of a repeated Georgian token: with the .slice(2000) cap + .{0,40} bounds this stays linear;
    // jest would time out if it went quadratic. The capped window has no trailing token, so nothing matches.
    expect(parseVideoEditCommand('კონტრასტ'.repeat(50000))).toBeNull();
  });
});
