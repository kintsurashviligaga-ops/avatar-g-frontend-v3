/**
 * „3D plan" — the Interior designer's secondary action: the EXISTING /api/orchestrator/interior/produce pipeline (Gemini
 * reads the room's geometry from the photo and writes its style guide), streamed as SSE, ending in
 * `{ stage:'completed', geometry, style }` for the inline Three.js RoomViewer (components/chat/RoomViewer.tsx).
 * `coverUrl` is the render the plan is for: the route files the finished plan to the Library with it as the picture.
 *
 * The route RESERVES PRODUCE_COST.interior before it runs and refunds it when the run does not complete (lib/orchestrator/
 * produceBilling) — this client only reads the stream. A guest is turned away by the route (401), and a short balance is
 * reported as `{ stage:'failed', error:'insufficient_credits' }`.
 *
 * Whatever the server sends is normalised through the same validators the route's own tests use (normalizeRoomGeometry /
 * normalizeStyleGuide) before RoomViewer sees it: the viewer builds meshes from these numbers.
 */
import { normalizeRoomGeometry, normalizeStyleGuide, type RoomGeometry, type StyleGuide } from '@/lib/orchestrator/interior';

export interface PlanResult { geometry: RoomGeometry; style: StyleGuide }

/** `code` is a machine code the panel reacts to; `message` is never shown (the panel has its own words). */
export class PlanError extends Error {
  readonly code: 'unauthorized' | 'insufficient_credits' | 'rate_limited' | 'failed';
  constructor(code: PlanError['code'], message = code) { super(message); this.name = 'PlanError'; this.code = code; }
}

/** The `data:` payloads of an SSE text buffer: complete events only, the unfinished tail handed back for the next chunk. */
export function takeEvents(buffer: string): { events: unknown[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: unknown[] = [];
  for (const block of parts) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try { events.push(JSON.parse(line.slice(5).trim())); } catch { /* a malformed frame is skipped, never fatal */ }
    }
  }
  return { events, rest };
}

export async function runPlan3d(args: {
  imageUrls: string[];
  brief: string;
  coverUrl?: string;
  signal?: AbortSignal;
  onProgress?: (pct: number, stage?: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<PlanResult> {
  const doFetch = args.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const res = await doFetch('/api/orchestrator/interior/produce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: args.signal,
    body: JSON.stringify({ imageUrls: args.imageUrls.slice(0, 3), brief: args.brief.slice(0, 600), ...(args.coverUrl ? { coverUrl: args.coverUrl } : {}) }),
  });
  if (res.status === 401) throw new PlanError('unauthorized');
  if (res.status === 429) throw new PlanError('rate_limited');
  if (!res.ok || !res.body) throw new PlanError('failed');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const { events, rest } = takeEvents(done ? `${buffer}\n\n` : buffer);
    buffer = rest;
    for (const e of events) {
      const ev = (e ?? {}) as { stage?: unknown; pct?: unknown; error?: unknown; geometry?: unknown; style?: unknown };
      if (ev.stage === 'completed') {
        return { geometry: normalizeRoomGeometry(ev.geometry), style: normalizeStyleGuide(ev.style) };
      }
      if (ev.stage === 'failed') {
        throw new PlanError(ev.error === 'insufficient_credits' ? 'insufficient_credits' : 'failed');
      }
      if (typeof ev.pct === 'number' && Number.isFinite(ev.pct)) args.onProgress?.(Math.max(0, Math.min(99, Math.round(ev.pct))), typeof ev.stage === 'string' ? ev.stage : undefined);
    }
    if (done) break;
  }
  throw new PlanError('failed'); // the stream ended without a verdict
}
