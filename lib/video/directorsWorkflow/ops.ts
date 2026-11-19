/**
 * lib/video/directorsWorkflow/ops.ts — the scene-card edits: add, remove, move, duplicate, change.
 *
 * Immutable: every edit returns a new project with `version + 1` and `status: 'draft'`, so an approval (which names one
 * version) never covers a board that changed after it. Order is always renumbered 1…n. A scene whose first frame was
 * "previous" falls back to "none" when it becomes scene 1 (nothing comes before it).
 *
 * Pure and client-safe.
 */
import { DIRECT_CLIP_DEFAULT_SECONDS } from '@/lib/video/directClip';
import { DW_MAX_SCENES, DW_MIN_SCENES, type DwProject, type DwScene } from './types';

let seq = 0;
/** A short id unique within a project. Callers may pass their own (tests do). */
export const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

function sorted(scenes: readonly DwScene[]): DwScene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

function renumber(scenes: readonly DwScene[]): DwScene[] {
  return scenes.map((s, i) => {
    const order = i + 1;
    const firstFrame = order === 1 && s.firstFrame === 'previous' ? 'none' : s.firstFrame;
    return s.order === order && s.firstFrame === firstFrame ? s : { ...s, order, firstFrame };
  });
}

function bump(project: DwProject, scenes: DwScene[]): DwProject {
  return { ...project, scenes: renumber(scenes), status: 'draft', version: project.version + 1 };
}

export function emptyScene(id: string = newId('scene')): DwScene {
  return {
    id,
    order: 0,
    title: '',
    action: '',
    camera: '',
    seconds: DIRECT_CLIP_DEFAULT_SECONDS,
    characterIds: [],
    audio: { lines: [], ambience: '', effects: [], music: null },
    firstFrame: 'previous',
  };
}

/** Insert a scene after `afterId` (or at the end). No-op at the scene limit. */
export function addScene(project: DwProject, scene: DwScene = emptyScene(), afterId?: string): DwProject {
  if (project.scenes.length >= DW_MAX_SCENES) return project;
  const list = sorted(project.scenes);
  const at = afterId ? list.findIndex((s) => s.id === afterId) + 1 : list.length;
  list.splice(at <= 0 ? list.length : at, 0, scene);
  return bump(project, list);
}

/** Remove a scene. No-op on the last remaining scene. */
export function removeScene(project: DwProject, sceneId: string): DwProject {
  if (project.scenes.length <= DW_MIN_SCENES) return project;
  const list = sorted(project.scenes).filter((s) => s.id !== sceneId);
  return list.length === project.scenes.length ? project : bump(project, list);
}

/** Move a scene to a 1-based position (clamped). */
export function moveScene(project: DwProject, sceneId: string, toOrder: number): DwProject {
  const list = sorted(project.scenes);
  const from = list.findIndex((s) => s.id === sceneId);
  if (from < 0) return project;
  const to = Math.min(Math.max(Math.round(toOrder), 1), list.length) - 1;
  if (to === from) return project;
  const [s] = list.splice(from, 1);
  list.splice(to, 0, s!);
  return bump(project, list);
}

/** A copy right after the original, with fresh ids. No-op at the scene limit. */
export function duplicateScene(project: DwProject, sceneId: string, id: string = newId('scene')): DwProject {
  const src = project.scenes.find((s) => s.id === sceneId);
  if (!src) return project;
  const copy: DwScene = { ...src, id, audio: { ...src.audio, lines: src.audio.lines.map((l) => ({ ...l })), effects: [...src.audio.effects] }, characterIds: [...src.characterIds] };
  return addScene(project, copy, sceneId);
}

/** Change fields of one scene (not its id or order: use moveScene). */
export function updateScene(project: DwProject, sceneId: string, patch: Partial<Omit<DwScene, 'id' | 'order'>>): DwProject {
  if (!project.scenes.some((s) => s.id === sceneId)) return project;
  return bump(project, sorted(project.scenes).map((s) => (s.id === sceneId ? { ...s, ...patch } : s)));
}

/** Approve exactly this version. The caller stores the version with the quote it showed. */
export function approve(project: DwProject): DwProject {
  return { ...project, status: 'approved' };
}
