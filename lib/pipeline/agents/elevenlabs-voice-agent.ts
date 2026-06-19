// Master Prompt §5 / B.5 — Dialogue agent. Wraps textToHostedSpeech (ElevenLabs
// multilingual v2 → Supabase-hosted MP3). One clip per scene's dialogueScript.
import 'server-only';
import { BaseAgent, AgentContext } from './base-agent';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';

export class ElevenLabsVoiceAgent extends BaseAgent {
  constructor(private readonly voiceId?: string) {
    super('ElevenLabsVoice', 30000);
  }

  async generateSpeech(ctx: AgentContext, text: string): Promise<string> {
    return this.guarded(
      ctx,
      async () => {
        const url = await textToHostedSpeech(text, this.voiceId ?? null);
        if (!url) throw new Error('voice synthesis returned null');
        return url;
      },
      2,
    );
  }
}
