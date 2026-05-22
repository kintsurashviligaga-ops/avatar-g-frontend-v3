import {
  normalizeRoomGeometry, normalizeStyleGuide, buildWalkthroughPrompts,
  buildStyleUserPrompt, DEFAULT_ROOM_GEOMETRY, DEFAULT_STYLE_GUIDE,
} from './interior';

describe('normalizeRoomGeometry', () => {
  test('garbage → safe default-ish geometry with ≥3 walls', () => {
    const g = normalizeRoomGeometry(null);
    expect(g.walls.length).toBeGreaterThanOrEqual(3);
    expect(g.floor.widthM).toBeGreaterThan(0);
    expect(g.wallHeightM).toBeGreaterThanOrEqual(2);
  });
  test('clamps absurd dimensions', () => {
    const g = normalizeRoomGeometry({ floor: { widthM: 999, depthM: -3 }, wallHeightM: 99 });
    expect(g.floor.widthM).toBeLessThanOrEqual(40);
    expect(g.floor.depthM).toBeGreaterThanOrEqual(1);
    expect(g.wallHeightM).toBeLessThanOrEqual(6);
  });
  test('synthesizes 4 walls when fewer than 3 supplied', () => {
    const g = normalizeRoomGeometry({ floor: { widthM: 3, depthM: 6 }, walls: [{ lengthM: 3 }] });
    expect(g.walls).toHaveLength(4);
  });
  test('coerces opening type + clamps to a valid wall index', () => {
    const g = normalizeRoomGeometry({ walls: [{ lengthM: 4 }, { lengthM: 4 }, { lengthM: 4 }], openings: [{ type: 'portal', wall: 99, widthM: 9, heightM: 9 }] });
    expect(g.openings[0]!.type).toBe('window');
    expect(g.openings[0]!.wall).toBeLessThan(g.walls.length);
    expect(g.openings[0]!.heightM).toBeLessThanOrEqual(g.wallHeightM);
  });
  test('keeps confidence in 0..1', () => {
    expect(normalizeRoomGeometry({ confidence: 5 }).confidence).toBe(1);
    expect(normalizeRoomGeometry({ confidence: -1 }).confidence).toBe(0);
  });
});

describe('normalizeStyleGuide', () => {
  test('garbage → default style guide', () => {
    const s = normalizeStyleGuide(undefined);
    expect(s.styleName).toBe(DEFAULT_STYLE_GUIDE.styleName);
    expect(s.palette.length).toBeGreaterThan(0);
  });
  test('keeps only valid hex colors, falls back when none', () => {
    expect(normalizeStyleGuide({ palette: ['#fff', '#A1B2C3', 'red', 123] }).palette).toEqual(['#fff', '#A1B2C3']);
    expect(normalizeStyleGuide({ palette: ['nope'] }).palette).toEqual(DEFAULT_STYLE_GUIDE.palette);
  });
  test('clamps lighting temperature to 2000–6500K', () => {
    expect(normalizeStyleGuide({ lightingTempK: 100 }).lightingTempK).toBe(2000);
    expect(normalizeStyleGuide({ lightingTempK: 99999 }).lightingTempK).toBe(6500);
  });
});

describe('buildWalkthroughPrompts', () => {
  test('produces exactly 5 distinct shot prompts carrying style + geometry', () => {
    const shots = buildWalkthroughPrompts(DEFAULT_ROOM_GEOMETRY, DEFAULT_STYLE_GUIDE);
    expect(shots).toHaveLength(5);
    expect(new Set(shots).size).toBe(5);
    expect(shots[0]).toContain(DEFAULT_STYLE_GUIDE.styleName);
    expect(shots[0]).toContain('living room');
  });
});

describe('buildStyleUserPrompt', () => {
  test('embeds geometry JSON + brief', () => {
    const p = buildStyleUserPrompt(DEFAULT_ROOM_GEOMETRY, 'cozy reading nook');
    expect(p).toContain('cozy reading nook');
    expect(p).toContain('"wallHeightM"');
  });
});
