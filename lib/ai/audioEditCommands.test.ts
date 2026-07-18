import { parseAudioEditCommand } from './audioEditCommands';

describe('parseAudioEditCommand — natural-language audio edits drive the sliders', () => {
  it('maps an explicit dB duck to a linear volume (−12 dB ≈ 0.25)', () => {
    expect(parseAudioEditCommand('music duck -12dB')!.volume).toBeCloseTo(0.251, 2);
    expect(parseAudioEditCommand('მუსიკა ჩაუწიე -12dB-მდე')!.volume).toBeCloseTo(0.251, 2);
    expect(parseAudioEditCommand('-6 db')!.volume).toBeCloseTo(0.501, 2);
    expect(parseAudioEditCommand('+6db louder')!.volume).toBeCloseTo(1.995, 2);
  });

  it('handles mute / quieter / louder / duck / normal across ka/en/ru', () => {
    expect(parseAudioEditCommand('mute')!.volume).toBe(0);
    expect(parseAudioEditCommand('დაადუმე')!.volume).toBe(0);
    expect(parseAudioEditCommand('заглуши')!.volume).toBe(0);
    expect(parseAudioEditCommand('duck the music')!.volume).toBe(0.25);
    expect(parseAudioEditCommand('make it quieter')!.volume).toBe(0.5);
    expect(parseAudioEditCommand('louder please')!.volume).toBe(1.6);
    expect(parseAudioEditCommand('громче')!.volume).toBe(1.6);
    expect(parseAudioEditCommand('normal volume')!.volume).toBe(1);
  });

  it('handles fade in / out with an explicit duration + a bare fade', () => {
    expect(parseAudioEditCommand('fade in 2s')!.fade).toEqual({ inSec: 2 });
    expect(parseAudioEditCommand('fade out 3')!.fade).toEqual({ outSec: 3 });
    expect(parseAudioEditCommand('fade in')!.fade).toEqual({ inSec: 2 });
    expect(parseAudioEditCommand('add a fade')!.fade).toEqual({ inSec: 1.5, outSec: 1.5 });
    expect(parseAudioEditCommand('ფეიდ ინ')!.fade).toEqual({ inSec: 2 });
    // fade duration is clamped to the slider max (5s)
    expect(parseAudioEditCommand('fade in 9s')!.fade).toEqual({ inSec: 5 });
  });

  it('handles pitch (up/down + explicit semitones) and speed', () => {
    expect(parseAudioEditCommand('pitch up')!.pitch).toBe(3);
    expect(parseAudioEditCommand('lower pitch a lot')!.pitch).toBe(-6);
    expect(parseAudioEditCommand('+5 st')!.pitch).toBe(5);
    expect(parseAudioEditCommand('20 st')!.pitch).toBe(12); // clamped to the ±12 range
    expect(parseAudioEditCommand('speed up')!.speed).toBe(1.5);
    expect(parseAudioEditCommand('ნელა')!.speed).toBe(0.5);
    expect(parseAudioEditCommand('normal speed')!.speed).toBe(1);
  });

  it('combines multiple adjustments in one command', () => {
    const c = parseAudioEditCommand('duck the music to -12dB and add a fade in');
    expect(c!.volume).toBeCloseTo(0.251, 2);
    expect(c!.fade).toEqual({ inSec: 2 });
  });

  it('returns null when nothing is recognised', () => {
    expect(parseAudioEditCommand('hello, how are you?')).toBeNull();
    expect(parseAudioEditCommand('')).toBeNull();
    expect(parseAudioEditCommand('   ')).toBeNull();
  });

  it('does not blow up on a pathologically long input (input cap)', () => {
    expect(parseAudioEditCommand('ჩაუწიე'.repeat(50000))!.volume).toBe(0.25);
  });
});
