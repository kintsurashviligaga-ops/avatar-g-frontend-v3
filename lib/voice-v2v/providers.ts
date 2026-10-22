import 'server-only';
/**
 * The realtime voice engines this app server calls (MASTER TASK v3.1: Google only for chat, voice and agents). The
 * OpenAI and Deepgram STT, the Cartesia TTS fallback and the OpenAI assistant stream are gone: the realtime STT refuses
 * (/api/voice/transcribe runs Gemini instead), and the TTS is ElevenLabs only until Cloud TTS replaces it.
 */
import type { RealtimeVoiceLanguage } from '@/types/voice';
import { KA_VOICE_FEMALE } from '@/lib/audio/georgian-voice';

export type SttProviderName = 'openai-whisper-3-turbo' | 'deepgram-nova-2';
export type TtsProviderName = 'elevenlabs-multilingual-v2' | 'cartesia-sonic';

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

function ttsProviderPreference(): 'elevenlabs' | 'cartesia' {
  const value = String(process.env.VOICE_V2V_TTS_PROVIDER || '').trim().toLowerCase();
  if (value === 'cartesia') {
    return 'cartesia';
  }
  return 'elevenlabs';
}

export function getRealtimeProviderSnapshot(): {
  stt: SttProviderName;
  tts: TtsProviderName;
} {
  return {
    stt: sttProviderPreference() === 'deepgram' ? 'deepgram-nova-2' : 'openai-whisper-3-turbo',
    tts: ttsProviderPreference() === 'cartesia' ? 'cartesia-sonic' : 'elevenlabs-multilingual-v2',
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

async function synthesizeWithElevenLabs(text: string, language: RealtimeVoiceLanguage): Promise<TtsResult> {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  // Georgian → the CLONED native voice (shared default) unless an env override is set.
  const georgianVoice = String(process.env.ELEVENLABS_GEORGIAN_VOICE_ID || '').trim() || KA_VOICE_FEMALE;
  const defaultVoice = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const voiceId = language === 'ka-GE' ? georgianVoice : (defaultVoice || georgianVoice);

  if (!apiKey || !voiceId) {
    throw new Error('elevenlabs_config_missing');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      optimize_streaming_latency: 3,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.78,
        style: 0.32,
        use_speaker_boost: true,
      },
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`elevenlabs_tts_failed_${response.status}`);
  }

  const bytes = await response.arrayBuffer();

  return {
    audioBase64: bytesToBase64(bytes),
    mimeType: 'audio/mpeg',
    provider: 'elevenlabs-multilingual-v2',
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

  // ElevenLabs is the one voice engine here, so a miss is an ElevenLabs failure, never a silent Cartesia answer, whatever
  // AI_GOOGLE_ONLY or VOICE_V2V_TTS_PROVIDER says.
  return synthesizeWithElevenLabs(text, input.language);
}
