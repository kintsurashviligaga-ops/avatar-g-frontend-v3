import { isProviderPermitted } from '@/lib/providers/policy';
import { hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { NextRequest, NextResponse } from 'next/server';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import type { NanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { randomUUID } from 'node:crypto';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { applyApiGuards } from '@/lib/api/guard';
import { getActiveConfig } from '@/lib/agent/optimizer/activeConfig';
import { isProviderTripped, recordProviderResult } from '@/lib/orchestrator/idempotency';
import { generateGrokImage } from '@/lib/ai/xaiImage';
import { generateFluxProImage } from '@/lib/ai/fluxImage';
import { generateGeminiImage, geminiImageForEndpoint } from '@/lib/ai/geminiImage';
import { debitExistsForRef, deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { billingLocale, ledgerUnavailableBody, replayRefusedBody } from '@/lib/api/billingCopy';
import { providerErrorBody } from '@/lib/api/providerError';
import { claimIdempotencyKey, releaseIdempotencyKey, hashPayload } from '@/lib/orchestrator/idempotency';
import { creditCostFor } from '@/lib/credits/pricing';
import { sanitizeStyle } from '@/lib/studio/style';
import { composeImagePrompt } from '@/lib/studio/composeImagePrompt';
import { resolveTemplateContext } from '@/lib/studio/templateContext';
import { resolveShootDirective } from '@/lib/studio/shootContext';
import { DEFAULT_MODEL, availabilityOf, catalogueEntry, catalogueFor, imageEndpointFor, type DeploymentProbe } from '@/lib/providers/catalogue';

export const dynamic = 'force-dynamic';
// 300s headroom so the higher-resolution tiers (2K/4K) have time to finish on the
// provider instead of timing out at the old 120s ceiling (the "image won't
// generate" report on `high`). 1K still returns in ~50s; the poll exits on success.
export const maxDuration = 300;

/**
 * The MODEL → NanoBanana endpoint map is the catalogue's (lib/providers/catalogue: `nb/auto` · `nb/v2` · `nb/pro`, each with
 * its endpoint per size). Auto is exactly the old quality map — standard → v2-1k, high → v2-2k, ultra → pro-4k — so a request
 * without `model` renders what it always rendered.
 *
 * ⚠️ THE CLIENT NAMES A MODEL, NEVER AN ENDPOINT. `model` must be an image entry of the catalogue that this deployment can run
 * (availabilityOf); anything else is refused 400 BEFORE the mutex, the charge or a provider call. The legacy `endpoint` field
 * was cast straight into the provider call (`'task-details'` included); it is now honoured only when it is one of the
 * catalogue's own image endpoints. Every endpoint is one image's price here — the dearest (pro-4k) is what `ultra` always
 * cost — so no pick can cost us more than a 4K Auto render already did.
 */
const IMAGE_ENDPOINTS: ReadonlySet<string> = new Set(
  catalogueFor('image').flatMap((e) => (e.wire.runner === 'image' ? Object.values(e.wire.endpoints) : [])),
);
const NO_DEPLOYMENT_GATE: DeploymentProbe = { image: true, higgsfield: false, studioV2: false, hfEnabled: () => false, film: false, music: null };

type ImageModelPick = { ok: true; modelId: string; endpoint: NanoBananaEndpoint } | { ok: false };

function resolveImageModel(rawModel: unknown, rawEndpoint: unknown, quality: string): ImageModelPick {
  const entry = catalogueEntry(rawModel === undefined || rawModel === null || rawModel === '' ? DEFAULT_MODEL.image : rawModel);
  if (!entry || entry.service !== 'image' || entry.wire.runner !== 'image' || !availabilityOf(entry, NO_DEPLOYMENT_GATE).available) return { ok: false };
  if (rawEndpoint !== undefined && rawEndpoint !== null && rawEndpoint !== '') {
    return typeof rawEndpoint === 'string' && IMAGE_ENDPOINTS.has(rawEndpoint)
      ? { ok: true, modelId: entry.id, endpoint: rawEndpoint as NanoBananaEndpoint }
      : { ok: false };
  }
  const endpoint = imageEndpointFor(entry, quality);
  return endpoint ? { ok: true, modelId: entry.id, endpoint } : { ok: false };
}

// The style directives (STYLE_SUFFIXES) and the prompt's assembly order live in lib/studio/composeImagePrompt.

// Host a data: reference image to a signed https URL — NanoBanana's img2img only
// accepts an https reference (extractImageUrls drops data: URLs), so a freshly
// uploaded/attached image must be copied to Supabase first. Fail-open → null.
async function hostReferenceImage(dataUrl: string): Promise<string | null> {
  try {
    const m = dataUrl.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'image/png').toLowerCase();
    const ext = /jpe?g/i.test(mime) ? 'jpg' : /webp/i.test(mime) ? 'webp' : 'png';
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return null;
    const path = `omni-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 7200)) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // applyApiGuards = EXPENSIVE rate-limit + per-user daily AI budget. This paid route previously
  // ran only checkRateLimit, so it was exempt from the daily cap the sibling /api/replicate/image
  // enforces — a ×4 image batch was 4 uncounted paid generations (audit MED). Match the sibling.
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'nanobanana.image' });
  if (gate.response) return gate.response;

  // ⚠️ THERE IS DELIBERATELY NO EARLY RETURN ON A MISSING NANOBANANA KEY.
  //
  // This route used to hard-return 500 here when NANOBANANA_API_KEY was absent — BEFORE the try block, so
  // the two designed fallback legs (Grok/xAI, then FLUX 1.1 Pro) could never run. A single expired or
  // rotated key therefore took image generation in the whole product to 100% dead: every prompt and every
  // ×4 tile came back "Image generation failed. Try again." while XAI_API_KEY and REPLICATE_API_TOKEN sat
  // wired up and perfectly able to produce the image.
  //
  // The early return was not load-bearing — nothing here reads the key. lib/nanobanana/client.ts re-reads
  // it and throws, that throw is already caught below, and the catch sets providerText and falls through
  // to Grok → FLUX exactly as the cascade intends. A key rotation now DEGRADES instead of breaking, and
  // the 502-with-refund still fires if every leg genuinely misses.

  // ── PRE-RENDER RESERVE STATE (TOCTOU fix) ────────────────────────────────────
  // The credit is now DEBITED before the provider call (inside the try, once the tray jobId
  // is known) and REFUNDED on any downstream miss. Declared out here so the outer catch can
  // refund a mid-render throw. This REPLACES the old hasSufficientBalance READ-gate, which let
  // N concurrent tiles of one ×4 batch pass a stale balance and each render for free — the
  // post-success deduct then rejected the overdraw only AFTER 4 paid provider calls had fired.
  let reservedUid: string | null = null;
  let reserveRef = '';
  let reserved = false;
  // IN-FLIGHT MUTEX (V1) — a short-TTL Redis lock keyed on the request SIGNATURE (user + exact
  // provider inputs) that instantly blocks a double-click / retry-storm from spawning a SECOND paid
  // provider render. The billing ref dedupes the CHARGE, but NOT the render — this closes that. Held
  // for the TTL on success (an identical re-submit is blocked briefly); RELEASED on any failure so a
  // genuine retry isn't locked out. Fail-open (the helper no-ops without Redis).
  let idemOwner = '';
  let idemKey = '';
  /** Refund (at most once) + release the mutex. TRUE only when the refund actually landed — the only thing a failure
   *  response may report as `refunded: true` (or put "your credit was returned" in its message). */
  const refundReserve = async (): Promise<boolean> => {
    let refunded = false;
    if (reserved && reservedUid) {
      reserved = false; // idempotent: refund at most once
      const r = await refundCredits(reservedUid, creditCostFor('image'), `${reserveRef}:refund`).catch(() => null);
      refunded = !!r?.ok;
    }
    if (idemOwner && idemKey) { const k = idemKey; idemKey = ''; await releaseIdempotencyKey(idemOwner, k).catch(() => {}); }
    return refunded;
  };
  const releaseMutex = async (): Promise<void> => {
    if (idemOwner && idemKey) { const k = idemKey; idemKey = ''; await releaseIdempotencyKey(idemOwner, k).catch(() => {}); }
  };

  try {
    const body = await req.json() as {
      prompt?: string;
      style?: string;
      quality?: string;
      aspectRatio?: string;
      /** Legacy: a NanoBanana endpoint id — honoured only when it is one of the catalogue's image endpoints. */
      endpoint?: string;
      /** The picked model (lib/providers/catalogue, service 'image'); absent = Auto. Validated before any charge. */
      model?: unknown;
      /** Img2img / edit: a source image (data: upload OR an https URL to edit). */
      referenceImage?: string;
      /** P7 — what to AVOID in the image (folded into the prompt as a negative clause). */
      negativePrompt?: string;
      /** DURABLE PROGRESS — the composer's tray jobId. When present the completed row is
       *  UPSERTED under this id (converging with the client's placeholder row) so an image
       *  produces exactly ONE generation_jobs row, not a client + server duplicate. */
      jobId?: string;
      /** BATCH tile index (0..N-1). A ×2/×4 batch sends N tiles with an IDENTICAL prompt/params
       *  payload but distinct tiles — without this the payload-hash mutex treats tiles 2..N as
       *  duplicate double-clicks and 409s them. Folding the index into the key makes each tile of
       *  a batch its own claim, while a genuine double-click (same index) still dedupes. */
      batchTile?: number;
      /** The template card the request's values select (lib/studio/templates) — an ID; its context is resolved here. */
      templateId?: unknown;
      /** The Interior designer's / Photographer's choices as IDs (lib/studio/shootWire) — resolved to a directive here. */
      studio?: unknown;
    };
    const clientJobId = typeof body.jobId === 'string' ? body.jobId.slice(0, 120) : '';

    // Cap the prompt server-side before enrichment (mirrors lib/replicate/schemas.ts) so a
    // multi-megabyte prompt can't be shipped to the paid provider (audit MED).
    const prompt = (body.prompt ?? '').trim().slice(0, 2000);
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }
    // ⚠️ `style` IS CLIENT TEXT THAT LANDS IN THE PAID PROMPT (lib/studio/style.ts): one line, ≤80 chars, no
    // control/bidi characters. Cleaned here, before the mutex key, so every use below sees the same value.
    const styleLabel = sanitizeStyle(body.style);
    const quality = body.quality ?? 'high';
    const pick = resolveImageModel(body.model, body.endpoint, quality);
    if (!pick.ok) {
      return NextResponse.json({
        success: false,
        code:    'unknown_model',
        error:   'unknown_model',
        message: 'ეს მოდელი აქ მიუწვდომელია — აირჩიე სხვა. / This model is not available here — pick another one.',
      }, { status: 400 });
    }
    // ⚠️ THE TEMPLATE'S CONTEXT IS RESOLVED HERE, FROM ITS ID — never accepted as text (lib/studio/templateContext).
    // Only when THIS request's aspect, quality and style still select the card; anything else resolves to null and
    // the render is exactly what the controls say. Resolved before the mutex key, which hashes the id it applied.
    const template = resolveTemplateContext('image', body.templateId, { aspect: body.aspectRatio ?? '1:1', quality, style: styleLabel });
    // ⚠️ THE INTERIOR DESIGNER AND THE PHOTOGRAPHER RIDE THIS ROUTE — one charge path, one refund path (lib/studio/shootContext).
    // Their style / room / camera arrive as IDs and resolve to server text; `refGiven` is what the BODY carries, not what the
    // client claims. Null (no `studio`, or an unknown kind) leaves the render exactly as the image tool's controls say.
    const refGiven = typeof body.referenceImage === 'string' && body.referenceImage.trim() !== '';
    const shoot = resolveShootDirective(body.studio, { hasReference: refGiven });
    // Stop unsupported edits and missing credentials before billing or provider calls.
    if (refGiven || !hasGeminiImagenProvider()) {
      const code = refGiven ? 'image_edit_unavailable' : 'provider_unavailable';
      return NextResponse.json({ success: false, code, error: code,
        message: refGiven ? 'Image editing is not available right now.' : 'Image generation is not available right now.' }, { status: 503 });
    }


    // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). This route was "free-to-try" for guests: a paid image render plus a
    // Gemini translation leg, behind nothing but a spoofable per-IP limit. The studio already stops a guest before
    // sending; this stops a direct POST. FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment.
    // (applyApiGuards above already resolved a cookie session; the full resolver covers the Bearer path.)
    const sessionUserId = gate.auth ? gate.auth.userId : ((await authedClientFromRequest(req)).user?.id ?? null);
    if (mustSignInToGenerate(sessionUserId)) {
      return NextResponse.json(signInToGenerateBody(), { status: 401 });
    }

    // RESERVE the credit up front (state declared above). The atomic deduct serialises a
    // concurrent ×4 batch: only tiles the wallet can actually fund proceed; the rest 402 WITHOUT
    // a paid render (fixes the free-image TOCTOU leak). Authed only (a FILM_ALLOW_ANONYMOUS demo stays unbilled).
    // ⚠️ SECOND NETWORK VALIDATION OF THE SAME JWT. applyApiGuards above already resolved the cookie
    // session through auth.getUser(), which is a real round trip to GoTrue and not a local decode.
    // Reuse its answer when it has one; fall back to the full resolver otherwise, because getAuthContext
    // only reads cookies and this route must still accept the Authorization: Bearer path unchanged.
    const rUser = sessionUserId ? { id: sessionUserId } : null;
    // The in-flight MUTEX stays fail-open: a Redis blip only loses the double-click guard, never money.
    try {
      // Claim the in-flight mutex FIRST (covers authed + anon) on the deterministic request signature.
      // A concurrent identical request loses the race → 409 without a paid render or a charge.
      idemOwner = rUser?.id ?? `anon:${clientJobId || 'session'}`;
      idemKey = `image:${await hashPayload({ u: idemOwner, p: prompt, e: pick.endpoint, ar: body.aspectRatio ?? '1:1', s: styleLabel, ref: (body.referenceImage ?? '').slice(0, 512), neg: body.negativePrompt ?? '', bt: typeof body.batchTile === 'number' ? body.batchTile : null, t: template?.id ?? null, ...(shoot ? { sh: shoot.key } : {}) })}`;
      if (!(await claimIdempotencyKey(idemOwner, idemKey, 60))) {
        idemKey = ''; // not ours to release — the winning request holds it
        return NextResponse.json({ success: false, error: 'duplicate_request', message: 'This image is already being generated.' }, { status: 409 });
      }
    } catch { idemKey = ''; /* mutex unavailable — proceed without the double-click guard */ }
    // ── THE CHARGE FAILS CLOSED. ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ THIS USED TO SHARE THE MUTEX'S FAIL-OPEN `try`, and only `insufficient` stopped the render: a deduct that
    // came back `error` (the ledger unreachable or refusing the write) rendered the image UNBILLED, for everyone,
    // for as long as the ledger was down. A definitive ledger failure now refuses (503 billing_unavailable, nothing
    // charged, nothing rendered). Only `skipped` (the RPC not provisioned at all) still proceeds uncharged, exactly
    // as reserveProduce documents for every other paid route.
    if (rUser?.id) {
      reservedUid = rUser.id;
      // ⚠️ CLIENT-KEYED BILLING REF — same exploit shape as produceBilling.idemRef: deduct_credits
      // dedupes on (user_id, ref) forever, so a constant clientJobId with a changing prompt was
      // charged once and rendered free thereafter. The body fingerprint is server-derived.
      reserveRef = `image:nanobanana:${clientJobId || randomUUID()}:${bodyFingerprint(body)}:${rUser.id}`;
      // ⚠️ …AND THE SAME jobId + BODY IS A REPLAY. deduct_credits answers it with SUCCESS and no new debit, so a
      // replay once the 60 s mutex lapsed rendered a fresh image for nothing — every time. The studio mints a new
      // jobId per job and per tile, so only a replayed request lands here; it is refused before any charge or render.
      if ((await debitExistsForRef(rUser.id, reserveRef)) === true) {
        await releaseMutex();
        return NextResponse.json({ ...replayRefusedBody(), message: 'This image was already generated.' }, { status: 409 });
      }
      const debit = await deductCredits(rUser.id, creditCostFor('image'), reserveRef);
      if (!debit.ok && debit.reason === 'insufficient') {
        await refundReserve(); // releases the mutex (nothing reserved yet) so a top-up retry works
        return NextResponse.json({ success: false, error: 'არასაკმარისი კრედიტი — შეავსე ბალანსი. / Not enough credits — please top up.', code: 'insufficient_credits' }, { status: 402 });
      }
      if (!debit.ok && debit.reason === 'error') {
        await releaseMutex(); // nothing was reserved — let the retry through
        return NextResponse.json(ledgerUnavailableBody(billingLocale(req)), { status: 503 });
      }
      reserved = debit.ok;
    }

    const endpoint    = pick.endpoint;
    // ⚠️ EVERY ENGINE THIS ROUTE CAN REACH READS ENGLISH ONLY — NanoBanana, Grok and FLUX 1.1 Pro are
    // all trained overwhelmingly on English text. Nothing here translated anything, so a Georgian brief
    // arrived as noise, each engine fell back to its priors, and the user was handed a competent image
    // of something they never asked for. Only the DESCRIPTION is translated (subject, style, colours,
    // camera) — this route carries no text the image must reproduce verbatim. `prompt` itself is left
    // alone on purpose: it is what recordCompletedAsset files below and what the Library shows back.
    // FAIL-OPEN by construction — any error, missing key or timeout returns the ORIGINAL text, so a
    // translation outage can never turn a working render into a failed one.
    const { promptToEnglish } = await import('@/lib/ai/promptToEnglish');
    const promptEn    = await promptToEnglish(prompt, 'image');
    // P7 — negative prompt: NanoBanana has no dedicated negative field, so the things to
    // avoid are appended as an explicit exclusion clause the model honours.
    const negativeRaw = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 400) : '';
    const negative    = negativeRaw ? await promptToEnglish(negativeRaw, 'image') : '';
    // SELF-IMPROVING (STEP 5): if an admin has APPROVED an active 'image' config, apply its learned
    // prompt directive as a suffix so the loop's improvement actually reaches generation. Fail-soft
    // — no active config (or table not migrated) → generation is exactly as before.
    const activeImageCfg = await getActiveConfig('image').catch(() => null);
    // The assembly (style directive or quality boost → template suffix → exclusion clause → learned directive) is the
    // pure lib/studio/composeImagePrompt. `knownStyle` is the ONLY value forwarded as the provider's `style` field.
    // A studio request's lead (the task, what stays identical) goes BEFORE the brief; its look / camera ride as the suffix and
    // its "avoid" joins the exclusion clause. An image-tool request has no `shoot`, so every value below is what it was.
    const { finalPrompt, knownStyle } = composeImagePrompt({
      promptEn: shoot ? `${shoot.lead} ${promptEn}` : promptEn,
      styleLabel,
      templateSuffix: shoot ? shoot.suffix : (template?.suffix ?? null),
      negativeEn: shoot ? [negative, shoot.avoid].filter(Boolean).join(', ') : negative,
      learnedDirective: activeImageCfg?.prompt ?? null,
    });

    // Img2img / edit — resolve the reference image to an https URL the provider
    // accepts: data: uploads are hosted to Supabase; https URLs (e.g. editing a
    // previously generated image) pass straight through.
    let referenceImageUrl: string | undefined;
    const ref = typeof body.referenceImage === 'string' ? body.referenceImage.trim() : '';
    if (ref.startsWith('data:')) referenceImageUrl = (await hostReferenceImage(ref)) || undefined;
    else if (/^https?:\/\//i.test(ref)) referenceImageUrl = ref;
    // ⚠️ A STUDIO PHOTO THAT COULD NOT BE HOSTED MUST NOT BECOME A TEXT-TO-IMAGE RENDER. For the image tool a lost reference
    // degrades to a fresh picture; for the Interior designer that is a different room, for the Photographer a different
    // subject — charged as if it were theirs. Refuse and refund before any provider is called.
    if (shoot && ref && !referenceImageUrl) {
      const refunded = await refundReserve();
      return NextResponse.json({
        success: false,
        code:    'reference_unavailable',
        refunded,
        message: `ფოტო ვერ წავიკითხე${refunded ? ' — კრედიტი დაბრუნდა' : ''}. სცადე სხვა JPG ან PNG. / We could not read your photo${refunded ? ' — your credit was returned' : ''}. Try another JPG or PNG.`,
        error:   'reference_unavailable',
      }, { status: 502 });
    }

    let providerUrl: string | null = null;
    let backupB64: string | null = null;
    let backupMime = 'image/png';
    let providerText: string | undefined;
    let credits: number | undefined;
    let model = `NanoBananaAI ${endpoint.toUpperCase()}`;

    // ⚠️ GOOGLE FIRST (2026-10-03). The catalogue's image models ARE Google's — Nano Banana 2 and Pro (`vendor: 'Google'`) —
    // but this route bought them through a reseller, the NanoBanana API. Its balance ran dry and EVERY image, photographer
    // and interior render failed („The current credits are insufficient", 3 of 3 that day; Grok and FLUX missed too) while
    // the Gemini key that runs the chat and Veo could make the same picture. The same model is now asked on Google
    // directly (the user's photo as an inline part, the size the endpoint names); NanoBanana → Grok → FLUX below are the
    // fallback, unchanged. Same reserve, same price, same refund on a miss.
    if (!(await isProviderTripped('gemini-image').catch(() => false))) {
      const g = geminiImageForEndpoint(endpoint);
      // The other Nano Banana once, before the reseller: a key whose project does not serve one of the two (a 404) still
      // makes the picture. Each attempt is time-boxed so the reseller legs keep their window inside maxDuration.
      for (const m of [g.model]) {
        const img = await generateGeminiImage({
          prompt: finalPrompt,
          aspectRatio: body.aspectRatio ?? '1:1',
          imageSize: g.imageSize,
          model: m,
          timeoutMs: 70_000,
          ...(referenceImageUrl ? { referenceImages: [referenceImageUrl] } : {}),
        });
        if (img) {
          backupB64 = img.base64;
          backupMime = img.mimeType;
          model = `Google ${img.model}`;
          break;
        }
      }
      await recordProviderResult('gemini-image', !!backupB64).catch(() => {});
    }

    // CIRCUIT BREAKER (Task 5.3) — consult the Redis breaker BEFORE dispatching to NanoBanana
    // (the reseller leg). If NanoBanana has tripped (3 hard failures inside the cooldown) skip it and
    // fail-FAST to the Grok backup, instead of burning ~50s on a known-bad provider. Every outcome
    // is recorded so the breaker opens/closes itself. Fail-open: no Redis → primary always runs.
    const nbTripped = !backupB64 && (await isProviderTripped('nanobanana').catch(() => false));
    if (isProviderPermitted('nanobanana', 'image') && !backupB64 && !nbTripped) {
      try {
        // Give 2K/4K a long-enough result-poll window (≈250s) so they complete rather
        // than timing out; 1K finishes far sooner and exits the poll early.
        const primary = await generateNanoBananaImage({
          prompt:      finalPrompt,
          endpoint,
          aspectRatio: body.aspectRatio ?? '1:1',
          style:       knownStyle || undefined,
          ...(referenceImageUrl ? { referenceImageDataUrl: referenceImageUrl } : {}),
          // Poll budget matched to the engine's REAL latency AND to what this function can afford.
          // maxDuration is 300s; the FLUX leg (45s) + the re-host copy (25s) still have to run AFTER
          // this returns, so the primary may never own more than ~150s or the fallback is unreachable
          // and Vercel 504s the lambda before the refund path at the bottom can fire.
          pollMaxAttempts: endpoint === 'pro-4k' || endpoint === 'v2-4k' ? 60 : 40, // 150s / 100s
          pollIntervalMs:  2500,
        });
        providerUrl = primary.url ?? null;
        providerText = primary.text;
        credits = primary.credits;
        await recordProviderResult('nanobanana', !!primary.url).catch(() => {});
      } catch (e) {
        await recordProviderResult('nanobanana', false).catch(() => {});
        providerText = e instanceof Error ? e.message : undefined;
      }
    } else if (nbTripped) {
      // eslint-disable-next-line no-console
      console.warn('[nanobanana/image] breaker OPEN for nanobanana → fail-fast to Grok backup');
    }

    // BACKUP LEG — breaker OPEN or the primary returned no image → route to the Grok backup (the
    // designed image fallback). Returns null when XAI_API_KEY isn't set (leg simply unavailable →
    // the 502 below fires exactly as before, no regression).
    // GUARD !referenceImageUrl: Grok/FLUX are PROMPT-ONLY (no image input), so for an EDIT request (a
    // reference image is set, e.g. "edit this photo") they'd ignore the source and return an UNRELATED
    // new image — which we'd deliver as success and still charge. When only NanoBanana can honor the
    // reference and it missed, skip these legs so the 502-refund path below fires instead.
    if (isProviderPermitted('xai', 'image') && !providerUrl && !backupB64 && !referenceImageUrl && !(await isProviderTripped('grok').catch(() => false))) {
      try {
        const grok = await generateGrokImage(finalPrompt);
        if (grok?.url) { providerUrl = grok.url; model = `Grok ${grok.model}`; await recordProviderResult('grok', true).catch(() => {}); }
        else if (grok?.b64) { backupB64 = grok.b64; model = `Grok ${grok.model}`; await recordProviderResult('grok', true).catch(() => {}); }
        else if (grok) { await recordProviderResult('grok', false).catch(() => {}); }
      } catch (e) {
        await recordProviderResult('grok', false).catch(() => {});
        if (!providerText) providerText = e instanceof Error ? e.message : undefined;
      }
    }

    // FINAL LEG — FLUX 1.1 Pro (owner-chosen image fallback quality, 2026-07-11). Only fires when
    // BOTH NanoBanana AND Grok missed, so it rarely runs (minimal added cost) but keeps a high-quality
    // image coming through instead of a 502. Fail-open: null → the 502 below fires as before.
    // Same edit-guard as the Grok leg: FLUX 1.1 Pro is prompt-only, so it must not substitute an unrelated
    // image for an edit request — skip it when a reference image is set so the 502-refund path fires.
    if (isProviderPermitted('replicate', 'image') && !providerUrl && !backupB64 && !referenceImageUrl && !(await isProviderTripped('flux-pro').catch(() => false))) {
      try {
        const flux = await generateFluxProImage(finalPrompt, body.aspectRatio ?? '1:1');
        if (flux) { providerUrl = flux; model = 'FLUX 1.1 Pro'; await recordProviderResult('flux-pro', true).catch(() => {}); }
        else { await recordProviderResult('flux-pro', false).catch(() => {}); }
      } catch (e) {
        await recordProviderResult('flux-pro', false).catch(() => {});
        if (!providerText) providerText = e instanceof Error ? e.message : undefined;
      }
    }

    if (!providerUrl && !backupB64) {
      // ⚠️ THE MESSAGE USED TO SAY "your credit was returned" WHENEVER A CREDIT HAD BEEN RESERVED — before the refund
      // ran and whatever it answered. It now says so only when refund_credits confirmed it (and `refunded` says the same).
      const refunded = await refundReserve(); // paid for nothing → give the reserved credit back
      console.error('[nanobanana/image] every engine missed:', (providerText ?? 'no image URL').slice(0, 300));
      return NextResponse.json({
        success: false,
        code:    'provider_unavailable',
        refunded,
        // ⚠️ THE CLIENT SHOWS `message` AND DROPS `error` for every code except insufficient_credits
        // (OmniStudio.runImageJob; describeOpFailure does the same). Without this field the honest
        // reason — and the fact that the credit was returned — was replaced by "Image generation failed".
        message: `ვერ შევქმენი სურათი — ყველა ძრავა დროებით მიუწვდომელია${refunded ? ', კრედიტი დაბრუნდა' : ''}. სცადე ხელახლა. / Every image engine is unavailable right now${refunded ? ' — your credit was returned' : ''}. Please try again.`,
        // The engines' own failure text (providerText) stays server-side; the body carries only our code.
        error:   'provider_unavailable',
      }, { status: 502 });
    }

    // RE-HOST to Supabase Storage so the image renders in-app. The provider
    // returns a URL on its own CDN, which (a) is NOT in our CSP img-src — so the
    // browser would block the <img> — and (b) is a short-lived temp link. Copying
    // the bytes to our `*.supabase.co` bucket (CSP-allowed) returns a stable,
    // signed URL the client can display + download. Fail-open: if the copy fails,
    // fall back to the raw provider URL (better than nothing).
    let hostedUrl = providerUrl ?? '';
    if (backupB64) {
      // Google or Grok returned raw base64 (no provider CDN URL to re-fetch) → upload the bytes directly.
      try {
        const ext = /jpe?g/i.test(backupMime) ? 'jpg' : /webp/i.test(backupMime) ? 'webp' : 'png';
        const path = `omni/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const signed = await uploadAndSign('uploads', path, backupB64, backupMime, 604800);
        if (signed) hostedUrl = signed;
      } catch { /* fail-open — final guard below rejects an empty url */ }
    } else if (providerUrl) {
      try {
        // Time-box the copy: a slow provider CDN must NOT hang the function until the
        // Vercel maxDuration limit (that surfaced as an intermittent platform 500).
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 25_000);
        const r = await fetch(providerUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
        if (r.ok) {
          const ct = r.headers.get('content-type') || 'image/png';
          const ext = /jpe?g/i.test(ct) ? 'jpg' : /webp/i.test(ct) ? 'webp' : 'png';
          const buf = Buffer.from(await r.arrayBuffer());
          // Guard against pathologically large payloads blowing the function's memory.
          if (buf.byteLength <= 18 * 1024 * 1024) {
            const b64 = buf.toString('base64');
            const path = `omni/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const signed = await uploadAndSign('uploads', path, b64, ct, 604800); // 7-day signed URL
            if (signed) hostedUrl = signed;
          }
        }
      } catch {
        /* fail-open — keep the provider URL */
      }
    }

    // A backup-b64 upload miss can leave no usable URL → treat as a provider miss (502).
    if (!hostedUrl) {
      const refunded = await refundReserve(); // no deliverable asset → give the reserved credit back
      return NextResponse.json({
        success: false,
        code:    'host_failed',
        refunded,
        message: `სურათი შეიქმნა, მაგრამ ატვირთვა ვერ მოხერხდა${refunded ? ' — კრედიტი დაბრუნდა' : ''}. სცადე ხელახლა. / The image was generated but could not be stored${refunded ? ' — your credit was returned' : ''}. Please try again.`,
        error:   'Image host failed',
      }, { status: 502 });
    }

    // File the finished asset. The credit was already RESERVED up front (see the reserve above),
    // so there is NO charge here — only the durable completion row. Reuse the composer's tray jobId
    // so this UPSERTS the client's placeholder (one row, not a duplicate); other callers get a fresh
    // UUID. Fail-open: a record miss never fails the already-delivered asset.
    try {
      const { user } = await authedClientFromRequest(req);
      await recordCompletedAsset({ id: clientJobId || randomUUID(), userId: user?.id ?? DEMO_VOICE_USER_ID, serviceType: 'image', url: hostedUrl, prompt });
    } catch {
      /* fail-open */
    }

    return NextResponse.json({
      success:   true,
      url:       hostedUrl,
      model,
      endpoint,
      credits,
    });
  } catch (err) {
    const charged = reserved; // captured before refundReserve clears it
    const refunded = await refundReserve(); // mid-render throw → give the reserved credit back
    const message = err instanceof Error ? err.message : 'Image generation failed';
    console.error('[nanobanana/image]', message);
    // ⚠️ NEVER THE PROVIDER'S OWN WORDS (lib/api/providerError) — and the sanitiser's "you were not charged" only when
    // it is true: nothing was charged, or the refund landed. A charge whose refund did not land gets a neutral code.
    const safe = providerErrorBody(err, billingLocale(req));
    const failBody = charged && !refunded
      ? { success: false, error: 'image_failed', refunded: false }
      : { success: false, error: safe.error, message: safe.message, refunded };
    return NextResponse.json(failBody, { status: 502 });
  }
}
