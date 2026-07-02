/**
 * POST /api/video/remix — edit an EXISTING (user-uploaded) video.
 *
 * One route, one `op` discriminator, so the Video Remix panel can run any of:
 *   trim       — cut a window out of the clip (ffmpeg)
 *   captions   — burn a title / caption lower-third onto it (ffmpeg overlay)
 *   voiceover  — synthesize AI narration and mix it under the audio (ffmpeg)
 *   music      — lay an uploaded track over the video (replace or duck-mix)
 *   redub      — lip-sync the speaker to new TTS text or an uploaded track (Wav2Lip)
 *   restyle    — re-imagine the look: keyframe → image restyle → i2v re-animate
 *   character  — replace / insert a character: keyframe → character swap → i2v
 *
 * Every op is STRICTLY fail-open: a miss returns { url: null, error } and the
 * client keeps the original. The actual wallet charge is unchanged (the client
 * shows the credit toast); this route just produces the edited media URL.
 *
 * Request: { op, videoUrl, ... per-op params }   Response: { url, error? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { trimClip } from '@/lib/video/trimClip';
import { muxAudioOntoVideo, extractFrame, kenBurnsClip, klingI2v, colorGrade, changeSpeed, changeSpeedRamp, stabilizeClip, roopFaceSwapVideo, type GradeStyle } from '@/lib/video/remixOps';
import { overlayMasterUrl } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { filmLipsyncCreate, lipsyncFetch } from '@/lib/ai/lipsync';
import { reSignIfInternal, createSignedAssetUrl, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { generateMusic } from '@/lib/ai/replicate';
import { validateAdImageMeta, base64ByteLength } from '@/lib/ads/adInputValidation';
import { checkAdBudget } from '@/lib/ads/adBudgetGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 600s: roop video face-swap (the character op's primary path) can run several minutes on
// longer clips; the other ops finish in seconds. Bounded under Vercel's ceiling.
export const maxDuration = 600;

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
type Aspect = '9:16' | '16:9' | '1:1';
type Gender = 'male' | 'female';

/** Resolve a client media ref (https / bare storage path) to a fetchable https URL. */
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return reSignIfInternal(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}

const ok = (url: string | null, extra: Record<string, unknown> = {}) => NextResponse.json({ url, ...extra });
const fail = (error: string) => NextResponse.json({ url: null, error });

// Lip-sync (Wav2Lip) create + bounded poll — the redub op's engine.
async function runLipsync(videoUrl: string, audioUrl: string): Promise<string | null> {
  // Redub lip-syncs an existing VIDEO master to new audio. SadTalker/HeyGen
  // (lipsyncCreate) are TALKING-PHOTO engines — they take a still IMAGE, so feeding
  // them a video silently fails ("Lip-sync is unavailable right now"). The correct
  // engine for a video→audio relip is sync/lipsync-2 (filmLipsyncCreate), which takes
  // { video, audio }. lipsyncFetch already polls its "sync:<id>" jobs.
  const id = await filmLipsyncCreate(videoUrl, audioUrl).catch(() => null);
  if (!id) return null;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const s = await lipsyncFetch(id).catch(() => null);
    if (!s) continue;
    if (s.status === 'succeeded' && s.url) return s.url;
    if (s.status === 'failed' || s.status === 'canceled') return null;
  }
  return null;
}

