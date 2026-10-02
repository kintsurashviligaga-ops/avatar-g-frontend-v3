/**
 * lib/studio/shootContext.ts — what the INTERIOR DESIGNER and the PHOTOGRAPHER add to an image request, resolved on the
 * SERVER from ids (the sibling of lib/studio/templateContext.ts, for the two tools that have a request of their own).
 *
 * The client names a style card, a room and four camera settings by id (lib/studio/shootWire.ts); everything that reaches
 * the paid prompt is looked up HERE, in tables that live only in server code (hence `server-only`). A client can choose
 * WHICH style, never what it says: an unknown id, a non-string, `constructor` or `__proto__` resolves to „nothing"
 * (the field is simply left out), and an unknown `kind` resolves the whole request to null — it renders as a plain image.
 *
 * ⚠️ THE ROOM MUST SURVIVE. A redesign that moves the windows or the fireplace is not a redesign of THIS room. With a
 * supplied photo the lead says, before anything else, which parts of the room are fixed (walls, windows, doors, ceiling,
 * built-ins, floor plan, proportions, viewpoint) and that only furnishings, materials, colour, light and decor change. The
 * Photographer does the same for identity: a product keeps its shape, colours and labels; a person keeps their face.
 * (/api/nanobanana/image skips its prompt-only Grok and FLUX fallbacks whenever a reference is present, so a miss refunds
 * instead of delivering an unrelated picture — and, for these two tools, refuses a reference it could not host.)
 *
 * The directive is split around the user's brief so the brief stays where the model weighs it:
 *   `lead`   — before the brief: the task, and what must stay identical;
 *   `suffix` — after the brief and the quality boost: the style / look, the camera, the realism;
 *   `avoid`  — merged into the route's „Do NOT include: …" clause.
 * Every string is capped here, at the source, so a future edit to a table cannot ship a paragraph into a paid prompt.
 *
 * Pure apart from the `server-only` marker: no env, no I/O. The text is English: every engine behind the route reads it.
 */
import 'server-only';
import { INTERIOR_TEMPLATES } from '@/lib/studio/templates.interior';
import { PHOTOSHOOT_TEMPLATES, type ShootSubject } from '@/lib/studio/templates.photoshoot';
import { TEMPLATE_ID_RX } from '@/lib/studio/templates';
import {
  ANGLE_IDS, DOF_IDS, LENS_IDS, LIGHT_IDS, ROOM_IDS, isOneOf,
  type AngleId, type DofId, type LensId, type LightId, type RoomId, type ShootKind,
} from '@/lib/studio/shootWire';

export const SHOOT_LEAD_MAX = 420;
export const SHOOT_SUFFIX_MAX = 760;
export const SHOOT_AVOID_MAX = 200;

// ─── Interior ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Each directive is DESCRIPTIVE and AFFIRMATIVE (a „no X" in a positive prompt reads as a request for X), and names the
// materials, furniture and light that make the style recognisable at a glance.

