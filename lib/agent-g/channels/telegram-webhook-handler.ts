import { NextResponse } from 'next/server';
import { storeInboundTelegramEvent } from '@/lib/agent-g/channels/inbound-events';
import {
  generateAgentGPersonalityReply,
  getFallbackReply,
  type AgentGLocale,
  type PersonalityOutput,
} from '@/lib/agentg/personality';
import { detectTone, type AgentGTone } from '@/lib/agent-g/tone';
import { getUserMemory, recordEvent, upsertUserMemory } from '@/lib/agent-g/memory';
import { isAgentGVoiceEnabled, transcribeTelegramVoice } from '@/lib/agent-g/voice/stt';
import { synthesizeTelegramVoice } from '@/lib/agent-g/voice/tts';

type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  voice?: {
    file_id?: string;
    duration?: number;
    mime_type?: string;
  };
  audio?: {
    file_id?: string;
    duration?: number;
    mime_type?: string;
  };
  video_note?: {
    file_id?: string;
    duration?: number;
    length?: number;
  };
  chat?: { id?: number | string; type?: string };
  from?: { id?: number | string; username?: string; is_bot?: boolean };
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number | string; username?: string; is_bot?: boolean };
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramSendMessageResponse = {
  ok?: boolean;
  error_code?: number;
  description?: string;
};

type SendTelegramMessageResult = {
  attempted: boolean;
  httpStatus: number | null;
  ok: boolean;
  errorCode: number | null;
  errorMessage: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value || '').trim();
}

function json(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function getUpdateType(update: TelegramUpdate): string {
  if (update.message) return 'message';
  if (update.edited_message) return 'edited_message';
  if (update.channel_post) return 'channel_post';
  if (update.edited_channel_post) return 'edited_channel_post';
  if (update.callback_query) return 'callback_query';
  return 'unknown';
}

function truncateText(value: string | null, max = 80): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

async function sendTelegramMessage(params: {
  token: string;
  chatId: string;
  text: string;
}): Promise<SendTelegramMessageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`https://api.telegram.org/bot${params.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const payload = (await response
      .json()
      .catch((_error) => null)) as TelegramSendMessageResponse | null;

    return {
      attempted: true,
      httpStatus: response.status,
      ok: Boolean(response.ok && payload?.ok),
      errorCode: payload?.error_code ?? null,
      errorMessage: payload?.description ?? null,
    };
  } catch (error) {
    return {
      attempted: true,
      httpStatus: null,
      ok: false,
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : 'sendMessage failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegramAudio(params: {
  token: string;
  chatId: string;
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<SendTelegramMessageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);

  try {
    const form = new FormData();
    const audioBuffer = Uint8Array.from(params.audio);
    form.append('chat_id', params.chatId);
    form.append('audio', new Blob([audioBuffer], { type: params.mimeType }), params.fileName);

    const response = await fetch(`https://api.telegram.org/bot${params.token}/sendAudio`, {
      method: 'POST',
      body: form,
      cache: 'no-store',
      signal: controller.signal,
    });

    const payload = (await response
      .json()
      .catch((_error) => null)) as TelegramSendMessageResponse | null;

    return {
      attempted: true,
      httpStatus: response.status,
      ok: Boolean(response.ok && payload?.ok),
      errorCode: payload?.error_code ?? null,
      errorMessage: payload?.description ?? null,
    };
  } catch (error) {
    return {
      attempted: true,
      httpStatus: null,
      ok: false,
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : 'sendAudio failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('operation_timeout'));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function detectLocaleFromText(text: string | null): AgentGLocale {
  const normalized = (text || '').toLowerCase();
  if (/\b(hello|hi|help|thanks|please)\b/.test(normalized)) return 'en';
  if (/\b(привет|помоги|спасибо|пожалуйста)\b/.test(normalized)) return 'ru';
  return 'ka';
}

function getVoiceDurationLimitSeconds(): number {
  const raw = Number(process.env.AGENT_G_VOICE_MAX_SECONDS || '45');
  if (!Number.isFinite(raw) || raw <= 0) {
    return 45;
  }

  return Math.floor(raw);
}

function redactSensitiveText(value: string): string {
  const redactedPhone = value.replace(/\b\+?\d[\d\s()\-]{7,}\d\b/g, '[redacted-phone]');
  const redactedAddress = redactedPhone.replace(
    /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|lane|ln\.?|apt\.?|flat|მისამართი|ქუჩა)\b[^,\n]{0,80}/gi,
    '[redacted-address]'
  );
  return redactedAddress;
}

