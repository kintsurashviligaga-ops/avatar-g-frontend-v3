/** @jest-environment node */
import { mediaCarryingIndices, mediaPlaceholder, shouldSendMedia, MEDIA_WINDOW_TURNS } from './mediaWindow';

const img = { dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png' };
const txt = (t: string) => ({ role: 'user', text: t });
const withImg = (t: string) => ({ role: 'user', text: t, medias: [img] });

describe('the unbounded re-upload is actually bounded now', () => {
  it('THE BUG: five attached images used to all re-upload on every later message', () => {
    const history = [withImg('a'), withImg('b'), withImg('c'), withImg('d'), withImg('e'), txt('now what?')];
    const carrying = mediaCarryingIndices(history);
    expect(carrying.size).toBe(MEDIA_WINDOW_TURNS);
    // Only the most recent media-bearing turns survive; the older three are dropped.
    expect([...carrying].sort()).toEqual([3, 4]);
  });

  it('a long text-only tail does NOT push the last image out of the window', () => {
    // Counting raw turns would drop the image after two replies while the user is still discussing it.
    const history = [withImg('photo'), txt('r1'), txt('r2'), txt('r3'), txt('r4'), txt('make it warmer')];
    expect(mediaCarryingIndices(history).has(0)).toBe(true);
  });

  it('the immediate follow-up still sees the image', () => {
    const history = [withImg('here is a photo'), txt('nice'), txt('make it warmer')];
    expect(shouldSendMedia(0, mediaCarryingIndices(history))).toBe(true);
  });
});

describe('nothing is silently erased', () => {
  it('a dropped attachment leaves a placeholder naming what it was', () => {
    expect(mediaPlaceholder('image/png')).toBe('[earlier image attachment]');
    expect(mediaPlaceholder('video/mp4')).toBe('[earlier video attachment]');
    expect(mediaPlaceholder('audio/webm')).toBe('[earlier audio attachment]');
    expect(mediaPlaceholder('application/pdf')).toBe('[earlier file attachment]');
  });
});

describe('bounds', () => {
  it('handles an empty or media-free history', () => {
    expect(mediaCarryingIndices([]).size).toBe(0);
    expect(mediaCarryingIndices([txt('a'), txt('b')]).size).toBe(0);
  });

  it('keep=0 disables byte-sending entirely', () => {
    expect(mediaCarryingIndices([withImg('a')], 0).size).toBe(0);
  });

  it('a history shorter than the window keeps everything it has', () => {
    expect(mediaCarryingIndices([withImg('a')]).size).toBe(1);
  });

  it('turns with an empty medias array are not counted as carrying', () => {
    const history = [withImg('a'), { role: 'user', text: 'b', medias: [] }];
    expect([...mediaCarryingIndices(history)]).toEqual([0]);
  });
});
