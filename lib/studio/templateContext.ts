/**
 * lib/studio/templateContext.ts — what a TEMPLATE CARD adds to a generation, resolved on the SERVER from its id.
 *
 * Owner decision 2026-10-01 (A-a): a card may add a style context beyond the panel's own controls, provided the card
 * says so („Adds: …", lib/studio/templates.ts). This module is the only place those context strings exist.
 *
 * ⚠️ THE CLIENT SENDS AN ID, NEVER TEXT. A request carries `templateId`; everything that reaches a prompt is looked
 * up here, from tables that never ship to the browser (hence `server-only`). An id is honoured only when:
 *   1. it is a well-formed wire id (TEMPLATE_ID_RX) that names a real card of THAT tool, looked up as an OWN key
 *      ('constructor' is a well-formed id and a plain `table[id]` would "find" Object's constructor);
 *   2. the request's own values still select that card: image and music re-run `match*Template` on what the route
 *      actually received; video checks the style and the music-video mode (the two a storyboard request and a render
 *      both carry; their lengths and orientations are expressed differently, so those are not compared).
 * So a stale id (the user edited a field after picking the card), a tampered id, or one borrowed from another card
 * (`anime` sent with style `Photorealistic`) resolves to null and the request renders exactly as the controls say.
 *
 * Every string is capped (image suffix 200, music descriptor 160, film look 160, director note 400) — at the source
 * and again here, so a future edit to a table cannot ship a paragraph into a paid prompt.
 *
 * Avatar (presenter) cards resolve nothing (decision A-f). Pure apart from the `server-only` marker: no env, no I/O.
 */
import 'server-only';
import {
  IMAGE_TEMPLATES, MUSIC_TEMPLATES, TEMPLATE_ID_RX, VIDEO_TEMPLATES, matchImageTemplate, matchMusicTemplate,
  type ImageMatchInput, type MusicMatchInput, type TemplateTool,
} from '@/lib/studio/templates';

export const IMAGE_SUFFIX_MAX = 200;
export const MUSIC_DESCRIPTOR_MAX = 160;
export const VIDEO_LOOK_MAX = 160;
export const DIRECTOR_NOTE_MAX = 400;

// ─── The context tables (English: every engine behind these routes reads English) ─────────────────────────────
// Keep each line descriptive and AFFIRMATIVE. A film look lands in the positive prompt, where "no X" reads as a
// request for X (see lib/chat/filmPipeline FILM_DRIFT_NEGATIVE), and it must not name anything the drift negative
// suppresses (a test checks every look against the negative it will render beside).

const IMAGE_SUFFIX: Readonly<Record<string, string>> = {
  product: 'clean seamless studio backdrop, soft diffused key light, the product centred in crisp focus, subtle floor reflection, commercial catalogue photography',
  social: 'bright natural light, lifestyle feel, a bold uncluttered composition that reads at a glance, vibrant true-to-life colour',
  poster: 'movie-poster key art, one bold focal subject, dramatic depth and scale, generous negative space in the upper third',
  wallpaper: 'expansive panoramic vista, rich atmospheric depth, a calm uncluttered centre, balanced edge-to-edge composition',
  concept: 'environment concept art, epic sense of scale, layered foreground, midground and background, production-design detail',
  anime: 'anime key visual, expressive characters, dynamic composition, luminous sky gradients, crisp cel highlights',
  'oil-painting': 'museum-grade oil on canvas, thick impasto brushwork, rich glazes, warm gallery lighting',
  '3d-render': 'soft global illumination, smooth pastel studio backdrop, gentle contact shadows, clean product-visualisation finish',
};

const MUSIC_DESCRIPTOR: Readonly<Record<string, string>> = {
  'hollywood-cinematic': 'Sweeping orchestral film score: lush strings, bold brass and timpani, a slow build to an epic climax',
  'rnb-beat': 'Smooth R&B groove: warm Rhodes chords, deep 808 bass, crisp finger snaps, laid-back swing',
  'rnb-hiphop-core': 'Modern hip-hop and R&B: punchy drums, rolling hi-hats, a catchy melodic hook',
  'georgian-folk': 'Georgian polyphonic folk: three-part choral harmony behind the lead voice, panduri and chonguri strings, a warm feast-table feel',
  'lofi-chill': 'Dusty lo-fi hip-hop: vinyl crackle, mellow jazz chords, soft boom-bap drums, a relaxed late-night mood',
  'electronic-cyber': 'Driving cyberpunk electronica: arpeggiated analogue synths, pulsing sidechained bass, four-on-the-floor drums',
  'retro-jazz-lounge': 'Smoky 1950s jazz lounge: upright bass, brushed drums, muted trumpet, an intimate late-night club feel',
  'documentary-ambient': 'Understated documentary ambient: slowly evolving pads, sparse felt piano, a calm reflective space',
};

