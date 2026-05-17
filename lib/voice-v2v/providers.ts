import 'server-only';

import OpenAI from 'openai';

import type { RealtimeVoiceLanguage } from '@/types/voice';

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

type AssistantStreamInput = {
  userText: string;
  language: RealtimeVoiceLanguage;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
};

const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toLanguageCode(language: RealtimeVoiceLanguage): 'ka' | 'en' | 'ru' {
  if (language === 'ru-RU') return 'ru';
  if (language === 'en-US') return 'en';
  return 'ka';
}

function arrayBufferFromBase64(audioBase64: string): ArrayBuffer {
  const buffer = Buffer.from(audioBase64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
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

async function transcribeWithOpenAI(params: {
  audioBase64: string;
  language: RealtimeVoiceLanguage;
  mimeType?: string;
  hint?: string;
}): Promise<SttResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('openai_key_missing');
  }

  const model = String(process.env.VOICE_V2V_STT_MODEL || DEFAULT_STT_MODEL).trim() || DEFAULT_STT_MODEL;
  const language = toLanguageCode(params.language);
  const mimeType = String(params.mimeType || 'audio/wav').trim() || 'audio/wav';

  const form = new FormData();
  form.append('file', new Blob([arrayBufferFromBase64(params.audioBase64)], { type: mimeType }), `chunk.${mimeType.includes('mpeg') ? 'mp3' : 'wav'}`);
  form.append('model', model);
  form.append('language', language);

  const hint = normalizeWhitespace(String(params.hint || ''));
  if (hint) {
    form.append('prompt', hint);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as { text?: string } | null;
  const text = normalizeWhitespace(String(payload?.text || ''));

  if (!response.ok || !text) {
    throw new Error(`openai_stt_failed_${response.status}`);
  }

  return {
    text,
    isFinal: true,
    provider: 'openai-whisper-3-turbo',
  };
}

async function transcribeWithDeepgram(params: {
  audioBase64: string;
  language: RealtimeVoiceLanguage;
  sampleRate?: number;
  hint?: string;
}): Promise<SttResult> {
  const apiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('deepgram_key_missing');
  }

  const language = toLanguageCode(params.language);
  const sampleRate = Number(params.sampleRate || 16_000);
  const hints = normalizeWhitespace(String(params.hint || '')).split(' ').slice(0, 12).join(',');
  const model = String(process.env.VOICE_V2V_DEEPGRAM_MODEL || 'nova-2').trim() || 'nova-2';

  const query = new URLSearchParams({
    model,
    language,
    punctuate: 'true',
    smart_format: 'true',
    encoding: 'linear16',
    channels: '1',
    sample_rate: String(Number.isFinite(sampleRate) ? sampleRate : 16_000),
  });

  if (hints) {
    query.set('keywords', hints);
  }

  const response = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/raw',
    },
    body: arrayBufferFromBase64(params.audioBase64),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          confidence?: number;
        }>;
      }>;
    };
  } | null;

  const alternative = payload?.results?.channels?.[0]?.alternatives?.[0];
  const text = normalizeWhitespace(String(alternative?.transcript || ''));

  if (!response.ok || !text) {
    throw new Error(`deepgram_stt_failed_${response.status}`);
  }

  return {
    text,
    isFinal: true,
    provider: 'deepgram-nova-2',
    confidence: Number.isFinite(alternative?.confidence ?? NaN) ? Number(alternative?.confidence) : undefined,
  };
}

export async function transcribeRealtimePcmChunk(params: {
  audioBase64: string;
  language: RealtimeVoiceLanguage;
  sampleRate?: number;
  hint?: string;
  mimeType?: string;
}): Promise<SttResult> {
  const preferred = sttProviderPreference();

  if (preferred === 'deepgram') {
    try {
      return await transcribeWithDeepgram(params);
    } catch {
      return transcribeWithOpenAI(params);
    }
  }

  try {
    return await transcribeWithOpenAI(params);
  } catch {
    return transcribeWithDeepgram(params);
  }
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
  const userText = normalizeWhitespace(input.userText);
  if (!userText) {
    return;
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const fallback = input.language === 'ka-GE'
      ? 'მესმის. ახლავე ვამუშავებ თქვენს მოთხოვნას.'
      : input.language === 'ru-RU'
      ? 'Понял. Уже обрабатываю ваш запрос.'
      : 'Understood. Processing your request now.';
    yield fallback;
    return;
  }

  const model = String(process.env.VOICE_V2V_LLM_MODEL || DEFAULT_CHAT_MODEL).trim() || DEFAULT_CHAT_MODEL;
  const client = new OpenAI({ apiKey });

  const messages = [
    {
      role: 'system',
      content: getSystemPrompt(input.language),
    },
    ...(input.history || []).slice(-6).map((item) => ({
      role: item.role,
      content: item.text,
    })),
    {
      role: 'user',
      content: userText,
    },
  ];

  const stream = await client.chat.completions.create({
    model,
    temperature: 0.35,
    stream: true,
    messages,
  } as unknown as Parameters<typeof client.chat.completions.create>[0]);

  for await (const event of stream as unknown as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>) {
    const token = String(event?.choices?.[0]?.delta?.content || '');
    if (token) {
      yield token;
    }
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
  const georgianVoice = String(process.env.ELEVENLABS_GEORGIAN_VOICE_ID || '').trim();
  const defaultVoice = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const voiceId = language === 'ka-GE' ? georgianVoice || defaultVoice : defaultVoice || georgianVoice;

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

async function synthesizeWithCartesia(text: string, language: RealtimeVoiceLanguage): Promise<TtsResult> {
  const apiKey = String(process.env.CARTESIA_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('cartesia_key_missing');
  }

  const voiceId = String(process.env.CARTESIA_VOICE_ID || '').trim();
  const modelId = String(process.env.CARTESIA_MODEL_ID || 'sonic').trim() || 'sonic';

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: modelId,
      voice: {
        mode: voiceId ? 'id' : 'prebuilt',
        id: voiceId || undefined,
      },
      language: toLanguageCode(language),
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 24000,
      },
      transcript: text,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`cartesia_tts_failed_${response.status}`);
  }

  const bytes = await response.arrayBuffer();

  return {
    audioBase64: bytesToBase64(bytes),
    mimeType: 'audio/wav',
    provider: 'cartesia-sonic',
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

  const preferred = ttsProviderPreference();

  if (preferred === 'cartesia') {
    try {
      return await synthesizeWithCartesia(text, input.language);
    } catch {
      return synthesizeWithElevenLabs(text, input.language);
    }
  }

  try {
    return await synthesizeWithElevenLabs(text, input.language);
  } catch {
    return synthesizeWithCartesia(text, input.language);
  }
}
