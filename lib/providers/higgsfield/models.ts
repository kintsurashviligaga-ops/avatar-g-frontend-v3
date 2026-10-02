/**
 * Higgsfield endpoints and input schemas — ONLY what the model documentation states.
 *
 * Source: docs.higgsfield.ai/docs/models/<model>/<workflow>.md, read 2026-09-28; the Pro siblings (Kling 3 Pro text→video,
 * Pro image→video, Motion Control Pro) and SOUL V2's full page re-read 2026-10-02. Each schema below mirrors the documented
 * JSON schema — a SUBSET where the page offers more than the studio uses (Kling's multi_shots / elements, SOUL's style_id,
 * seed and custom_reference_id): a field we never send cannot be sent wrong. `.strict()` because several endpoints declare
 * `additionalProperties: false` and a stray key is a 422 at the provider. Where a variant's page was not read, the schema is
 * the family's and the registry marks it `schema: 'family'` so the smoke test is what confirms it.
 *
 * ⚠️ NOT in Higgsfield's public catalogue (16 image entries, 2026-09-22): Nano Banana, Seedream, GPT Image.
 * Soul ID IS documented (soul-id/create-character, read 2026-10-02) — but it is TRAINING: POST /v1/custom-references with
 * 1–100 photos returns a character id, no request_id and no media. It is not a generation this saga can run; a flow of its
 * own would train it and then pass the id to SOUL V2 as `custom_reference_id`.
 */
import { z } from 'zod';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

export const HF_ENDPOINTS = {
  soul2: 'higgsfield-ai/soul/v2/standard',
  kling3StdT2v: 'kling-video/v3.0/std/text-to-video',
  kling3ProT2v: 'kling-video/v3.0/pro/text-to-video',
  kling3StdI2v: 'kling-video/v3.0/std/image-to-video',
  kling3ProI2v: 'kling-video/v3.0/pro/image-to-video',
  seedance25T2v: 'bytedance/seedance-2.5/text-to-video',
  seedance25R2v: 'bytedance/seedance-2.5/reference-to-video',
  kling3McStd: 'kling-video/v3/motion-control/std',
  kling3McPro: 'kling-video/v3/motion-control/pro',
  genjutsuMotion: 'higgsfield/genjutsu/motion-transfer/v1.0',
} as const;

/** Every media URL we hand the provider must be public HTTPS (Higgsfield fetches it; a private host is a waste). */
const mediaUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((u) => u.startsWith('https://') && isPublicHttpUrl(u), { message: 'must be a public https URL' });

/** Kling: prompt ≤ 2,500 chars (longer is truncated by the provider — we refuse instead). */
const prompt = z.string().trim().min(1).max(2500);

/** The studio's reference cap (brief §5: refs ≤ 5), below every provider maximum. */
export const MAX_REFS = 5;

const klingDuration = z.number().int().min(3).max(15).default(5);
const klingSound = z.enum(['on', 'off']).default('on');
const cfgScale = z.number().min(0).max(1).optional();

/**
 * SOUL V2 · text→image (soul-2/generate, read 2026-10-02): the shape and the size. Both defaults are the provider's own
 * (1:1, 720p), so a body without them renders exactly what the quickstart's minimum body did. Left out on purpose:
 * `batch_size` (1 or 4 — four images is a different price, which the quote has to own first), `seed`, `style_id` and
 * `custom_reference_id` (Soul ID — see the header). `style_strength` is accepted by the provider but "has no effect".
 */
export const soul2Input = z
  .object({
    prompt,
    aspect_ratio: z.enum(['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2']).default('1:1'),
    resolution: z.enum(['720p', '1080p']).default('720p'),
  })
  .strict();

/** Kling 3.0 · text→video (std page read 2026-09-28, pro page 2026-10-02 — the same schema). */
export const klingT2vInput = z
  .object({
    prompt,
    duration: klingDuration,
    aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
    sound: klingSound,
    cfg_scale: cfgScale,
  })
  .strict();

/** Kling 3.0 · image→video — image_url is the first frame, last_image_url the optional last. No aspect_ratio. */
export const klingI2vInput = z
  .object({
    prompt,
    image_url: mediaUrl,
    last_image_url: mediaUrl.optional(),
    duration: klingDuration,
    sound: klingSound,
    cfg_scale: cfgScale,
  })
  .strict();

const seedanceDuration = z.number().int().min(4).max(30).default(5);
const seedanceCommon = {
  duration: seedanceDuration,
  resolution: z.enum(['480p', '720p']).default('720p'),
  aspect_ratio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']).default('16:9'),
  generate_audio: z.boolean().default(true),
};

/** Seedance 2.5 · text→video (additionalProperties: false). */
export const seedanceT2vInput = z.object({ prompt, ...seedanceCommon }).strict();

/**
 * Seedance 2.5 · reference→video — at least one reference array; our cap is MAX_REFS per kind.
 * ⚠️ No `video_urls` (yet): Seedance bills the INPUT video's duration too, which cannot be known before fetching
 * it, so a request with video references could not be priced before it is charged (tokenPricing.ts).
 */
export const seedanceR2vInput = z
  .object({
    prompt: prompt.optional(),
    image_urls: z.array(mediaUrl).min(1).max(MAX_REFS).optional(),
    audio_urls: z.array(mediaUrl).min(1).max(MAX_REFS).optional(),
    ...seedanceCommon,
  })
  .strict()
  .refine((v) => Boolean(v.image_urls?.length || v.audio_urls?.length), {
    message: 'at least one reference is required',
    path: ['image_urls'],
  });

/** Kling 3.0 Motion Control — output duration follows the 3–30 s source video; no duration field. */
export const klingMotionInput = z
  .object({
    image_url: mediaUrl,
    video_url: mediaUrl,
    prompt: z.string().trim().max(2500).default(''),
    keep_original_sound: z.enum(['yes', 'no']).default('yes'),
    character_orientation: z.enum(['image', 'video']).default('video'),
  })
  .strict();

/** Genjutsu motion transfer — source video ≥ 4 s. */
export const genjutsuMotionInput = z
  .object({
    video_url: mediaUrl,
    image_urls: z.array(mediaUrl).min(1).max(MAX_REFS),
  })
  .strict();
