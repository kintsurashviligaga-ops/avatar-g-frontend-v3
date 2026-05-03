import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';

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

export type ChatContext = {
  currentPage?: string;
  activeService?: string;
  selectedMode?: string;
};

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type PersonalityInput = {
  userText: string;
  channel: AgentGChannel;
  userId?: string;
  locale?: AgentGLocale;
  sessionId?: string;
  systemRules?: string[];
  context?: ChatContext;
  history?: ConversationTurn[];
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

const MODEL = 'claude-sonnet-4-5';
const MAX_REPLY_CHARS = 1500;
const MAX_RETRIES = 2;

const HARMFUL_PATTERN = /(hate|harass|bully|dox|credit card|password|ssn|explosive|weapon)/i;

const FALLBACK_BY_LOCALE: Record<AgentGLocale, string> = {
  ka: 'გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌',
  en: 'Give me a moment and I will get back with a clear answer 🙌',
  ru: 'Дай мне немного времени, и я скоро вернусь с ответом 🙌',
};

let cachedClient: Anthropic | null = null;

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

const SERVICE_CONTEXT_MAP: Record<string, string> = {
  avatar: 'The user is in the Avatar Studio. Help them create, customize, or refine their AI avatar. Guide them through styles, expressions, backgrounds, and output formats.',
  video: 'The user is in the Video Generation section. Help them create AI-generated videos, set up prompts, choose styles, duration, and resolution.',
  image: 'The user is in the Image Creation section. Help them generate AI images, posters, or artwork. Guide them through prompts, styles, aspect ratios, and quality settings.',
  music: 'The user is in the Music Production section. Help them produce AI music tracks, choose genres, moods, instruments, and duration.',
  text: 'The user is in the Content Writing section. Help them write scripts, captions, marketing copy, or other text content using AI.',
  workflow: 'The user is in the Workflow Builder. Help them chain multiple AI services together into automated multi-step workflows.',
};

function buildSystemPrompt(params: {
  locale: AgentGLocale;
  channel: AgentGChannel;
  detection: EmotionDetectionResult;
  styleHints: string[];
  systemRules?: string[];
  context?: ChatContext;
}): string {
  const languageRule =
    params.locale === 'ka'
      ? 'Respond in natural Georgian first, unless user explicitly requests another language.'
      : params.locale === 'ru'
        ? 'Respond in clear Russian.'
        : 'Respond in clear English.';

  const serviceHint = params.context?.activeService
    ? SERVICE_CONTEXT_MAP[params.context.activeService] || ''
    : '';

  const pageHint = params.context?.currentPage
    ? `The user is currently on the ${params.context.currentPage} page.`
    : '';

  return [
    AGENT_G_SYSTEM_PROMPT,
    '',
    '## SESSION CONTEXT',
    languageRule,
    '',
    `Detected user emotion: ${params.detection.detectedEmotion}.`,
    `Style hints: ${params.styleHints.join(', ')}.`,
    `Channel: ${params.channel}.`,
    serviceHint,
    pageHint,
    ...(params.systemRules ?? []),
  ].filter(Boolean).join('\n');
}

function getAnthropicClient(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing in environment variables');
  }

  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
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
  history?: ConversationTurn[];
}): Promise<string> {
  const client = getAnthropicClient();
  let attempt = 0;
  let lastError: unknown = null;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (args.history && args.history.length > 0) {
    const recentHistory = args.history.slice(-10);
    for (const turn of recentHistory) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  messages.push({ role: 'user', content: args.userText });

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      const completion = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        temperature: 0.55,
        system: args.systemPrompt,
        messages,
      });

      const block = completion.content[0];
      const text = block?.type === 'text' ? block.text : null;
      if (!text) throw new Error('Empty model response');

      return trimReply(sanitizeOwnerNaming(text));
    } catch (error) {
      console.error('[AgentG.Personality] Anthropic attempt', attempt, 'failed:', error instanceof Error ? error.message : error);
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
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
    context: input.context,
  });

  try {
    const reply = await generateWithRetry({ locale, userText, systemPrompt, history: input.history });
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
  } catch (err) {
    console.error('[AgentG.Personality] generateWithRetry failed:', err instanceof Error ? err.message : err);
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
