/**
 * THE list of models a user can choose, per service — one entry per choice, whatever runs it. Every model picker reads it
 * (components/studio/ui/ModelPicker): the Image and Video Create panels, Studio β, and the routes that must refuse a pick.
 *
 * Why a second module beside lib/providers/registry.ts: the registry says HOW to run a Higgsfield model (endpoint, zod schema,
 * fallback, timeout) and is server-side weight; this says WHAT a person is choosing (name, one line on what it is for, a
 * speed/quality badge, what it can do, which request carries it) and is isomorphic — the picker renders from it before any
 * request returns. The registry takes its Higgsfield labels FROM here, so there is still one list of names.
 *
 * ⚠️ NOTHING HERE IS A PRICE. The price is the server's quote for the model id the request carries (POST /api/quote); a
 * picker that printed its own number would be a second price that can drift from the one charged.
 *
 * ⚠️ NOTHING HERE IS A WISH. An entry exists only when a route in this repo can run it TODAY (`runner`); Higgsfield facts are
 * cited to the page they were read from (`source`), and a model whose schema was not read is `verified: 'unverified'` and stays
 * off unless the owner lists it by name in HF_ENABLED_MODELS (registry.isModelEnabled). Not here, on purpose:
 *   · Higgsfield's Nano Banana / Seedream / GPT Image — not in its public catalogue (16 image entries, 2026-09-22). Our
 *     "Nano Banana" rows below are a different provider (api.nanobananaapi.ai), behind /api/nanobanana/image.
 *   · Soul ID — documented (docs.higgsfield.ai/docs/models/soul-id/create-character, read 2026-10-02) but it TRAINS a
 *     character (POST /v1/custom-references → an id, no media), so it is not a generation a picker can offer. It needs its
 *     own flow; Soul 2 would then take its id as `custom_reference_id`.
 *   · avatar — the talking avatar runs one fixed pipeline; there is nothing to choose, so no service entry.
 *
 * Pure: no React, no env, no I/O. Availability (keys, HF_ENABLED_MODELS, STUDIO_V2, breakers) is computed by the server from
 * `availabilityOf` (app/api/studio/catalogue) — this file only knows what each model needs.
 */
