import 'server-only';

import { transcribeWithChirp, CHIRP_SYNC_MAX_SECONDS } from '@/lib/voice-v2v/chirpStt';

/**
 * Agent G's Telegram voice notes → text, on Cloud Speech-to-Text Chirp 3 (lib/voice-v2v/chirpStt: the site mic's engine
 * since GG's card of 2026-11-01, the same Vertex Workload Identity token, no API key). This replaced OpenAI's
 * transcription API (v5.1 M-14 cleanup, GG 2026-11-13 16:20Z), so OpenAI is left only for the chat-memory embeddings
 * until #306 lands.
 *
 * Telegram sends voice notes as OGG/Opus; Chirp's `autoDecodingConfig` reads OGG_OPUS, so the bytes go as they are.
 * One sync request takes under CHIRP_SYNC_MAX_SECONDS (60 s): longer notes are turned away by the handler first
 * (agentGVoiceMaxSeconds caps AGENT_G_VOICE_MAX_SECONDS at that).
 */
export type SttResult = {
  transcript: string;
  provider: 'chirp-3';
  /** Seconds Google billed (both Chirp legs), for the owner's cost view. */
  billedSeconds: number;
};

/**
 * Off unless AGENT_G_VOICE=on. It was hard-off while the only engine was OpenAI (Google only, MASTER TASK v3.1); now
 * that it is Chirp, turning it on is GG's call after a real voice note is tried. Merging this changes nothing.
 */
export function isAgentGVoiceEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return String(env.AGENT_G_VOICE || '').trim().toLowerCase() === 'on';
}

/** The longest note Agent G transcribes: AGENT_G_VOICE_MAX_SECONDS (default 45), never more than Chirp's sync limit. */
export function agentGVoiceMaxSeconds(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = Number(env.AGENT_G_VOICE_MAX_SECONDS || '45');
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 45;
  return Math.min(n, CHIRP_SYNC_MAX_SECONDS);
}

type TelegramFileResponse = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
};

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

/** One clip → text on Chirp 3, Georgian first (the site's three languages are listed; chirpStt picks the readable leg). */
export async function transcribeAudioBuffer(input: { audioBuffer: Uint8Array; language?: string }): Promise<SttResult> {
  if (!input.audioBuffer.length) throw new Error('empty_voice_file');
  const r = await transcribeWithChirp(input.audioBuffer, input.language?.trim() || 'ka');
  const transcript = r.text.trim();
  if (!transcript) throw new Error('chirp_transcription_empty');
  return { transcript, provider: 'chirp-3', billedSeconds: r.billedSeconds };
}

export async function transcribeTelegramVoice(input: {
  botToken: string;
  fileId: string;
  /** Kept for the caller's signature; Chirp decodes OGG/Opus on its own. */
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

    return transcribeAudioBuffer({ audioBuffer, language: 'ka' });
  });
}
