import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { NextRequest } from 'next/server';
import { reportError } from '@/lib/observability/report-error';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { embed } from '@/lib/memory/embed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── 1. SYSTEM PROMPT ────────────────────────────────────────────────────────
// Agent G persona: expert creative director, Georgian-first, Markdown-rich.
// Refined for professional tone consistent with the MyAvatar.ge brand voice.

const SYSTEM_PROMPT = `${AGENT_G_SYSTEM_PROMPT}

CHAT INTERFACE — OPERATING RULES:
- Language: reply in the user's exact language. Default to Georgian (ქართული) when the language is ambiguous or mixed.
- Formatting: always use rich Markdown — ## section headers, **bold** for emphasis, bullet lists for options, numbered steps for instructions, \`\`\`language code blocks for any code.
- Visual analysis: when you receive an image (from the Image Creator or uploaded), give precise, actionable creative feedback — composition, palette, mood, technical quality — aligned with the user's stated goal.
- Tone: world-class creative director meets trusted advisor. Be specific, inspiring, and never generic. One concrete next step or follow-up question must close every substantive reply.
- Scope: you orchestrate 14 AI services on MyAvatar.ge. Route naturally: if a request calls for image generation, video, music, or avatar creation, acknowledge it and tell the user which service will handle it.
- You are Agent G, powered by Google Gemini 2.0 Flash on the MyAvatar.ge platform.`;

// ─── 2. SECURITY GUARD ───────────────────────────────────────────────────────

const MAX_BODY_BYTES = 512_000; // 512 KB — prevents abuse via oversized payloads

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return createGoogleGenerativeAI({ apiKey });
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  return createAnthropic({ apiKey });
}

// ─── 3. TYPES ────────────────────────────────────────────────────────────────

type IncomingPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string };

type IncomingMessage = {
  role: string;
  content: string | IncomingPart[];
};

// ai SDK accepts base64 strings or URL objects for images
type ImageContent = { type: 'image'; image: string | URL };
type TextContent = { type: 'text'; text: string };

type ModelMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'user'; content: Array<TextContent | ImageContent> };

// ─── 4. MULTIMODAL MESSAGE BUILDER ───────────────────────────────────────────
// Handles three image sources:
//   • data URLs   — "data:image/png;base64,..."  (uploaded files)
//   • base64      — raw base64 string             (from internal pipeline)
//   • HTTPS URLs  — "https://..."                 (FLUX.1 output URLs)

function toCoreMessages(messages: IncomingMessage[]): ModelMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      if (m.role === 'assistant' || typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: String(m.content) };
      }

      const parts = (m.content as IncomingPart[]).map((p): TextContent | ImageContent => {
        if (p.type === 'image') {
          // FLUX.1-schnell returns HTTPS URLs — pass as URL object so Gemini fetches them
          if (p.image.startsWith('http://') || p.image.startsWith('https://')) {
            return { type: 'image', image: new URL(p.image) };
          }
          // Everything else (data URLs, raw base64) passes through as a string
          return { type: 'image', image: p.image };
        }
        return { type: 'text', text: p.text };
      });

      return { role: 'user' as const, content: parts };
    });
}

// ─── 4b. MEMORY INJECTION ────────────────────────────────────────────────────
// Pull the latest user text, embed it, and fetch the top-k most-similar
// memories for the current authenticated user via the `match_memories` RPC.
// Failures are silent: missing OPENAI_API_KEY, no auth, embed failure, or RPC
// error all return `null` so chat never breaks because of memory.

function extractLatestUserText(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content.trim();
    if (Array.isArray(m.content)) {
      const text = (m.content as IncomingPart[])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

async function buildMemoryPreamble(req: NextRequest, messages: IncomingMessage[]): Promise<string | null> {
  try {
    const userText = extractLatestUserText(messages);
    if (!userText) return null;

    const embedding = await embed(userText);
    if (!embedding) return null;

    // Accept both cookie-based (browser) and Bearer-token (mobile / SDK) auth.
    // The previous createSupabaseServerClient() path read cookies only, which
    // meant memory was never injected for any non-browser caller.
    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) return null;

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_count: 5,
    });
    if (error) {
      reportError(error, { route: '/api/chat/gemini', stage: 'memory-rpc' });
      return null;
    }

    const rows = (data ?? []) as Array<{ id: string; fact: string; similarity: number }>;
    if (!rows.length) return null;

    const bullets = rows
      .map((r) => `- ${r.fact.replace(/\s+/g, ' ').trim()}`)
      .join('\n');

    // Make the preamble unambiguous: these are facts the user explicitly told
    // Agent G in earlier sessions (stored in their personal memory). Treat
    // them as trusted personal context — answer naturally, don't disclaim
    // "I don't have access to personal information".
    return [
      'KNOWN FACTS ABOUT THIS USER (from their personal memory store —',
      'they told you these themselves in earlier sessions; use them naturally',
      'and don\'t disclaim that you don\'t know personal info):',
      bullets,
    ].join('\n');
  } catch (err) {
    reportError(err, { route: '/api/chat/gemini', stage: 'memory-build' });
    return null;
  }
}

// ─── 5. ERROR CLASSIFICATION ─────────────────────────────────────────────────

function classifyError(err: unknown): 'rate_limit' | 'safety' | 'unknown' {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') || msg.includes('maxretriesexceeded')) {
    return 'rate_limit';
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('content_filter') || msg.includes('finish_reason: safety')) {
    return 'safety';
  }
  return 'unknown';
}