import { capsFor, DEFAULT_MODEL_IDS } from '@/lib/veo/capabilities';
import type { VeoTier } from '@/lib/veo/types';
import type { NanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { ENGINE_COPY, MUSIC_ENGINE_CHAIN, type MusicEngineId } from '@/lib/studio/musicEngines';
import type { ModelTier } from '@/lib/providers/types';

export type CatalogueService = 'image' | 'video' | 'motion' | 'music';
export const CATALOGUE_SERVICES: readonly CatalogueService[] = ['image', 'video', 'motion', 'music'];

export type L3 = Readonly<{ ka: string; en: string; ru: string }>;
export type CatalogueLang = keyof L3;
export const catalogueLang = (locale: string | null | undefined): CatalogueLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/**
 * Which existing request runs the model, and so which field carries the choice. A surface can only run its own runner's rows;
 * the others are shown to it disabled ("in the Video tool", "in Studio β").
 *   image  → POST /api/nanobanana/image  { model }       (validated against this list before any charge)
 *   film   → POST /api/chat/orchestrate  { veo.tier }    (VeoRenderOptionsSchema — the tier IS the model)
 *   music  → POST /api/ai/music          { engine }      (the route ignores an engine it cannot run)
 *   studio → POST /api/generate          { modelId }     (STUDIO_V2; the saga refuses anything registry.isModelEnabled refuses)
 */
export type ModelRunner = 'image' | 'film' | 'music' | 'studio';

/** The API a request goes to — not always the model's maker (Kling runs on Higgsfield). */
export type ModelProvider = 'higgsfield' | 'google' | 'nanobanana' | 'udio' | 'elevenlabs' | 'replicate';

/**
 * Where an entry's facts come from.
 *   docs       — the model's own documentation page was read (`source`)
 *   family     — a sibling workflow's page; the smoke test confirms it
 *   code       — our own tested module that wraps the provider (`source`), itself checked against the provider's docs
 *   unverified — not read: off unless named in HF_ENABLED_MODELS
 */
export type Verification = 'docs' | 'family' | 'code' | 'unverified';

/**
 * What a model can do (the brief's t2v / i2v / reference / max duration / aspect ratios), stated from its schema. The
 * Higgsfield rows are checked against their zod schemas by lib/providers/registry.test.ts, so a schema change that is not
 * mirrored here fails a test instead of the picker describing a model that no longer exists.
 */
export interface ModelCapabilities {
  /** Runs from words alone (text→image, text→video). */
  fromText: boolean;
  /** Takes a picture to animate or edit (image→video, an edit, a first frame). */
  fromImage: boolean;
  /** Reference pictures it follows at once (0 = none). */
  references: number;
  /** Longest output of ONE request, in seconds; null for a still, or when it follows a source video. */
  maxDurationSec: number | null;
  /** Shapes it renders; empty = it keeps the shape of what you give it. */
  aspectRatios: readonly string[];
  /** Media it cannot run without (motion transfer needs a source video). */
  needs?: ReadonlyArray<'image' | 'video'>;
}

/** The request field and value that select the model on its runner. */
export type ModelWire =
  | { runner: 'image'; endpoints: Readonly<Partial<Record<ImageQuality, NanoBananaEndpoint>>> }
  | { runner: 'film'; tier: VeoTier }
  | { runner: 'music'; engine: MusicEngineId | null }
  | { runner: 'studio' };

/** The image tool's sizes (lib/studio/imageCreate IMG_QUALITIES) — restated so this module imports nothing from the panel. */
export type ImageQuality = 'standard' | 'high' | 'ultra';

export interface CatalogueEntry {
  /** Stable: stored in browsers and carried by requests. Higgsfield ids are the registry's own. Never rename a shipped one. */
  id: string;
  service: CatalogueService;
  provider: ModelProvider;
  /** Who made the model, as people know it. */
  vendor: string;
  label: L3;
  /** One line: what it is for. */
  bestFor: L3;
  /** The badge: speed vs quality. Absent where there is no honest ranking (the music engines). */
  tier?: ModelTier;
  caps: ModelCapabilities;
  wire: ModelWire;
  verified: Verification;
  source: string;
  /** "Auto" — a chain, not one model. */
  auto?: true;
}

const t = (ka: string, en: string, ru: string): L3 => Object.freeze({ ka, en, ru });
const same = (name: string): L3 => t(name, name, name);

const HF_DOCS = 'https://docs.higgsfield.ai/docs/models';
/** The image route's ten ratios (lib/studio/imageCreate IMG_ASPECTS — pinned equal by catalogue.test.ts). */
const NB_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'] as const;
const SOUL2_ASPECTS = ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'] as const;
const KLING_T2V_ASPECTS = ['16:9', '9:16', '1:1'] as const;
const SEEDANCE_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const;

/** Veo's own facts per tier (lib/veo/capabilities — docs/VEO_ENGINE.md §1, Google docs verified 2026-09-29). */
function veoCaps(tier: VeoTier): ModelCapabilities {
  const c = capsFor(DEFAULT_MODEL_IDS.gemini[tier]);
  // One CLIP: the film pipeline stitches scenes up to FILM_MAX_SEC, but that is the pipeline, not the model.
  return { fromText: true, fromImage: true, references: c.maxReferenceImages, maxDurationSec: Math.max(...c.durations), aspectRatios: [...c.aspects] };
}

const IMAGE: CatalogueEntry[] = [
  {
    id: 'nb/auto', service: 'image', provider: 'nanobanana', vendor: 'Google', auto: true,
    label: t('ავტო', 'Auto', 'Авто'),
    bestFor: t('სისტემა ირჩევს: V2 — 1K და 2K, Pro — 4K.', 'Chosen for you: V2 at 1K and 2K, Pro at 4K.', 'Выбор системы: V2 для 1K и 2K, Pro для 4K.'),
    tier: 'standard',
    caps: { fromText: true, fromImage: true, references: 1, maxDurationSec: null, aspectRatios: NB_ASPECTS },
    // ⚠️ EXACTLY THE ROUTE'S OLD QUALITY_ENDPOINT — a request without `model` must render what it always rendered.
    wire: { runner: 'image', endpoints: { standard: 'v2-1k', high: 'v2-2k', ultra: 'pro-4k' } },
    verified: 'code', source: 'app/api/nanobanana/image (QUALITY_ENDPOINT) · lib/nanobanana/client.ts',
  },
  {
    id: 'nb/v2', service: 'image', provider: 'nanobanana', vendor: 'Google',
    label: same('Nano Banana V2'),
    bestFor: t('სწრაფი ყოველდღიური სურათი და რედაქტირება, 4K-მდე.', 'Fast everyday images and edits, up to 4K.', 'Быстрые повседневные изображения и правки, до 4K.'),
    tier: 'fast',
    caps: { fromText: true, fromImage: true, references: 1, maxDurationSec: null, aspectRatios: NB_ASPECTS },
    wire: { runner: 'image', endpoints: { standard: 'v2-1k', high: 'v2-2k', ultra: 'v2-4k' } },
    verified: 'code', source: 'lib/nanobanana/client.ts (generate-2 · 1K / 2K / 4K)',
  },
  {
    id: 'nb/pro', service: 'image', provider: 'nanobanana', vendor: 'Google',
    label: same('Nano Banana Pro'),
    bestFor: t('მაქსიმალური დეტალი, 2K და 4K. უფრო ნელი.', 'Maximum detail at 2K and 4K. Slower.', 'Максимум деталей в 2K и 4K. Медленнее.'),
    tier: 'pro',
    caps: { fromText: true, fromImage: true, references: 1, maxDurationSec: null, aspectRatios: NB_ASPECTS },
    // No 1K: the Pro endpoint's smallest size renders 2K (lib/nanobanana/client extractResolution: pro-1k2k → '2K').
    wire: { runner: 'image', endpoints: { high: 'pro-1k2k', ultra: 'pro-4k' } },
    verified: 'code', source: 'lib/nanobanana/client.ts (generate-pro · 2K / 4K)',
  },
  {
    id: 'hf/soul-2', service: 'image', provider: 'higgsfield', vendor: 'Higgsfield',
    label: t('Soul 2 — ფოტორეალისტური სურათი', 'Soul 2 — photoreal image', 'Soul 2 — фотореалистичное изображение'),
    bestFor: t('პორტრეტი, მოდა და რედაქციული ფოტო ბუნებრივი სინათლით.', 'Portraits, fashion and editorial photos in natural light.', 'Портреты, мода и редакционные фото при естественном свете.'),
    tier: 'standard',
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: null, aspectRatios: SOUL2_ASPECTS },
    wire: { runner: 'studio' },
    verified: 'docs', source: `${HF_DOCS}/soul-2/generate (read 2026-10-02)`,
  },
];

