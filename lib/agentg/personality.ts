import 'server-only';
import OpenAI from 'openai';

export type AgentGChannel = 'web' | 'telegram';
export type AgentGLocale = 'ka' | 'en' | 'ru';

export type Tone = {
  mood: 'calm' | 'friendly' | 'excited' | 'serious' | 'humorous';
  confidence: number;
};

export type PersonalityMeta = {
  detectedEmotion: string;
  styleHints: string[];
  voiceHint: string;
};

export type PersonalityOutput = {
  replyText: string;
  tone: Tone;
  meta: PersonalityMeta;
};

export type PersonalityInput = {
  userText: string;
  channel: AgentGChannel;
  userId?: string;
  locale?: AgentGLocale;
  sessionId?: string;
  systemRules?: string[];
};

type DetectedEmotion =
  | 'happy_positive'
  | 'neutral'
  | 'stressed_angry'
  | 'sad_low'
  | 'confused_help';

type EmotionDetectionResult = {
  detectedEmotion: DetectedEmotion;
  confidence: number;
};

type SessionMemory = {
  lastUserMessage: string;
  lastAssistantReply: string;
  lastDetectedEmotion: DetectedEmotion;
};

type OpenAIChatClient = {
  chat: {
    completions: {
      create: (...args: unknown[]) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      }>;
    };
  };
};

const MODEL = 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 10_000;
const MAX_REPLY_CHARS = 1500;
const MAX_RETRIES = 2;

const HARMFUL_PATTERN = /(hate|harass|bully|dox|credit card|password|ssn|explosive|weapon)/i;

const FALLBACK_BY_LOCALE: Record<AgentGLocale, string> = {
  ka: 'გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌',
  en: 'Give me a moment and I will get back with a clear answer 🙌',
  ru: 'Дай мне немного времени, и я скоро вернусь с ответом 🙌',
};

let cachedClient: OpenAIChatClient | null = null;

function normalizeLocale(locale: string | undefined): AgentGLocale {
  if (locale === 'en' || locale === 'ru') return locale;
  return 'ka';
}

function sanitizeOwnerNaming(text: string): string {
  return text
    .replace(/\bGio\b/gi, 'გაგ')
    .replace(/\bგიო\b/gi, 'გაგ')
    .replace(/\bgio\b/gi, 'გაგ');
}

function clampConfidence(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

function trimReply(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_REPLY_CHARS) return normalized;
  return `${normalized.slice(0, MAX_REPLY_CHARS - 3)}...`;
}

export function detectEmotion(userText: string): EmotionDetectionResult {
  const text = userText.toLowerCase();

  const positiveSignals = /(ვაუ|მაგარია|სუპერ|გენიალურ|ძაან კარგია|მადლობა|awesome|great|amazing|yay|love it)/i;
  const stressedSignals = /(ვნერვიულობ|მეშინია|გაბრაზებული|stress|stressed|angry|furious|panic|ანერვიულებული)/i;
  const sadSignals = /(ცუდად ვარ|მოწყენილი|დავიღალე|sad|depressed|down|low mood|no energy)/i;
  const confusedSignals = /(არ მესმის|დამეხმარე|რა ვქნა|confused|help me|how to|can you explain|why)/i;

  if (positiveSignals.test(text)) return { detectedEmotion: 'happy_positive', confidence: 0.87 };
  if (stressedSignals.test(text)) return { detectedEmotion: 'stressed_angry', confidence: 0.9 };
  if (sadSignals.test(text)) return { detectedEmotion: 'sad_low', confidence: 0.84 };
  if (confusedSignals.test(text)) return { detectedEmotion: 'confused_help', confidence: 0.82 };
  return { detectedEmotion: 'neutral', confidence: 0.65 };
}

