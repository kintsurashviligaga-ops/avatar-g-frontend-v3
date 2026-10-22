// Master Prompt §5 / B.5 — Dialogue agent. Wraps textToHostedSpeech (Google Cloud TTS →
// Supabase-hosted MP3). One clip per scene's dialogueScript. The class keeps its old name so
// the pipeline wiring stays as it is.
import 'server-only';
import { BaseAgent, AgentContext } from './base-agent';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';

export class ElevenLabsVoiceAgent extends BaseAgent {
  constructor(private readonly gender?: 'male' | 'female') {
    super('ElevenLabsVoice', 30000);
  }

  async generateSpeech(ctx: AgentContext, text: string): Promise<string> {
    return this.guarded(
      ctx,
      async () => {
        const url = await textToHostedSpeech(text, this.gender ?? null);
        if (!url) throw new Error('voice synthesis returned null');
        return url;
      },
      2,
    );
  }
}
