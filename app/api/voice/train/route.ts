import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { pollRvcPrediction, rehostModel } from '@/lib/audio/rvc';
import { getLatestTraining, markTrainingDone, markTrainingFailed, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

/**
 * A personal RVC voice model (training on Replicate).
 *
 * POST used to start a training. RVC has no Google engine, so every start is refused with 503 google_only before the
 * session, the limit or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1, lib/providers/mediaPolicy).
 * GET stays open: it checks a training started before this change and stores the trained model when it finishes.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // the GET copies a finished model to permanent storage

export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}

export async function GET(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  const userId = user?.id ?? DEMO_VOICE_USER_ID;

  const job = await getLatestTraining(userId);
  if (!job) return NextResponse.json({ status: 'none' });
  if (job.status === 'completed') return NextResponse.json({ status: 'completed', name: job.name });
  if (job.status === 'failed') return NextResponse.json({ status: 'failed' });

  // Still training → check Replicate and persist the result when it finishes.
  const poll = await pollRvcPrediction(job.id);
  if (poll.status === 'succeeded' && poll.modelUrl) {
    // Replicate's delivery URL is temporary → copy the model to permanent storage.
    const permanent = await rehostModel(poll.modelUrl);
    await markTrainingDone(job.id, permanent);
    return NextResponse.json({ status: 'completed', name: job.name });
  }
  if (poll.status === 'failed' || poll.status === 'canceled') {
    await markTrainingFailed(job.id, poll.error || 'training failed');
    return NextResponse.json({ status: 'failed', error: poll.error });
  }
  return NextResponse.json({ status: 'processing' });
}
