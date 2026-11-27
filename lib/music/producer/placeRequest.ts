/** lib/music/producer/placeRequest.ts — what the place route accepts. Pure. */
import type { CueSpan, CueTarget, PlacementScene } from './placement';

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function parsePlaceBody(raw: unknown): { trackId: string; target: CueTarget; span: CueSpan; projectId: string; filmUrl: string; scenes: PlacementScene[] } | null {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const film = (b.film && typeof b.film === 'object' ? b.film : {}) as Record<string, unknown>;
  const t = (b.target && typeof b.target === 'object' ? b.target : {}) as Record<string, unknown>;
  if (typeof b.trackId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(b.trackId)) return null;
  if (typeof film.projectId !== 'string' || !SAFE_ID.test(film.projectId)) return null;
  if (typeof film.filmUrl !== 'string' || film.filmUrl.length > 2000 || !/^https:\/\//i.test(film.filmUrl)) return null;
  if (!Array.isArray(film.scenes) || film.scenes.length < 1 || film.scenes.length > 10) return null;
  const scenes: PlacementScene[] = [];
  for (const s of film.scenes) {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.order !== 'number' || typeof o.seconds !== 'number' || !(o.seconds > 0 && o.seconds <= 10)) return null;
    scenes.push({ id: o.id.slice(0, 80), order: o.order, seconds: o.seconds });
  }
  let target: CueTarget;
  if (t.kind === 'film') target = { kind: 'film' };
  else if (t.kind === 'scene' && typeof t.scene === 'number' && Number.isInteger(t.scene)) target = { kind: 'scene', scene: t.scene };
  else return null;
  const span: CueSpan = b.span === 'to_end' ? 'to_end' : 'scene';
  return { trackId: b.trackId, target, span, projectId: film.projectId, filmUrl: film.filmUrl, scenes };
}
