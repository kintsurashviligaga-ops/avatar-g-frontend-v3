import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { guardGeneration } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { ledgerUnavailableBody } from '@/lib/api/billingCopy';
import { insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { classifyProviderError } from '@/lib/api/providerError';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min: generation (~30-90s) + transfer time

const LTX_BASE = 'https://api.ltx.video';

// Validated resolutions per model family (from LTX API docs)
const LTX_SUPPORTED_RESOLUTIONS: Record<string, string[]> = {
  'ltx-2-3-fast': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-3-pro':  ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-fast':   ['1920x1080', '2560x1440'],
  'ltx-2-pro':    ['1920x1080', '2560x1440'],
};

function parseLtxError(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const err = parsed.error as Record<string, unknown> | undefined;
    if (err?.message && typeof err.message === 'string') return err.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON — return as-is if short enough
  }
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

// Map aspect_ratio shorthand → default resolution for that model family
const ASPECT_TO_RESOLUTION: Record<string, string> = {
  '16:9':  '1920x1080',
  '9:16':  '1080x1920',
  '1:1':   '1920x1080', // LTX doesn't support 1:1 natively; closest landscape
  '4:3':   '1920x1080',
  '3:4':   '1080x1920',
};

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  // FINANCIAL SHIELD — require a signed-in user with balance before the paid LTX render.
  const guard = await guardGeneration(req, 'video');
  if (!guard.ok) return guard.response;

  let charged = false;
  let chargeRef = '';
  let chargeAmount = 0;
  /** Refund the reservation (once). TRUE only when the credits actually went back. */
  const giveBack = async (): Promise<boolean> => {
    if (!charged) return false;
    charged = false;
    const r = await refundCredits(guard.userId, chargeAmount, `${chargeRef}:refund`).catch(() => null);
    return !!r?.ok;
  };

  try {
    const body = await req.json();
    const {
      prompt,
      model = 'ltx-2-3-fast',
      duration = 6,
      camera_motion,
    } = body;
    // LTX renders at NATIVE frame rates only — sending fps:60 makes the upstream
    // API 400. The "60fps AI Interpolated" smoothness is a downstream RunPod
    // interpolation pass (Agent L), not an LTX param. Clamp to a supported native
    // rate and report the TRUE rendered fps back (so the meta chip stays honest).
    const reqFps = Number(body.fps ?? body.render?.fps ?? 24);
    const fps: number = [24, 25, 30].includes(reqFps) ? reqFps : 24;
    // LTX-2's headline capability is synchronized audio. The LTX API defaults
    // generate_audio to true; we honor that (silent clips felt "broken") while
    // still letting a caller opt out with generate_audio: false.
    const generateAudio = body.generate_audio !== false;

    // Accept both `resolution` (explicit) and `aspect_ratio` shorthand from CommandCenter
    const resolution: string =
      body.resolution ??
      ASPECT_TO_RESOLUTION[body.aspect_ratio as string] ??
      '1920x1080';

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
    }

    const apiKey = process.env.LTX_VIDEO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LTX Video API key not configured' }, { status: 500 });
    }

    // Validate resolution for chosen model
    const supported = LTX_SUPPORTED_RESOLUTIONS[model] ?? ['1920x1080'];
    const finalResolution = supported.includes(resolution) ? resolution : supported[0]!;
    if (!supported.includes(resolution)) {
      console.warn(`[ltx-video] Resolution ${resolution} not supported by ${model}, using ${finalResolution}`);
    }

    // ⚠️ RESERVED BEFORE THE RENDER, NOT DEDUCTED AFTER IT. The old post-success `deductCredits(...).catch(() => {})`
    // streamed the video back whether or not the charge landed — a parallel burst past one stale balance read, or a
    // ledger error, was a free LTX render. The atomic deduct now gates it (insufficient 402, ledger error 503,
    // `skipped` = no ledger RPC → uncharged as everywhere else); an LTX refusal or a throw gives it back.
    const cost = creditCostFor('video');
    const ref = `ltx:${guard.userId}:${randomUUID()}`;
    const debit = await deductCredits(guard.userId, cost, ref);
    if (!debit.ok && debit.reason === 'insufficient') {
      return NextResponse.json({ error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
    }
    if (!debit.ok && debit.reason === 'error') {
      return NextResponse.json(ledgerUnavailableBody(guard.locale), { status: 503 });
    }
    charged = debit.ok;
    chargeRef = ref;
    chargeAmount = cost;

    const ltxRes = await fetch(`${LTX_BASE}/v1/text-to-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, resolution: finalResolution, duration, fps, generate_audio: generateAudio, ...(camera_motion ? { camera_motion } : {}) }),
    });

    if (!ltxRes.ok) {
      const errText = await ltxRes.text();
      const message = parseLtxError(errText);
      console.error('[ltx-video] API error', ltxRes.status, message);
      const refunded = await giveBack();
      // LTX's own words stay in the log line above; the body carries a code. A provider 4xx/5xx is OUR outage (or a
      // rejected prompt) — never the provider's status, which would let a 402 read as the user being out of credit.
      const code = classifyProviderError({ status: ltxRes.status, message });
      return NextResponse.json({ error: code, refunded }, { status: code === 'provider_rejected' ? 422 : 503 });
    }

    // Forward the video stream directly — LTX returns video/mp4 synchronously.
    // Expose the EXACT render params the client persists as truthful media meta.
    return new Response(ltxRes.body, {
      headers: {
        'Content-Type': ltxRes.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'no-store',
        'X-Render-Fps': String(fps),
        'X-Render-Resolution': finalResolution,
        'Access-Control-Expose-Headers': 'X-Render-Fps, X-Render-Resolution',
      },
    });
  } catch (err) {
    console.error('[ltx-video]', err);
    const refunded = await giveBack();
    return NextResponse.json({ error: 'Server error', refunded }, { status: 500 });
  }
}
