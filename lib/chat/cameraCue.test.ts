import { inferCameraMove } from './cameraCue';

describe('inferCameraMove — cinematic camera cue from scene text', () => {
  it('detects the common moves from beat/prompt text', () => {
    expect(inferCameraMove('The hero stands still', 'slow dolly push in on his face')).toBe('DOLLY PUSH');
    expect(inferCameraMove('', 'camera pulls back to reveal the city')).toBe('DOLLY PULL');
    expect(inferCameraMove('Aerial drone shot over the ocean')).toBe('AERIAL');
    expect(inferCameraMove('extreme close-up of the eye')).toBe('CLOSE-UP');
    expect(inferCameraMove('wide establishing shot of the valley')).toBe('WIDE');
    expect(inferCameraMove('the camera pans across the crowd')).toBe('PAN');
    expect(inferCameraMove('a tracking shot following the runner')).toBe('TRACKING');
    expect(inferCameraMove('crane up over the rooftops')).toBe('CRANE');
    expect(inferCameraMove('handheld chaotic energy')).toBe('HANDHELD');
    expect(inferCameraMove('zoom in fast')).toBe('ZOOM');
    expect(inferCameraMove('orbit around the statue')).toBe('ORBIT');
    expect(inferCameraMove('locked-off static tripod shot')).toBe('STATIC');
  });

  it('returns null when there is no recognizable camera cue (no false chip)', () => {
    expect(inferCameraMove('A quiet morning in the village', 'warm light, birds singing')).toBeNull();
    expect(inferCameraMove('', '')).toBeNull();
    expect(inferCameraMove(null, null)).toBeNull();
    expect(inferCameraMove(undefined, undefined)).toBeNull();
  });

  it('prefers the more specific move (push-in over a generic word)', () => {
    // "push in" must win as DOLLY PUSH, not be missed
    expect(inferCameraMove('', 'push-in on the hero')).toBe('DOLLY PUSH');
    // an aerial drone beat wins over an incidental "wide" feel
    expect(inferCameraMove('drone aerial wide over the coast')).toBe('AERIAL');
  });

  it('is word-bounded — does not fire on a substring inside another word', () => {
    expect(inferCameraMove('the companion walked', 'panorama')).toBe('WIDE'); // "pan" inside "companion"/"panorama" must NOT be PAN; panorama → WIDE
    expect(inferCameraMove('a panther in the grass')).toBeNull(); // "pan" inside "panther" must not fire PAN
  });

  it('caps very long input without throwing', () => {
    const huge = 'lorem '.repeat(5000) + 'dolly push';
    // the cue is beyond the 2000-char cap → not scanned → null (deterministic, no hang)
    expect(inferCameraMove(huge)).toBeNull();
    expect(inferCameraMove('dolly push ' + 'x '.repeat(5000))).toBe('DOLLY PUSH');
  });

  // Regression (adversarial review P85): ambiguous words must NOT emit a wrong badge on ordinary
  // scene vocabulary — the module's "a missing cue is always better than a wrong one" contract.
  it('does NOT fire on ambiguous nouns/verbs lacking camera context', () => {
    expect(inferCameraMove('', 'she flips the pancake in the frying pan')).toBeNull(); // "frying pan"
    expect(inferCameraMove('pots and pans clatter in the kitchen')).toBeNull();
    expect(inferCameraMove('a crane lifts steel beams at the construction site')).toBeNull(); // machine
    expect(inferCameraMove('a crane flies over the marsh')).toBeNull(); // bird
    expect(inferCameraMove('static crackles on the old TV set')).toBeNull();
    expect(inferCameraMove('the hunter was tracking a deer')).toBeNull();
    expect(inferCameraMove('a dreamy tilt-shift miniature of the town')).toBeNull(); // lens effect, not a tilt
    expect(inferCameraMove('the orbit of the moon around the earth')).toBeNull(); // celestial, not a camera move
    expect(inferCameraMove('he pulls back the curtain')).toBeNull(); // character action, not a camera pull
    expect(inferCameraMove('a zoom lens on the shelf')).toBeNull();
  });

  it('still fires on explicit camera phrasing', () => {
    expect(inferCameraMove('a slow crane shot up the tower')).toBe('CRANE');
    expect(inferCameraMove('static shot of the empty room')).toBe('STATIC');
    expect(inferCameraMove('a tracking shot of the car')).toBe('TRACKING');
    expect(inferCameraMove('smooth gimbal move alongside the runner')).toBe('TRACKING');
    expect(inferCameraMove('tilt up to the sky')).toBe('TILT');
    expect(inferCameraMove('whip pan to the door')).toBe('PAN');
    expect(inferCameraMove('camera pulls back to reveal the crowd')).toBe('DOLLY PULL');
  });
});
