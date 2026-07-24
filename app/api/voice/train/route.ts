import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { prepareDatasetZip, startRvcTraining, pollRvcPrediction, rehostModel, rvcNameFor } from '@/lib/audio/rvc';
import { saveTrainingJob, getLatestTraining, markTrainingDone, markTrainingFailed, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';

/**
 * Train (and check) a personal RVC voice model.
 *
 * POST { voiceReference } → splits the voice into a dataset, starts training on
 * Replicate (~10–20 min), records the job, returns { jobId }. The training runs
 * async — far past the function budget — so the client polls GET, which checks the
 * Replicate prediction and stores the trained model URL on completion.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function hostVoiceData(dataUrl: string): Promise<string | null> {
  try {
    const m = dataUrl.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'audio/mpeg').toLowerCase();
    const ext = /wav/i.test(mime) ? 'wav' : /ogg/i.test(mime) ? 'ogg' : /mp4|m4a|aac/i.test(mime) ? 'm4a' : /webm/i.test(mime) ? 'webm' : 'mp3';
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return null;
    const path = `rvc-voice-src/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 3600)) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE); if (rl) return rl;
  const { user } = await authedClientFromRequest(req);
  // No sign-in required to TEST — fall back to a shared demo identity.
  const userId = user?.id ?? DEMO_VOICE_USER_ID;

  const body = (await req.json().catch(() => ({}))) as { voiceReference?: unknown };
  const voiceRef = typeof body.voiceReference === 'string' ? body.voiceReference.trim() : '';
  if (!voiceRef) return NextResponse.json({ success: false, error: 'voiceReference is required' }, { status: 400 });

  const voiceUrl = voiceRef.startsWith('data:')
    ? await hostVoiceData(voiceRef)
    : /^https?:\/\//i.test(voiceRef)
      ? voiceRef
      : await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', voiceRef, 3600);
  if (!voiceUrl) return NextResponse.json({ success: false, error: 'Could not read the voice file.' }, { status: 502 });

  const name = rvcNameFor(userId);
  const datasetUrl = await prepareDatasetZip(voiceUrl, name);
  if (!datasetUrl) return NextResponse.json({ success: false, error: 'Could not prepare the voice dataset (try a longer, clearer clip).' }, { status: 502 });

  // More epochs → a noticeably more faithful voice (the founder reported it didn't
  // sound like them). ~60 trains in a few minutes for a 1-min sample.
  const predictionId = await startRvcTraining(datasetUrl, 60);
  if (!predictionId) return NextResponse.json({ success: false, error: 'Could not start training.' }, { status: 502 });

  await saveTrainingJob(userId, predictionId, name);
  return NextResponse.json({ success: true, jobId: predictionId, status: 'processing' });
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