const VIDEO: CatalogueEntry[] = [
  {
    id: 'google/veo-3.1-lite', service: 'video', provider: 'google', vendor: 'Google',
    label: same('Veo 3.1 Lite'),
    bestFor: t('სწრაფი მონახაზი და ტესტი — რეფერენს-ფოტოს გარეშე.', 'Quick drafts and tests — no reference photos.', 'Быстрые черновики и тесты — без фото-референсов.'),
    tier: 'fast', caps: veoCaps('lite'), wire: { runner: 'film', tier: 'lite' },
    verified: 'code', source: 'lib/veo/capabilities.ts (docs/VEO_ENGINE.md §1)',
  },
  {
    id: 'google/veo-3.1-fast', service: 'video', provider: 'google', vendor: 'Google',
    label: same('Veo 3.1 Fast'),
    bestFor: t('ყოველდღიური Reels და რეკლამა — ძირითადი არჩევანი.', 'Everyday Reels and ads — the default.', 'Повседневные Reels и реклама — основной выбор.'),
    tier: 'standard', caps: veoCaps('fast'), wire: { runner: 'film', tier: 'fast' },
    verified: 'code', source: 'lib/veo/capabilities.ts (docs/VEO_ENGINE.md §1)',
  },
  {
    id: 'google/veo-3.1', service: 'video', provider: 'google', vendor: 'Google',
    label: same('Veo 3.1'),
    bestFor: t('მთავარი კადრები მაქსიმალური დეტალით.', 'Hero shots with the richest detail.', 'Главные кадры с максимальной детализацией.'),
    tier: 'pro', caps: veoCaps('standard'), wire: { runner: 'film', tier: 'standard' },
    verified: 'code', source: 'lib/veo/capabilities.ts (docs/VEO_ENGINE.md §1)',
  },
  {
    id: 'hf/kling-3-std-t2v', service: 'video', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 — ვიდეო ტექსტიდან', 'Kling 3 — text to video', 'Kling 3 — видео из текста'),
    bestFor: t('კინემატოგრაფიული კადრი 3–15 წამი, ხმით ან უხმოდ.', 'Cinematic 3–15 s shots, with or without sound.', 'Кинематографичные кадры 3–15 с, со звуком или без.'),
    tier: 'standard',
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: 15, aspectRatios: KLING_T2V_ASPECTS },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3/standard-text-to-video (read 2026-09-28)`,
  },
  {
    id: 'hf/kling-3-pro-t2v', service: 'video', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 Pro — ვიდეო ტექსტიდან', 'Kling 3 Pro — text to video', 'Kling 3 Pro — видео из текста'),
    bestFor: t('უმაღლესი ხარისხის კადრი რთული მოძრაობისთვის.', 'Top-quality shots for complex motion.', 'Кадры высшего качества для сложного движения.'),
    tier: 'pro',
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: 15, aspectRatios: KLING_T2V_ASPECTS },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3/pro-text-to-video (read 2026-10-02)`,
  },
  {
    id: 'hf/kling-3-std-i2v', service: 'video', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 — ფოტოს გაცოცხლება', 'Kling 3 — image to video', 'Kling 3 — оживление фото'),
    bestFor: t('შენი ფოტო ხდება პირველი კადრი; სურვილისამებრ — ბოლოც.', 'Your photo becomes the first frame — and optionally the last.', 'Ваше фото становится первым кадром, по желанию — и последним.'),
    tier: 'standard',
    caps: { fromText: false, fromImage: true, references: 0, maxDurationSec: 15, aspectRatios: [], needs: ['image'] },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3/standard-image-to-video (read 2026-09-28)`,
  },
  {
    id: 'hf/kling-3-pro-i2v', service: 'video', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 Pro — ფოტოს გაცოცხლება', 'Kling 3 Pro — image to video', 'Kling 3 Pro — оживление фото'),
    bestFor: t('ფოტოდან ვიდეო უფრო ზუსტი დეტალებითა და მოძრაობით.', 'Photo to video with finer detail and motion.', 'Видео из фото с более точными деталями и движением.'),
    tier: 'pro',
    caps: { fromText: false, fromImage: true, references: 0, maxDurationSec: 15, aspectRatios: [], needs: ['image'] },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3/pro-image-to-video (read 2026-10-02)`,
  },
  {
    id: 'hf/seedance-2.5-t2v', service: 'video', provider: 'higgsfield', vendor: 'ByteDance',
    label: t('Seedance 2.5 — სწრაფი ვიდეო', 'Seedance 2.5 — fast video', 'Seedance 2.5 — быстрое видео'),
    bestFor: t('სწრაფი ვიდეო 4–30 წამამდე, ექვსი კადრის ფორმატით.', 'Fast 4–30 s video in six frame shapes.', 'Быстрое видео 4–30 с в шести форматах кадра.'),
    tier: 'fast',
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: 30, aspectRatios: SEEDANCE_ASPECTS },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/seedance-2-5/text-to-video (read 2026-09-28)`,
  },
  {
    id: 'hf/seedance-2.5-r2v', service: 'video', provider: 'higgsfield', vendor: 'ByteDance',
    label: t('Seedance 2.5 — ვიდეო რეფერენსებით', 'Seedance 2.5 — reference to video', 'Seedance 2.5 — видео по референсам'),
    bestFor: t('ფოტოები ან ხმა როგორც ნიმუში — ერთი თანმიმდევრული კადრი.', 'Photos or sound as the guide — one consistent shot.', 'Фото или звук как образец — один цельный кадр.'),
    tier: 'standard',
    caps: { fromText: false, fromImage: true, references: 5, maxDurationSec: 30, aspectRatios: SEEDANCE_ASPECTS },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/seedance-2-5/reference-to-video (read 2026-09-28)`,
  },
];

