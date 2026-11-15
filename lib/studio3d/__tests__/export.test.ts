/** @jest-environment node */
import { readGlb, packGlb, GlbError, glbToStl, readStl, glbToObj, meshToObj } from '..';
import { fromTRS, multiply, IDENTITY } from '../export/glb';

/** One right-angle triangle in the XY plane + optional UVs, normals, indices and a textured material. */
function triangleGlb(opts: { node?: object; uvs?: boolean; normals?: boolean; indices?: 'u8' | 'u16' | 'u32' | 'none'; texture?: boolean; ext?: string[] } = {}) {
  const parts: Uint8Array[] = [];
  const views: any[] = [];
  const accessors: any[] = [];
  let off = 0;
  const add = (bytes: Uint8Array) => {
    views.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength });
    parts.push(bytes);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    if (pad) parts.push(new Uint8Array(pad));
    off += bytes.byteLength + pad;
    return views.length - 1;
  };
  const f32 = (a: number[]) => new Uint8Array(new Float32Array(a).buffer);
  accessors.push({ bufferView: add(f32([0, 0, 0, 1, 0, 0, 0, 1, 0])), componentType: 5126, count: 3, type: 'VEC3' });
  const attributes: any = { POSITION: 0 };
  if (opts.uvs) {
    accessors.push({ bufferView: add(f32([0, 0, 1, 0, 0, 1])), componentType: 5126, count: 3, type: 'VEC2' });
    attributes.TEXCOORD_0 = accessors.length - 1;
  }
  if (opts.normals) {
    accessors.push({ bufferView: add(f32([0, 0, 1, 0, 0, 1, 0, 0, 1])), componentType: 5126, count: 3, type: 'VEC3' });
    attributes.NORMAL = accessors.length - 1;
  }
  const prim: any = { attributes, mode: 4 };
  const it = opts.indices ?? 'u16';
  if (it !== 'none') {
    const arr = it === 'u8' ? new Uint8Array([0, 1, 2]) : it === 'u16' ? new Uint16Array([0, 1, 2]) : new Uint32Array([0, 1, 2]);
    accessors.push({ bufferView: add(new Uint8Array(arr.buffer)), componentType: it === 'u8' ? 5121 : it === 'u16' ? 5123 : 5125, count: 3, type: 'SCALAR' });
    prim.indices = accessors.length - 1;
  }
  const json: any = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...(opts.node ?? {}) }],
    meshes: [{ primitives: [prim] }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  };
  if (opts.texture) {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    json.images = [{ bufferView: add(png), mimeType: 'image/png' }];
    json.textures = [{ source: 0 }];
    json.materials = [{ name: 'Skin Mat', pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.25, 1], baseColorTexture: { index: 0 } } }];
    prim.material = 0;
  }
  if (opts.ext) json.extensionsRequired = opts.ext;
  const bin = new Uint8Array(off);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.byteLength; }
  json.buffers[0].byteLength = bin.byteLength;
  return packGlb(json, bin);
}

