// Master Prompt §5 / B.5 — Foley/SFX agent. Wraps generateFilmSfx (ElevenLabs
// sound-generation → hosted MP3). Already fail-open (returns null), so a missing SFX
// degrades to a music-only mix rather than failing the scene.
import 'server-only';
import { BaseAgent, AgentContext } from './base-agent';
import { generateFilmSfx } from '@/lib/chat/filmVoiceover';

export class ElevenLabsSfxAgent extends BaseAgent {
  constructor() {
    super('ElevenLabsSFX', 45000);
  }

  async generateSfx(ctx: AgentContext, description: string, totalSec = 6): Promise<string | null> {
    return this.guarded(
      ctx,
      () =>
        generateFilmSfx({
          brief: description,
          totalSec,
          compositeId: `${ctx.jobId}/sfx_${ctx.sceneNumber ?? 0}`,
        }),
      1,
    );
  }
}
