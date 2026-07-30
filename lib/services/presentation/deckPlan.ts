/**
 * lib/services/presentation/deckPlan.ts — the pure core of the Presentation studio.
 *
 * PURE + TOTAL: no imports, no I/O, never throws.
 *
 * The interesting part here is `wrapText`. resvg does NO text layout — an SVG `<text>` element renders on
 * one line and runs straight off the canvas. Nothing in this repo wraps body text (the closest thing,
 * `splitIntoSubtitleLines`, is a ≤3-word subtitle splitter for burned captions). So a real wrapper had to
 * exist for slide bullets to be legible, and it has to work for Georgian, which has no capital letters and
 * whose glyphs are wider than Latin at the same point size.
 */

export type DeckLanguage = 'ka' | 'en' | 'ru';
export type DeckTheme = 'dark' | 'light';

export interface Slide {
  title: string;
  bullets: string[];
  /** Prompt used to generate this slide's visual, when imagery is on. */
  imagePrompt?: string;
  /** Hosted URL of the generated visual, filled in by the pipeline. */
  imageUrl?: string;
  /** Speaker notes — shown under the slide in the deck view, hidden in print. */
  notes?: string;
}

export interface Deck {
  title: string;
  subtitle: string;
  slides: Slide[];
  language: DeckLanguage;
  theme: DeckTheme;
}

export interface DeckRequest {
  topic: string;
  slideCount: number;
  language: DeckLanguage;
  theme: DeckTheme;
  /** Generate a visual per slide. Costs one Imagen call each, so it is opt-in. */
  withImages: boolean;
  /** Extra steer: audience, tone, what to emphasise. */
  audience?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  request?: DeckRequest;
}

/**
 * Slide cap. Sized against the IMAGE FAN-OUT, not the text: with imagery on, each slide is one Imagen
 * call, and the route's budget has to cover all of them sequentially plus the outline.
 */
export const MAX_SLIDES = 12;
export const MIN_SLIDES = 3;
export const DEFAULT_SLIDES = 8;

export const MAX_BULLETS_PER_SLIDE = 5;
export const MAX_BULLET_CHARS = 140;
export const MAX_TITLE_CHARS = 80;
export const MAX_TOPIC_CHARS = 600;

/** 16:9 at a size that rasterises crisply without being a memory problem. */
export const SLIDE_W = 1600;
export const SLIDE_H = 900;

export function isDeckLanguage(v: unknown): v is DeckLanguage {
  return v === 'ka' || v === 'en' || v === 'ru';
}

/**
 * Advance width of one character, in multiples of the font size.
 *
 * This is a DELIBERATE APPROXIMATION, not a font metric — resvg does the real shaping, and we only need
 * to know where to break. Georgian (Mkhedruli, U+10D0–U+10FF) is noticeably wider than Latin at the same
 * size, and CJK is full-width; treating everything as Latin would let Georgian bullets overrun the slide,
 * which is the exact failure this function exists to prevent.
 */
function charWidthRatio(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x10a0 && c <= 0x10ff) return 0.58;                       // Georgian
  if (c >= 0x0400 && c <= 0x04ff) return 0.54;                       // Cyrillic
  if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) return 1.0; // CJK/Kana
  if (ch === ' ') return 0.26;
  if ('iljtfr.,:;\'"|!'.includes(ch)) return 0.28;                   // narrow Latin
  if ('mwMW@'.includes(ch)) return 0.86;                             // wide Latin
  if (ch >= 'A' && ch <= 'Z') return 0.62;
  return 0.52;
}

/** Approximate rendered width of a string at `fontSize`, in pixels. */
export function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidthRatio(ch) * fontSize;
  return w;
}

