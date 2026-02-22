import 'server-only';

type TelegramFileResponse = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
};

type OpenAITranscriptionResponse = {
  text?: string;
};

export type SttResult = {
  transcript: string;
  provider: 'openai-stt';
};

export function isAgentGVoiceEnabled(): boolean {
  return String(process.env.AGENT_G_VOICE_ENABLED || '').trim().toLowerCase() === 'true';
}

function getSttModel(): string {
  return String(process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe').trim();
}

function getOpenAIKey(): string {
  return String(process.env.OPENAI_API_KEY || '').trim();
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

async function transcribeVoiceBuffer(input: {
  audioBuffer: Uint8Array;
  filename: string;
  mimeType?: string;
}): Promise<SttResult> {
  const openAIKey = getOpenAIKey();
  if (!openAIKey) {
    throw new Error('missing_openai_key');
  }

  const form = new FormData();
  const mimeType = input.mimeType || 'audio/ogg';
  const fileBuffer = Uint8Array.from(input.audioBuffer);
  form.append('file', new Blob([fileBuffer], { type: mimeType }), input.filename);
  form.append('model', getSttModel());
  form.append('language', 'ka');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAIKey}`,
    },
    body: form,
    cache: 'no-store',
  });

  const payload = (await response
    .json()
    .catch(() => null)) as OpenAITranscriptionResponse | null;
  const transcript = String(payload?.text || '').trim();

  if (!response.ok || !transcript) {
    throw new Error('openai_transcription_failed');
  }

  return {
    transcript,
    provider: 'openai-stt',
  };
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

    return transcribeVoiceBuffer({
      audioBuffer,
      filename: 'telegram-voice.ogg',
      mimeType: input.mimeType,
    });
  });
}
