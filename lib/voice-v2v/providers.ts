import 'server-only';
/**
 * The realtime voice engines this app server calls (MASTER TASK v3.1: Google only for chat, voice and agents). The
 * OpenAI and Deepgram STT, the Cartesia TTS fallback and the OpenAI assistant stream are gone: the realtime STT refuses
 * (/api/voice/transcribe runs Gemini instead), and the TTS is Google Cloud TTS on the Vertex Workload Identity token
 * (lib/audio/google-tts; ElevenLabs is gone since PR 5d).
 */
import type { RealtimeVoiceLanguage } from '@/types/voice';
import { synthesizeGoogleTts } from '@/lib/audio/google-tts';

export type SttProviderName = 'openai-whisper-3-turbo' | 'deepgram-nova-2';
export type TtsProviderName = 'google-cloud-tts';

export type SttResult = {
  text: string;
  isFinal: boolean;
  provider: SttProviderName;
  confidence?: number;
};

export type TtsResult = {
  audioBase64: string;
  mimeType: string;
  provider: TtsProviderName;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function bytesToBase64(input: ArrayBuffer): string {
  return Buffer.from(input).toString('base64');
}

function sttProviderPreference(): 'openai' | 'deepgram' {
  const value = String(process.env.VOICE_V2V_STT_PROVIDER || '').trim().toLowerCase();
  if (value === 'deepgram') {
    return 'deepgram';
  }
  return 'openai';
}

export function getRealtimeProviderSnapshot(): {
  stt: SttProviderName;
  tts: TtsProviderName;
} {
  return {
    stt: sttProviderPreference() === 'deepgram' ? 'deepgram-nova-2' : 'openai-whisper-3-turbo',
    tts: 'google-cloud-tts',
  };
}

export async function transcribeRealtimePcmChunk(_params: {
  audioBase64: string;
  language: RealtimeVoiceLanguage;
  sampleRate?: number;
  hint?: string;
  mimeType?: string;
}): Promise<SttResult> {
  // Both engines this path had (OpenAI, Deepgram) are outside ones, so it refuses before any audio leaves, whatever
  // AI_GOOGLE_ONLY or VOICE_V2V_STT_PROVIDER says.
  throw new Error('google_only: realtime STT has no Google engine on this path');
}

export function createSemanticChunkAccumulator(minChunkChars = 64): {
  push: (token: string) => string[];
  flush: () => string | null;
} {
  let buffer = '';

  const flushIfReady = (): string[] => {
    const segments: string[] = [];

    const punctuationMatch = buffer.match(/(.+?[\.!?])(?:\s|$)/);
    if (punctuationMatch?.[1] && punctuationMatch[1].length >= Math.max(16, minChunkChars * 0.6)) {
      const sentence = normalizeWhitespace(punctuationMatch[1]);
      buffer = normalizeWhitespace(buffer.slice(punctuationMatch[0].length));
      if (sentence) {
        segments.push(sentence);
      }
      return segments;
    }

    if (buffer.length >= minChunkChars) {
      const splitIndex = buffer.lastIndexOf(' ');
      const chunk = normalizeWhitespace(splitIndex > 24 ? buffer.slice(0, splitIndex) : buffer);
      buffer = splitIndex > 24 ? normalizeWhitespace(buffer.slice(splitIndex + 1)) : '';
      if (chunk) {
        segments.push(chunk);
      }
    }

    return segments;
  };

  return {
    push(token: string): string[] {
      buffer += token;
      return flushIfReady();
    },
    flush(): string | null {
      const value = normalizeWhitespace(buffer);
      buffer = '';
      return value || null;
    },
  };
}

export async function synthesizeSpeechChunk(input: {
  text: string;
  language: RealtimeVoiceLanguage;
}): Promise<TtsResult> {
  const text = normalizeWhitespace(input.text);
  if (!text) {
    throw new Error('empty_tts_text');
  }

  // Cloud TTS is the one voice engine here, so a miss is a Cloud TTS failure, never a silent ElevenLabs or Cartesia
  // answer, whatever AI_GOOGLE_ONLY or VOICE_V2V_TTS_PROVIDER says.
  const audio = await synthesizeGoogleTts(text, { languageCode: input.language });
  if (!audio || !audio.byteLength) {
    throw new Error('google_tts_failed');
  }
  return {
    audioBase64: bytesToBase64(audio),
    mimeType: 'audio/mpeg',
    provider: 'google-cloud-tts',
  };
}