const INTERIOR_STYLE: Readonly<Record<string, { name: string; directive: string }>> = {
  scandinavian: {
    name: 'Scandinavian',
    directive: 'white and warm-grey walls, pale oak or ash flooring, light-wood furniture on slim legs, a linen or bouclé sofa, wool and sheepskin throws, a few green plants, simple paper and ceramic pendant lights, bright soft daylight, a calm hygge atmosphere',
  },
  modern: {
    name: 'Modern',
    directive: 'clean geometric lines, a neutral greige and charcoal palette, a low sectional sofa, a sculptural coffee table, matte black and brushed brass accents, large-format art, a statement floor lamp, recessed lighting, uncluttered surfaces',
  },
  minimalist: {
    name: 'Minimalist',
    directive: 'only a few essential furniture pieces, plain white walls, a monochrome white-grey-black palette with one natural accent, hidden storage, bare uncluttered surfaces, concealed lighting, generous empty floor, serene gallery-like calm',
  },
  japandi: {
    name: 'Japandi',
    directive: 'Japanese minimalism with Scandinavian warmth: low oak and walnut furniture, a woven rug, rice-paper lantern lights, a muted palette of oatmeal, clay and charcoal, a ceramic vase with bare branches, natural linen, shoji-inspired details, balanced and quiet',
  },
  loft: {
    name: 'Industrial loft',
    directive: 'exposed red brick and raw concrete, black steel-framed windows and shelving, a worn cognac leather sofa, reclaimed wood, Edison-bulb pendant lights, a metal-and-wood coffee table, tall ceilings, a warm urban atmosphere',
  },
  classic: {
    name: 'Classic',
    directive: 'wainscoting and crown mouldings, a symmetrical furniture layout, a tufted sofa and wingback chairs in rich fabric, a carved wood coffee table, a crystal chandelier, heavy drapes with tie-backs, a patterned wool rug, a warm cream and deep blue palette, timeless elegance',
  },
  'art-deco': {
    name: 'Art Deco',
    directive: 'bold geometric patterns, brass and gold inlays, deep emerald and navy velvet furniture, mirrored panels, fluted glass, a sunburst mirror, black lacquer and marble surfaces, a sculptural chandelier, 1920s glamour',
  },
  boho: {
    name: 'Bohemian',
    directive: 'layered kilim and Persian rugs, rattan and wicker furniture, macramé wall hangings, a low sofa with patterned cushions, many trailing plants, warm terracotta, mustard and sage tones, eclectic vintage finds, soft golden light',
  },
  mediterranean: {
    name: 'Mediterranean',
    directive: 'whitewashed rough-plaster walls, terracotta floor tiles, arched openings, dark timber beams, wrought-iron details, blue and ochre ceramics, linen curtains, olive-green accents, a warm sunlit villa atmosphere',
  },
  'georgian-traditional': {
    name: 'traditional Georgian',
    directive: 'carved dark walnut woodwork, arched niches, handwoven kilim and carpet textiles in deep red and indigo, a low wooden sofa with embroidered cushions, painted ceramics and clay qvevri vessels, warm timber and stone, brass and copper details, a cosy, hospitable atmosphere',
  },
  'mid-century': {
    name: 'mid-century modern',
    directive: 'walnut furniture with tapered legs, a low-slung sofa, a moulded lounge chair, a teak sideboard, a sunburst clock, a geometric rug, mustard and teal accents, globe pendant lights, 1960s optimism',
  },
  luxury: {
    name: 'luxury contemporary',
    directive: 'book-matched marble, brass and champagne-gold details, plush velvet and silk upholstery, a bespoke chandelier, high-gloss lacquer, layered ambient lighting, a rich neutral palette with deep jewel accents, a five-star hotel finish',
  },
};

/** The noun phrase after „a/an". `auto` is resolved against whether a photo was supplied (see composeInterior). */
const ROOM_NOUN: Readonly<Record<Exclude<RoomId, 'auto'>, string>> = {
  'living-room': 'living room',
  bedroom: 'bedroom',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  'dining-room': 'dining room',
  'home-office': 'home office',
  'kids-room': 'kids’ room',
  hallway: 'hallway',
  balcony: 'balcony',
};

// ─── Photoshoot ─────────────────────────────────────────────────────────────────────────────────────────────────

const PHOTOSHOOT_LOOK: Readonly<Record<string, { name: string; directive: string }>> = {
  'ecom-white': {
    name: 'e-commerce',
    directive: 'e-commerce product photography on a pure white seamless background, even soft shadowless studio light, a subtle natural contact shadow under the subject, the whole subject in frame and centred, crisp catalogue-ready detail',
  },
  lifestyle: {
    name: 'lifestyle',
    directive: 'lifestyle photography: the subject in a real, lived-in setting with natural window light, a warm authentic atmosphere, a candid composition, shallow depth of field, ready for social media',
  },
  'editorial-fashion': {
    name: 'editorial fashion',
    directive: 'a high-fashion editorial photograph: a striking pose, bold art direction, dramatic directional light, a seamless coloured or architectural backdrop, magazine-cover polish, a fine film-like grain',
  },
  'luxury-product': {
    name: 'luxury product',
    directive: 'luxury product campaign photography: a dark moody backdrop, a glossy reflective surface with a soft mirror reflection, dramatic rim light with a single soft key, rich contrast, a premium advertising look',
  },
  food: {
    name: 'food',
    directive: 'appetising food photography: fresh ingredients, natural side light, a hint of steam or droplets, shallow depth of field, rustic table styling, rich warm colour',
  },
  jewelry: {
    name: 'jewelry',
    directive: 'fine-jewelry macro photography: crisp facets and metal highlights, a dark velvet or polished stone surface, soft gradient reflections, controlled sparkle, extreme detail',
  },
  cosmetics: {
    name: 'cosmetics',
    directive: 'cosmetics and skincare product photography: a clean pastel gradient backdrop, water droplets or soft creamy textures, soft glowing light, a fresh dewy feel, minimal elegant styling',
  },
  headshot: {
    name: 'professional headshot',
    directive: 'a professional corporate headshot: a friendly confident expression, soft flattering studio light, a neutral blurred office or grey backdrop, smart business attire, sharp eyes',
  },
  'real-estate-exterior': {
    name: 'real-estate exterior',
    directive: 'real-estate exterior photography: the whole building in a wide, level view, a bright blue sky, golden-hour or soft daylight, manicured surroundings, straight vertical lines, sharp from front to back',
  },
  street: {
    name: 'street',
    directive: 'candid street photography: an urban setting, natural available light, a dynamic composition, subtle motion, cinematic city colours',
  },
  'studio-portrait': {
    name: 'studio portrait',
    directive: 'a classic studio portrait: a seamless dark-grey backdrop, Rembrandt key light with a soft fill, expressive eyes, natural skin texture, a timeless fine-art look',
  },
  'film-noir': {
    name: 'film noir',
    directive: 'a black-and-white film noir photograph: hard single-source light, deep chiaroscuro shadows, venetian-blind light patterns, a smoky atmosphere, high contrast, 1940s cinema grain',
  },
  'flat-lay': {
    name: 'flat-lay',
    directive: 'styled flat-lay photography: items arranged neatly on a textured surface seen from directly above, soft even daylight, complementary props and colour palette, balanced negative space',
  },
};

