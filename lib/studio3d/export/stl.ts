/**
 * lib/studio3d/export/stl.ts — GLB → binary STL for 3D printing.
 *
 * Printers and slicers are Z-up and millimetres; glTF is Y-up and metres. We rotate (x, y, z) → (x, −z, y), scale the
 * model so its HEIGHT is `heightMm` (default 100 mm, decision D6), centre it on X/Y and stand it on z = 0. Normals are
 * recomputed per face from the winding (slicers ignore stored normals, but a correct one keeps viewers happy).
 */
import { bounds, readGlb, type GlbMesh } from './glb';
import { clampStlMm } from '../spec';

export interface StlResult {
  bytes: Uint8Array;
  triangles: number;
  /** Final size in mm (x, y, z). */
  sizeMm: [number, number, number];
}

export function meshToStl(mesh: GlbMesh, heightMm?: number): StlResult {
  const h = clampStlMm(heightMm);
  const src = mesh.positions;
  const p = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    p[i] = src[i];
    p[i + 1] = -src[i + 2];
    p[i + 2] = src[i + 1];
  }
  const { min, max } = bounds(p);
  const height = max[2] - min[2];
  const scale = height > 0 ? h / height : 1;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (p[i] - cx) * scale;
    p[i + 1] = (p[i + 1] - cy) * scale;
    p[i + 2] = (p[i + 2] - min[2]) * scale;
  }

  const tris = mesh.indices.length / 3;
  const out = new Uint8Array(84 + tris * 50);
  const dv = new DataView(out.buffer);
  const header = new TextEncoder().encode('MyAvatar.ge 3D Studio, units mm, Z up');
  out.set(header.subarray(0, 80), 0);
  dv.setUint32(80, tris, true);
  let o = 84;
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l > 0) { nx /= l; ny /= l; nz /= l; }
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(o, p[v], true); dv.setFloat32(o + 4, p[v + 1], true); dv.setFloat32(o + 8, p[v + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  const s = bounds(p);
  const r = (n: number) => Math.round(n * 100) / 100;
  return { bytes: out, triangles: tris, sizeMm: [r(s.max[0] - s.min[0]), r(s.max[1] - s.min[1]), r(s.max[2] - s.min[2])] };
}

export const glbToStl = (glb: Uint8Array, heightMm?: number) => meshToStl(readGlb(glb), heightMm);

/** Read a binary STL back (tests and the print-check). */
export function readStl(bytes: Uint8Array): { triangles: number; normals: number[][]; vertices: number[][] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 !== bytes.byteLength) throw new Error('STL size does not match its triangle count');
  const normals: number[][] = [];
  const vertices: number[][] = [];
  for (let t = 0, o = 84; t < n; t++, o += 50) {
    normals.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]);
    for (let k = 0; k < 3; k++) {
      const q = o + 12 + k * 12;
      vertices.push([dv.getFloat32(q, true), dv.getFloat32(q + 4, true), dv.getFloat32(q + 8, true)]);
    }
  }
  return { triangles: n, normals, vertices };
}