export function mapEmotionToTone(detection: EmotionDetectionResult): { tone: Tone; voiceHint: string; styleHints: string[] } {
  switch (detection.detectedEmotion) {
    case 'happy_positive':
      return {
        tone: { mood: 'excited', confidence: clampConfidence(detection.confidence) },
        voiceHint: 'slightly brighter tone, faster pace',
        styleHints: ['warm', 'light humor', 'celebratory'],
      };
    case 'stressed_angry':
      return {
        tone: { mood: 'calm', confidence: clampConfidence(detection.confidence) },
        voiceHint: 'calmer, slower pace, reassuring',
        styleHints: ['short sentences', 'reassuring', 'step-by-step'],
      };
    case 'sad_low':
      return {
        tone: { mood: 'friendly', confidence: clampConfidence(detection.confidence) },
        voiceHint: 'gentle tone, medium-slow pace, empathetic pauses',
        styleHints: ['empathetic', 'kind', 'low-pressure'],
      };
    case 'confused_help':
      return {
        tone: { mood: 'serious', confidence: clampConfidence(detection.confidence) },
        voiceHint: 'clear articulation, medium pace, structured guidance',
        styleHints: ['clarifying', 'structured', 'practical'],
      };
    default:
      return {
        tone: { mood: 'friendly', confidence: clampConfidence(detection.confidence) },
        voiceHint: 'natural conversational tone, balanced pace',
        styleHints: ['concise', 'friendly', 'simple'],
      };
  }
}

function buildSystemPrompt(params: {
  locale: AgentGLocale;
  channel: AgentGChannel;
  detection: EmotionDetectionResult;
  styleHints: string[];
  systemRules?: string[];
}): string {
  const languageRule =
    params.locale === 'ka'
      ? 'Respond in natural Georgian first, unless user explicitly requests another language.'
      : params.locale === 'ru'
        ? 'Respond in clear Russian.'
        : 'Respond in clear English.';

  return [
    'You are Agent G for Avatar G.',
    languageRule,
    'Conversation style: friendly, empathetic, short and clear, slang-lite rhythm when natural.',
    'You can use light non-offensive humor when it helps.',
    'Ask clarifying questions only when absolutely needed to proceed.',
    'IMPORTANT naming rule: never call the owner Gio or გიო. Only use the owner name "გაგ" when naming the owner.',
    'Safety rules: do not provide hate, harassment, dangerous instructions, or personal data leaks.',
    `Detected emotion: ${params.detection.detectedEmotion}.`,
    `Style hints: ${params.styleHints.join(', ')}.`,
    `Channel: ${params.channel}.`,
    ...(params.systemRules ?? []),
  ].join(' ');
}

function resolveOpenAIConstructor(): new (options: { apiKey: string }) => OpenAIChatClient {
  const candidate = OpenAI as unknown as {
    default?: unknown;
    OpenAI?: unknown;
  };

  const ctor = [
    OpenAI,
    candidate.default,
    candidate.OpenAI,
    (candidate.default as { OpenAI?: unknown } | undefined)?.OpenAI,
  ].find((value) => typeof value === 'function');

  if (!ctor) {
    throw new Error('OpenAI constructor is unavailable');
  }

  return ctor as new (options: { apiKey: string }) => OpenAIChatClient;
}

function createDefaultClient(apiKey: string): OpenAIChatClient {
  const OpenAIConstructor = resolveOpenAIConstructor();
  return new OpenAIConstructor({ apiKey });
}

let openAIClientFactory: (apiKey: string) => OpenAIChatClient = createDefaultClient;

export function __setPersonalityOpenAIClientFactoryForTests(factory: (apiKey: string) => OpenAIChatClient): void {
  openAIClientFactory = factory;
  cachedClient = null;
}

export function __resetPersonalityOpenAIClientFactoryForTests(): void {
  openAIClientFactory = createDefaultClient;
  cachedClient = null;
}

function getOpenAIClient(): OpenAIChatClient {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing in environment variables');
  }

  if (!cachedClient) {
    cachedClient = openAIClientFactory(apiKey);
  }

  return cachedClient;
}

function isUnsafeInput(input: string): boolean {
  return HARMFUL_PATTERN.test(input);
}