// FIX 3 — preset-appropriate background score for a SINGLE-clip product ad, hosted to a
// fetchable URL. (Multi-clip ads already get a music bed from /api/video/assemble.)
// ElevenLabs Music (instrumental) → MusicGen fallback → null (caller keeps it silent).
const AD_MUSIC_PROMPTS: Record<string, string> = {
  splash: 'upbeat fresh energetic commercial pop, bright clean percussion, product advert bed',
  epic: 'dramatic cinematic orchestral trailer music, powerful epic build, brass and drums',
  luxury: 'elegant sophisticated ambient electronic, premium smooth refined, luxury brand bed',
  nature: 'warm acoustic organic uplifting, calm fresh natural, soft guitar and strings',
};
async function presetAdMusicUrl(presetKey: string, lengthSec = 8): Promise<string | null> {
  const prompt = AD_MUSIC_PROMPTS[presetKey] ?? AD_MUSIC_PROMPTS.luxury!;
  if (hasElevenLabsMusicKey()) {
    try {
      const { audio, contentType } = await composeElevenLabsMusic({ prompt, lengthMs: lengthSec * 1000, instrumental: true });
      const path = `productad-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const url = await uploadAndSign(UPLOAD_BUCKET, path, audio.toString('base64'), contentType, 604800);
      if (url) return url;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[video/remix] productad EL music failed → MusicGen:', e instanceof Error ? e.message : e);
    }
  }
  try {
    const score = await generateMusic(prompt, lengthSec);
    return score.audioUrl ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Accept both the panel's op names AND the chat-intent (Claude) op names.
  const OP_ALIASES: Record<string, string> = {
    add_music: 'music', face_swap: 'character', character_swap: 'character', add_text_overlay: 'captions', add_subtitles: 'captions',
  };
  // Accept both shapes: { op, grade, text, … } (the client) AND { operation, params:{…} }.
  const rawOp = String(body.op || body.operation || '').trim();
  const op = OP_ALIASES[rawOp] ?? rawOp;
  const p = (body.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {};
  // Flatten common params so per-op reads can fall back to params.* transparently.
  if (body.grade === undefined && (p.style ?? p.grade) !== undefined) body.grade = p.style ?? p.grade;
  if (body.text === undefined && p.text !== undefined) body.text = p.text;
  if (body.speed === undefined && p.speed !== undefined) body.speed = p.speed;
  if (body.startSec === undefined && p.startSec !== undefined) body.startSec = p.startSec;
  if (body.durationSec === undefined && p.durationSec !== undefined) body.durationSec = p.durationSec;
  if (body.aspect === undefined && p.aspect !== undefined) body.aspect = p.aspect;
  // character_swap identity photo + speed_ramp factor (flattened from params.*).
  if (body.characterRef === undefined && p.characterRef !== undefined) body.characterRef = p.characterRef;
  if (body.factor === undefined && p.factor !== undefined) body.factor = p.factor;

  // PHASE 2 L1 — Product-Ad: a PHOTO (not a source video) → commercial i2v clip.
  // Branches BEFORE the videoUrl guard: there is no source video; the product photo
  // is the Kling start_image (locked foreground) and a preset drives the environment.
  if (op === 'productad') {
    try {
      const aspectP: Aspect = body.aspect === '16:9' || body.aspect === '1:1' ? body.aspect : '9:16';
      const img = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
      // STEP 2.1 — server-authoritative ad-image guard for a data:image payload
      // (jpeg/png/webp, ≤10MB). This is the real ad path (images arrive as data URLs,
      // bypassing /api/upload), so the strict marketing profile is enforced HERE too.
      if (/^data:/i.test(img)) {
        const mt = img.match(/^data:([^;,]+)[;,]/);
        const b64 = img.includes(',') ? img.split(',')[1] ?? '' : '';
        const v = validateAdImageMeta({ contentType: mt?.[1] ?? '', sizeBytes: base64ByteLength(b64) });
        if (!v.ok) return NextResponse.json({ url: null, error: v.error }, { status: /too large/i.test(v.error) ? 413 : 415 });
      }
      // klingI2v/Replicate accepts a data:image URL directly; an https path is re-signed.
      const startImg = /^data:image\//i.test(img) ? img : await resolveMedia(img);
      if (!startImg) return fail('Add a product photo.');
      // Per-preset visual STYLE (the look) + per-scene ACTIONS (the multi-clip arc).
      // Single-clip (no sceneIndex) → just the style. Multi-clip (sceneIndex set) →
      // a distinct scene action prepended, cycled, so a 30/60s ad reads as a sequence
      // rather than the same shot N times. Same product photo anchors every clip.
      const PRESETS: Record<string, string> = {
        splash: 'glossy studio reflections, photorealistic water commercial',
        epic: 'volumetric smoke, dramatic moody lighting, premium cinematic commercial',
        luxury: 'floating gold particles, elegant neon ambient glow, soft reflections, high-end commercial',
        nature: 'warm sun rays, stone and wood textures, fresh outdoor organic commercial',
      };
      const PRESET_SCENES: Record<string, string[]> = {
        splash: ['dynamic water splashing around the product, droplets frozen mid-air in slow motion', 'close-up of droplets sliding down the product surface', 'wide splash burst with the product centered', 'slow-motion ripples and spray around the product', 'final clean reveal as the water settles'],
        epic: ['slow dolly push-in through volumetric smoke toward the product', 'low-angle hero shot with dramatic rim light', 'controlled orbit around the product, moody lighting', 'smoke swirls part to reveal the product', 'final epic crane pull-back reveal'],
        luxury: ['product rotating slowly as gold particles appear', 'elegant close-up detail shot with soft lighting', 'wide shot of the product in a luxury environment', 'product centered with particles swirling around it', 'final brand-aesthetic reveal'],
        nature: ['sun rays over the product as leaves drift past', 'close-up on natural stone and wood textures beside the product', 'wide organic environment with a soft breeze', 'dappled light moving across the product', 'final fresh golden-hour reveal'],
      };
      const presetKey = String(body.preset || 'luxury');
      const style = PRESETS[presetKey] ?? PRESETS.luxury!;
      const scenes = PRESET_SCENES[presetKey] ?? PRESET_SCENES.luxury!;
      const sceneIdx = Number.isFinite(Number(body.sceneIndex)) ? Math.max(0, Math.floor(Number(body.sceneIndex))) : -1;
      // STEP 2.5 — OPT-IN server-side budget cap, checked HERE (the spend point) before the
      // paid Kling call. Activated only when a cap is supplied (request `budgetCapUsd` or env
      // AD_SESSION_BUDGET_CAP_USD), so production ads are unaffected; it guards the 2.6 paid
      // test. Over-budget (or a single scene above the cap) → 402 top-up, never spends.
      const capUsd = Number(body.budgetCapUsd) || Number(process.env.AD_SESSION_BUDGET_CAP_USD) || 0;
      if (capUsd > 0) {
        const adScenes = Number.isFinite(Number(body.sceneCount))
          ? Math.max(1, Math.floor(Number(body.sceneCount)))
          : sceneIdx >= 0 ? sceneIdx + 1 : 1;
        const budget = checkAdBudget({ scenes: adScenes, withTts: false, withMusic: sceneIdx < 0 && body.noMusic !== true }, { capUsd });
        if (!budget.ok) return NextResponse.json({ url: null, error: budget.message, topUpNeeded: true }, { status: 402 });
      }
      const motion = sceneIdx >= 0 ? `${scenes[sceneIdx % scenes.length]}, ${style}` : `the product as the hero, ${style}`;
      // Premium i2v if a Replicate token is set, else a guaranteed Ken-Burns fallback.
      const url = (await klingI2v(startImg, `${motion}, the product stays sharp and centered, photorealistic, 4k`, aspectP)) || (await kenBurnsClip(startImg, 5, aspectP));
      if (!url) return fail('Product ad generation failed.');
      // FIX 3 — SINGLE-clip ads (sceneIdx < 0) come back silent; lay a preset score
      // under them so the 6s ad isn't mute. Multi-clip (sceneIdx >= 0) skips this — the
      // assemble pipeline scores the stitched master, so per-clip music would clash.
      // `noMusic` ALSO skips it: the caller (Product-Ad with a voiceover/overlay) sends
      // this clip straight to /api/video/assemble, which scores + dubs + overlays in one
      // pass — baking music here would only be replaced and waste a MusicGen call.
      // Fail-open: any music miss returns the (silent) clip — still a working ad.
      if (sceneIdx < 0 && body.noMusic !== true) {
        const music = await presetAdMusicUrl(presetKey, 8);
        if (music) {
          const scored = await muxAudioOntoVideo(url, music, 'replace', 12);
          if (scored) return ok(scored, { engine: 'Kling AI', music: true });
        }
        return ok(url, { engine: 'Kling AI', music: false });
      }
      return ok(url, { engine: 'Kling AI' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[video/remix] productad', err instanceof Error ? err.message : err);
      return fail('Product ad generation failed.');
    }
  }

  const videoUrl = await resolveMedia(body.videoUrl);
  if (!videoUrl) return fail('A video is required.');

  const aspect: Aspect = body.aspect === '16:9' || body.aspect === '1:1' ? body.aspect : '9:16';
  const gender: Gender = body.gender === 'male' ? 'male' : 'female';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : '';

  try {
    switch (op) {
      case 'trim': {
        const startSec = Number.isFinite(Number(body.startSec)) ? Math.max(0, Number(body.startSec)) : 0;
        const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0 ? Number(body.durationSec) : 5;
        const url = await trimClip(videoUrl, startSec, durationSec);
        return url ? ok(url) : fail('Trim failed.');
      }

      case 'captions': {
        if (!text) return fail('Add caption text.');
        const cta = typeof body.cta === 'string' ? body.cta.trim().slice(0, 80) : undefined;
        const url = await overlayMasterUrl(videoUrl, { overlayText: text, ...(cta ? { cta } : {}) });
        return url ? ok(url) : fail('Caption burn failed.');
      }

      case 'voiceover': {
        if (!text) return fail('Add the narration text.');
        const vo = await textToHostedSpeech(text, georgianVoiceId(gender));
        if (!vo) return fail('Voice synthesis is unavailable.');
        const url = await muxAudioOntoVideo(videoUrl, vo, 'mix', 12);
        return url ? ok(url) : fail('Mixing the voice-over failed.');
      }

      case 'music': {
        const audioUrl = await resolveMedia(body.audioUrl);
        if (!audioUrl) return fail('Add a music track.');
        const replace = body.mix !== true; // default: replace the original audio
        const url = await muxAudioOntoVideo(videoUrl, audioUrl, replace ? 'replace' : 'mix', 12);
        return url ? ok(url) : fail('Adding the music failed.');
      }

      case 'redub': {
        // Audio source: synthesized from text in the chosen voice, or an upload.
        const uploaded = await resolveMedia(body.audioUrl);
        const audioUrl = uploaded || (text ? await textToHostedSpeech(text, georgianVoiceId(gender)) : null);
        if (!audioUrl) return fail('Add redub text or an audio track.');
        const url = await runLipsync(videoUrl, audioUrl);
        return url ? ok(url) : fail('Lip-sync is unavailable right now.');
      }

      case 'color_grade': {
        const g = String(body.grade ?? '');
        const grade = (['vintage', 'neon', 'noir', 'dramatic'].includes(g) ? g : 'cinematic') as GradeStyle;
        const url = await colorGrade(videoUrl, grade);
        return url ? ok(url) : fail('Color grade failed.');
      }

      case 'speed_change': {
        const speed = Number.isFinite(Number(body.speed)) && Number(body.speed) > 0 ? Number(body.speed) : 2;
        const url = await changeSpeed(videoUrl, speed);
        return url ? ok(url) : fail('სიჩქარის შეცვლა ვერ მოხერხდა.');
      }

      case 'speed_ramp': {
        // Cinematic slow-in / slow-out ramp (video-only). `factor` = how much the ends slow.
        const factor = Number.isFinite(Number(body.factor)) && Number(body.factor) > 1 ? Number(body.factor) : 1.5;
        const url = await changeSpeedRamp(videoUrl, factor);
        return url ? ok(url) : fail('სიჩქარის რემპი ვერ მოხერხდა.');
      }

      case 'stabilize': {
        // vidstab two-pass; fail-open keeps the original if stabilization can't run.
        const url = await stabilizeClip(videoUrl);
        return url ? ok(url) : fail('ვიდეოს სტაბილიზაცია ვერ მოხერხდა.');
      }

      case 'restyle':
      case 'character':
      case 'background_remove': {
        // Anchor frame → image model (restyle / character swap / bg removal) → re-animate.
        const frame = await extractFrame(videoUrl, 0.5);
        if (!frame) return fail('ვიდეოდან კადრის წაკითხვა ვერ მოხერხდა.');
        // TASK 1 — character swap with an UPLOADED PHOTO.
        const swapPhoto = op === 'character' ? await resolveMedia(body.characterRef) : null;
        // PRIMARY (closer-to-source): roop video face-swap — the SAME video with the face
        // replaced throughout, motion preserved. Tried first when a swap photo is present;
        // on any miss we fall through to the keyframe-regenerate path below (a fresh ~5s clip
        // seeded by one frame — Kling is i2v-only, so that path can't preserve motion).
        if (op === 'character' && swapPhoto) {
          const swapped = await roopFaceSwapVideo(videoUrl, swapPhoto);
          if (swapped) return ok(swapped, { method: 'faceswap' });
        }
        const editPrompt =
          op === 'restyle'
            ? `Restyle this exact scene: ${text || 'cinematic, film-grade color grade'}. Keep the composition and subjects, change only the visual style.`
            : op === 'background_remove'
              ? `Remove the background behind the subject and replace it with ${text || 'a clean, plain neutral studio backdrop'}. Keep the subject exactly as-is.`
              : `${text || 'replace the main character with a new person'}. Keep the background, framing and lighting; change the character${swapPhoto ? ' to the reference person, preserving their face and identity' : ' to match this description'}.`;
        const styled = await generateNanoBananaImage({
          prompt: editPrompt,
          referenceImageDataUrl: frame,
          aspectRatio: aspect,
        }).catch(() => null);
        const startImage = styled?.url || frame;
        const motionPrompt = op === 'restyle' ? (text || 'cinematic motion') : (text || 'natural character motion');
        // Premium i2v if a token is set, else a guaranteed Ken-Burns animation so the
        // user ALWAYS gets a moving, restyled clip. The swap photo (if any) rides along as
        // the kling identity reference.
        const url = (await klingI2v(startImage, motionPrompt, aspect, swapPhoto ? [swapPhoto] : undefined)) || (await kenBurnsClip(startImage, 5, aspect));
        return url ? ok(url, { still: styled?.url ?? null }) : fail(op === 'character' ? 'პერსონაჟის შეცვლა ვერ მოხერხდა.' : 'რესტაილი ვერ მოხერხდა.');
      }

      default:
        return fail(`უცნობი ოპერაცია: ${op || '(none)'}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[video/remix]', op, err instanceof Error ? err.message : err);
    return fail('The remix could not be completed.');
  }
}
