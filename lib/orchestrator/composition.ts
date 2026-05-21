import { SEGMENT_DURATION_SEC, type VideoComposition, type VideoSegment } from './types';
import { normalizeRenderSettings, renderSettingsToPayload, type RenderSettings } from './render-settings';

/**
 * Resolve the effective render settings for one segment: explicit segment
 * overrides win field-by-field over the composition's global settings.
 * Unset override fields gracefully fall back to global.
 */
export function resolveSegmentSettings(global: RenderSettings, seg: VideoSegment): RenderSettings {
  return normalizeRenderSettings({ ...global, ...(seg.overrides ?? {}) });
}

/**
 * Temporal Segmentation — 6-second clip assembly.
 *
 * The video agent produces one ≤6s asset per call (LTX latency budget,
 * provider sweet spot). Long videos are composed by chaining N segments
 * and assembling them at the end.
 *
 * Lifecycle:
 *   1. User generates a video → orchestrator creates a `VideoComposition`
 *      and adds the first `VideoSegment` (status='ready').
 *   2. SuggestedAction "Add 6s clip" pushes a new segment in
 *      status='queued' → the video agent picks it up.
 *   3. While generating, segment status='generating' — UI shows the
 *      thumbnail strip with a spinner over the placeholder.
 *   4. On completion the segment becomes 'ready' with assetUrl + poster.
 *   5. When ≥2 segments are 'ready' and the user clicks "Assemble", the
 *      orchestrator POSTs to /api/video/assemble with the segment URLs
 *      (+ optional voiceover + music) and stores the final URL.
 *
 * The assembly itself happens server-side (ffmpeg-as-a-service) so the
 * client only handles light planning + UI.
 */

export function newComposition(firstSegment: VideoSegment): VideoComposition {
  return {
    id: `comp_${Math.random().toString(36).slice(2, 10)}`,
    segments: [firstSegment],
    updatedAt: Date.now(),
  };
}

export function newSegment(prompt: string, params?: { cameraMotion?: VideoSegment['cameraMotion']; durationSec?: number }): VideoSegment {
  return {
    id: `seg_${Math.random().toString(36).slice(2, 10)}`,
    index: 0,
    durationSec: params?.durationSec ?? SEGMENT_DURATION_SEC,
    prompt,
    status: 'queued',
    cameraMotion: params?.cameraMotion ?? null,
    createdAt: Date.now(),
  };
}

export function appendSegment(comp: VideoComposition, seg: VideoSegment): VideoComposition {
  const next = { ...comp };
  next.segments = [...comp.segments, { ...seg, index: comp.segments.length }];
  next.updatedAt = Date.now();
  return next;
}

export function removeSegment(comp: VideoComposition, segmentId: string): VideoComposition {
  const next = { ...comp };
  next.segments = comp.segments
    .filter(s => s.id !== segmentId)
    .map((s, i) => ({ ...s, index: i }));
  next.updatedAt = Date.now();
  return next;
}

export function reorderSegment(comp: VideoComposition, segmentId: string, newIndex: number): VideoComposition {
  const cur = comp.segments.findIndex(s => s.id === segmentId);
  if (cur === -1) return comp;
  const next = { ...comp };
  const list = [...comp.segments];
  const [moved] = list.splice(cur, 1);
  if (!moved) return comp;
  list.splice(Math.max(0, Math.min(list.length, newIndex)), 0, moved);
  next.segments = list.map((s, i) => ({ ...s, index: i }));
  next.updatedAt = Date.now();
  return next;
}

export function patchSegment(comp: VideoComposition, segmentId: string, patch: Partial<VideoSegment>): VideoComposition {
  const next = { ...comp };
  next.segments = comp.segments.map(s => s.id === segmentId ? { ...s, ...patch } : s);
  next.updatedAt = Date.now();
  return next;
}

export function readyCount(comp: VideoComposition): number {
  return comp.segments.filter(s => s.status === 'ready').length;
}

export function totalDurationSec(comp: VideoComposition): number {
  return comp.segments
    .filter(s => s.status === 'ready')
    .reduce((sum, s) => sum + s.durationSec, 0);
}

export function canAssemble(comp: VideoComposition): boolean {
  // Need at least 2 ready segments, and every queued/generating one
  // must have resolved before assembly (avoid black frames).
  if (readyCount(comp) < 2) return false;
  return comp.segments.every(s => s.status === 'ready' || s.status === 'failed');
}

/**
 * Submit the assembled composition to the server. Returns the
 * resulting video URL (or throws on failure).
 */
export async function assembleComposition(
  comp: VideoComposition,
  global: RenderSettings,
  signal?: AbortSignal,
): Promise<string> {
  const payload = {
    segments: comp.segments
      .filter(s => s.status === 'ready' && s.assetUrl)
      .sort((a, b) => a.index - b.index)
      .map(s => ({
        url: s.assetUrl,
        durationSec: s.durationSec,
        cameraMotion: s.cameraMotion ?? null,
        // Each segment carries its fully-resolved settings (override → global).
        render: renderSettingsToPayload(resolveSegmentSettings(global, s)),
      })),
    voiceoverUrl: comp.voiceoverUrl ?? null,
    musicUrl:     comp.musicUrl     ?? null,
    // Global defaults included so the agent has the fallback baseline too.
    globalRender: renderSettingsToPayload(global),
  };
  const res = await fetch('/api/video/assemble', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`Assembly failed (${res.status}) ${detail}`.trim());
  }
  const data = await res.json() as { url?: string; error?: string };
  if (!data.url) throw new Error(data.error || 'Assembly returned no URL');
  return data.url;
}
