/**
 * lib/services/presentation/deckOutline.ts — deck outline generation (Gemini-first via llmText).
 *
 * ⚠️ NOT wrapped in `guardedCall`. `llmText` already books its own spend against the platform budget
 * internally; wrapping it would charge the $300 envelope twice for one call.
 *
 * There is no `responseSchema`-constrained generation anywhere in this repo, so this follows the existing
 * pattern from lib/ads/adScriptAgent.ts: instruct the shape in the prompt → strip fences → parse
 * defensively → one retry → fall back to a deterministic outline. Never throws.
 */
import { llmText } from '@/lib/ai/llmText';
import {
  normalizeSlides,
  fallbackOutline,
  MAX_BULLETS_PER_SLIDE,
  MAX_BULLET_CHARS,
  type DeckRequest,
  type Slide,
} from './deckPlan';

const LANGUAGE_NAME: Record<DeckRequest['language'], string> = {
  ka: 'Georgian (ქართული)',
  en: 'English',
  ru: 'Russian (русский)',
};

/**
 * Pull the first JSON array out of a model response. Models wrap JSON in ```json fences, prose, or both.
 * Exported because this is where a malformed response becomes a blank deck, so it is worth pinning down.
 */
export function extractJsonArray(raw: string): unknown {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  // Strip a fenced block first — its contents are the intended payload.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1]?.trim() || text;

  const direct = tryParse(body);
  if (Array.isArray(direct)) return direct;
  // Some responses are an object wrapping the array.
  if (direct && typeof direct === 'object') {
    const o = direct as Record<string, unknown>;
    for (const key of ['slides', 'deck', 'items', 'data']) {
      if (Array.isArray(o[key])) return o[key];
    }
  }
  // Last resort: the first bracketed span in the text.
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start >= 0 && end > start) {
    const span = tryParse(body.slice(start, end + 1));
    if (Array.isArray(span)) return span;
  }
  return null;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function buildPrompt(req: DeckRequest): { system: string; user: string } {
  const lang = LANGUAGE_NAME[req.language];
  const system = [
    `You write presentation decks. Write ENTIRELY in ${lang} — every title, every bullet, every note.`,
    '',
    'Return ONLY a JSON array. No prose before or after, no markdown fence.',
    'Each element: {"title": string, "bullets": string[], "imagePrompt": string, "notes": string}',
    '',
    'RULES',
    `- Exactly ${req.slideCount} elements.`,
    `- 2 to ${MAX_BULLETS_PER_SLIDE} bullets per slide, each under ${MAX_BULLET_CHARS} characters.`,
    '- Bullets are SPOKEN POINTS, not paragraphs. No leading dashes or numbers — the template draws those.',
    `- "imagePrompt" is a short ENGLISH visual description for an image generator, even though the deck is in ${lang}. No text in the image.`,
    '- "notes" is one or two sentences the presenter would say.',
    '- The first slide introduces the topic; the last one concludes it.',
  ].join('\n');

  const user = [
    `Topic: ${req.topic}`,
    req.audience ? `Audience: ${req.audience}` : '',
    `Slides: ${req.slideCount}`,
  ].filter(Boolean).join('\n');

  return { system, user };
}

export interface OutlineResult {
  slides: Slide[];
  /** True when the model chain produced nothing usable and the deterministic skeleton was used instead. */
  usedFallback: boolean;
}

export async function generateOutline(req: DeckRequest): Promise<OutlineResult> {
  const { system, user } = buildPrompt(req);
  // ~160 tokens per slide of JSON, plus headroom for Georgian (which is token-expensive).
  const maxTokens = Math.min(8000, req.slideCount * 220 + 600);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await llmText({
      system: attempt === 0 ? system : `${system}\n\nYour previous reply was not valid JSON. Return ONLY the array.`,
      user,
      geminiFirst: true,
      maxTokens,
      timeoutMs: 90_000,
    });
    if (!raw) continue;
    const slides = normalizeSlides(extractJsonArray(raw), req.slideCount);
    // A deck that came back mostly empty is a parse failure wearing a costume — retry, then fall back.
    if (slides.length >= Math.min(req.slideCount, 2)) {
      return { slides, usedFallback: false };
    }
  }

  return { slides: fallbackOutline(req), usedFallback: true };
}
