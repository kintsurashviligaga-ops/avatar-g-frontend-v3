/** @jest-environment node */
/**
 * „Export picks" decides everything before it reads a byte: the ZIP parts stay under the in-memory cap, a file too
 * big for any part is saved on its own, and two cards' IMG_0001.JPG do not overwrite each other.
 */
import {
  MAX_PHOTO_BYTES, ZIP_PART_CAP_BYTES, gradedFileName, gradedMime, isAcceptedPhoto, planExport, safeFileName,
  uniqueNames, zipFileName,
} from './exportPlan';

const MB = 1024 * 1024;

describe('planExport', () => {
  it('splits picks into ZIP parts that never exceed the cap, in pick order', () => {
    const items = [100, 150, 80, 120, 10].map((mb, i) => ({ id: `p${i}`, size: mb * MB }));
    const plan = planExport(items, 300 * MB);
    expect(plan.zips.map((z) => z.map((x) => x.id))).toEqual([['p0', 'p1'], ['p2', 'p3', 'p4']]);
    for (const z of plan.zips) expect(z.reduce((s, x) => s + x.size, 0)).toBeLessThanOrEqual(300 * MB);
    expect(plan.singles).toEqual([]);
  });

  it('a file bigger than a whole part is saved on its own, and the rest still zip', () => {
    const plan = planExport([{ id: 'a', size: 5 * MB }, { id: 'huge', size: 400 * MB }, { id: 'b', size: 5 * MB }], 300 * MB);
    expect(plan.singles.map((x) => x.id)).toEqual(['huge']);
    expect(plan.zips.map((z) => z.map((x) => x.id))).toEqual([['a', 'b']]);
  });

  it('nothing picked → nothing to do; the default cap is the documented one', () => {
    expect(planExport([])).toEqual({ zips: [], singles: [] });
    expect(ZIP_PART_CAP_BYTES).toBe(300 * MB);
    expect(planExport([{ size: ZIP_PART_CAP_BYTES }]).zips).toHaveLength(1);
    expect(planExport([{ size: ZIP_PART_CAP_BYTES + 1 }]).singles).toHaveLength(1);
  });
});

describe('names', () => {
  it('two cards’ IMG_0001.JPG do not collide (case-insensitively, like the disk they land on)', () => {
    expect(uniqueNames(['IMG_0001.JPG', 'img_0001.jpg', 'IMG_0001.JPG', 'IMG_0002.JPG']))
      .toEqual(['IMG_0001.JPG', 'img_0001 (2).jpg', 'IMG_0001 (3).JPG', 'IMG_0002.JPG']);
  });

  it('strips folders, control characters and leading dots; never empty', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\a.jpg')).toBe('a.jpg');
    expect(safeFileName('.hidden.jpg')).toBe('hidden.jpg');
    expect(safeFileName('a\u0000b\u001f.jpg')).toBe('ab.jpg');
    expect(safeFileName('')).toBe('photo');
    expect(safeFileName('x'.repeat(400)).length).toBe(180);
  });

  it('a graded copy is named after the type it is encoded in', () => {
    expect(gradedMime('image/png')).toBe('image/png');
    expect(gradedMime('image/webp')).toBe('image/jpeg');
    expect(gradedFileName('IMG_1.webp', 'image/webp')).toBe('IMG_1.jpg');
    expect(gradedFileName('scan.PNG', 'image/png')).toBe('scan.png');
    expect(gradedFileName('noext', 'image/jpeg')).toBe('noext.jpg');
  });

  it('the ZIP is stamped with the local time, and numbered when split', () => {
    const at = new Date(2026, 9, 1, 14, 30);
    expect(zipFileName(at)).toBe('myavatar-picks-20261001-1430.zip');
    expect(zipFileName(at, 2, 3)).toBe('myavatar-picks-20261001-1430-part2of3.zip');
  });
});

describe('isAcceptedPhoto', () => {
  it('takes JPEG, PNG and WebP — by type, or by extension when the browser reports no type', () => {
    expect(isAcceptedPhoto({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isAcceptedPhoto({ type: 'image/png', name: 'a.png' })).toBe(true);
    expect(isAcceptedPhoto({ type: 'image/webp', name: 'a.webp' })).toBe(true);
    expect(isAcceptedPhoto({ type: '', name: 'DSC_1.JPEG' })).toBe(true);
    expect(isAcceptedPhoto({ type: 'image/heic', name: 'a.heic' })).toBe(false);
    expect(isAcceptedPhoto({ type: 'image/x-canon-cr2', name: 'a.cr2' })).toBe(false);
    expect(isAcceptedPhoto({ type: 'image/gif', name: 'a.gif' })).toBe(false);
    expect(isAcceptedPhoto({ type: '', name: 'a.heic' })).toBe(false);
    expect(MAX_PHOTO_BYTES).toBeGreaterThan(50 * MB);
  });
});