/**
 * Break `text` into lines that fit `maxWidth` at `fontSize`.
 *
 * Breaks on spaces where possible. A single word longer than the line (a URL, a long Georgian compound)
 * is HARD-SPLIT rather than allowed to overflow — an unbreakable word silently running off the slide is
 * the failure mode this replaces. `maxLines` truncates with an ellipsis so a runaway bullet cannot push
 * the rest of the slide off the canvas.
 */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines = 4): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean || !(maxWidth > 0) || !(fontSize > 0)) return [];

  const lines: string[] = [];
  let line = '';

  const pushLine = () => {
    if (line) lines.push(line);
    line = '';
  };

  for (const word of clean.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (measureText(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    pushLine();
    // The word alone still does not fit — hard-split it across lines.
    if (measureText(word, fontSize) > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        if (measureText(chunk + ch, fontSize) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
    if (lines.length >= maxLines) break;
  }
  pushLine();

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  if (last) kept[maxLines - 1] = `${last.replace(/[\s.,;:]+$/, '')}…`;
  return kept;
}

/** Trim + bound one bullet. */
function cleanBullet(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    // Models love to re-add the bullet glyph the template already draws.
    .replace(/^[-–—•*·\d.)\]\s]+/, '')
    .trim()
    .slice(0, MAX_BULLET_CHARS);
}

/**
 * Coerce whatever the model returned into a valid Deck. TOTAL: every branch produces a usable deck or
 * reports why, because an outline that half-parses would otherwise render as blank slides.
 */
export function normalizeSlides(raw: unknown, wanted: number): Slide[] {
  if (!Array.isArray(raw)) return [];
  const out: Slide[] = [];
  for (const item of raw) {
    if (out.length >= wanted) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const title = String(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
    const bullets = (Array.isArray(r.bullets) ? r.bullets : [])
      .map(cleanBullet)
      .filter(Boolean)
      .slice(0, MAX_BULLETS_PER_SLIDE);
    // A slide with neither a title nor a single bullet renders as an empty rectangle — drop it.
    if (!title && !bullets.length) continue;
    const imagePrompt = typeof r.imagePrompt === 'string' ? r.imagePrompt.trim().slice(0, 400) : '';
    const notes = typeof r.notes === 'string' ? r.notes.trim().slice(0, 600) : '';
    out.push({
      title: title || bullets[0] || '',
      bullets,
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out;
}

export function validateDeckRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;

  const topic = String(b.topic ?? '').replace(/\s+/g, ' ').trim();
  if (topic.length < 3) return { ok: false, error: 'topic is too short' };
  if (topic.length > MAX_TOPIC_CHARS) return { ok: false, error: `topic must be under ${MAX_TOPIC_CHARS} characters` };

  const countRaw = Number(b.slideCount);
  const slideCount = Number.isFinite(countRaw)
    ? Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(countRaw)))
    : DEFAULT_SLIDES;

  const audience = String(b.audience ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

  return {
    ok: true,
    request: {
      topic,
      slideCount,
      language: isDeckLanguage(b.language) ? b.language : 'ka',
      theme: b.theme === 'light' ? 'light' : 'dark',
      withImages: b.withImages === true,
      ...(audience ? { audience } : {}),
    },
  };
}

/** Billing units are 'decks' — one build is one deck, regardless of slide count. */
export function deckUnits(): number {
  return 1;
}

/**
 * A deterministic outline, used when the model chain returns nothing.
 *
 * This matters more than it looks: `llmText` returns null both when a provider misses AND when the budget
 * guard refuses the call — indistinguishable from the caller. Erroring there would turn a budget ceiling
 * into a broken service, so the deck degrades to a structured skeleton the user can edit instead.
 */
export function fallbackOutline(req: DeckRequest): Slide[] {
  const T: Record<DeckLanguage, { intro: string; body: string; close: string; point: string }> = {
    ka: { intro: 'შესავალი', body: 'ძირითადი ნაწილი', close: 'დასკვნა', point: 'ძირითადი აზრი' },
    en: { intro: 'Introduction', body: 'Main section', close: 'Conclusion', point: 'Key point' },
    ru: { intro: 'Введение', body: 'Основная часть', close: 'Заключение', point: 'Ключевая мысль' },
  };
  const t = T[req.language];
  const slides: Slide[] = [{ title: t.intro, bullets: [req.topic] }];
  for (let i = 1; i < req.slideCount - 1; i += 1) {
    slides.push({ title: `${t.body} ${i}`, bullets: [`${t.point} ${i}`] });
  }
  if (req.slideCount > 1) slides.push({ title: t.close, bullets: [req.topic] });
  return slides.slice(0, req.slideCount);
}
