import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';
const SYSTEM_PROMPT = 'You are Agent G, a helpful assistant for Avatar G platform. Be concise.';
const MAX_REPLY_CHARS = 1500;
const OPENAI_TIMEOUT_MS = 7000;

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

let cachedClient: OpenAIChatClient | null = null;

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

export function __setOpenAIClientFactoryForTests(factory: (apiKey: string) => OpenAIChatClient): void {
  openAIClientFactory = factory;
  cachedClient = null;
}

export function __resetOpenAIClientFactoryForTests(): void {
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

function trimReply(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_REPLY_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_REPLY_CHARS - 3)}...`;
}

export async function getOpenAIReply(userText: string): Promise<string> {
  const input = userText.trim();
  if (!input) {
    return 'Please send a message so I can help.';
  }

  const client = getOpenAIClient();

  const completion = await client.chat.completions.create(
    {
      model: MODEL,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: input,
        },
      ],
    },
    {
      timeout: OPENAI_TIMEOUT_MS,
    }
  );

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    return 'I could not generate a response right now.';
  }

  return trimReply(raw);
}