const MOTION: CatalogueEntry[] = [
  {
    id: 'hf/kling-3-motion-std', service: 'motion', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 Motion Control — მოძრაობის გადატანა', 'Kling 3 Motion Control', 'Kling 3 Motion Control — перенос движения'),
    bestFor: t('ვიდეოს მოძრაობა (3–30 წამი) გადადის შენს ფოტოზე.', 'A video’s motion (3–30 s) moves onto your photo.', 'Движение из видео (3–30 с) переносится на ваше фото.'),
    tier: 'standard',
    // The output follows the 3–30 s source video (the docs' usage notes; the schema has no duration field).
    caps: { fromText: false, fromImage: true, references: 0, maxDurationSec: 30, aspectRatios: [], needs: ['image', 'video'] },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3-motion-control/std (read 2026-09-28)`,
  },
  {
    id: 'hf/kling-3-motion-pro', service: 'motion', provider: 'higgsfield', vendor: 'Kling',
    label: t('Kling 3 Motion Control Pro — ზუსტი მოძრაობა', 'Kling 3 Motion Control Pro', 'Kling 3 Motion Control Pro — точное движение'),
    bestFor: t('მოძრაობის გადატანა მაღალი სიზუსტით და დეტალებით.', 'Motion transfer with higher precision and detail.', 'Перенос движения с высокой точностью и детализацией.'),
    tier: 'pro',
    caps: { fromText: false, fromImage: true, references: 0, maxDurationSec: 30, aspectRatios: [], needs: ['image', 'video'] },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/kling-3-motion-control/pro (read 2026-10-02)`,
  },
  {
    id: 'hf/genjutsu-motion', service: 'motion', provider: 'higgsfield', vendor: 'Higgsfield',
    label: t('Genjutsu — მოძრაობის გადატანა', 'Genjutsu — motion transfer', 'Genjutsu — перенос движения'),
    bestFor: t('მოძრაობა ვიდეოდან (მინ. 4 წამი) ერთ ან რამდენიმე ფოტოზე.', 'Motion from a video (4 s or longer) onto one or more photos.', 'Движение из видео (от 4 с) на одно или несколько фото.'),
    tier: 'standard',
    caps: { fromText: false, fromImage: true, references: 5, maxDurationSec: null, aspectRatios: [], needs: ['image', 'video'] },
    wire: { runner: 'studio' }, verified: 'docs', source: `${HF_DOCS}/genjutsu/motion-transfer (read 2026-09-28)`,
  },
];

