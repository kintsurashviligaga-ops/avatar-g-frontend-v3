import 'server-only';
import { geminiAudioInput, transcribeWithGeminiDetailed } from '@/lib/voice-v2v/geminiStt';

type TelegramFileResponse = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
};

export type SttResult = {
  transcript: string;
  provider: 'gemini';
  segments?: Array<{
    startSec: number;
    endSec: number;
    text: string;
  }>;
};

export function isAgentGVoiceEnabled(): boolean {
  return String(process.env.AGENT_G_VOICE_ENABLED || '').trim().toLowerCase() === 'true';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stt_timeout')), timeoutMs);
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
      if (index >= attempts) {
        break;
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('stt_failed'));
}

async function resolveTelegramFileUrl(botToken: string, fileId: string): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  const payload = (await response
    .json()
    .catch(() => null)) as TelegramFileResponse | null;

  const filePath = payload?.result?.file_path;
  if (!response.ok || !payload?.ok || !filePath) {
    throw new Error('telegram_get_file_failed');
  }

  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

export async function transcribeAudioBuffer(input: {
  audioBuffer: Uint8Array;
  filename: string;
  mimeType?: string;
  language?: string;
  withSegments?: boolean;
}): Promise<SttResult> {
  const audio = geminiAudioInput(input.mimeType || 'audio/ogg', input.audioBuffer);
  if (!audio.mimeType) throw new Error('unsupported_audio_container');
  const language = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' }[input.language ?? ''] ?? input.language ?? 'auto';
  const result = await transcribeWithGeminiDetailed(Buffer.from(input.audioBuffer).toString('base64'), audio.mimeType, language);
  return { transcript: result.text, provider: 'gemini' };

}

export async function transcribeTelegramVoice(input: {
  botToken: string;
  fileId: string;
  mimeType?: string;
}): Promise<SttResult> {
  return withRetries(2, async () => {
    const fileUrl = await withTimeout(resolveTelegramFileUrl(input.botToken, input.fileId), 4_500);
    const fileResponse = await withTimeout(
      fetch(fileUrl, {
        method: 'GET',
        cache: 'no-store',
      }),
      9_000
    );

    if (!fileResponse.ok) {
      throw new Error('telegram_download_failed');
    }

    const arrayBuffer = await withTimeout(fileResponse.arrayBuffer(), 9_000);
    const audioBuffer = new Uint8Array(arrayBuffer);
    if (!audioBuffer.length) {
      throw new Error('empty_voice_file');
    }

    return transcribeAudioBuffer({
      audioBuffer,
      filename: 'telegram-voice.ogg',
      mimeType: input.mimeType,
      language: 'ka',
    });
  });
}
