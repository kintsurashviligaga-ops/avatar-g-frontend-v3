import 'server-only';

import type { AgentGTone } from '@/lib/agent-g/tone';

export type TtsResult = {
  audio: Uint8Array;
  mimeType: string;
  fileName: string;
  provider: 'elevenlabs';
};

function getElevenLabsConfig(): { apiKey: string; voiceId: string } {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim();

  if (!apiKey || !voiceId) {
    throw new Error('missing_elevenlabs_config');
  }

  return { apiKey, voiceId };
}

function toneSettings(tone: AgentGTone): { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean } {
  if (tone === 'happy') {
    return { stability: 0.4, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true };
  }

  if (tone === 'stressed' || tone === 'angry' || tone === 'sad') {
    return { stability: 0.72, similarity_boost: 0.75, style: 0.28, use_speaker_boost: true };
  }

  return { stability: 0.58, similarity_boost: 0.76, style: 0.4, use_speaker_boost: true };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tts_timeout')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function withRetries<T>(attempts: number, task: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  let index = 0;

  while (index < attempts) {
    index += 1;
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (index >= attempts) break;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('tts_failed'));
}

export async function synthesizeTelegramVoice(params: { text: string; tone: AgentGTone }): Promise<TtsResult> {
  const { apiKey, voiceId } = getElevenLabsConfig();
  const cleanedText = String(params.text || '').trim();

  if (!cleanedText) {
    throw new Error('empty_tts_text');
  }

  return withRetries(2, async () => {
    const response = await withTimeout(
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: toneSettings(params.tone),
        }),
        cache: 'no-store',
      }),
      12_000
    );

    if (!response.ok) {
      throw new Error(`elevenlabs_http_${response.status}`);
    }

    const arrayBuffer = await withTimeout(response.arrayBuffer(), 12_000);
    const bytes = new Uint8Array(arrayBuffer);

    if (!bytes.length) {
      throw new Error('empty_tts_audio');
    }

    return {
      audio: bytes,
      mimeType: 'audio/mpeg',
      fileName: 'agent-g-reply.mp3',
      provider: 'elevenlabs',
    };
  });
}