function sanitizeEventText(value: string): string {
  return redactSensitiveText(value).slice(0, 500);
}

function isLikelySensitiveFact(value: string): boolean {
  return /\b\+?\d[\d\s()\-]{7,}\d\b/.test(value) || /\b(?:street|avenue|road|lane|მისამართი|ქუჩა)\b/i.test(value);
}

function extractFactsFromText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const patterns = [
    /(?:მე მქვია|ჩემი სახელია|my name is|call me)\s+([\p{L}0-9 _-]{2,32})/iu,
    /(?:ვსაუბრობ|language is|prefer language|ენა)\s+([\p{L}]{2,20})/iu,
    /(?:ვარ|i am)\s+([\p{L}0-9 _-]{2,40})/iu,
  ];

  const facts: string[] = [];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[0]) continue;
    const candidate = sanitizeEventText(match[0]);
    if (!candidate || isLikelySensitiveFact(candidate)) continue;
    facts.push(candidate);
  }

  return facts.slice(0, 3);
}

function toToneStats(value: unknown): Partial<Record<AgentGTone, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  return {
    happy: Number(source.happy || 0),
    neutral: Number(source.neutral || 0),
    stressed: Number(source.stressed || 0),
    angry: Number(source.angry || 0),
    sad: Number(source.sad || 0),
  };
}

const telegramRateWindowMs = 60_000;
const telegramRateMax = 120;
const telegramPayloadBytes = 256_000;
const telegramRateMap = new Map<string, { count: number; windowStart: number }>();

function getRequestIp(req: Request): string {
  const forwarded = normalize(req.headers.get('x-forwarded-for'));
  if (forwarded) {
    return normalize(forwarded.split(',')[0]);
  }
  return normalize(req.headers.get('x-real-ip')) || 'unknown';
}

function isTelegramRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = telegramRateMap.get(ip);

  if (!existing || now - existing.windowStart >= telegramRateWindowMs) {
    telegramRateMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  existing.count += 1;
  return existing.count > telegramRateMax;
}

