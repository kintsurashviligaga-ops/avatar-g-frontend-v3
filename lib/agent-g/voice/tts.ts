import 'server-only';

import type { AgentGTone } from '@/lib/agent-g/tone';
import { synthesizeGoogleTts } from '@/lib/audio/google-tts';

export type TtsResult = {
  audio: Uint8Array;
  mimeType: string;
  fileName: string;
  provider: 'google-cloud-tts';
};

/**
 * The agent's spoken Telegram reply, on Google Cloud TTS (lib/audio/google-tts, the Vertex Workload Identity token).
 * ElevenLabs is gone (MASTER TASK v3.1 PR 5d). `tone` is kept for the caller but changes nothing: it only ever set
 * ElevenLabs' stability/style, which Cloud TTS does not have. Throws on any miss; the handler then sends the reply as
 * text.
 */
export async function synthesizeTelegramVoice(params: { text: string; tone: AgentGTone }): Promise<TtsResult> {
  const cleanedText = String(params.text || '').trim();
  if (!cleanedText) {
    throw new Error('empty_tts_text');
  }

  const audio = await synthesizeGoogleTts(cleanedText);
  if (!audio || !audio.byteLength) {
    throw new Error('tts_unavailable');
  }

  return {
    audio: new Uint8Array(audio),
    mimeType: 'audio/mpeg',
    fileName: 'agent-g-reply.mp3',
    provider: 'google-cloud-tts',
  };
}
