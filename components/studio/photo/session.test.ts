/**
 * @jest-environment jsdom
 *
 * The culling session store: what it accepts, the order it keeps, that analysis lands (and never rates), and the
 * culling keys.
 */
jest.mock('./spawnWorker', () => ({ spawnCullWorker: () => { throw new Error('no worker in tests'); } }));

import { NEUTRAL_GRADE } from '@/lib/photo/grade';
import { MAX_PHOTOS } from '@/lib/photo/exportPlan';
import type { PhotoMetrics } from '@/lib/photo/cullMetrics';
import type { CullClient } from './cullClient';
import type { AnalyzeResult } from './pipeline';
import { SESSION_CLEARED_EVENT } from '@/lib/auth/sessionCleanup';
import { bindSessionToPage, createPhotoSession, cullKeyAction, deriveCull, filterItems, type PhotoSession } from './session';

const file = (name: string, type = 'image/jpeg', size = 1000, lastModified = 1) => {
  const f = new File([new Uint8Array(4)], name, { type, lastModified });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

const metrics = (hash: string, sharpness = 500, over: Partial<PhotoMetrics> = {}): PhotoMetrics => ({
  sharpness, sharpnessGlobal: 100, meanLuma: 0.45, highlightClip: 0, shadowClip: 0, hash, ...over,
});

/** A client whose analyses the test resolves by file name. */
function fakeClient() {
  const pending = new Map<string, { resolve: (r: AnalyzeResult) => void; reject: (e: Error) => void }>();
  const client: CullClient & { cancelled: number } = {
    cancelled: 0,
    analyze: (f) => new Promise<AnalyzeResult>((resolve, reject) => { pending.set(f.name, { resolve, reject }); }),
    render: () => Promise.reject(new Error('unused')),
    cancelPending() { this.cancelled++; },
    dispose() {},
  };
  const finish = async (name: string, m: PhotoMetrics, takenAt: number | null = null) => {
    pending.get(name)!.resolve({ metrics: m, takenAt, width: 4000, height: 3000, thumb: new Blob(['t']) });
    await Promise.resolve(); await Promise.resolve();
  };
  const fail = async (name: string) => {
    pending.get(name)!.reject(new Error('decode'));
    await Promise.resolve(); await Promise.resolve();
  };
  return { client, finish, fail, pending };
}

describe('photo session', () => {
  it('takes JPEG/PNG/WebP, skips the rest, de-duplicates, and keeps camera order (IMG_9 before IMG_10)', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    const a = file('IMG_10.JPG');
    const r = s.addFiles([a, file('IMG_9.JPG'), file('scan.png', 'image/png'), file('raw.cr2', 'image/x-canon-cr2'), file('clip.mp4', 'video/mp4')]);
    expect(r).toEqual({ added: 3, skippedType: 2, skippedSize: 0, skippedLimit: 0, duplicates: 0 });
    expect(s.get().items.map((i) => i.name)).toEqual(['IMG_9.JPG', 'IMG_10.JPG', 'scan.png']);
    expect(s.addFiles([a]).duplicates).toBe(1);
    expect(s.get().items[0]!.status).toBe('unrated');
    expect(s.get().items[0]!.grade).toEqual(NEUTRAL_GRADE);
    expect(s.get().selectedId).toBe(s.get().items[0]!.id);
  });

  it('caps a session at MAX_PHOTOS and skips files over the size ceiling', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    const many = Array.from({ length: MAX_PHOTOS + 3 }, (_, i) => file(`P${i}.jpg`));
    expect(s.addFiles(many)).toMatchObject({ added: MAX_PHOTOS, skippedLimit: 3 });
    const s2 = createPhotoSession(() => client);
    expect(s2.addFiles([file('huge.png', 'image/png', 500 * 1024 * 1024)]).skippedSize).toBe(1);
  });

  it('analysis lands on the photo — and never rates it, however bad it is', async () => {
    const { client, finish, fail } = fakeClient();
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:thumb';
    const s = createPhotoSession(() => client);
    s.addFiles([file('a.jpg'), file('b.jpg')]);
    await finish('a.jpg', metrics('0000000000000000', 1, { meanLuma: 0.01, shadowClip: 0.99 }), 123);
    await fail('b.jpg');
    const [a, b] = s.get().items;
    expect(a).toMatchObject({ state: 'ready', thumbUrl: 'blob:thumb', takenAt: 123, width: 4000, status: 'unrated' });
    expect(b).toMatchObject({ state: 'error', status: 'unrated' });
    expect(deriveCull(s.get().items).get(a!.id)!.verdict!.flags).toEqual(['blurry', 'underexposed']);
  });

  it('a rating marks the session dirty until it is exported; clear cancels queued analysis and empties it', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    s.addFiles([file('a.jpg')]);
    const id = s.get().items[0]!.id;
    expect(s.get().dirty).toBe(false);
    s.setStatus(id, 'pick');
    expect(s.get().items[0]!.status).toBe('pick');
    expect(s.get().dirty).toBe(true);
    s.markExported();
    expect(s.get().dirty).toBe(false);
    s.setGrade(id, { saturation: 999, contrast: 120, brightness: 100, temperature: 0 });
    expect(s.get().items[0]!.grade.saturation).toBe(200);
    s.clear();
    expect(s.get().items).toEqual([]);
    expect(client.cancelled).toBe(1);
  });

  it('a grade is unsaved work too — changing one marks the session dirty, re-applying the same one does not', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    s.addFiles([file('a.jpg'), file('b.jpg')]);
    const [a, b] = s.get().items;
    const warm = { saturation: 118, contrast: 105, brightness: 104, temperature: 55 };
    let calls = 0;
    s.subscribe(() => calls++);
    s.setGrade(a!.id, { ...NEUTRAL_GRADE });
    expect(calls).toBe(0);
    expect(s.get().dirty).toBe(false);
    s.setGrade(a!.id, warm);
    expect(s.get().dirty).toBe(true);
    s.markExported();
    s.setGradeFor([a!.id], warm); // already that grade: nothing changed
    expect(s.get().dirty).toBe(false);
    s.setGradeFor([a!.id, b!.id], warm);
    expect(s.get().dirty).toBe(true);
    expect(s.get().items[1]!.grade).toEqual(warm);
  });

  it('notifies subscribers, and a result for a photo that was cleared meanwhile is dropped', async () => {
    const { client, finish } = fakeClient();
    const s = createPhotoSession(() => client);
    const seen: number[] = [];
    const off = s.subscribe(() => seen.push(s.get().items.length));
    s.addFiles([file('a.jpg')]);
    s.clear();
    await finish('a.jpg', metrics('0000000000000000'));
    expect(s.get().items).toEqual([]);
    off();
    expect(seen).toEqual([1, 0]);
  });
});

