import 'server-only';
import type { RealtimeVoiceLanguage } from '@/types/voice';
import { KA_VOICE_FEMALE } from '@/lib/audio/georgian-voice';
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@/lib/ai/google/provider';
import { geminiTierModel } from '@/lib/ai/google/models';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';
import { transcribeWithGeminiDetailed } from './geminiStt';

export type SttProviderName = 'gemini';
export type TtsProviderName = 'elevenlabs-multilingual-v2';
export type SttResult = { text: string; isFinal: boolean; provider: SttProviderName; confidence?: number };
export type TtsResult = { audioBase64: string; mimeType: string; provider: TtsProviderName };
type AssistantStreamInput = { userText: string; language: RealtimeVoiceLanguage; history?: Array<{ role: 'user' | 'assistant'; text: string }>; signal?: AbortSignal };
const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();
const bytesToBase64 = (input: ArrayBuffer): string => Buffer.from(input).toString('base64');
export function getRealtimeProviderSnapshot(): { stt: SttProviderName; tts: TtsProviderName } {
  return { stt: 'gemini', tts: 'elevenlabs-multilingual-v2' };
}
export async function transcribeRealtimePcmChunk(params: {
  audioBase64: string; language: RealtimeVoiceLanguage; sampleRate?: number; hint?: string; mimeType?: string;
}): Promise<SttResult> {
  let audio = Buffer.from(params.audioBase64, 'base64');
  const mime = params.mimeType || 'audio/wav';
  // WebSocket frames contain raw mono PCM. A WAV declaration alone is insufficient for Gemini.
  if (mime === 'audio/wav' && audio.toString('ascii', 0, 4) !== 'RIFF') {
    const rate = params.sampleRate ?? 16000;
    if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || audio.length % 2) throw new Error('invalid_pcm_audio');
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(audio.length + 36, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(audio.length, 40);
    audio = Buffer.concat([header, audio]);
  }
  const result = await transcribeWithGeminiDetailed(audio.toString('base64'), mime, params.language);
  return { text: result.text, isFinal: true, provider: 'gemini' };
}

function getSystemPrompt(language: RealtimeVoiceLanguage): string {
  const common = [
    'You are Agent G, an ultra-low-latency voice assistant for myavatar.ge.',
    'Prefer concise spoken replies (1-2 short sentences) unless user asks for details.',
    'Handle technical terms and slang naturally and preserve proper nouns.',
    'If user language is Georgian, prioritize fluent Georgian output.',
  ].join(' ');

  if (language === 'ka-GE') {
    return `${common} Reply in Georgian by default unless user explicitly switches language.`;
  }

  if (language === 'ru-RU') {
    return `${common} Reply in Russian unless user language changes.`;
  }

  return `${common} Reply in English unless user language changes.`;
}

export async function* streamAssistantTokens(input: AssistantStreamInput): AsyncGenerator<string> {
  const prompt = normalizeWhitespace(input.userText);
  if (!prompt) return;
  const model = geminiTierModel('flash');
  if (!(await chatBudgetAllows(prompt, model))) throw new Error('voice_budget_exhausted');
  const google = createGoogleGenerativeAI({ apiKey: resolveGeminiKey() || undefined });
  const timeout = AbortSignal.timeout(25_000);
  const result = streamText({
    model: google(model), system: getSystemPrompt(input.language), maxOutputTokens: 512,
    messages: [...(input.history ?? []).slice(-6).map((item) => ({ role: item.role, content: item.text })), { role: 'user', content: prompt }],
    abortSignal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
  });
  let outputChars = 0;
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw new Error('voice_provider_unavailable');
      if (part.type === 'text-delta') { outputChars += part.text.length; yield part.text; }
    }
    if (!outputChars) throw new Error('voice_provider_empty');
  } finally {
    if (outputChars) void bookChatUsage(prompt, outputChars, model);
  }

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
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20_000),
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

export async function synthesizeSpeechChunk(input: { text: string; language: RealtimeVoiceLanguage }): Promise<TtsResult> {
  const text = normalizeWhitespace(input.text);
  if (!text) throw new Error('empty_tts_text');
  return synthesizeWithElevenLabs(text, input.language);
}