async function processTelegramUpdateInBackground(params: {
  update: TelegramUpdate;
  requestId: string;
  startedAt: number;
}): Promise<void> {
  const { update, requestId, startedAt } = params;
  const updateType = getUpdateType(update);
  const message =
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post ||
    update.callback_query?.message;

  const chat = message?.chat || {};
  const from = message?.from || update.callback_query?.from || {};
  const chatId = chat.id ? String(chat.id) : null;
  const chatType = typeof chat.type === 'string' ? chat.type : null;
  const isBotMessage = Boolean(from?.is_bot);
  const userId = from.id ? String(from.id) : null;
  const username = typeof from.username === 'string' ? from.username : null;
  const text =
    typeof message?.text === 'string'
      ? message.text
      : typeof update.callback_query?.data === 'string'
        ? update.callback_query.data
        : null;
  const caption = typeof message?.caption === 'string' ? message.caption : null;
  const incomingText = text || caption;
  const messageId = typeof message?.message_id === 'number' ? message.message_id : null;
  const date = typeof message?.date === 'number' ? message.date : null;

  if (!message || !chatId) {
    return;
  }

  const token = normalize(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN', { request_id: requestId });
    return;
  }

  const canReply = !isBotMessage && chatType === 'private';
  const voiceAttachment = message.voice || message.audio || message.video_note || null;
  const shouldProcessVoice = canReply && isAgentGVoiceEnabled() && Boolean(voiceAttachment?.file_id);
  const shouldReplyText = canReply && Boolean(incomingText && incomingText.trim().length > 0) && !shouldProcessVoice;

  const buildReplyFromUserText = async (normalizedText: string, sourceType: 'message' | 'voice_message') => {
    const locale = detectLocaleFromText(normalizedText);
    const tone = detectTone(normalizedText);
    const effectiveUserId = userId || chatId;
    const existingMemory = await getUserMemory('telegram', effectiveUserId);
    const existingFacts = Array.isArray(existingMemory.memory.facts)
      ? existingMemory.memory.facts.filter((item): item is string => typeof item === 'string')
      : [];
    const nextFacts = [...existingFacts, ...extractFactsFromText(normalizedText)].slice(-5);
    const existingToneStats = toToneStats(
      existingMemory.style && typeof existingMemory.style === 'object'
        ? (existingMemory.style as Record<string, unknown>).toneStats
        : undefined
    );

    const systemRules = [
      'Do not call the user gio, გიო, or any variation. If you use a name, use "გაგ" and do not overuse it.',
      'Use natural Georgian with friendly, humorous tone unless the user explicitly requests another language.',
      `Tone detection: ${tone.tone} (${tone.confidence}).`,
    ];

    let personalityOutput: PersonalityOutput | null = null;
    let usedFallback = false;

    try {
      personalityOutput = await withTimeout(
        generateAgentGPersonalityReply({
          userText: normalizedText,
          channel: 'telegram',
          userId: effectiveUserId ?? undefined,
          locale,
          sessionId: `${chatId}:${requestId}`,
          systemRules,
        }),
        1_800
      );
    } catch {
      usedFallback = true;
    }

    const fallbackText = getFallbackReply(locale);
    const replyText = personalityOutput?.replyText || fallbackText;
    const nextToneStats = {
      happy: Number(existingToneStats.happy || 0),
      neutral: Number(existingToneStats.neutral || 0),
      stressed: Number(existingToneStats.stressed || 0),
      angry: Number(existingToneStats.angry || 0),
      sad: Number(existingToneStats.sad || 0),
    };
    nextToneStats[tone.tone] += 1;

    void recordEvent('telegram', effectiveUserId, sourceType, {
      text: sanitizeEventText(normalizedText),
      tone,
      locale,
      updateType,
    });

    void upsertUserMemory('telegram', effectiveUserId, {
      memory: {
        facts: nextFacts,
        preferredLanguage: 'ka',
        preferredAddressName: 'გაგ',
      },
      style: {
        toneStats: nextToneStats,
        lastTone: tone.tone,
        lastToneConfidence: tone.confidence,
      },
    });

    return {
      replyText,
      effectiveUserId,
      usedFallback,
      tone,
      detectedEmotion: personalityOutput?.meta.detectedEmotion ?? 'neutral',
    };
  };

  if (shouldProcessVoice && voiceAttachment?.file_id) {
    const voiceDuration = Number(voiceAttachment.duration || 0);
    const voiceMimeType = 'mime_type' in voiceAttachment ? voiceAttachment.mime_type : undefined;
    const maxSeconds = getVoiceDurationLimitSeconds();

    if (voiceDuration > maxSeconds) {
      void sendTelegramMessage({
        token,
        chatId,
        text: `გაგ, ხმოვანი ცოტა შეამოკლე — მაქსიმუმ ${maxSeconds} წამი, რომ სწრაფად გიპასუხო 🎙️`,
      });
    } else {
      try {
        const sttResult = await transcribeTelegramVoice({
          botToken: token,
          fileId: voiceAttachment.file_id,
          mimeType: voiceMimeType,
        });

        const reply = await buildReplyFromUserText(sttResult.transcript.trim(), 'voice_message');

        try {
          const ttsAudio = await synthesizeTelegramVoice({
            text: reply.replyText,
            tone: reply.tone.tone,
          });

          void sendTelegramAudio({
            token,
            chatId,
            audio: ttsAudio.audio,
            fileName: ttsAudio.fileName,
            mimeType: ttsAudio.mimeType,
          });
        } catch {
          void sendTelegramMessage({ token, chatId, text: reply.replyText });
        }
      } catch {
        void sendTelegramMessage({
          token,
          chatId,
          text: 'გაგ, ხმოვანი ბოლომდე ვერ წავიკითხე. კიდევ ერთხელ სცადე უფრო მკაფიოდ, ან ტექსტად მომწერე 🙏',
        });
      }
    }
  } else if (shouldReplyText && incomingText) {
    const reply = await buildReplyFromUserText(incomingText.trim(), 'message');
    void sendTelegramMessage({ token, chatId, text: reply.replyText });

    console.info('[Telegram] Reply queued', {
      request_id: requestId,
      channel: 'telegram',
      chat_id: chatId,
      used_fallback: reply.usedFallback,
      detected_emotion: reply.detectedEmotion,
      detected_tone: reply.tone.tone,
      execution_ms: Date.now() - startedAt,
    });
  }

  void storeInboundTelegramEvent({
    channel: 'telegram',
    type: 'telegram_update',
    chatId,
    userId,
    username,
    text: incomingText,
    messageId,
    date,
    payload: update,
  });
}

