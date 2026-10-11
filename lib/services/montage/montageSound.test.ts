/** The montage's own sound graph (GG 2026-10-11 17:38Z: the clips' own sound, a music bed, a narration over both). */
import { LIMIT, MUSIC_UNDER_OWN_DB, VOICE_DUCK, soundMixGraph } from './montageSound';

describe('soundMixGraph', () => {
  test('the master alone: only the limiter', () => {
    const g = soundMixGraph({});
    expect(g.inputs).toBe(1);
    expect(g.out).toBe('aout');
    expect(g.graph).toContain('[0:a]');
    expect(g.graph).toContain(`alimiter=limit=${LIMIT}`);
    expect(g.graph).not.toContain('amix');
  });

  test('music under the clips: input 1 at its level, summed without halving (normalize=0), the picture\'s length', () => {
    const g = soundMixGraph({ music: { gainDb: MUSIC_UNDER_OWN_DB } });
    expect(g.inputs).toBe(2);
    expect(g.graph).toContain('[1:a]');
    expect(g.graph).toContain('volume=-10.0dB');
    expect(g.graph).toContain('amix=inputs=2:duration=first:dropout_transition=0:normalize=0');
  });

  test('a narration: the last input, delayed to its second, keys the duck and is laid on top at full level', () => {
    const g = soundMixGraph({ music: { gainDb: 0 }, voice: { atSec: 2.5 } });
    expect(g.inputs).toBe(3);
    expect(g.graph).toContain('[2:a]');
    expect(g.graph).toContain('adelay=delays=2500:all=1');
    expect(g.graph).toContain('apad');
    expect(g.graph).toContain(`sidechaincompress=threshold=${VOICE_DUCK.threshold}:ratio=${VOICE_DUCK.ratio}`);
    // No music: the narration is input 1.
    const v = soundMixGraph({ voice: { atSec: 0 } });
    expect(v.inputs).toBe(2);
    expect(v.graph).toContain('[1:a]');
    expect(v.graph).not.toContain('adelay');
  });

  test('levels are clamped and garbage is harmless', () => {
    expect(soundMixGraph({ music: { gainDb: -500 } }).graph).toContain('volume=-60.0dB');
    expect(soundMixGraph({ music: { gainDb: Number.NaN } }).graph).toContain('volume=0.0dB');
    expect(soundMixGraph({ voice: { atSec: -3 } }).graph).not.toContain('adelay');
  });
});
