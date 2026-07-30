/**
 * lib/services/presentation/deckPipeline.ts — outline → visuals → rasterised slides.
 *
 *   1 outline  Gemini via llmText, with a deterministic fallback (never fails the job)
 *   2 visuals  optional Imagen 4 per slide, gated on the provider actually being configured
 *   3 render   SVG → PNG via resvg with the bundled FiraGO fonts → hosted
 *
 * WHY PNG AND NOT SERVER-SIDE PDF: pdfkit is not in `serverComponentsExternalPackages` and has no file
 * tracing entry, while it reads `.afm` metrics off disk relative to __dirname — the classic silent ENOENT
 * in a Vercel lambda. Both existing pdfkit generators here also write Georgian through Helvetica, which
 * drops Mkhedruli entirely. So the server produces PNG slides (guaranteed Georgian, portable, zippable)
 * and the browser handles PDF via print, where the user's own renderer does the work.
 *
 * DEGRADATION IS THE DESIGN: no Imagen key → a text-only typographic deck, which is a perfectly good
 * deliverable. No LLM → the deterministic skeleton. Only a failure to rasterise ANY slide fails the job.
 */
import 'server-only';
import { Resvg } from '@resvg/resvg-js';
import { generateImagenImages, mapImagenAspect, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { overlayFontFiles } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { updateJobStage } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';
import { generateOutline } from './deckOutline';
import { buildSlideSvg, buildCoverSvg } from './slideSvg';
import { SLIDE_W, SLIDE_H, type Deck, type DeckRequest, type Slide } from './deckPlan';

const WEEK_SEC = 604_800;

export type DeckStep = 'outline' | 'visuals' | 'render';

const PCT: Record<DeckStep, number> = { outline: 18, visuals: 62, render: 94 };

export interface RenderedSlide {
  index: number;
  title: string;
  bullets: string[];
  notes?: string;
  /** Hosted PNG of the fully composed slide. */
  pngUrl: string;
  /** Hosted visual for this slide, when imagery was on and it succeeded. */
  imageUrl?: string;
}

export interface DeckResult {
  deck: Deck;
  slides: RenderedSlide[];
  coverUrl: string | null;
  usedFallbackOutline: boolean;
  /** Slides that asked for a visual and did not get one. */
  imagesMissing: number;
  imagesRequested: boolean;
  stepsRun: DeckStep[];
}

export type DeckOutcome =
  | { ok: true; result: DeckResult }
  | { ok: false; step: DeckStep; error: string };

async function stage(jobId: string | null, step: DeckStep): Promise<void> {
  if (!jobId) return;
  await updateJobStage(jobId, step, PCT[step]).catch(() => {});
}

/** SVG → PNG with the bundled Georgian fonts. Null on any resvg failure (bad markup, OOM). */
function rasterize(svg: string): Buffer | null {
  try {
    const resvg = new Resvg(svg, {
      // loadSystemFonts:false + explicit fontFiles is the ONLY combination that renders Mkhedruli here.
      font: { fontFiles: overlayFontFiles(), loadSystemFonts: false, defaultFontFamily: 'FiraGO' },
      fitTo: { mode: 'width', value: SLIDE_W },
    });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    console.warn('[deck/rasterize] failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function hostPng(buf: Buffer, tag: string): Promise<string | null> {
  return uploadBufferAndSign(
    'renders',
    `decks/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
    buf,
    'image/png',
    WEEK_SEC,
  );
}

export async function runDeckBuild(
  req: DeckRequest,
  opts: { jobId?: string | null } = {},
): Promise<DeckOutcome> {
  const jobId = opts.jobId ?? null;
  const stepsRun: DeckStep[] = [];

  try {
    // ── LEG 1 · outline ────────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'outline');
    const { slides: outline, usedFallback } = await generateOutline(req);
    if (!outline.length) return { ok: false, step: 'outline', error: 'no outline could be produced' };
    stepsRun.push('outline');

    // ── LEG 2 · visuals ────────────────────────────────────────────────────────────────────────────
    const wantImages = req.withImages && hasGeminiImagenProvider();
    let imagesMissing = 0;
    const slides: Slide[] = outline.map((s) => ({ ...s }));

    if (wantImages) {
      await stage(jobId, 'visuals');
      for (let i = 0; i < slides.length; i += 1) {
        const slide = slides[i];
        if (!slide) continue;
        // Fall back to the title when the model gave no imagePrompt — better than skipping the visual.
        const prompt = slide.imagePrompt || slide.title;
        if (!prompt) { imagesMissing += 1; continue; }
        const images = await generateImagenImages({
          prompt: `${prompt}. Clean editorial illustration, no text, no words, no letters.`,
          aspectRatio: mapImagenAspect('16:9'),
          numberOfImages: 1,
        }).catch(() => null);
        const first = images?.[0];
        if (!first) { imagesMissing += 1; continue; }
        const url = await hostPng(first.buffer, `img-${i}`).catch(() => null);
        if (url) slide.imageUrl = url; else imagesMissing += 1;
      }
      stepsRun.push('visuals');
    } else if (req.withImages) {
      // Asked for, but the provider is not configured — count them all so the caller can say so.
      imagesMissing = slides.length;
    }

    // ── LEG 3 · render ─────────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'render');
    const title = slides[0]?.title || req.topic;
    const coverBuf = rasterize(buildCoverSvg(title, req.topic, req.theme));
    const coverUrl = coverBuf ? await hostPng(coverBuf, 'cover').catch(() => null) : null;

    const rendered: RenderedSlide[] = [];
    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      if (!slide) continue;
      const svg = buildSlideSvg(slide, {
        theme: req.theme,
        pageNumber: i + 1,
        totalPages: slides.length,
        hasImage: Boolean(slide.imageUrl),
      });
      const png = rasterize(svg);
      if (!png) continue;
      const pngUrl = await hostPng(png, `slide-${i + 1}`).catch(() => null);
      if (!pngUrl) continue;
      rendered.push({
        index: i + 1,
        title: slide.title,
        bullets: slide.bullets,
        ...(slide.notes ? { notes: slide.notes } : {}),
        pngUrl,
        ...(slide.imageUrl ? { imageUrl: slide.imageUrl } : {}),
      });
    }
    // Text and structure survive even if rasterisation fails wholesale, but a deck with zero rendered
    // slides is not a deliverable — fail rather than hand back an empty viewer.
    if (!rendered.length) return { ok: false, step: 'render', error: 'no slides could be rendered' };
    stepsRun.push('render');

    return {
      ok: true,
      result: {
        deck: { title, subtitle: req.topic, slides, language: req.language, theme: req.theme },
        slides: rendered,
        coverUrl,
        usedFallbackOutline: usedFallback,
        imagesMissing,
        imagesRequested: req.withImages,
        stepsRun,
      },
    };
  } catch (err) {
    reportError(err, { where: 'deckPipeline.run' });
    const last = stepsRun[stepsRun.length - 1] ?? 'outline';
    return { ok: false, step: last, error: err instanceof Error ? err.message : 'deck build failed' };
  }
}

/** Exported for the route's response typing. */
export type { Deck, DeckRequest };
export { SLIDE_W, SLIDE_H };
