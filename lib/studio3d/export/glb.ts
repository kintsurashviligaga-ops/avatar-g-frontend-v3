/**
 * lib/studio3d/export/glb.ts — a small, dependency-free glTF 2.0 binary (.glb) reader, enough to turn the worker's GLB
 * into STL and OBJ on our own server (the download route, PR C). Pure TypeScript; works in Node and in the browser.
 *
 * Reads: the JSON + BIN chunks, the default scene's node tree (matrix or TRS), triangle primitives (mode 4) with
 * POSITION (float VEC3), optional NORMAL and TEXCOORD_0 (float, or normalised u8/u16), u8/u16/u32 or no indices, and the
 * material's base colour + base-colour texture (embedded image).
 * Refuses: Draco / meshopt compression (the worker never writes them), external .bin or image URIs, sparse accessors.
 */

export interface GlbTexture {
  bytes: Uint8Array;
  mime: string;
}

export interface GlbMaterial {
  name: string;
  baseColor: [number, number, number, number];
  texture?: GlbTexture;
}

export interface GlbGroup {
  /** First index (into `indices`) of this primitive. */
  start: number;
  count: number;
  material: number; // -1 = default material
}

export interface GlbMesh {
  /** World-space positions, xyz per vertex (glTF is Y-up, metres). */
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  /** Triangles, counter-clockwise front faces. */
  indices: Uint32Array;
  groups: GlbGroup[];
  materials: GlbMaterial[];
}

export class GlbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlbError';
  }
}

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const UNSUPPORTED_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression'];
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export function splitGlb(buf: Uint8Array): { json: Json; bin: Uint8Array | null } {
  if (buf.byteLength < 20) throw new GlbError('file is too small to be a GLB');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new GlbError('not a GLB file');
  if (dv.getUint32(4, true) !== 2) throw new GlbError('only glTF 2.0 is supported');
  const total = Math.min(dv.getUint32(8, true), buf.byteLength);
  let off = 12;
  let json: Json = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > total) throw new GlbError('truncated GLB chunk');
    const body = buf.subarray(start, start + len);
    if (type === CHUNK_JSON && json === null) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === CHUNK_BIN && bin === null) bin = body;
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new GlbError('GLB has no JSON chunk');
  return { json, bin };
}

/* ---------------------------------------------------------------- 4×4 maths (column-major, like glTF) ---------------------------------------------------------------- */

export type Mat4 = number[];
export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
    out[c * 4 + r] = s;
  }
  return out;
}

export function fromTRS(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): Mat4 {
  const [x = 0, y = 0, z = 0, w = 1] = q;
  const [sx = 1, sy = 1, sz = 1] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1,
  ];
}

const det3 = (m: Mat4) =>
  m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);

/* ---------------------------------------------------------------- accessors ---------------------------------------------------------------- */

function readAccessor(json: Json, bin: Uint8Array | null, index: number): { data: Float64Array; size: number; count: number } {
  const acc = json.accessors?.[index];
  if (!acc) throw new GlbError(`missing accessor ${index}`);
  if (acc.sparse) throw new GlbError('sparse accessors are not supported');
  const size = COMPONENTS[acc.type];
  const bytes = BYTES[acc.componentType];
  if (!size || !bytes) throw new GlbError('unsupported accessor type');
  const count: number = acc.count;
  const out = new Float64Array(count * size);
  if (acc.bufferView === undefined) return { data: out, size, count }; // all zeros per spec
  const view = json.bufferViews?.[acc.bufferView];
  if (!view) throw new GlbError('missing bufferView');
  if ((view.buffer ?? 0) !== 0 || !bin) throw new GlbError('external buffers are not supported');
  const stride: number = view.byteStride || size * bytes;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const end = base + stride * (count - 1) + size * bytes;
  if (count > 0 && end > Math.min(bin.byteLength, (view.byteOffset ?? 0) + view.byteLength)) throw new GlbError('accessor runs past its buffer');
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const norm = acc.normalized === true;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < size; c++) {
      const o = base + i * stride + c * bytes;
      let v: number;
      switch (acc.componentType) {
        case 5126: v = dv.getFloat32(o, true); break;
        case 5125: v = dv.getUint32(o, true); break;
        case 5123: v = dv.getUint16(o, true); if (norm) v /= 65535; break;
        case 5122: v = dv.getInt16(o, true); if (norm) v = Math.max(v / 32767, -1); break;
        case 5121: v = dv.getUint8(o); if (norm) v /= 255; break;
        default: v = dv.getInt8(o); if (norm) v = Math.max(v / 127, -1);
      }
      out[i * size + c] = v;
    }
  }
  return { data: out, size, count };
}

function readImage(json: Json, bin: Uint8Array | null, textureIndex: number | undefined): GlbTexture | undefined {
  if (textureIndex === undefined) return undefined;
  const tex = json.textures?.[textureIndex];
  // WebP textures (TRELLIS.2 writes these) live under EXT_texture_webp.
  const src = tex?.extensions?.EXT_texture_webp?.source ?? tex?.source;
  const img = json.images?.[src];
  if (!img || img.bufferView === undefined || !bin) return undefined;
  const view = json.bufferViews[img.bufferView];
  const start = view.byteOffset ?? 0;
  return { bytes: bin.slice(start, start + view.byteLength), mime: String(img.mimeType || 'image/png') };
}

/* ---------------------------------------------------------------- the reader ---------------------------------------------------------------- */

export const MAX_TRIANGLES = 2_000_000;

