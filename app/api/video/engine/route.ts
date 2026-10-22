/**
 * GET /api/video/engine — what the live Veo route can do, for the studio's Veo panel (docs/VEO_ENGINE.md §3).
 *
 * The panel asks instead of assuming: whether Veo's own sound can be switched off is Vertex-only, and a control that
 * silently does nothing is worse than one that is not offered. Per tier, the controls come from the Vertex row that
 * tier renders on (lib/veo/capabilities), and a tier whose model is refused (no verified row, or a region the row does
 * not list) reads as unavailable. Booleans, numbers and a transport name only — never a model id, project, bucket or key.
 */
import { NextResponse } from 'next/server';
import { isTruthyFlag } from '@/lib/env/flag';
import { capsFor, resolveModel } from '@/lib/veo/capabilities';
import { veoCapEnforced } from '@/lib/veo/dailyCap';
import { veoModelProblem, veoTransport } from '@/lib/veo/engine';
import type { VeoDuration, VeoResolution, VeoTier } from '@/lib/veo/types';

export const dynamic = 'force-dynamic';

/** What one tier's Vertex row offers, for that tier's controls. */
export interface VideoEngineTier {
  /** It renders here: Veo is configured and the tier's model has a verified row that lists GCP_VEO_LOCATION. */
  available: boolean;
  /** Asset reference images it takes (0 = none: the reference mode is not offered). */
  referenceImages: number;
  lastFrame: boolean;
  /** generateAudio=false is honoured. */
  audioToggle: boolean;
  resolutions: VeoResolution[];
  durations: VeoDuration[];
  /** Google lists the model as Preview (Lite), not GA. */
  preview: boolean;
}

export interface VideoEngineInfo {
  /** Where new clips render: Vertex AI, the Gemini API, or nowhere (no Veo route is configured). */
  transport: 'vertex' | 'gemini' | null;
  /** Veo is the only engine (no Runway / Kling / LTX fallback). */
  googleOnly: boolean;
  /** generateAudio=false is honoured (Vertex). The Gemini API always renders sound. */
  audioToggle: boolean;
  /**
   * Whether Google's prompt rewriting can be switched OFF. Always false: Veo 3.x rewrites server-side on both transports
   * and fails the operation on an explicit enhancePrompt=false (PROVEN 2026-10-08, GCP Part 0 T1). Kept for old clients.
   */
  enhancePrompt: boolean;
  /** The schema-only cameraControl field is sent (Vertex + VEO_NATIVE_CAMERA_CONTROL=1); otherwise camera = prompt only. */
  nativeCameraControl: boolean;
  /** The hard daily Veo ceiling (VEO_DAILY_LIMIT_USD) is configured on this deployment. Never the figure itself. */
  dailyCap: boolean;
  /** Each tier's controls, read from its own Vertex row. */
  tiers: Record<VeoTier, VideoEngineTier>;
}

const TIERS: readonly VeoTier[] = ['lite', 'fast', 'standard'];

function tierInfo(tier: VeoTier, configured: boolean): VideoEngineTier {
  const row = capsFor(resolveModel('vertex', tier), 'vertex');
  return {
    available: configured && veoModelProblem(tier) === null,
    referenceImages: row.maxReferenceImages,
    lastFrame: row.supportsLastFrame,
    audioToggle: row.supportsAudioToggle,
    resolutions: Object.keys(row.resolutions) as VeoResolution[],
    durations: [...row.durations],
    preview: row.status === 'preview',
  };
}

export async function GET() {
  const transport = veoTransport();
  const vertex = transport === 'vertex';
  const body: VideoEngineInfo = {
    transport,
    googleOnly: true, // always, MASTER TASK v3.1 (lib/veo/policy)
    audioToggle: vertex,
    enhancePrompt: false,
    nativeCameraControl: vertex && isTruthyFlag(process.env.VEO_NATIVE_CAMERA_CONTROL),
    dailyCap: veoCapEnforced(),
    tiers: Object.fromEntries(TIERS.map((tier) => [tier, tierInfo(tier, vertex)])) as Record<VeoTier, VideoEngineTier>,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
