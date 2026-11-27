/**
 * lib/studio3d/export/obj.ts — GLB → Wavefront OBJ + MTL + texture files (the download route zips them with jszip, PR C).
 *
 * OBJ keeps glTF's Y-up and metres (Blender, Maya, Unity and Unreal all import OBJ Y-up by default). Texture V is flipped
 * (glTF's origin is top-left, OBJ's bottom-left). Indices are 1-based; each material group gets its own `usemtl`.
 */
import { readGlb, type GlbMesh } from './glb';

export interface ObjFiles {
  obj: string;
  mtl: string;
  textures: { name: string; bytes: Uint8Array }[];
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const f = (n: number) => {
  const s = (Math.round(n * 1e6) / 1e6).toString();
  return s === '-0' ? '0' : s;
};

export function meshToObj(mesh: GlbMesh, baseName = 'model'): ObjFiles {
  const name = baseName.replace(/[^\w-]+/g, '_').slice(0, 40) || 'model';
  const lines: string[] = ['# MyAvatar.ge 3D Studio', `mtllib ${name}.mtl`, `o ${name}`];
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3) lines.push(`v ${f(P[i]!)} ${f(P[i + 1]!)} ${f(P[i + 2]!)}`);
  if (mesh.uvs) for (let i = 0; i < mesh.uvs.length; i += 2) lines.push(`vt ${f(mesh.uvs[i]!)} ${f(1 - mesh.uvs[i + 1]!)}`);
  if (mesh.normals) for (let i = 0; i < mesh.normals.length; i += 3) lines.push(`vn ${f(mesh.normals[i]!)} ${f(mesh.normals[i + 1]!)} ${f(mesh.normals[i + 2]!)}`);

  const ref = (v: number) => {
    const k = v + 1;
    if (mesh.uvs && mesh.normals) return `${k}/${k}/${k}`;
    if (mesh.uvs) return `${k}/${k}`;
    if (mesh.normals) return `${k}//${k}`;
    return `${k}`;
  };

  const used = new Set<number>();
  for (const g of mesh.groups) {
    used.add(g.material);
    lines.push(`usemtl ${g.material >= 0 ? mesh.materials[g.material]!.name : 'default'}`);
    for (let t = g.start; t < g.start + g.count; t += 3) {
      lines.push(`f ${ref(mesh.indices[t]!)} ${ref(mesh.indices[t + 1]!)} ${ref(mesh.indices[t + 2]!)}`);
    }
  }

  const mtl: string[] = ['# MyAvatar.ge 3D Studio'];
  const textures: ObjFiles['textures'] = [];
  if (used.has(-1)) mtl.push('newmtl default', 'Kd 0.8 0.8 0.8', 'd 1', 'illum 2', '');
  mesh.materials.forEach((m, i) => {
    if (!used.has(i)) return;
    const [r, g, b, a] = m.baseColor;
    mtl.push(`newmtl ${m.name}`, `Kd ${f(r)} ${f(g)} ${f(b)}`, `d ${f(a)}`, 'illum 2');
    if (m.texture) {
      const file = `${name}_${i}.${EXT[m.texture.mime] ?? 'png'}`;
      mtl.push(`map_Kd ${file}`);
      textures.push({ name: file, bytes: m.texture.bytes });
    }
    mtl.push('');
  });

  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n'), textures };
}

export const glbToObj = (glb: Uint8Array, baseName?: string) => meshToObj(readGlb(glb), baseName);