export function readGlb(buf: Uint8Array): GlbMesh {
  const { json, bin } = splitGlb(buf);
  const required: string[] = json.extensionsRequired ?? [];
  const bad = required.find((e) => UNSUPPORTED_EXT.includes(e));
  if (bad) throw new GlbError(`${bad} is not supported`);

  const materials: GlbMaterial[] = (json.materials ?? []).map((m: Json, i: number) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const f = pbr.baseColorFactor ?? [1, 1, 1, 1];
    return {
      name: String(m.name || `material_${i}`).replace(/[^\w.-]+/g, '_').slice(0, 40) || `material_${i}`,
      baseColor: [f[0]!, f[1]!, f[2]!, f[3]!] as [number, number, number, number],
      texture: readImage(json, bin, pbr.baseColorTexture?.index),
    };
  });

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const groups: GlbGroup[] = [];
  let anyNormals = false;
  let anyUvs = false;
  let allNormals = true;
  let allUvs = true;

  const sceneIndex = json.scene ?? 0;
  const roots: number[] = json.scenes?.[sceneIndex]?.nodes ?? (json.nodes ?? []).map((_: unknown, i: number) => i);
  const seen = new Set<number>();

  const visit = (ni: number, parent: Mat4) => {
    if (seen.has(ni)) throw new GlbError('node graph has a cycle');
    seen.add(ni);
    const node = json.nodes?.[ni];
    if (!node) return;
    const local = Array.isArray(node.matrix) && node.matrix.length === 16 ? node.matrix : fromTRS(node.translation, node.rotation, node.scale);
    const world = multiply(parent, local);
    if (node.mesh !== undefined) addMesh(node.mesh, world);
    for (const c of node.children ?? []) visit(c, world);
  };

  const addMesh = (mi: number, m: Mat4) => {
    const mesh = json.meshes?.[mi];
    if (!mesh) return;
    const flip = det3(m) < 0;
    // Normal matrix = inverse-transpose of the 3×3; for TRELLIS output (rotation + uniform scale) the 3×3 itself, renormalised.
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue; // lines / points have no surface
      if (prim.extensions && Object.keys(prim.extensions).some((e) => UNSUPPORTED_EXT.includes(e))) throw new GlbError('compressed meshes are not supported');
      if (prim.attributes?.POSITION === undefined) continue;
      const P = readAccessor(json, bin, prim.attributes.POSITION);
      const N = prim.attributes.NORMAL !== undefined ? readAccessor(json, bin, prim.attributes.NORMAL) : null;
      const T = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
      const I = prim.indices !== undefined ? readAccessor(json, bin, prim.indices).data : null;
      const base = pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        const x = P.data[i * 3]!, y = P.data[i * 3 + 1]!, z = P.data[i * 3 + 2]!;
        pos.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
        if (N) {
          const a = N.data[i * 3]!, b = N.data[i * 3 + 1]!, c = N.data[i * 3 + 2]!;
          let nx = m[0]! * a + m[4]! * b + m[8]! * c, ny = m[1]! * a + m[5]! * b + m[9]! * c, nz = m[2]! * a + m[6]! * b + m[10]! * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          if (flip) { nx = -nx; ny = -ny; nz = -nz; }
          nrm.push(nx / l, ny / l, nz / l);
        } else nrm.push(0, 0, 0);
        if (T) uv.push(T.data[i * 2]!, T.data[i * 2 + 1]!);
        else uv.push(0, 0);
      }
      anyNormals ||= !!N; allNormals &&= !!N;
      anyUvs ||= !!T; allUvs &&= !!T;
      const start = idx.length;
      const n = I ? I.length : P.count;
      const tri = n - (n % 3);
      for (let t = 0; t < tri; t += 3) {
        const a = I ? I[t]! : t, b = I ? I[t + 1]! : t + 1, c = I ? I[t + 2]! : t + 2;
        if (a >= P.count || b >= P.count || c >= P.count) throw new GlbError('index out of range');
        if (flip) idx.push(base + a, base + c, base + b);
        else idx.push(base + a, base + b, base + c);
      }
      if (idx.length / 3 > MAX_TRIANGLES) throw new GlbError('model has too many triangles');
      const material = typeof prim.material === 'number' && prim.material < materials.length ? prim.material : -1;
      if (idx.length > start) groups.push({ start, count: idx.length - start, material });
    }
  };

  for (const r of roots) visit(r, IDENTITY);
  if (idx.length === 0) throw new GlbError('model has no triangles');

  return {
    positions: Float32Array.from(pos),
    ...(anyNormals && allNormals ? { normals: Float32Array.from(nrm) } : {}),
    ...(anyUvs && allUvs ? { uvs: Float32Array.from(uv) } : {}),
    indices: Uint32Array.from(idx),
    groups,
    materials,
  };
}

/** Bounding box of world positions. */
export function bounds(p: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    if (p[i + k]! < min[k]!) min[k] = p[i + k]!;
    if (p[i + k]! > max[k]!) max[k] = p[i + k]!;
  }
  return { min, max };
}

/* ---------------------------------------------------------------- writer (tests + fixtures) ---------------------------------------------------------------- */

/** Pack a JSON object and a BIN chunk into a .glb (used by tests and by the worker contract fixture). */
export function packGlb(json: object, bin?: Uint8Array): Uint8Array {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = enc.length + ((4 - (enc.length % 4)) % 4);
  const binLen = bin ? bin.length + ((4 - (bin.length % 4)) % 4) : 0;
  const total = 12 + 8 + jsonLen + (bin ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(enc, 20);
  out.fill(0x20, 20 + enc.length, 20 + jsonLen);
  if (bin) {
    const o = 20 + jsonLen;
    dv.setUint32(o, binLen, true);
    dv.setUint32(o + 4, CHUNK_BIN, true);
    out.set(bin, o + 8);
  }
  return out;
}
