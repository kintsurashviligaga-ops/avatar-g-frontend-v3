import { createHash } from 'node:crypto';
import { cacheGet, cacheSet } from '@/lib/platform/cache';

interface AIGenerateOptions {
  prompt: string;
  type?: 'text' | 'code' | 'creative' | 'executive' | 'chat';
  language?: 'ka' | 'en' | 'ru';
  /** Skip cache lookup and write for this request. */
  skipCache?: boolean;
  /** Override default TTL (seconds) for this request's cached result. */
  cacheTtlSeconds?: number;
}

interface AIProvider {
  name: string;
  generate: (options: AIGenerateOptions) => Promise<string>;
  isAvailable: () => boolean;
}

// ─── Cache TTLs by type ───────────────────────────────────────────────────────

const CACHE_TTL_BY_TYPE: Record<string, number> = {
  text: 3600,      // 1 h — deterministic prose is stable
  code: 1800,      // 30 min
  creative: 300,   // 5 min — allow variety
  executive: 900,  // 15 min
  chat: 0,         // skip — conversational context matters
};

function buildCacheKey(options: AIGenerateOptions): string {
  const fingerprint = JSON.stringify({
    p: options.prompt,
    t: options.type ?? 'text',
    l: options.language ?? 'ka',
  });
  return `ai:gen:${createHash('sha256').update(fingerprint).digest('hex')}`;
}

// ─── Providers ────────────────────────────────────────────────────────────────

const openAIProvider: AIProvider = {
  name: 'OpenAI',
  isAvailable: () => !!process.env.OPENAI_API_KEY,
  generate: async (options) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: getSystemPrompt(options.type, options.language) },
          { role: 'user', content: options.prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');
    return content;
  },
};

const grokProvider: AIProvider = {
  name: 'Grok',
  isAvailable: () => !!process.env.XAI_API_KEY,
  generate: async (options) => {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { role: 'system', content: getSystemPrompt(options.type, options.language) },
          { role: 'user', content: options.prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Grok error: ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Grok returned empty content');
    return content;
  },
};

const deepSeekProvider: AIProvider = {
  name: 'DeepSeek',
  isAvailable: () => !!process.env.DEEPSEEK_API_KEY,
  generate: async (options) => {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: getSystemPrompt(options.type, options.language) },
          { role: 'user', content: options.prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned empty content');
    return content;
  },
};

const geminiProvider: AIProvider = {
  name: 'Gemini',
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  generate: async (options) => {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // API key belongs in the header, not the request body
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${getSystemPrompt(options.type, options.language)}\n\n${options.prompt}`,
                },
              ],
            },
          ],
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini returned empty content');
    return content;
  },
};

const localProvider: AIProvider = {
  name: 'Local',
  isAvailable: () => true,
  generate: async (options) => {
    const responses: Record<string, Record<string, string>> = {
      ka: {
        text: `პასუხი: "${options.prompt.slice(0, 50)}..."\n\nAI-მ დაამუშავა თქვენი მოთხოვნა.\nსანდოობა: 94.7%`,
        code: `// კოდი: ${options.prompt.slice(0, 30)}...\n\nfunction solution() {\n  const result = processData();\n  return result;\n}`,
        creative: `შემოქმედებითი ტექსტი: "${options.prompt.slice(0, 30)}..."\n\nციფრული სინათლის კორიდორებში...`,
        executive: `საქმიანი მიმოხილვა\n\nმოთხოვნა: ${options.prompt.slice(0, 30)}...\nსტატუსი: დამუშავებულია`,
        chat: `გამარჯობა! მე ვარ Avatar G Assistant.\n\nთქვენი შეკითხვა: "${options.prompt}"\n\nრით შემიძლია დაგეხმაროთ?`,
      },
      en: {
        text: `Response: "${options.prompt.slice(0, 50)}..."\n\nAI processed your request.\nConfidence: 94.7%`,
        code: `// Code: ${options.prompt.slice(0, 30)}...\n\nfunction solution() {\n  const result = processData();\n  return result;\n}`,
        creative: `Creative text: "${options.prompt.slice(0, 30)}..."\n\nIn the neon-lit corridors...`,
        executive: `Executive Summary\n\nRequest: ${options.prompt.slice(0, 30)}...\nStatus: PROCESSED`,
        chat: `Hello! I am Avatar G Assistant.\n\nYour question: "${options.prompt}"\n\nHow can I help you?`,
      },
    };
    const lang = options.language ?? 'ka';
    const type = options.type ?? 'text';
    const fallback = responses['ka']?.['text'] ?? 'Response unavailable';
    return responses[lang]?.[type] ?? fallback;
  },
};

