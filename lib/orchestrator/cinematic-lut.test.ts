import { buildCubeFile, pickLutLook, LUT_FILENAME, gradePixel } from './cinematic-lut';

describe('cinematic-lut', () => {
  test('buildCubeFile emits a valid 17³ .cube with header + exact row count', () => {
    const cube = buildCubeFile('night_neon', 17);
    expect(cube).toContain('LUT_3D_SIZE 17');
    expect(cube).toContain('DOMAIN_MIN 0.0 0.0 0.0');
    expect(cube).toContain('DOMAIN_MAX 1.0 1.0 1.0');
    // 17^3 data rows + 4 header lines (+ trailing newline → one empty token)
    const dataRows = cube.trim().split('\n').filter((l) => /^[0-9]/.test(l));
    expect(dataRows.length).toBe(17 * 17 * 17);
    // every data row is 3 floats in [0,1]
    for (const r of [dataRows[0], dataRows[dataRows.length - 1], dataRows[2500]]) {
      const nums = r.split(' ').map(Number);
      expect(nums).toHaveLength(3);
      for (const n of nums) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1); }
    }
  });

  test('identity-ish endpoints stay in-gamut (black near black, white near white)', () => {
    const cube = buildCubeFile('cinematic', 9);
    const rows = cube.trim().split('\n').filter((l) => /^[0-9]/.test(l));
    const first = rows[0].split(' ').map(Number); // input (0,0,0)
    const last = rows[rows.length - 1].split(' ').map(Number); // input (1,1,1)
    first.forEach((n) => expect(n).toBeLessThan(0.2));
    last.forEach((n) => expect(n).toBeGreaterThan(0.8));
  });

  test('pickLutLook classifies night/neon/moody → night_neon (purple-gold)', () => {
    expect(pickLutLook('moody rooftop at night with purple neon, music video')).toBe('night_neon');
    expect(pickLutLook('cyberpunk city, dark, magenta')).toBe('night_neon');
    expect(pickLutLook('ღამის ქალაქი ნეონის შუქით')).toBe('night_neon'); // Georgian "night city neon"
  });

  test('pickLutLook classifies golden-hour/warm → warm_golden', () => {
    expect(pickLutLook('young woman in old Tbilisi streets at golden hour, warm colors')).toBe('warm_golden');
    expect(pickLutLook('sunset, amber light')).toBe('warm_golden');
  });

  test('pickLutLook default → neutral cinematic', () => {
    expect(pickLutLook('a documentary about coffee')).toBe('cinematic');
    expect(pickLutLook('')).toBe('cinematic');
    expect(pickLutLook(null)).toBe('cinematic');
  });

  test('cinematic default keeps a SUBTLE (non-yellow) highlight warmth [V8-F3]', () => {
    // A highlight grey must not read as yellow: the warm push (mapped R − B) is gentle,
    // a regression guard against the old +0.05/-0.04 tint (~0.078 spread → yellow cast).
    const [hr, , hb] = gradePixel('cinematic', 0.8, 0.8, 0.8);
    expect(hr - hb).toBeLessThan(0.05);
    expect(hr - hb).toBeGreaterThanOrEqual(0); // still teal-orange (warm highlights), just gentle
    // Mid grey stays neutral in red — no overall cast.
    const [mr] = gradePixel('cinematic', 0.5, 0.5, 0.5);
    expect(Math.abs(mr - 0.5)).toBeLessThan(0.03);
  });

  test('LUT filenames are stable, descriptive .cube names (for proof/logs)', () => {
    expect(LUT_FILENAME.night_neon).toBe('myavatar-night-neon-purple-gold.cube');
    expect(LUT_FILENAME.warm_golden).toBe('myavatar-warm-golden-hour.cube');
    expect(LUT_FILENAME.cinematic).toBe('myavatar-cinematic-teal-orange.cube');
  });
});
