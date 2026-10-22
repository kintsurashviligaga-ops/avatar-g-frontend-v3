/**
 * lib/avatar/curatedFace.ts — a built-in avatar's face as the talking avatar's first frame (MASTER TASK v3.1, PR 9).
 *
 * The server reads the face from the deployment's own public/ folder, so no upload, signed URL or caller-chosen file
 * reaches Veo. next.config.js traces public/avatars into /api/avatar/veo; without that entry the read fails and the
 * route refuses before any charge.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VeoMedia } from '@/lib/veo/types';
import { curatedAvatarFace } from './curated';

/** The face's bytes for Veo, or null: not a built-in avatar, or its file is missing from the deployment. */
export async function loadCuratedFace(face: string): Promise<(VeoMedia & { kind: 'bytes' }) | null> {
  const path = curatedAvatarFace(face);
  if (!path) return null;
  try {
    const bytes = await readFile(join(process.cwd(), 'public', path));
    return bytes.length ? { kind: 'bytes', base64: bytes.toString('base64'), mimeType: 'image/jpeg' } : null;
  } catch {
    return null;
  }
}
