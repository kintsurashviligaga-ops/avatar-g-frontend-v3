/**
 * lib/studio3d/server/download.ts — one delivered model in the format the person picked. Free (no ledger call).
 *   glb → the worker's file as it is;  stl → binary STL, Z-up mm, `mm` tall;  obj → a .zip with .obj + .mtl + textures.
 * Pure apart from jszip; the route (app/api/studio3d/[id]/download) reads the GLB from our private bucket.
 */
import JSZip from 'jszip';
import { glbToObj } from '../export/obj';
import { glbToStl } from '../export/stl';
import { clampStlMm } from '../spec';

export type DownloadFormat = 'glb' | 'obj' | 'stl';
export const isDownloadFormat = (v: unknown): v is DownloadFormat => v === 'glb' || v === 'obj' || v === 'stl';

/** A safe file name from the request words: letters (any script) and digits, max 40, else "model". */
export function fileBase(prompt: string | undefined): string {
  const s = String(prompt ?? '').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'model';
}

export interface DownloadFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

export async function buildDownload(glb: Uint8Array, format: DownloadFormat, opts: { mm?: unknown; base?: string } = {}): Promise<DownloadFile> {
  const base = fileBase(opts.base);
  if (format === 'glb') return { bytes: glb, contentType: 'model/gltf-binary', filename: `${base}.glb` };
  if (format === 'stl') {
    const mm = clampStlMm(opts.mm);
    return { bytes: glbToStl(glb, mm).bytes, contentType: 'model/stl', filename: `${base}-${mm}mm.stl` };
  }
  // OBJ references its material file and textures by ASCII names; the zip keeps the person's name outside.
  const files = glbToObj(glb, 'model');
  const zip = new JSZip();
  zip.file('model.obj', files.obj);
  zip.file('model.mtl', files.mtl);
  for (const t of files.textures) zip.file(t.name, t.bytes);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, contentType: 'application/zip', filename: `${base}-obj.zip` };
}

/** RFC 6266 header with an ASCII fallback and the UTF-8 name (Georgian file names survive). */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