function fallbackReply(locale: AgentGLocale): string {
  return FALLBACK_BY_LOCALE[locale] || FALLBACK_BY_LOCALE.ka;
}

async function generateWithRetry(args: {
  locale: AgentGLocale;
  userText: string;
  systemPrompt: string;
}): Promise<string> {
  const client = getOpenAIClient();
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      const completion = await client.chat.completions.create(
        {
          model: MODEL,
          temperature: 0.55,
          messages: [
            { role: 'system', content: args.systemPrompt },
            { role: 'user', content: args.userText },
          ],
        },
        {
          timeout: OPENAI_TIMEOUT_MS,
        }
      );

      const text = completion.choices?.[0]?.message?.content;
      if (!text || typeof text !== 'string') {
        throw new Error('Empty model response');
      }

      return trimReply(sanitizeOwnerNaming(text));
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Model generation failed');
}

export async function generateAgentGPersonalityReply(input: PersonalityInput): Promise<PersonalityOutput> {
  const locale = normalizeLocale(input.locale);
  const userText = String(input.userText || '').trim();
  const realtimeModel = (process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview').trim();

  const detection = detectEmotion(userText);
  const mapped = mapEmotionToTone(detection);

  const memory: SessionMemory = {
    lastUserMessage: userText,
    lastAssistantReply: '',
    lastDetectedEmotion: detection.detectedEmotion,
  };

  if (!userText) {
    const emptyReply = locale === 'ka' ? 'მითხარი რაში დაგეხმარო და ერთად მოვაგვაროთ 💫' : locale === 'ru' ? 'Напиши, чем помочь, и разберём вместе 💫' : 'Tell me what you need and we will solve it together 💫';
    memory.lastAssistantReply = emptyReply;
    return {
      replyText: emptyReply,
      tone: mapped.tone,
      meta: {
        detectedEmotion: detection.detectedEmotion,
        styleHints: [...mapped.styleHints, `voice-ready:${Boolean(realtimeModel)}`],
        voiceHint: mapped.voiceHint,
      },
    };
  }

  if (isUnsafeInput(userText)) {
    const safeReply = locale === 'ka'
      ? 'ამ თემაზე ვერ დაგეხმარები. თუ გინდა, უსაფრთხო და კონსტრუქციულ ალტერნატივას შემოგთავაზებ 🙌'
      : locale === 'ru'
        ? 'С этим я не помогу. Могу предложить безопасную и полезную альтернативу 🙌'
        : 'I can’t help with that, but I can offer a safe and constructive alternative 🙌';
    memory.lastAssistantReply = safeReply;
    return {
      replyText: safeReply,
      tone: mapped.tone,
      meta: {
        detectedEmotion: detection.detectedEmotion,
        styleHints: [...mapped.styleHints, 'safety-block', `voice-ready:${Boolean(realtimeModel)}`],
        voiceHint: mapped.voiceHint,
      },
    };
  }

  const systemPrompt = buildSystemPrompt({
    locale,
    channel: input.channel,
    detection,
    styleHints: mapped.styleHints,
    systemRules: input.systemRules,
  });

  try {
    const reply = await generateWithRetry({ locale, userText, systemPrompt });
    memory.lastAssistantReply = reply;
    return {
      replyText: reply,
      tone: mapped.tone,
      meta: {
        detectedEmotion: detection.detectedEmotion,
        styleHints: [...mapped.styleHints, `voice-ready:${Boolean(realtimeModel)}`],
        voiceHint: mapped.voiceHint,
      },
    };
  } catch {
    const fallback = fallbackReply(locale);
    memory.lastAssistantReply = fallback;
    return {
      replyText: fallback,
      tone: mapped.tone,
      meta: {
        detectedEmotion: detection.detectedEmotion,
        styleHints: [...mapped.styleHints, 'fallback', `voice-ready:${Boolean(realtimeModel)}`],
        voiceHint: mapped.voiceHint,
      },
    };
  }
}

export function getFallbackReply(locale: AgentGLocale = 'ka'): string {
  return fallbackReply(locale);
}