/** The music route's chain, named by lib/studio/musicEngines' own copy (one set of names for both pickers). */
const MUSIC: CatalogueEntry[] = [
  {
    id: 'music/auto', service: 'music', provider: 'google', vendor: 'Google', auto: true,
    label: t(ENGINE_COPY.ka.auto.name, ENGINE_COPY.en.auto.name, ENGINE_COPY.ru.auto.name),
    bestFor: t(ENGINE_COPY.ka.auto.role([]), ENGINE_COPY.en.auto.role([]), ENGINE_COPY.ru.auto.role([])),
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: null, aspectRatios: [] },
    wire: { runner: 'music', engine: null },
    verified: 'code', source: 'lib/studio/musicEngines.ts (MUSIC_ENGINE_CHAIN)',
  },
  ...MUSIC_ENGINE_CHAIN.map((engine): CatalogueEntry => ({
    id: `music/${engine}`, service: 'music',
    provider: engine === 'lyria' ? 'google' : engine === 'udio' ? 'udio' : engine === 'elevenlabs-music' ? 'elevenlabs' : 'replicate',
    vendor: engine === 'lyria' ? 'Google' : engine === 'udio' ? 'Udio' : engine === 'elevenlabs-music' ? 'ElevenLabs' : 'Meta',
    label: t(ENGINE_COPY.ka.engines[engine].name, ENGINE_COPY.en.engines[engine].name, ENGINE_COPY.ru.engines[engine].name),
    bestFor: t(ENGINE_COPY.ka.engines[engine].role, ENGINE_COPY.en.engines[engine].role, ENGINE_COPY.ru.engines[engine].role),
    caps: { fromText: true, fromImage: false, references: 0, maxDurationSec: null, aspectRatios: [] },
    wire: { runner: 'music', engine },
    verified: 'code', source: 'lib/ai/musicEnginesStatus.ts · lib/studio/musicEngines.ts',
  })),
];

export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([...IMAGE, ...VIDEO, ...MOTION, ...MUSIC]);

/** What a surface shows before anyone picks — the model its route always ran. */
export const DEFAULT_MODEL: Readonly<Record<CatalogueService, string>> = Object.freeze({
  image: 'nb/auto',
  video: 'google/veo-3.1-fast',
  motion: 'hf/kling-3-motion-std',
  music: 'music/auto',
});

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

export function catalogueEntry(id: unknown): CatalogueEntry | null {
  return typeof id === 'string' ? BY_ID.get(id) ?? null : null;
}

