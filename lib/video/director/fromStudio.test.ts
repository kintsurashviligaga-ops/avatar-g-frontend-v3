/** @jest-environment node */
/**
 * fromStudio.ts — the studio board as a director storyboard: one shot per scene in board order, the scene text exactly
 * as the studio would render it (V3), the board's frame / length / tier, the first photo and the seed as the lock (V4);
 * and nothing reshaped (V6): a square board or a reference on a short clip stays as it is, for the rules to refuse.
 */
import { freeze, validateStoryboard } from './storyboard';
import { studioToDirectorStoryboard, type StudioBoard } from './fromStudio';

const NOW = new Date('2026-10-08T15:00:00.000Z');

function board(over: Partial<StudioBoard> = {}): StudioBoard {
  return {
    filmPrompt: 'A lighthouse keeper',
    refs: [],
    orientation: 'landscape',
    scenes: [
      { ordinal: 1, beat: 'Climb', prompt: 'scene one' },
      { ordinal: 2, beat: 'Lamp', prompt: '  ლამპა  ', edited: true },
      { ordinal: 3, beat: 'Door', prompt: 'scene three' },
    ],
    sceneScripts: ['Script one.', 'Script two.', null],
    ...over,
  };
}

describe('studioToDirectorStoryboard', () => {
  it('maps every scene to a shot in board order with the text the studio would render, untouched', () => {
    const sb = studioToDirectorStoryboard(board(), { id: 'sb-1', quality: 'fast', clipSec: 8, now: NOW });
    expect(sb.shots.map((s) => [s.order, s.prompt])).toEqual([[1, 'Script one.'], [2, '  ლამპა  '], [3, 'scene three']]);
    expect(sb.totalDurationSeconds).toBe(24);
    expect(sb.approvedByUser).toBe(true);
    expect(validateStoryboard(sb)).toEqual({ ok: true });
    expect(() => freeze(sb)).not.toThrow();
  });

  it('locks the frame, the first photo and the seed', () => {
    const sb = studioToDirectorStoryboard(board({ orientation: 'vertical', refs: ['https://cdn.example.com/me.png'] }), { id: 'sb-1', quality: 'standard', clipSec: 8, seed: 42 });
    expect(sb.consistencyLock).toEqual({ aspectRatio: '9:16', enforceAcrossShots: true, seed: 42, characterReference: 'https://cdn.example.com/me.png' });
    expect(sb.shots.every((s) => s.aspectRatio === '9:16' && s.quality === 'standard')).toBe(true);
  });

  it('reshapes nothing the director cannot render: a square board and a reference on a 6 s clip are refused by the rules', () => {
    const square = studioToDirectorStoryboard(board({ orientation: 'square' }), { id: 'sb-1', quality: 'fast', clipSec: 8 });
    expect(square.consistencyLock.aspectRatio).toBe('1:1');
    expect(validateStoryboard(square).ok).toBe(false);
    const short = studioToDirectorStoryboard(board({ clipSec: 6, refs: ['https://cdn.example.com/me.png'] }), { id: 'sb-1', quality: 'fast', clipSec: 8 });
    expect(short.shots[0]?.durationSeconds).toBe(6);
    expect(validateStoryboard(short).ok).toBe(false);
  });
});
