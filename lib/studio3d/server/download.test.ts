/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any -- mock deps */
import JSZip from 'jszip';
import { buildDownload, contentDisposition, fileBase } from './download';
import { downloadJob, type Studio3dDeps } from './service';
import { packGlb } from '../export/glb';
import { readStl } from '../export/stl';

function triangle(): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(pos.buffer);
  return packGlb({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }],
  }, bin);
}

it('names files safely, Georgian included', () => {
  expect(fileBase('წითელი სავარძელი!')).toBe('წითელი-სავარძელი');
  expect(fileBase('../../etc/passwd')).toBe('etc-passwd');
  expect(fileBase('')).toBe('model');
  expect(contentDisposition('წითელი.glb')).toBe(`attachment; filename="______.glb"; filename*=UTF-8''${encodeURIComponent('წითელი.glb')}`);
});

it('GLB as is, STL at the chosen height, OBJ as a zip', async () => {
  const glb = triangle();
  expect(await buildDownload(glb, 'glb', { base: 'car' })).toMatchObject({ contentType: 'model/gltf-binary', filename: 'car.glb', bytes: glb });
  const stl = await buildDownload(glb, 'stl', { mm: '40', base: 'car' });
  expect(stl.filename).toBe('car-40mm.stl');
  expect(Math.max(...readStl(stl.bytes).vertices.map((v) => v[2]!))).toBeCloseTo(40);
  const obj = await buildDownload(glb, 'obj', { base: 'car' });
  expect(obj).toMatchObject({ contentType: 'application/zip', filename: 'car-obj.zip' });
  const zip = await JSZip.loadAsync(obj.bytes);
  expect(Object.keys(zip.files).sort()).toEqual(['model.mtl', 'model.obj']);
  expect(await zip.file('model.obj')!.async('string')).toContain('f 1 2 3');
});

describe('downloadJob', () => {
  const row = (step: string) => ({
    id: '00000000-0000-4000-8000-000000000001', userId: 'u', createdAt: 0,
    request: { mode: 'image', prompt: 'car', detail: 'standard', faces: 'medium' },
    state: { id: 'x', mode: 'image', step, modelCredits: 14, referenceCredits: 0, held: true, charged: step === 'done', refunded: false, referenceCharged: false, outputs: { glb: 'u/x/model.glb' } },
  });
  const deps = (r: any, bytes: Uint8Array | null = triangle()) => ({ store: { get: async () => r }, readBytes: async () => bytes } as unknown as Studio3dDeps);

  it('serves a finished model to its owner, free', async () => {
    const r = await downloadJob(deps(row('done')), 'u', row('done').id, 'stl', 100);
    expect(r).toMatchObject({ ok: true, file: { filename: 'car-100mm.stl' } });
  });
  it('refuses others, unfinished jobs, bad formats and broken files', async () => {
    expect(await downloadJob(deps(row('done')), 'other', row('done').id, 'glb')).toMatchObject({ ok: false, status: 404 });
    expect(await downloadJob(deps(row('shape')), 'u', row('done').id, 'glb')).toMatchObject({ ok: false, status: 409 });
    expect(await downloadJob(deps(row('done')), 'u', row('done').id, 'fbx')).toMatchObject({ ok: false, status: 400 });
    expect(await downloadJob(deps(row('done'), null), 'u', row('done').id, 'glb')).toMatchObject({ ok: false, status: 502 });
    expect(await downloadJob(deps(row('done'), new Uint8Array(30)), 'u', row('done').id, 'stl')).toMatchObject({ ok: false, status: 422 });
  });
});