export function catalogueFor(service: CatalogueService): CatalogueEntry[] {
  return CATALOGUE.filter((e) => e.service === service);
}

export const isCatalogueService = (v: unknown): v is CatalogueService =>
  typeof v === 'string' && (CATALOGUE_SERVICES as readonly string[]).includes(v);

// ── what the server decides: can THIS deployment run it ─────────────────────────────────────────────────────────────

/**
 * Why a model cannot run here. Granular for the owner (the route answers it); the picker words most of them as "not
 * enabled", because to a user they are the same thing.
 */
export type UnavailableReason = 'unverified' | 'not_enabled' | 'studio_off' | 'not_configured' | 'busy';

export interface Availability {
  available: boolean;
  reason: UnavailableReason | null;
}

/** What the server knows about this deployment, read once per request (lib/providers/catalogueStatus). */
export interface DeploymentProbe {
  /** HF credentials are set. */
  higgsfield: boolean;
  /** STUDIO_V2 is on — /api/generate exists. */
  studioV2: boolean;
  /** registry.isModelEnabled — HF_ENABLED_MODELS, with unverified models only when listed by name. */
  hfEnabled: (id: string) => boolean;
  /** The film route has a renderer (a Veo transport, or the non-Google fallbacks). */
  film: boolean;
  /** Per music engine: configured / breaker open. Null when not read. */
  music: Partial<Record<MusicEngineId, { configured: boolean; busy: boolean }>> | null;
}

const OK: Availability = { available: true, reason: null };
const no = (reason: UnavailableReason): Availability => ({ available: false, reason });

/**
 * ⚠️ THE ORDER IS THE MOST HONEST FIRST: an unverified schema is "coming soon" whatever the env says; a model the owner did
 * not enable is "not enabled" even where the keys exist; only then does a missing key or a switched-off studio matter.
 * The image route is never blocked here — its own cascade (NanoBanana → Grok → FLUX) refunds a miss.
 */
export function availabilityOf(entry: CatalogueEntry, probe: DeploymentProbe): Availability {
  switch (entry.wire.runner) {
    case 'image':
      return OK;
    case 'film':
      return probe.film ? OK : no('not_configured');
    case 'music': {
      if (entry.wire.engine === null) return OK; // Auto: the route says so itself when nothing in the chain can run
      const m = probe.music?.[entry.wire.engine];
      if (!m) return OK; // not read → as the route treats it: try, fall through
      if (!m.configured) return no('not_configured');
      return m.busy ? no('busy') : OK;
    }
    case 'studio':
      if (entry.verified === 'unverified' && !probe.hfEnabled(entry.id)) return no('unverified');
      if (!probe.hfEnabled(entry.id)) return no('not_enabled');
      if (!probe.studioV2) return no('studio_off');
      if (!probe.higgsfield) return no('not_configured');
      return OK;
  }
}

// ── the image route's wire ──────────────────────────────────────────────────────────────────────────────────────────

/** The NanoBanana endpoint an image model renders `quality` at: its own, else its nearest larger size, else its largest. */
export function imageEndpointFor(entry: CatalogueEntry, quality: string): NanoBananaEndpoint | null {
  if (entry.wire.runner !== 'image') return null;
  const e = entry.wire.endpoints;
  const q = (quality === 'standard' || quality === 'high' || quality === 'ultra' ? quality : 'high') as ImageQuality;
  return e[q] ?? (q === 'standard' ? e.high : undefined) ?? e.ultra ?? e.high ?? null;
}

/** The sizes an image model renders natively — the quality chip disables the rest. */
export function imageQualitiesOf(entry: CatalogueEntry): ImageQuality[] {
  const w = entry.wire;
  return w.runner === 'image' ? (['standard', 'high', 'ultra'] as const).filter((q) => !!w.endpoints[q]) : [];
}

// ── the film route's wire ───────────────────────────────────────────────────────────────────────────────────────────

/** The Veo model a film tier renders on (the tier IS the model on /api/chat/orchestrate). */
export function videoModelForTier(tier: VeoTier): CatalogueEntry {
  return CATALOGUE.find((e) => e.wire.runner === 'film' && e.wire.tier === tier) ?? BY_ID.get(DEFAULT_MODEL.video)!;
}

export function tierForVideoModel(id: unknown): VeoTier | null {
  const e = catalogueEntry(id);
  return e && e.wire.runner === 'film' ? e.wire.tier : null;
}