const LENS: Readonly<Record<LensId, string>> = {
  '24': 'shot on a 24mm wide-angle lens, an expansive field of view with slight perspective stretch',
  '35': 'shot on a 35mm lens, a natural reportage perspective',
  '50': 'shot on a 50mm lens, a natural human-eye perspective with true proportions',
  '85': 'shot on an 85mm portrait lens, flattering compression and smooth background separation',
};
const LIGHT: Readonly<Record<LightId, string>> = {
  window: 'soft window light from the side with gentle natural falloff',
  softbox: 'studio softbox lighting: a large diffused key light with controlled fill',
  golden: 'golden-hour sunlight: warm, low and backlit, with a soft glow',
  neon: 'coloured neon lighting: a vivid magenta and cyan glow with reflective highlights',
  flash: 'hard direct flash: crisp specular highlights and defined shadows, an editorial flash look',
};
const ANGLE: Readonly<Record<AngleId, string>> = {
  eye: 'an eye-level camera angle',
  low: 'a low camera angle looking up, a heroic perspective',
  top: 'a top-down overhead camera angle looking straight down',
};
const DOF: Readonly<Record<DofId, string>> = {
  shallow: 'shallow depth of field at f/1.8 with creamy background blur',
  medium: 'moderate depth of field at f/5.6, a sharp subject over a softly blurred background',
  deep: 'deep depth of field at f/11, sharp from foreground to background',
};

/** What must stay IDENTICAL when a reference photo of this kind of subject is supplied. */
const IDENTITY: Readonly<Record<ShootSubject, string>> = {
  product: 'the product’s exact shape, colours, materials, logos and labels',
  person: 'the person’s face, features, hair, skin tone and overall identity',
  place: 'the building’s exact architecture, proportions and materials',
  any: 'the subject’s exact identity, shape, colours and details',
};

// ─── Resolution ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ShootDirective {
  kind: ShootKind;
  /** Everything the directive depends on, as one short string — hashed into the route's in-flight mutex. */
  key: string;
  /** Sentence(s) placed BEFORE the user's brief: the task, and what must stay identical. */
  lead: string;
  /** Directives placed AFTER the brief and the quality boost: the style or look, the camera, the realism. */
  suffix: string;
  /** What to keep out of the picture — merged into the route's „Do NOT include: …" clause. */
  avoid: string;
  /** True when the directive was composed for an edit of a supplied photo. */
  fromPhoto: boolean;
}

