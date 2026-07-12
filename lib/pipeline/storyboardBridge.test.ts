/** @jest-environment node */
import { serializeStoryboardMatrix, durationForSceneCount, type StoryboardMatrix } from './storyboardBridge';

const cell = (ordinal: number, over: Partial<{ frameUrl: string | null; prompt: string; script: string }> = {}) => ({
  ordinal,
  frameUrl: over.frameUrl ?? null,
  prompt: over.prompt ?? `scene ${ordinal} action`,
  ...(over.script ? { script: over.script } : {}),
});

const base = (over: Partial<StoryboardMatrix> = {}): StoryboardMatrix => ({
  theme: 'a detective in a rainy city',
  cells: [cell(1), cell(2), cell(3), cell(4), cell(5), cell(6)],
  ...over,
});

describe('durationForSceneCount', () => {
  test('1→6s, 6→30s, 12→60s (matches the pipeline sceneFrameCount mapping)', () => {
    expect(durationForSceneCount(1)).toBe(6);
    expect(durationForSceneCount(6)).toBe(30);
    expect(durationForSceneCount(12)).toBe(60);
    expect(durationForSceneCount(0)).toBe(6);
  });
});

describe('serializeStoryboardMatrix — Phase 29 V2 bridge protocol', () => {
  test('orders cells by ordinal and always populates scenePrompts', () => {
    const p = serializeStoryboardMatrix(base({ cells: [cell(3), cell(1), cell(2)] }));
    expect(p.scenePrompts).toEqual(['scene 1 action', 'scene 2 action', 'scene 3 action']);
  });

  test('ALL-OR-NOTHING sceneFrames: a fully-framed grid yields the positional frame array', () => {
    const cells = [1, 2, 3, 4, 5, 6].map((i) => cell(i, { frameUrl: `https://cdn/f${i}.jpg` }));
    const p = serializeStoryboardMatrix(base({ cells }));
    expect(p.sceneFrames).toEqual(cells.map((c) => c.frameUrl));
  });

  test('a PARTIAL grid (one frame missing) yields sceneFrames=undefined (never a holey anchor set)', () => {
    const cells = [cell(1, { frameUrl: 'https://cdn/f1.jpg' }), cell(2, { frameUrl: null }), cell(3, { frameUrl: 'https://cdn/f3.jpg' })];
    const p = serializeStoryboardMatrix(base({ cells }));
    expect(p.sceneFrames).toBeUndefined();
    // …but the per-scene lanes still populate so the video studio can generate the rest.
    expect(p.scenePrompts).toHaveLength(3);
  });

  test('folds the authored scenes into the SCRIPT block of filmPrompt (render follows them exactly)', () => {
    const p = serializeStoryboardMatrix(base({ theme: 'noir', cells: [cell(1, { script: 'a man lights a cigarette' }), cell(2, { prompt: 'rain on the window' })] }));
    expect(p.filmPrompt).toContain('noir');
    expect(p.filmPrompt).toMatch(/SCRIPT \(follow this EXACTLY/);
    expect(p.filmPrompt).toContain('Scene 1: a man lights a cigarette');
    expect(p.filmPrompt).toContain('Scene 2: rain on the window');
  });

  test('body-less scenes never leak into the SCRIPT block, even at two-digit ordinals (Scene 12)', () => {
    const cells = Array.from({ length: 12 }, (_, i) => ({ ordinal: i + 1, frameUrl: null, prompt: '' }));
    const p = serializeStoryboardMatrix({ theme: 'noir', cells });
    expect(p.masterScript).toBe(''); // no "Scene 12:" line leaks (the old length>9 filter let it through)
    expect(p.filmPrompt).toBe('noir'); // just the theme, no empty SCRIPT block
  });

  test('scene scripts prefer script over prompt, and are undefined when every cell is empty', () => {
    const withScript = serializeStoryboardMatrix(base({ cells: [cell(1, { script: 'the real script', prompt: 'ignored' })] }));
    expect(withScript.sceneScripts).toEqual(['the real script']);
    const empty = serializeStoryboardMatrix(base({ cells: [{ ordinal: 1, frameUrl: null, prompt: '' }] }));
    expect(empty.sceneScripts).toBeUndefined();
  });

  test('characterRefs prefers a clean portrait, else the first framed cell', () => {
    expect(serializeStoryboardMatrix(base({ characterPortraitUrl: 'https://cdn/portrait.jpg' })).characterRefs).toEqual(['https://cdn/portrait.jpg']);
    const framed = serializeStoryboardMatrix(base({ cells: [cell(1, { frameUrl: 'https://cdn/f1.jpg' }), cell(2)] }));
    expect(framed.characterRefs).toEqual(['https://cdn/f1.jpg']);
    expect(serializeStoryboardMatrix(base()).characterRefs).toEqual([]); // no portrait, no frames
  });

  test('orientation defaults to vertical; duration falls back to the scene count', () => {
    expect(serializeStoryboardMatrix(base()).orientation).toBe('vertical');
    expect(serializeStoryboardMatrix(base({ orientation: 'landscape' })).orientation).toBe('landscape');
    expect(serializeStoryboardMatrix(base()).duration).toBe(30); // 6 scenes → 30s
    expect(serializeStoryboardMatrix(base({ cells: Array.from({ length: 12 }, (_, i) => cell(i + 1)) })).duration).toBe(60);
    expect(serializeStoryboardMatrix(base({ duration: 45 })).duration).toBe(45); // explicit wins
  });

  test('threads the character lock + music-video flag when present', () => {
    const p = serializeStoryboardMatrix(base({ character: 'a 30yo detective, grey coat', musicVideoMode: true }));
    expect(p.characterLock).toBe('a 30yo detective, grey coat');
    expect(p.musicVideoMode).toBe(true);
  });
});