describe('derived views', () => {
  it('bursts, verdicts and the filters', async () => {
    const { client, finish } = fakeClient();
    const s = createPhotoSession(() => client);
    s.addFiles([file('1.jpg'), file('2.jpg'), file('3.jpg')]);
    await finish('1.jpg', metrics('00ff00ff00ff00ff', 900));
    await finish('2.jpg', metrics('00ff00ff00ff00fe', 200));
    await finish('3.jpg', metrics('ff00ff00ff00ff00', 30));
    const items = s.get().items;
    const cull = deriveCull(items);
    expect(cull.get(items[0]!.id)!.burst).toMatchObject({ size: 2, best: true });
    expect(cull.get(items[1]!.id)!.verdict!.flags).toEqual(['burst-softer']);
    expect(cull.get(items[2]!.id)!.burst).toBeNull(); // a single frame is not shown as a burst
    expect(cull.get(items[2]!.id)!.verdict!.flags).toEqual(['blurry']);
    s.setStatus(items[0]!.id, 'pick');
    s.setStatus(items[2]!.id, 'reject');
    const now = s.get().items;
    expect(filterItems(now, 'picks', cull).map((i) => i.name)).toEqual(['1.jpg']);
    expect(filterItems(now, 'rejects', cull).map((i) => i.name)).toEqual(['3.jpg']);
    expect(filterItems(now, 'unrated', cull).map((i) => i.name)).toEqual(['2.jpg']);
    expect(filterItems(now, 'flagged', cull).map((i) => i.name)).toEqual(['2.jpg', '3.jpg']);
    expect(filterItems(now, 'all', cull)).toHaveLength(3);
  });
});

