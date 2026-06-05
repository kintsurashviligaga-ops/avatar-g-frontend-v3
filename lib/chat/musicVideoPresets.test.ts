import {
  composeMusicVideoPrompt,
  findGenre,
  findCameraMove,
  findShot,
  findLighting,
  MV_GENRES,
  MV_CAMERA_MOVES,
  MV_SHOTS,
  MV_LIGHTING,
} from './musicVideoPresets';

describe('music-video presets', () => {
  test('exposes the advertised genres, shots, camera moves, and lighting', () => {
    expect(MV_GENRES.map((g) => g.id)).toEqual(['blues', 'hiphop', 'pop', 'cinematic']);
    expect(MV_SHOTS.map((s) => s.id)).toEqual(['wide', 'medium', 'closeup']);
    expect(MV_CAMERA_MOVES.map((c) => c.id)).toEqual(['pan', 'zoom', 'orbit']);
    expect(MV_LIGHTING.map((l) => l.id)).toEqual(['golden', 'cinematic', 'moody', 'melancholic']);
  });

  test('shot + lighting lookups resolve and fail gracefully', () => {
    expect(findShot('closeup')?.labelEn).toBe('Close-up');
    expect(findShot('nope')).toBeUndefined();
    expect(findLighting('golden')?.labelEn).toBe('Golden Hour');
    expect(findLighting(null)).toBeUndefined();
  });

  test('composes every chosen dimension (genre + shot + camera + lighting)', () => {
    const p = composeMusicVideoPrompt({
      userPrompt: 'Sing on a rooftop',
      genreId: 'blues',
      shotId: 'closeup',
      cameraId: 'orbit',
      lightingId: 'golden',
    });
    expect(p).toContain('Sing on a rooftop');
    expect(p).toContain('blues');
    expect(p).toContain('close-up');
    expect(p).toContain('orbit');
    expect(p).toContain('golden-hour');
    expect(p).toContain('star performer');
  });

  test('lookups resolve and fail gracefully', () => {
    expect(findGenre('blues')?.labelEn).toBe('Blues');
    expect(findGenre('nope')).toBeUndefined();
    expect(findGenre(null)).toBeUndefined();
    expect(findCameraMove('orbit')?.labelEn).toBe('Orbit');
    expect(findCameraMove(undefined)).toBeUndefined();
  });

  test('composes user text + genre + camera + the identity anchor', () => {
    const p = composeMusicVideoPrompt({ userPrompt: 'Sing on a rooftop at sunset', genreId: 'hiphop', cameraId: 'orbit' });
    expect(p).toContain('Sing on a rooftop at sunset');
    expect(p).toContain('hip-hop');
    expect(p).toContain('orbit');
    expect(p).toContain('star performer');
  });

  test('works with no user text (presets only)', () => {
    const p = composeMusicVideoPrompt({ userPrompt: '', genreId: 'blues', cameraId: null });
    expect(p).toContain('blues');
    expect(p).toContain('star performer');
    expect(p.startsWith('.')).toBe(false); // no leading empty segment
  });

  test('works with neither genre nor camera (still anchors identity)', () => {
    const p = composeMusicVideoPrompt({ userPrompt: 'My song', genreId: null, cameraId: null });
    expect(p).toContain('My song');
    expect(p).toContain('star performer');
  });

  test('never emits doubled periods', () => {
    const p = composeMusicVideoPrompt({ userPrompt: 'A scene.', genreId: 'pop', cameraId: 'pan' });
    expect(p).not.toMatch(/\.\s*\./);
  });
});