describe('GLB reader', () => {
  it('reads positions, uvs, normals and every index width', () => {
    for (const indices of ['u8', 'u16', 'u32', 'none'] as const) {
      const m = readGlb(triangleGlb({ uvs: true, normals: true, indices }));
      expect(Array.from(m.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(Array.from(m.indices)).toEqual([0, 1, 2]);
      expect(Array.from(m.uvs!)).toEqual([0, 0, 1, 0, 0, 1]);
      expect(Array.from(m.normals!)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    }
  });
  it('applies node transforms (TRS and matrix)', () => {
    const m = readGlb(triangleGlb({ node: { translation: [10, 0, 0], scale: [2, 2, 2] } }));
    expect(Array.from(m.positions)).toEqual([10, 0, 0, 12, 0, 0, 10, 2, 0]);
    const s = Math.SQRT1_2; // 90° about Z
    const r = readGlb(triangleGlb({ node: { rotation: [0, 0, s, s] } }));
    const p = Array.from(r.positions).map((v) => Math.round(v * 1e6) / 1e6 + 0);
    expect(p).toEqual([0, 0, 0, 0, 1, 0, -1, 0, 0]);
    const mat = readGlb(triangleGlb({ node: { matrix: fromTRS([0, 5, 0]) } }));
    expect(Array.from(mat.positions)).toEqual([0, 5, 0, 1, 5, 0, 0, 6, 0]);
  });
  it('keeps the front face when a mirror flips the winding', () => {
    const m = readGlb(triangleGlb({ node: { scale: [-1, 1, 1] } }));
    expect(Array.from(m.indices)).toEqual([0, 2, 1]);
  });
  it('reads the material and the embedded texture', () => {
    const m = readGlb(triangleGlb({ uvs: true, texture: true }));
    expect(m.materials[0].name).toBe('Skin_Mat');
    expect(m.materials[0].baseColor).toEqual([1, 0.5, 0.25, 1]);
    expect(m.materials[0].texture!.mime).toBe('image/png');
    expect(Array.from(m.materials[0].texture!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(m.groups).toEqual([{ start: 0, count: 3, material: 0 }]);
  });
  it('refuses what it cannot read', () => {
    expect(() => readGlb(new Uint8Array(10))).toThrow(GlbError);
    expect(() => readGlb(new Uint8Array(40))).toThrow('not a GLB');
    expect(() => readGlb(triangleGlb({ ext: ['KHR_draco_mesh_compression'] }))).toThrow('KHR_draco_mesh_compression');
    expect(() => readGlb(packGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [] }] }))).toThrow('no triangles');
  });
  it('matrix helpers', () => {
    expect(multiply(IDENTITY, fromTRS([1, 2, 3]))).toEqual(fromTRS([1, 2, 3]));
  });
});

describe('GLB → STL', () => {
  it('turns Y-up metres into Z-up millimetres standing on z = 0', () => {
    const stl = glbToStl(triangleGlb(), 50);
    expect(stl.triangles).toBe(1);
    expect(stl.bytes.byteLength).toBe(84 + 50);
    const back = readStl(stl.bytes);
    // glTF (0,0,0) (1,0,0) (0,1,0) → (x,−z,y) → height 1 → ×50, centred on x/y, min z = 0
    expect(back.vertices).toEqual([[-25, 0, 0], [25, 0, 0], [-25, 0, 50]]);
    const [nx, ny, nz] = back.normals[0];
    expect([nx, ny + 0, nz]).toEqual([0, -1, 0]);
    expect(stl.sizeMm).toEqual([50, 0, 50]);
    expect(new TextDecoder().decode(stl.bytes.slice(0, 37))).toBe('MyAvatar.ge 3D Studio, units mm, Z up');
  });
  it('defaults to 100 mm and clamps silly heights', () => {
    expect(glbToStl(triangleGlb()).sizeMm[2]).toBe(100);
    expect(glbToStl(triangleGlb(), 100000).sizeMm[2]).toBe(500);
  });
});

describe('GLB → OBJ', () => {
  it('writes v / vt (V flipped) / vn / f and an MTL with the texture', () => {
    const out = glbToObj(triangleGlb({ uvs: true, normals: true, texture: true }), 'red car');
    expect(out.obj).toBe([
      '# MyAvatar.ge 3D Studio',
      'mtllib red_car.mtl',
      'o red_car',
      'v 0 0 0', 'v 1 0 0', 'v 0 1 0',
      'vt 0 1', 'vt 1 1', 'vt 0 0',
      'vn 0 0 1', 'vn 0 0 1', 'vn 0 0 1',
      'usemtl Skin_Mat',
      'f 1/1/1 2/2/2 3/3/3',
      '',
    ].join('\n'));
    expect(out.mtl).toContain('newmtl Skin_Mat\nKd 1 0.5 0.25\nd 1\nillum 2\nmap_Kd red_car_0.png');
    expect(out.textures).toHaveLength(1);
    expect(out.textures[0].name).toBe('red_car_0.png');
  });
  it('plain mesh gets the default material and bare face indices', () => {
    const out = meshToObj(readGlb(triangleGlb({ indices: 'none' })));
    expect(out.obj).toContain('usemtl default\nf 1 2 3');
    expect(out.mtl).toContain('newmtl default');
    expect(out.textures).toEqual([]);
  });
});