const SAFETY_MESSAGE_KA = '⚠️ შეტყობინება Google-ის უსაფრთხოების ფილტრებს ეჯახება. გთხოვ, შეცვალე ფორმულირება და სცადე თავიდან.';
const SAFETY_MESSAGE_EN = '⚠️ This request was blocked by safety filters. Please rephrase and try again.';

// Used when BOTH Gemini and Anthropic return empty output — most often a
// quota/rate-limit issue on the provider side that doesn't surface as an
// HTTP error. Tells the user what to do instead of a misleading "safety" claim.
const PROVIDERS_DOWN_KA = '⚠️ AI სერვისები დროებით მიუწვდომელია (Gemini + Anthropic ცარიელ პასუხს აბრუნებენ). სცადე რამდენიმე წუთში — ეს ხშირად ლიმიტის ან მცირე outage-ის შედეგია. თუ პრობლემა გრძელდება, შეტყობინე ადმინს.';
const PROVIDERS_DOWN_EN = '⚠️ AI services temporarily unavailable (Gemini + Anthropic both returned empty responses). Please try again in a few minutes — this is usually a rate-limit or brief outage. If it persists, contact support.';

function localeFromMessages(messages: IncomingMessage[]): 'ka' | 'en' {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const txt = typeof m.content === 'string'
      ? m.content
      : (m.content as IncomingPart[])
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join(' ');
    if (txt && /[Ⴀ-ჿ]/.test(txt)) return 'ka';
    if (txt) return 'en';
  }
  return 'ka';
}

// ─── 6. ROUTE HANDLER ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // API key guard — fail fast before reading body
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Request size guard — reject oversized bodies immediately
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Request body too large (max 512 KB)' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = (await req.json()) as { messages: IncomingMessage[] };
    const { messages = [] } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const modelMessages = toCoreMessages(messages);

    // Best-effort memory injection. Never blocks the chat — if the lookup
    // fails for any reason we fall back to the base system prompt.
    const memoryPreamble = await buildMemoryPreamble(req, messages);
    const effectiveSystem = memoryPreamble
      ? `${memoryPreamble}\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (text: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

        try {
          // ── Primary: Gemini 2.0 Flash ──────────────────────────────────────
          // Try Gemini models in order — fail fast (maxRetries:0) so the fallback
          // chain runs within the 60s Vercel timeout instead of burning it on retries.
          // gemini-2.5-flash has a separate quota bucket and is the most capable.
          const GEMINI_MODELS = [
            'gemini-2.5-flash',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash',
          ] as const;

          let geminiOk = false;
          for (const modelName of GEMINI_MODELS) {
            try {
              const google = getGeminiClient();
              const result = streamText({
                model: google(modelName),
                system: effectiveSystem,
                messages: modelMessages,
                maxOutputTokens: 4096,
                temperature: 0.7,
                maxRetries: 0, // fail instantly on quota/error — we rotate ourselves
              });
              let streamed = 0;
              for await (const chunk of result.textStream) {
                if (chunk) {
                  send(chunk);
                  streamed += chunk.length;
                }
              }
              // Gemini occasionally completes with zero text chunks (silent
              // safety pass-through, empty finish_reason, or quota throttling
              // that doesn't surface as an error). Treat that as a miss and
              // fall through to the next model / fallback.
              if (streamed === 0) {
                console.warn('[/api/chat/gemini]', modelName, 'returned 0 chars — rotating');
                continue;
              }
              geminiOk = true;
              break;
            } catch (geminiErr) {
              const kind = classifyError(geminiErr);
              if (kind === 'safety') {
                console.warn('[/api/chat/gemini] Safety block on', modelName);
                send(SAFETY_MESSAGE_KA + '\n\n' + SAFETY_MESSAGE_EN);
                return;
              }
              console.warn('[/api/chat/gemini]', modelName, kind, '— trying next model');
            }
          }

          if (!geminiOk) {
            // ── Fallback: Anthropic Claude Haiku ────────────────────────────
            console.error('[/api/chat/gemini] All Gemini models exhausted — falling back to Anthropic');
            try {
              const anthropic = getAnthropicClient();
              const fallback = streamText({
                model: anthropic('claude-haiku-4-5-20251001'),
                system: effectiveSystem,
                // Haiku doesn't support image URLs inline — strip to text-only
                messages: modelMessages.map(m => ({
                  role: m.role,
                  content: typeof m.content === 'string'
                    ? m.content
                    : (m.content as Array<TextContent | ImageContent>)
                        .filter((p): p is TextContent => p.type === 'text')
                        .map(p => p.text)
                        .join('\n') || '[image attached]',
                })),
                maxOutputTokens: 4096,
                temperature: 0.7,
                maxRetries: 1,
              });
              let streamed = 0;
              for await (const chunk of fallback.textStream) {
                if (chunk) {
                  send(chunk);
                  streamed += chunk.length;
                }
              }
              if (streamed === 0) {
                send(localeFromMessages(messages) === 'en' ? PROVIDERS_DOWN_EN : PROVIDERS_DOWN_KA);
              }
            } catch (anthropicErr) {
              console.error('[/api/chat/gemini] Anthropic fallback failed:', anthropicErr);
              send(localeFromMessages(messages) === 'en' ? PROVIDERS_DOWN_EN : PROVIDERS_DOWN_KA);
            }
          }

        } catch (err) {
          const msg = err instanceof Error ? err.message : 'AI service unavailable';
          console.error('[/api/chat/gemini] Unhandled error:', err);
          send(`⚠️ ${msg}`);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });

  } catch (error) {
    reportError(error, { route: '/api/chat/gemini', stage: 'request-parse' });
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
