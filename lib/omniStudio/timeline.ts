export type OmniTrackKind = 'video' | 'overlay' | 'caption' | 'voiceover' | 'music' | 'sfx';
export type OmniAspect = '16:9' | '9:16' | '1:1';
export type OmniClipSourceKind = 'video' | 'image' | 'audio';

export interface OmniBeat { id: string; timeSec: number; strength: number; }
export interface OmniClip {
  id: string; trackId: string; sourceKind: OmniClipSourceKind; sourceUrl: string; sourcePath?: string;
  name: string; startSec: number; durationSec: number; sourceStartSec: number; muted?: boolean;
  volume?: number; caption?: string; opacity?: number;
  filter?: 'none' | 'cinematic' | 'vintage' | 'noir' | 'warm'; locked?: boolean;
}
export interface OmniTrack { id: string; kind: OmniTrackKind; name: string; clips: OmniClip[]; muted?: boolean; volume?: number; locked?: boolean; }
export interface OmniProject {
  id?: string; name: string; aspect: OmniAspect; fps: 24 | 25 | 30; durationSec: number;
  maxDurationSec: 240; tracks: OmniTrack[]; beats: OmniBeat[]; createdAt?: string; updatedAt?: string; version: number;
}
export const OMNI_MAX_DURATION_SEC = 240;
export const OMNI_TRACKS = [
  { id: 'v1', kind: 'video' as const, name: 'Video' },
  { id: 'ov1', kind: 'overlay' as const, name: 'Overlays' },
  { id: 'cc1', kind: 'caption' as const, name: 'Captions' },
  { id: 'vo1', kind: 'voiceover' as const, name: 'Voice' },
  { id: 'm1', kind: 'music' as const, name: 'Music' },
  { id: 'sfx1', kind: 'sfx' as const, name: 'SFX' },
];
export function createEmptyProject(name = 'Untitled Production'): OmniProject {
  return { name, aspect: '16:9', fps: 24, durationSec: 0, maxDurationSec: 240, tracks: OMNI_TRACKS.map(x => ({ ...x, clips: [], volume: 1 })), beats: [], version: 1 };
}
export function clampDuration(sec: number): number { return Number.isFinite(sec) ? Math.min(240, Math.max(0, Number(sec.toFixed(3)))) : 0; }
export function timelineEnd(track: OmniTrack): number { return track.clips.reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0); }
export function projectDuration(project: Pick<OmniProject, 'tracks'>): number { return clampDuration(Math.max(0, ...project.tracks.map(timelineEnd))); }
export function normalizeProject(input: OmniProject): OmniProject {
  const tracks = input.tracks.map(track => ({ ...track, clips: track.clips.map(c => ({
    ...c, startSec: Math.max(0, Number(c.startSec) || 0), durationSec: Math.max(0.1, Number(c.durationSec) || 0.1),
    sourceStartSec: Math.max(0, Number(c.sourceStartSec) || 0), volume: Math.min(2, Math.max(0, Number(c.volume ?? 1))), opacity: Math.min(1, Math.max(0, Number(c.opacity ?? 1))),
  })).filter(c => c.startSec < 240).map(c => ({ ...c, durationSec: Math.min(c.durationSec, 240 - c.startSec) })) }));
  return { ...input, maxDurationSec: 240, tracks, durationSec: projectDuration({ tracks }), version: Number(input.version) || 1 };
}
export function validateProject(input: unknown): { ok: true; project: OmniProject } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'project must be an object' };
  const p = input as Partial<OmniProject>;
  if (typeof p.name !== 'string' || !p.name.trim()) return { ok: false, error: 'project name is required' };
  if (!['16:9', '9:16', '1:1'].includes(String(p.aspect))) return { ok: false, error: 'invalid aspect' };
  if (![24, 25, 30].includes(Number(p.fps))) return { ok: false, error: 'invalid fps' };
  if (!Array.isArray(p.tracks)) return { ok: false, error: 'tracks must be an array' };
  const project = normalizeProject({
    id: typeof p.id === 'string' ? p.id : undefined, name: p.name.slice(0, 120).trim(), aspect: p.aspect!, fps: p.fps!,
    durationSec: Number(p.durationSec) || 0, maxDurationSec: 240, tracks: p.tracks as OmniTrack[],
    beats: Array.isArray(p.beats) ? p.beats as OmniBeat[] : [], createdAt: p.createdAt, updatedAt: p.updatedAt, version: Number(p.version) || 1,
  });
  if (project.durationSec > 240) return { ok: false, error: 'project duration cannot exceed 240 seconds' };
  return { ok: true, project };
}