const VIDEO_CONTEXT: Readonly<Record<string, { look: string; note: string }>> = {
  reel: {
    look: 'a punchy cinematic vertical-reel look with shallow depth of field, rich contrast and the subject framed centre for a phone screen',
    note: 'Open on the strongest image within the first second. Keep every shot simple and readable on a phone, and end on a clean, memorable final frame.',
  },
  trailer: {
    look: 'an epic movie-trailer look with anamorphic widescreen framing, high-contrast dramatic lighting, deep shadows and sweeping scale',
    note: 'Structure it like a trailer: a quiet setup, stakes rising shot by shot, and a climactic final image. Favour bold, iconic compositions.',
  },
  teaser: {
    look: 'a striking single-shot teaser look with a bold composition, cinematic lighting and one clear focal subject',
    note: 'One shot carries the whole idea: make it the most arresting image of the concept, with a clear subject and one deliberate camera move.',
  },
  anime: {
    look: 'a hand-drawn anime look with cel shading, clean line art, vivid flat colour, expressive faces and painterly skies',
    note: 'Direct it like an anime opening sequence: expressive character moments, dynamic angles and painterly backgrounds. Keep the character design identical in every shot.',
  },
  'neon-nights': {
    look: 'a neon-lit city at night with magenta and cyan signage, wet reflective streets, deep blue shadows and a moody atmosphere',
    note: 'Let the city be a character: reflections, rain and passing light. Hold the palette to magenta, cyan and deep blue throughout.',
  },
  'nature-doc': {
    look: 'a natural-history documentary look with natural light, long-lens wildlife framing, rich organic colour and sweeping landscapes',
    note: 'Shoot it like a nature documentary: patient observational shots, a wide establishing landscape first, then closer details of the life within it.',
  },
  noir: {
    look: 'a black-and-white film noir look with hard chiaroscuro key light, deep shadows, venetian-blind light patterns and a smoky 1940s mood',
    note: 'Direct it as classic noir: low-key lighting, silhouettes, rain-slick streets and tense close-ups, every frame in black and white.',
  },
  'music-video': {
    look: 'a music-video look with neon stage light, haze and moving beams, high-energy framing on the performer and bold saturated colour',
    note: 'Cut on the beat: alternate wide performance shots with close-ups of the singer, and keep the energy rising toward the final chorus.',
  },
};

// ─── Resolution ─────────────────────────────────────────────────────────────────────────────────────────

export interface ImageTemplateContext { tool: 'image'; id: string; suffix: string }
export interface MusicTemplateContext { tool: 'music'; id: string; descriptor: string }
export interface VideoTemplateContext { tool: 'video'; id: string; look: string; directorNote: string }
export type TemplateContext = ImageTemplateContext | MusicTemplateContext | VideoTemplateContext;

/** What a film request can vouch for: its style label and whether it is a music video. */
export interface VideoMatchInput { style: string | null | undefined; musicVideoMode: boolean }

const own = (table: Readonly<Record<string, unknown>>, id: string): boolean => Object.prototype.hasOwnProperty.call(table, id);

/** One line, bounded — a table entry is trusted text, but the cap is the contract, so it is enforced, not assumed. */
const bounded = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max).trim();

/** A well-formed wire id, or null. Non-strings, blanks and anything outside [a-z0-9-]{1,40} are not ids. */
function wireId(raw: unknown): string | null {
  return typeof raw === 'string' && TEMPLATE_ID_RX.test(raw) ? raw : null;
}

export function resolveTemplateContext(tool: 'image', rawId: unknown, values: ImageMatchInput): ImageTemplateContext | null;
export function resolveTemplateContext(tool: 'music', rawId: unknown, values: MusicMatchInput): MusicTemplateContext | null;
export function resolveTemplateContext(tool: 'video', rawId: unknown, values: VideoMatchInput): VideoTemplateContext | null;
export function resolveTemplateContext(tool: 'avatar', rawId: unknown, values?: unknown): null;
export function resolveTemplateContext(tool: TemplateTool, rawId: unknown, values?: unknown): TemplateContext | null {
  const id = wireId(rawId);
  if (!id) return null;
  switch (tool) {
    case 'image': {
      if (!own(IMAGE_SUFFIX, id) || !IMAGE_TEMPLATES.some((t) => t.id === id)) return null;
      if (matchImageTemplate(values as ImageMatchInput) !== id) return null;
      const suffix = bounded(IMAGE_SUFFIX[id]!, IMAGE_SUFFIX_MAX);
      return suffix ? { tool: 'image', id, suffix } : null;
    }
    case 'music': {
      if (!own(MUSIC_DESCRIPTOR, id) || !MUSIC_TEMPLATES.some((t) => t.id === id)) return null;
      if (matchMusicTemplate(values as MusicMatchInput) !== id) return null;
      const descriptor = bounded(MUSIC_DESCRIPTOR[id]!, MUSIC_DESCRIPTOR_MAX);
      return descriptor ? { tool: 'music', id, descriptor } : null;
    }
    case 'video': {
      if (!own(VIDEO_CONTEXT, id)) return null;
      const card = VIDEO_TEMPLATES.find((t) => t.id === id);
      const v = values as VideoMatchInput | undefined;
      if (!card || !v || card.values.style !== v.style) return null;
      if ((card.values.mode === 'musicvideo') !== (v.musicVideoMode === true)) return null;
      const ctx = VIDEO_CONTEXT[id]!;
      const look = bounded(ctx.look, VIDEO_LOOK_MAX);
      return look ? { tool: 'video', id, look, directorNote: bounded(ctx.note, DIRECTOR_NOTE_MAX) } : null;
    }
    default:
      // Presenters add nothing (decision A-f): the face, voice and format ARE the template.
      return null;
  }
}

/**
 * The film template for a STORYBOARD request body and for a RENDER's metadata: one function on both sides, so the
 * board the user approves and the film they pay for are planned with the same look. Each caller passes the style
 * and mode it actually renders with (the storyboard's cleaned `style`; filmComposite's resolved `style`).
 */
export function resolveFilmTemplate(src: { templateId?: unknown; style: string | null | undefined; musicVideoMode: boolean }): VideoTemplateContext | null {
  return resolveTemplateContext('video', src.templateId, { style: src.style, musicVideoMode: src.musicVideoMode });
}

/** Every card id that resolves a context, per tool — for the parity test with the client's „Adds: …" copy. */
export const TEMPLATE_CONTEXT_IDS: Readonly<Record<'image' | 'music' | 'video', readonly string[]>> = {
  image: Object.keys(IMAGE_SUFFIX),
  music: Object.keys(MUSIC_DESCRIPTOR),
  video: Object.keys(VIDEO_CONTEXT),
};