const own = (table: Readonly<Record<string, unknown>>, id: string): boolean => Object.prototype.hasOwnProperty.call(table, id);
/** One line, bounded — a table entry is trusted text, but the cap is the contract, so it is enforced, not assumed. */
const bounded = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max).trim();
/** A well-formed wire id, or null. */
const wireId = (raw: unknown): string | null => (typeof raw === 'string' && TEMPLATE_ID_RX.test(raw) ? raw : null);
const article = (s: string) => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`;

export interface InteriorChoice { template?: unknown; room?: unknown }

/** The interior designer's directive from its (already-untrusted) choices. Unknown ids add nothing. */
export function composeInterior(c: InteriorChoice, ctx: { hasReference: boolean }): ShootDirective {
  const tid = wireId(c.template);
  const style = tid && own(INTERIOR_STYLE, tid) && INTERIOR_TEMPLATES.some((t) => t.id === tid) ? INTERIOR_STYLE[tid]! : null;
  const room: RoomId = isOneOf(ROOM_IDS, c.room) ? c.room : 'auto';
  // `auto` with a photo means the room the photo shows; with none it defaults to a living room (the most common ask).
  const noun = room !== 'auto' ? ROOM_NOUN[room] : ctx.hasReference ? null : ROOM_NOUN['living-room'];
  const styleLine = style ? `${style.name} style: ${style.directive}.` : 'A tasteful, cohesive, well-considered design.';
  const avoidBase = 'people, text, watermarks, logos, warped or distorted furniture';
  if (ctx.hasReference) {
    return {
      kind: 'interior',
      key: `interior|${style ? tid : '-'}|${room}|photo`,
      lead: bounded(
        `Interior redesign of the supplied photograph of ${noun ? article(noun) : 'the room'}. Keep the room’s architecture exactly as photographed: the same walls, windows and their positions, doors, ceiling height, fireplace and built-in features, floor plan, proportions and camera viewpoint. Change only the furniture, materials, colours, lighting and decor.`,
        SHOOT_LEAD_MAX,
      ),
      suffix: bounded(`${styleLine} Photorealistic interior photography, natural light, true-to-life materials, realistic scale and perspective, sharp focus, magazine quality.`, SHOOT_SUFFIX_MAX),
      avoid: bounded(`${avoidBase}, extra or missing windows`, SHOOT_AVOID_MAX),
      fromPhoto: true,
    };
  }
  return {
    kind: 'interior',
    key: `interior|${style ? tid : '-'}|${room}|new`,
    lead: bounded(`Photorealistic interior-design photograph of ${article(noun ?? 'living room')}.`, SHOOT_LEAD_MAX),
    suffix: bounded(`${styleLine} Wide-angle architectural photography, natural daylight, realistic scale and perspective, a coherent furniture layout, sharp focus, magazine quality.`, SHOOT_SUFFIX_MAX),
    avoid: bounded(avoidBase, SHOOT_AVOID_MAX),
    fromPhoto: false,
  };
}

export interface PhotoshootChoice { template?: unknown; lens?: unknown; light?: unknown; angle?: unknown; dof?: unknown }

/** The photographer's directive from its (already-untrusted) choices. Unknown ids add nothing. */
export function composePhotoshoot(c: PhotoshootChoice, ctx: { hasReference: boolean }): ShootDirective {
  const tid = wireId(c.template);
  const card = tid ? PHOTOSHOOT_TEMPLATES.find((t) => t.id === tid) : undefined;
  const look = tid && card && own(PHOTOSHOOT_LOOK, tid) ? PHOTOSHOOT_LOOK[tid]! : null;
  const lens = isOneOf(LENS_IDS, c.lens) ? c.lens : null;
  const light = isOneOf(LIGHT_IDS, c.light) ? c.light : null;
  const angle = isOneOf(ANGLE_IDS, c.angle) ? c.angle : null;
  const dof = isOneOf(DOF_IDS, c.dof) ? c.dof : null;
  const camera = [lens && LENS[lens], light && LIGHT[light], angle && ANGLE[angle], dof && DOF[dof]].filter((s): s is string => !!s);
  const name = look?.name ?? 'studio';
  const lead = ctx.hasReference
    ? `Professional ${name} photoshoot of the exact subject in the supplied reference photo. Keep ${IDENTITY[card?.subject ?? 'any']} identical to the reference.`
    : `Professional ${name} photograph.`;
  const parts = [look ? `${look.directive}.` : '', camera.length ? `${camera.join(', ')}.` : '', 'High-end photography, sharp focus, true-to-life colour.'];
  return {
    kind: 'photoshoot',
    key: `photoshoot|${look ? tid : '-'}|${lens ?? '-'}|${light ?? '-'}|${angle ?? '-'}|${dof ?? '-'}|${ctx.hasReference ? 'photo' : 'new'}`,
    lead: bounded(lead, SHOOT_LEAD_MAX),
    suffix: bounded(parts.filter(Boolean).join(' '), SHOOT_SUFFIX_MAX),
    avoid: bounded('text, watermarks, logos that are not on the subject, distorted anatomy, extra fingers, duplicated objects', SHOOT_AVOID_MAX),
    fromPhoto: ctx.hasReference,
  };
}

/**
 * The directive for a request body's `studio` field (any shape — it is a client value), or null when it names no known
 * tool. The route calls this once, after it has parsed the body; null leaves the request exactly as the controls say.
 */
export function resolveShootDirective(raw: unknown, ctx: { hasReference: boolean }): ShootDirective | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'interior') return composeInterior(r, ctx);
  if (r.kind === 'photoshoot') return composePhotoshoot(r, ctx);
  return null;
}

/** Every style / preset id that has a directive here — for the parity test with the client's cards. */
export const SHOOT_CONTEXT_IDS: Readonly<Record<ShootKind, readonly string[]>> = {
  interior: Object.keys(INTERIOR_STYLE),
  photoshoot: Object.keys(PHOTOSHOOT_LOOK),
};