describe('cullKeyAction', () => {
  it('P / X / U rate, arrows and J / K move', () => {
    expect(cullKeyAction({ key: 'p' })).toEqual({ type: 'status', status: 'pick' });
    expect(cullKeyAction({ key: 'X' })).toEqual({ type: 'status', status: 'reject' });
    expect(cullKeyAction({ key: 'u' })).toEqual({ type: 'status', status: 'unrated' });
    expect(cullKeyAction({ key: 'ArrowRight' })).toEqual({ type: 'move', by: 1 });
    expect(cullKeyAction({ key: 'k' })).toEqual({ type: 'move', by: -1 });
    expect(cullKeyAction({ key: 'q' })).toBeNull();
  });

  it('leaves ⌘P, Ctrl+P and Alt combinations to the browser', () => {
    expect(cullKeyAction({ key: 'p', metaKey: true })).toBeNull();
    expect(cullKeyAction({ key: 'p', ctrlKey: true })).toBeNull();
    expect(cullKeyAction({ key: 'x', altKey: true })).toBeNull();
  });

  it.each([
    ['Georgian', { KeyP: 'პ', KeyX: 'ხ', KeyU: 'უ', KeyJ: 'ჯ', KeyK: 'კ' }],
    ['Russian', { KeyP: 'з', KeyX: 'ч', KeyU: 'г', KeyJ: 'о', KeyK: 'л' }],
  ])('the same physical keys work on the %s layout', (_layout, keys) => {
    expect(cullKeyAction({ key: keys.KeyP, code: 'KeyP' })).toEqual({ type: 'status', status: 'pick' });
    expect(cullKeyAction({ key: keys.KeyX, code: 'KeyX' })).toEqual({ type: 'status', status: 'reject' });
    expect(cullKeyAction({ key: keys.KeyU, code: 'KeyU' })).toEqual({ type: 'status', status: 'unrated' });
    expect(cullKeyAction({ key: keys.KeyJ, code: 'KeyJ' })).toEqual({ type: 'move', by: 1 });
    expect(cullKeyAction({ key: keys.KeyK, code: 'KeyK' })).toEqual({ type: 'move', by: -1 });
    expect(cullKeyAction({ key: keys.KeyP.toUpperCase(), code: 'KeyP' })).toEqual({ type: 'status', status: 'pick' });
    // ⌘P is still the browser's, whatever the layout.
    expect(cullKeyAction({ key: keys.KeyP, code: 'KeyP', metaKey: true })).toBeNull();
    expect(cullKeyAction({ key: keys.KeyP, code: 'KeyP', ctrlKey: true })).toBeNull();
  });

  it('a Latin letter means what it says (Dvorak: the P key types „l"); other keys stay unbound', () => {
    expect(cullKeyAction({ key: 'l', code: 'KeyP' })).toBeNull();
    expect(cullKeyAction({ key: 'ქ', code: 'KeyQ' })).toBeNull();
    expect(cullKeyAction({ key: 'პ' })).toBeNull(); // no code reported: nothing to fall back to
  });
});

describe('the session and the page', () => {
  const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('a reload asks first only while there is unsaved work — whether or not the workspace is open', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    const unbind = bindSessionToPage(s, window);
    expect(unload()).toBe(false);
    s.addFiles([file('a.jpg')]);
    expect(unload()).toBe(false); // photos, but nothing rated or graded yet
    const id = s.get().items[0]!.id;
    s.setStatus(id, 'pick');
    expect(unload()).toBe(true);
    s.markExported();
    expect(unload()).toBe(false);
    s.setGrade(id, { saturation: 118, contrast: 105, brightness: 104, temperature: 55 });
    expect(unload()).toBe(true);
    unbind();
    expect(unload()).toBe(false);
  });

  it('a sign-out empties the session, so the next person in this tab never sees these photos', () => {
    const { client } = fakeClient();
    const s = createPhotoSession(() => client);
    const unbind = bindSessionToPage(s, window);
    s.addFiles([file('a.jpg'), file('b.jpg')]);
    s.setStatus(s.get().items[0]!.id, 'pick');
    window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
    expect(s.get()).toEqual({ items: [], selectedId: null, dirty: false });
    expect(client.cancelled).toBe(1);
    expect(unload()).toBe(false); // nothing left to lose
    unbind();
  });

  it('the page’s own session is bound once, when it is first asked for', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./session') as { photoSession: () => PhotoSession };
      const s = mod.photoSession();
      expect(mod.photoSession()).toBe(s);
      s.addFiles([file('a.jpg')]);
      s.setStatus(s.get().items[0]!.id, 'reject');
      expect(unload()).toBe(true);
      window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
      expect(s.get().items).toEqual([]);
      expect(unload()).toBe(false);
    });
  });
});
