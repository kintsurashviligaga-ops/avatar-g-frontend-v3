/**
 * lib/video/directorsWorkflow/server.ts — the server side shared by the Director's Workflow routes: who may use them
 * (DIRECTORS_WORKFLOW + admin), and the request checks. Every route answers 404 while the flag is off for this user, so a
 * closed feature says nothing about itself.
 */
import 'server-only';
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin/guard';
import { DIRECT_CLIP_SECONDS } from '@/lib/video/directClip';
import { directorsWorkflowAllowed } from './flag';
import { validateProject } from './plan';
import type { DwProject } from './types';

export function directorsWorkflowOpenTo(user: User | null, env: Record<string, string | undefined> = process.env): boolean {
  return !!user && directorsWorkflowAllowed(isAdminUser(user), env);
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/**
 * A project as the browser sent it, shape-checked (lengths, enums, arrays), then rule-checked by validateProject.
 * Null = not a project at all. The caller still runs validateProject for the rules a user can fix.
 */
export function parseProject(v: unknown): DwProject | null {
  if (!isRec(v)) return null;
  if (!isStr(v.id, 64) || !isStr(v.title, 200) || !isStr(v.logline, 400)) return null;
  if (v.aspect !== '9:16' && v.aspect !== '16:9') return null;
  if (v.resolution !== '720p' && v.resolution !== '1080p') return null;
  if (v.status !== 'draft' && v.status !== 'approved') return null;
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return null;
  if (!Array.isArray(v.characters) || v.characters.length > 8 || !Array.isArray(v.scenes) || v.scenes.length > 20) return null;
  for (const c of v.characters) {
    if (!isRec(c) || !isStr(c.id, 32) || !isStr(c.name, 60) || !isStr(c.look, 600) || (c.voice !== 'male' && c.voice !== 'female')) return null;
    if (c.photoId !== undefined && !isStr(c.photoId, 300)) return null;
  }
  for (const s of v.scenes) {
    if (!isRec(s) || !isStr(s.id, 64) || typeof s.order !== 'number' || !isStr(s.title, 200) || !isStr(s.action, 2_000) || !isStr(s.camera, 400)) return null;
    if (!(DIRECT_CLIP_SECONDS as readonly unknown[]).includes(s.seconds)) return null;
    if (!Array.isArray(s.characterIds) || s.characterIds.length > 8 || !s.characterIds.every((x) => isStr(x, 32))) return null;
    if (s.firstFrame !== 'previous' && s.firstFrame !== 'photo' && s.firstFrame !== 'none') return null;
    if (s.photoId !== undefined && !isStr(s.photoId, 300)) return null;
    const a = s.audio;
    if (!isRec(a) || !Array.isArray(a.lines) || a.lines.length > 10 || !isStr(a.ambience, 400) || !Array.isArray(a.effects) || a.effects.length > 8) return null;
    if (!a.lines.every((l) => isRec(l) && isStr(l.characterId, 32) && isStr(l.text, 600))) return null;
    if (!a.effects.every((e) => isStr(e, 400)) || !(a.music === null || isStr(a.music, 400))) return null;
  }
  return v as unknown as DwProject;
}

/** parseProject + the rules: null when not a project, else the problems (empty = OK). */
export function checkProject(v: unknown): { project: DwProject; problems: ReturnType<typeof validateProject> } | null {
  const project = parseProject(v);
  return project ? { project, problems: validateProject(project) } : null;
}
