/**
 * @jest-environment jsdom
 *
 * „Export picks": originals go out untouched, graded picks through the worker, everything into a ZIP — and when the
 * ZIP cannot be built, or a grade cannot be applied, the picks still reach the user.
 */
jest.mock('./spawnWorker', () => ({ spawnCullWorker: () => { throw new Error('no worker in tests'); } }));

const zipState: { files: { name: string; data: unknown }[][]; failGenerate: boolean } = { files: [], failGenerate: false };
jest.mock('jszip', () => ({
  __esModule: true,
  default: class FakeZip {
    entries: { name: string; data: unknown }[] = [];
    constructor() { zipState.files.push(this.entries); }
    file(name: string, data: unknown) { this.entries.push({ name, data }); return this; }
    async generateAsync() {
      if (zipState.failGenerate) throw new Error('out of memory');
      return new Blob(['zip']);
    }
  },
}));

import { NEUTRAL_GRADE, type Grade } from '@/lib/photo/grade';
import type { CullClient } from './cullClient';
import { exportPicks } from './exportPicks';
import type { PhotoItem } from './session';

const item = (name: string, opts: { grade?: Grade; type?: string; size?: number } = {}): PhotoItem => {
  const type = opts.type ?? 'image/jpeg';
  const f = new File([name], name, { type, lastModified: 1_700_000_000_000 });
  return {
    id: name, file: f, name, size: opts.size ?? 10, type, status: 'pick', grade: opts.grade ?? { ...NEUTRAL_GRADE },
    state: 'ready', thumbUrl: null, metrics: null, takenAt: null, width: 1, height: 1,
  };
};

function client(opts: { fail?: Set<string>; downscale?: boolean } = {}) {
  const rendered: string[] = [];
  const c: CullClient = {
    analyze: () => Promise.reject(new Error('unused')),
    render: async (file, _grade, mime) => {
      rendered.push(`${file.name}→${mime}`);
      if (opts.fail?.has(file.name)) throw new Error('canvas-unavailable');
      return { blob: new Blob(['graded'], { type: mime }), downscaled: !!opts.downscale };
    },
    cancelPending() {},
    dispose() {},
  };
  return { c, rendered };
}

const warm: Grade = { saturation: 118, contrast: 105, brightness: 104, temperature: 55 };

beforeEach(() => {
  zipState.files = [];
  zipState.failGenerate = false;
});

describe('exportPicks', () => {
  it('zips the picks: originals byte for byte, graded ones re-encoded under their new name', async () => {
    const { c, rendered } = client();
    const saved: string[] = [];
    const progress: number[] = [];
    const a = item('IMG_1.JPG');
    const o = await exportPicks([a, item('IMG_2.webp', { grade: warm, type: 'image/webp' })], c, {
      save: (_b, n) => saved.push(n), gapMs: 0, now: new Date(2026, 9, 1, 9, 5), onProgress: (p) => progress.push(p.done),
    });
    expect(o).toEqual({ zips: 1, files: 0, ungraded: [], downscaled: 0, zipFailed: false });
    expect(saved).toEqual(['myavatar-picks-20261001-0905.zip']);
    expect(zipState.files[0]!.map((e) => e.name)).toEqual(['IMG_1.JPG', 'IMG_2.jpg']);
    expect(zipState.files[0]![0]!.data).toBe(a.file); // the original File itself — EXIF and all
    expect(rendered).toEqual(['IMG_2.webp→image/jpeg']);
    expect(progress).toEqual([1, 2]);
  });

  it('when the ZIP cannot be built, every pick is saved one by one — none is graded twice', async () => {
    zipState.failGenerate = true;
    const { c, rendered } = client({ downscale: true });
    const saved: string[] = [];
    const o = await exportPicks([item('a.jpg'), item('b.png', { grade: warm, type: 'image/png' })], c, { save: (_b, n) => saved.push(n), gapMs: 0 });
    expect(o.zipFailed).toBe(true);
    expect(o.zips).toBe(0);
    expect(o.files).toBe(2);
    expect(saved).toEqual(['a.jpg', 'b.png']);
    expect(rendered).toEqual(['b.png→image/png']);
    expect(o.downscaled).toBe(1);
  });

  it('a pick whose grade cannot be applied still goes out — as shot, under its own extension — and is reported', async () => {
    const { c } = client({ fail: new Set(['DSC_7.webp']) });
    const saved: string[] = [];
    const o = await exportPicks([item('DSC_7.webp', { grade: warm, type: 'image/webp' })], c, { save: (_b, n) => saved.push(n), gapMs: 0 });
    expect(o.ungraded).toEqual(['DSC_7.webp']);
    expect(zipState.files[0]!.map((e) => e.name)).toEqual(['DSC_7.webp']);
    expect(saved).toHaveLength(1);
  });

  it('a file too big for any ZIP part is saved on its own; the rest still zip', async () => {
    const { c } = client();
    const saved: string[] = [];
    const o = await exportPicks([item('small.jpg'), item('giant.png', { size: 400 * 1024 * 1024, type: 'image/png' })], c, {
      save: (_b, n) => saved.push(n), gapMs: 0, now: new Date(2026, 0, 2, 3, 4),
    });
    expect(o).toMatchObject({ zips: 1, files: 1, zipFailed: false });
    expect(saved).toEqual(['myavatar-picks-20260102-0304.zip', 'giant.png']);
  });

  it('two IMG_0001.JPG from two cards do not overwrite each other in the ZIP', async () => {
    const { c } = client();
    await exportPicks([item('IMG_0001.JPG'), { ...item('IMG_0001.JPG'), id: 'other' }], c, { save: () => {}, gapMs: 0 });
    expect(zipState.files[0]!.map((e) => e.name)).toEqual(['IMG_0001.JPG', 'IMG_0001 (2).JPG']);
  });
});