// ─── System prompts ───────────────────────────────────────────────────────────

function getSystemPrompt(type?: string, language?: string): string {
  const prompts: Record<string, Record<string, string>> = {
    ka: {
      text: 'თქვენ ხართ Avatar G - AI ასისტენტი. უპასუხეთ ქართულად.',
      code: 'თქვენ ხართ პროგრამისტი. დაწერეთ კოდი.',
      creative: 'თქვენ ხართ მწერალი. დაწერეთ ტექსტი.',
      executive: 'თქვენ ხართ ასისტენტი. შეჯამება.',
      chat: 'თქვენ ხართ Avatar G Assistant.',
    },
    en: {
      text: 'You are Avatar G - AI Assistant.',
      code: 'You are a programmer.',
      creative: 'You are a writer.',
      executive: 'You are an assistant.',
      chat: 'You are Avatar G Assistant.',
    },
  };
  const langKey = language ?? 'ka';
  const typeKey = type ?? 'text';
  const langPrompts = prompts[langKey] ?? prompts['ka'];
  return langPrompts?.[typeKey] ?? prompts['ka']?.['text'] ?? '';
}

// ─── Provider chain ───────────────────────────────────────────────────────────

const providers = [
  openAIProvider,
  grokProvider,
  deepSeekProvider,
  geminiProvider,
  localProvider,
];

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AIGenerateResult {
  text: string;
  provider: string;
  isRealAI: boolean;
  fromCache?: boolean;
}

export async function generateWithFallback(options: AIGenerateOptions): Promise<AIGenerateResult> {
  const ttl =
    options.skipCache
      ? 0
      : (options.cacheTtlSeconds ?? CACHE_TTL_BY_TYPE[options.type ?? 'text'] ?? 3600);

  // Cache read — skip for types with ttl=0 (e.g. chat)
  if (ttl > 0) {
    const cacheKey = buildCacheKey(options);
    const cached = await cacheGet<AIGenerateResult>(cacheKey);
    if (cached) return { ...cached, fromCache: true };
  }

  // Provider chain
  const errors: string[] = [];
  let result: AIGenerateResult | null = null;

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;
    try {
      const text = await provider.generate(options);
      result = { text, provider: provider.name, isRealAI: provider.name !== 'Local' };
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AI] ${provider.name} failed:`, message);
      errors.push(`${provider.name}: ${message}`);
    }
  }

  if (!result) {
    throw new Error(`All AI providers failed: ${errors.join(', ')}`);
  }

  // Cache write
  if (ttl > 0) {
    const cacheKey = buildCacheKey(options);
    await cacheSet(cacheKey, result, ttl);
  }

  return result;
}

export const generateText = (prompt: string, lang?: 'ka' | 'en' | 'ru') =>
  generateWithFallback({ prompt, type: 'text', language: lang });

export const generateCode = (prompt: string, lang?: 'ka' | 'en' | 'ru') =>
  generateWithFallback({ prompt, type: 'code', language: lang });

export const chat = (prompt: string, lang?: 'ka' | 'en' | 'ru') =>
  generateWithFallback({ prompt, type: 'chat', language: lang });

export default generateWithFallback;
