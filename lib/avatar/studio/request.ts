/**
 * lib/avatar/studio/request.ts — the Studio request as the browser sent it, shape-checked. Pure.
 *
 * The browser sends the REQUEST (script, presenter, voice, tone, pace, format, background), never a plan or a price:
 * the server rebuilds the plan with buildStudioPlan and compares the price the card showed (`expectedCredits`), so a
 * changed price is refused free (409) instead of charged.
 */
import { PACES, TONES } from './catalog';
import { MAX_SCRIPT_CHARS, MAX_SCENES } from './scriptScenes';
import type { StudioRequest } from './plan';

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Storage paths a background upload may name: the caller's own upload folder only. */
export function ownsUploadPath(path: string, userId: string): boolean {
  return path.startsWith(`avatar-studio/${userId}/uploads/`) && !path.includes('..') && /^[A-Za-z0-9._/-]+$/.test(path);
}

export function parseStudioRequest(v: unknown): Parsed<StudioRequest> {
  if (!isRec(v)) return { ok: false, errors: ['request must be an object'] };
  const errors: string[] = [];
  const script = str(v.script, MAX_SCRIPT_CHARS * 2);
  if (script === null) errors.push('script must be text');
  const presenterId = str(v.presenterId, 80);
  if (!presenterId) errors.push('presenterId is required');
  if (v.voiceId !== undefined && v.voiceId !== null && !str(v.voiceId, 40)) errors.push('voiceId must be a voice name');
  for (const k of ['voiceSpeed', 'voicePitch'] as const) {
    if (v[k] !== undefined && (typeof v[k] !== 'number' || !Number.isFinite(v[k]))) errors.push(`${k} must be a number`);
  }
  if (v.tone !== undefined && !(TONES as readonly unknown[]).includes(v.tone)) errors.push('unknown tone');
  if (v.pace !== undefined && !(PACES as readonly unknown[]).includes(v.pace)) errors.push('unknown pace');
  if (v.format !== undefined && v.format !== '16:9' && v.format !== '9:16') errors.push('format must be 16:9 or 9:16');
  if (v.resolution !== undefined && v.resolution !== '720p' && v.resolution !== '1080p') errors.push('resolution must be 720p or 1080p');
  let background: StudioRequest['background'];
  if (v.background !== undefined) {
    const b = v.background;
    if (!isRec(b)) errors.push('background must be an object');
    else if (b.kind === 'studio' || b.kind === 'green') background = { kind: b.kind };
    else if (b.kind === 'upload' && str(b.path, 300)) background = { kind: 'upload', path: b.path as string };
    else if (b.kind === 'generate' && str(b.prompt, 400) !== null) background = { kind: 'generate', prompt: b.prompt as string };
    else errors.push('unknown background');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      script: script as string,
      presenterId: presenterId as string,
      voiceId: (v.voiceId as string | null | undefined) ?? undefined,
      ...(typeof v.voiceSpeed === 'number' ? { voiceSpeed: v.voiceSpeed } : {}),
      ...(typeof v.voicePitch === 'number' ? { voicePitch: v.voicePitch } : {}),
      tone: v.tone as StudioRequest['tone'],
      pace: v.pace as StudioRequest['pace'],
      format: v.format as StudioRequest['format'],
      resolution: v.resolution as StudioRequest['resolution'],
      background,
    },
  };
}

export interface SceneStart {
  /** The browser's own id for this presentation (one folder of scenes). */
  projectId: string;
  request: StudioRequest;
  sceneIndex: number;
  /** The price the card showed for this scene. */
  expectedCredits: number;
  /** The scene's text as the user edited it ("Edit script"); else the plan's own text. */
  text?: string;
  /** 0 = first take; "Regenerate scene" sends the next number (a new charge, a new debit ref). */
  take: number;
}

export function parseSceneStart(v: unknown): Parsed<SceneStart> {
  if (!isRec(v)) return { ok: false, errors: ['body must be an object'] };
  const req = parseStudioRequest(v.request);
  const errors = req.ok ? [] : [...req.errors];
  const projectId = str(v.projectId, 64);
  if (!projectId || !/^[A-Za-z0-9_-]{6,64}$/.test(projectId)) errors.push('projectId must be 6–64 letters, digits, - or _');
  const sceneIndex = v.sceneIndex;
  if (typeof sceneIndex !== 'number' || !Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= MAX_SCENES) errors.push('sceneIndex is out of range');
  const expectedCredits = v.expectedCredits;
  if (typeof expectedCredits !== 'number' || !Number.isInteger(expectedCredits) || expectedCredits < 1) errors.push('expectedCredits is required');
  const take = v.take ?? 0;
  if (typeof take !== 'number' || !Number.isInteger(take) || take < 0 || take > 20) errors.push('take is out of range');
  if (v.text !== undefined && str(v.text, MAX_SCRIPT_CHARS) === null) errors.push('text is too long');
  if (errors.length || !req.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      projectId: projectId as string, request: req.value, sceneIndex: sceneIndex as number, expectedCredits: expectedCredits as number,
      take: take as number, ...(typeof v.text === 'string' ? { text: v.text } : {}),
    },
  };
}