export async function handleTelegramWebhook(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const clientIp = getRequestIp(req);
    if (isTelegramRateLimited(clientIp)) {
      return json({ ok: false, error: 'rate_limited' }, 429);
    }

    const expectedSecret = normalize(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (expectedSecret) {
      const providedSecret = normalize(req.headers.get('x-telegram-bot-api-secret-token'));
      if (!providedSecret || providedSecret !== expectedSecret) {
        return json({ ok: false, error: 'Invalid webhook secret header' }, 403);
      }
    }

    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > telegramPayloadBytes) {
      return json({ ok: false, error: 'payload_too_large' }, 413);
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > telegramPayloadBytes) {
      return json({ ok: false, error: 'payload_too_large' }, 413);
    }

    const update = (rawBody ? JSON.parse(rawBody) : {}) as TelegramUpdate;
    if (!update || typeof update !== 'object') {
      return json({ ok: true, ignored: true, reason: 'invalid_payload' });
    }

    const updateType = getUpdateType(update);
    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post ||
      update.callback_query?.message;
    const text =
      typeof message?.text === 'string'
        ? message.text
        : typeof update.callback_query?.data === 'string'
          ? update.callback_query.data
          : null;
    const caption = typeof message?.caption === 'string' ? message.caption : null;
    const incomingText = text || caption;
    const chatId = message?.chat?.id ? String(message.chat.id) : null;

    console.info('[Telegram] Incoming Telegram update', {
      request_id: requestId,
      channel: 'telegram',
      update_type: updateType,
      chat_id: chatId,
      text_preview: truncateText(incomingText, 40),
      queued: true,
      execution_ms: Date.now() - startedAt,
    });

    queueMicrotask(() => {
      void processTelegramUpdateInBackground({
        update,
        requestId,
        startedAt,
      }).catch((error) => {
        console.error('[Telegram] Background processor failed', {
          request_id: requestId,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    });

    return json({
      ok: true,
      received: true,
      queued: true,
      request_id: requestId,
      update_id: update.update_id ?? null,
      update_type: updateType,
      chat_id: chatId,
      execution_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[Telegram] Handler error', {
      request_id: requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
      execution_ms: Date.now() - startedAt,
    });
    return json({ ok: true, ignored: true, reason: 'handler_error' });
  }
}
