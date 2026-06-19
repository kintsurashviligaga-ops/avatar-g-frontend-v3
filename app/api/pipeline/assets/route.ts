// Master Prompt §5 — Phase 1 + Phase 2 end-to-end test endpoint. Director → parallel asset
// production. Guarded by a header key (spends real generation credits).
import { NextRequest, NextResponse } from 'next/server';
import { ClaudeDirectorAgent } from '@/lib/pipeline/agents/claude-director';
import { Phase2AssetProducer } from '@/lib/pipeline/phases/phase2-assets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const director = new ClaudeDirectorAgent();
const producer = new Phase2AssetProducer();

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-selftest-key');
  if (!key || key !== process.env.MIGRATION_RUN_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { prompt?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const jobId = 'phase2-selftest';
  try {
    const orchestration = await director.direct({ jobId }, prompt);
    const assets = await producer.run({ jobId }, orchestration);
    return NextResponse.json({
      ok: true,
      intent: orchestration.intent,
      counts: {
        images: assets.images.filter(Boolean).length,
        voices: assets.voices.filter(Boolean).length,
        sfx: assets.sfx.filter(Boolean).length,
        music: assets.music ? 1 : 0,
      },
      assets,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
