/**
 * GET /api/video/engine — what the live Veo route can do, for the studio's Veo panel (docs/VEO_ENGINE.md §3).
 *
 * The panel asks instead of assuming: whether Veo's own sound can be switched off is Vertex-only, and a control that
 * silently does nothing is worse than one that is not offered. Booleans
 * and a transport name only — never a model id, project, bucket or key.
 */
import { NextResponse } from 'next/server';
import { isTruthyFlag } from '@/lib/env/flag';
import { veoTransport } from '@/lib/veo/engine';
import { isGoogleOnly } from '@/lib/veo/policy';

export const dynamic = 'force-dynamic';

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
}

export async function GET() {
  const transport = veoTransport();
  const vertex = transport === 'vertex';
  const body: VideoEngineInfo = {
    transport,
    googleOnly: isGoogleOnly(),
    audioToggle: vertex,
    enhancePrompt: false,
    nativeCameraControl: vertex && isTruthyFlag(process.env.VEO_NATIVE_CAMERA_CONTROL),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
