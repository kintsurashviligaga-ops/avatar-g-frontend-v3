// Master Prompt §5 / B.7 — Soundtrack agent. Wraps generateUdioTrack (start + poll).
// Started FIRST in Phase 2 because it is the longest task — its latency hides behind the
// parallel image/voice work (§13 pre-fetch optimization).
import 'server-only';
import { BaseAgent, AgentContext } from './base-agent';
import { generateUdioTrack } from '@/lib/udio/client';

export class UdioAgent extends BaseAgent {
  constructor() {
    super('Udio', 200000); // generation + result polling — the longest leg
  }

  async generateTrack(ctx: AgentContext, prompt: string): Promise<string> {
    return this.guarded(
      ctx,
      async () => {
        const res = await generateUdioTrack({ prompt, makeInstrumental: true });
        if (!res.audioUrl) throw new Error(`Udio returned no audioUrl (status ${res.status})`);
        return res.audioUrl;
      },
      1,
    );
  }
}
