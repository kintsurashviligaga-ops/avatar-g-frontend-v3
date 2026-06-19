// Master Prompt §4 — Phase 1 (Cognitive Direction) endpoint. Runs the ClaudeDirectorAgent
// and returns the strictly-validated 5-scene OrchestrationOutput. Guarded by a header key
// (it spends a Claude call) — the building block the full pipeline orchestrator will call.
import { NextRequest, NextResponse } from 'next/server';
import { ClaudeDirectorAgent } from '@/lib/pipeline/agents/claude-director';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

const director = new ClaudeDirectorAgent();

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

  try {
    const orchestration = await director.direct({ jobId: 'phase1-selftest' }, prompt);
    return NextResponse.json({ ok: true, intent: orchestration.intent, sceneCount: orchestration.scenes.length, orchestration });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
