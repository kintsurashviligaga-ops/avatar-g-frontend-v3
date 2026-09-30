import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { costPerSecondUsd, DEFAULT_TIER, resolutionFor, resolveModel } from '@/lib/veo/capabilities';
import { createVeoClip, deliverableUrl, pollVeoClip, veoTransport, type CreateVeoClipResult } from '@/lib/veo/engine';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import type { OutputFormat } from '@/lib/veo/types';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { addWatermark } from '@/lib/video/remixOps';
import { shouldWatermark } from '@/lib/billing/entitlements';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';

/**
 * The batch video queue Agent G drives — enqueue N prompts, drain one step at a time, poll for results.
 *
 * ⚠️ WHY A TABLE AND A DRAIN, NOT A LOOP. Vercel functions are short-lived and this project has no
 * daemon; a 20-clip batch cannot be held in memory while it renders. Each item is a ROW with a status and
 * one short request advances ONE item, so nothing is lost when a function ends and a retry resumes where
 * it stopped. Veo is submit→poll anyway, which is the same shape.
 *
 * ⚠️ BILLING IS PER ITEM, CHARGED AT RENDER, REFUNDED ON FAILURE.
 *   · Nothing is charged at ENQUEUE. A batch that is never drained must cost nothing — otherwise a
 *     cancelled run silently keeps the money.
 *   · `charge_ref` is UNIQUE and per item. deduct_credits is idempotent on its ref, so a retried drain
 *     cannot charge twice — and a ref shared across the batch would make items 2..N FREE, which is a bug
 *     this codebase has already shipped once.
 *   · A submit that fails refunds immediately; a poll that reports failure refunds too. The credit is
 *     never held by a clip that will not exist.
 *
 * ⚠️ VEO GOES THROUGH lib/veo/engine AND THE BUDGET GUARD. This used to call lib/ai/geminiVeo directly,
 * which could only ever render on the Gemini API (adding GCP credentials moves every other Veo caller to
 * Vertex AI) and spent Google money OUTSIDE the daily budget guard — a 25-clip batch was 25 Veo jobs the
 * platform envelope never saw. The submit now runs inside guardedCall, priced like ServiceManager's Veo leg.
 * The stored `operation` is the engine's operation name, which says by itself which transport polls it
 * (`models/…` Gemini, `projects/…` Vertex), so a row submitted before a transport switch still resolves.
 *
 * ⚠️ AN AMBIGUOUS SUBMIT IS NEVER RE-SUBMITTED. A timed-out / 5xx create MAY have made a billed job, but
 * there is no operation name to poll, so the item fails and the user is refunded — the platform, not the
 * user, carries the possible Veo charge, and the budget keeps the estimate for it. A retry would risk two.
 */

const VIDEO_SECONDS = 8; // Veo's clip grid — see the project's scene-grid notes.
/** 7 days — the hosted copy's TTL, and V4 signing's own maximum for a Vertex clip. */
const DELIVERY_TTL_SEC = 604_800;
/** Anything smaller is not a playable clip — the floor ServiceManager.deliverVeoVideo uses too. */
const MIN_CLIP_BYTES = 1_024;
/** The legacy client's prompt cap: the enqueue cap is on the brief, and the English translation can run longer. */
const PROMPT_MAX_CHARS = 2_000;

/**
 * The stored shape as the engine's output format. The engine decides the native frame (1:1 renders at 16:9,
 * 4:5 at 9:16); this queue has no post-crop, so those clips are delivered at the native frame. Anything
 * unrecognised renders landscape, as the legacy client did.
 */
function outputFormat(aspect: string): OutputFormat {
  return aspect === '9:16' || aspect === '16:9' || aspect === '1:1' || aspect === '4:5' ? aspect : '16:9';
}

/**
 * The budget books a definitive refusal at $0 (nothing was created); an `ambiguous` submit keeps the estimate
 * because a billed job MAY exist — the guard errs toward counting money that may be spent.
 */
function submitActualCost(result: unknown): number | undefined {
  const outcome = (result as CreateVeoClipResult | null)?.outcome;
  return outcome && !outcome.ok && outcome.reason !== 'ambiguous' ? 0 : undefined;
}

export interface QueueItem {
  id: string; batch_id: string; ordinal: number; prompt: string; aspect: string;
  watermark: boolean; status: 'queued' | 'submitted' | 'done' | 'failed';
  operation: string | null; video_url: string | null; error: string | null;
  credits: number; attempts: number;
}

type Svc = ReturnType<typeof createServiceRoleClient>;
const COLS = 'id, batch_id, ordinal, prompt, aspect, watermark, status, operation, video_url, error, credits, attempts';

/** Enqueue a batch. Charges NOTHING — see the header. */
export async function enqueueBatch(
  svc: Svc, userId: string,
  prompts: string[], opts: { aspect?: string } = {},
): Promise<{ batchId: string; count: number }> {
  const batchId = randomUUID();
  const rows = prompts.map((prompt, ordinal) => ({
    batch_id: batchId, user_id: userId, ordinal,
    prompt: prompt.slice(0, 2000),
    aspect: opts.aspect ?? '16:9',
    // `watermark` is left at its column default. The row does not decide — shouldWatermark() does, at
    // render time, so a customer who pays mid-batch gets clean clips from the next one on.
  }));
  const { error } = await svc.from('agent_video_queue').insert(rows);
  if (error) throw error;
  return { batchId, count: rows.length };
}

export async function batchStatus(svc: Svc, batchId: string, userId: string): Promise<QueueItem[]> {
  // Scoped by user_id as well as batch_id: a batch id is a uuid, but authorisation should not rest on
  // it being unguessable.
  const { data } = await svc.from('agent_video_queue').select(COLS)
    .eq('batch_id', batchId).eq('user_id', userId).order('ordinal', { ascending: true });
  return (data ?? []) as QueueItem[];
}

/**
 * Mark an item failed and give back whatever it was actually charged.
 *
 * ⚠️ THE AMOUNT IS RE-READ FROM THE ROW, NEVER TAKEN FROM THE CALLER'S COPY. The first version trusted
 * the `item` snapshot drainOnce reads at the top of the request — but on the SUBMIT path the charge is
 * written *after* that read, so `item.credits` was still 0, the `> 0` guard never fired, and a failed clip
 * silently kept the user's money. Worse, the row was then stamped `credits: 0`, so it *looked* refunded.
 *
 * Verified live on 2026-08-06: a Veo refusal took 25 credits off a real balance and wrote no refund entry
 * to `credit_ledger` at all. The poll path happened to work — its `item` comes from a later read — which
 * is exactly why reading the code did not reveal it.
 *
 * ⚠️ `credits` IS ZEROED ONLY IF THE REFUND ACTUALLY LANDED. Zeroing regardless erases the evidence that
 * the user is still owed money, and a retry would then find nothing to give back.
 */
async function fail(svc: Svc, item: QueueItem, userId: string, reason: string): Promise<void> {
  const { data: fresh } = await svc.from('agent_video_queue').select('credits').eq('id', item.id).maybeSingle();
  const charged = Number((fresh as { credits?: number } | null)?.credits ?? item.credits ?? 0);

  let refunded = true;
  if (charged > 0) {
    // Same ref as the debit: probed live against refund_credits — it credits the balance rather than
    // being swallowed as a replay of the charge.
    const res = await refundCredits(userId, charged, `agentq:${item.id}`).catch(() => ({ ok: false as const }));
    refunded = res.ok;
    if (!refunded) {
      // eslint-disable-next-line no-console
      console.warn(`[agentq] refund MISSED for item ${item.id} (${charged} credits) — row keeps its charge`);
    }
  }

  await svc.from('agent_video_queue')
    .update({
      status: 'failed',
      error: reason.slice(0, 300),
      ...(refunded ? { credits: 0 } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id);
}

/**
 * Advance the queue by ONE step for this user and return what happened.
 * Submitted items are polled FIRST so a batch drains steadily instead of submitting everything and only
 * then discovering the provider is down.
 */
export async function drainOnce(svc: Svc, userId: string): Promise<{ action: string; item?: QueueItem }> {
  // ── 1. Poll the oldest in-flight clip ─────────────────────────────────────
  const { data: inflight } = await svc.from('agent_video_queue').select(COLS)
    .eq('user_id', userId).eq('status', 'submitted').order('created_at', { ascending: true }).limit(1).maybeSingle();

  if (inflight) {
    const item = inflight as QueueItem;
    if (!item.operation) { await fail(svc, item, userId, 'submitted without an operation handle'); return { action: 'failed', item }; }
    const res = await pollVeoClip(item.operation).catch(() => null);
    // `processing` covers every transient/unknown outcome by design — keep waiting rather than refunding
    // a clip that is still rendering. Only an explicit verdict (`filtered` / `failed`) ends the item.
    if (!res || res.state === 'processing') return { action: 'pending', item };
    if (res.state === 'filtered') { await fail(svc, item, userId, 'Google declined this clip under its safety rules'); return { action: 'failed', item }; }
    const video = res.state === 'succeeded' ? res.videos[0] : undefined;
    if (!video) { await fail(svc, item, userId, 'the provider could not render this clip'); return { action: 'failed', item }; }

    let url: string | null;
    if (video.kind === 'gcs') {
      // Vertex AI wrote the clip into our own bucket: a signed read URL IS the delivery — nothing to download
      // or re-host. A signing error is a delivery miss like any other, so it refunds.
      url = await deliverableUrl(video, DELIVERY_TTL_SEC).catch(() => null);
      if (!url) { await fail(svc, item, userId, 'video could not be hosted'); return { action: 'failed', item }; }
    } else {
      // A Gemini API file needs the key to read, so it is downloaded server-side (the key never leaves);
      // `bytes` is Vertex's inline output. Either way the clip is hosted once, at a path fixed per item.
      const buf = video.kind === 'bytes'
        ? Buffer.from(video.base64, 'base64')
        : await downloadGeminiVideo(video.uri).catch(() => null);
      if (!buf || buf.byteLength < MIN_CLIP_BYTES) { await fail(svc, item, userId, 'video could not be downloaded'); return { action: 'failed', item }; }

      url = await uploadBufferAndSign('uploads', `agentq/${item.id}.mp4`, buf, 'video/mp4', DELIVERY_TTL_SEC);
      if (!url) { await fail(svc, item, userId, 'video could not be hosted'); return { action: 'failed', item }; }
    }

    // ⚠️ WATERMARK LAST. Anything that crops or scales must happen before it — stripVeoWatermark crops
    // the bottom of the frame and would cut off a mark applied earlier. Fail-open: an unmarked clip is
    // better than losing a render the user has already paid for.
    //
    // ⚠️ THE SERVER DECIDES, NOT THE ROW. This used to read `item.watermark`, which came straight from
    // the enqueue request body — so `{"prompts":[…],"watermark":false}` bought an unmarked render for
    // nothing. Entitlement is read here, at render time, from the payment record; that also means a
    // customer who pays midway through a batch gets clean clips from the next one on.
    if (await shouldWatermark(userId)) url = (await addWatermark(url).catch(() => null)) ?? url;

    await svc.from('agent_video_queue')
      .update({ status: 'done', video_url: url, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    return { action: 'done', item };
  }

  // ── 2. Otherwise submit the next queued prompt ────────────────────────────
  const { data: next } = await svc.from('agent_video_queue').select(COLS)
    .eq('user_id', userId).eq('status', 'queued').order('ordinal', { ascending: true }).limit(1).maybeSingle();
  if (!next) return { action: 'idle' };
  const item = next as QueueItem;

  const transport = veoTransport();
  if (!transport) { await fail(svc, item, userId, 'video provider is not configured'); return { action: 'failed', item }; }

  // ⚠️ CHARGE HERE, NOT AT ENQUEUE, AND UNDER THIS ITEM'S OWN REF. `agentq:<item id>` is unique per row
  // and the column is UNIQUE, so a retried drain re-uses the same ref and deduct_credits — which is
  // idempotent on it — refuses to charge again.
  const cost = creditCostFor('video', { seconds: VIDEO_SECONDS });
  const ref = `agentq:${item.id}`;
  const debit = await deductCredits(userId, cost, ref);
  if (!debit.ok) {
    await svc.from('agent_video_queue')
      .update({ status: 'failed', error: 'insufficient_credits', updated_at: new Date().toISOString() })
      .eq('id', item.id);
    return { action: 'insufficient', item };
  }
  await svc.from('agent_video_queue')
    .update({ credits: cost, charge_ref: ref, attempts: item.attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', item.id);

  // Veo reads English — the same reason every other lane translates. The brief is a DESCRIPTION, so
  // there is nothing here that must survive verbatim.
  const promptEn = await promptToEnglish(item.prompt, 'video');
  // The default tier is what the legacy client rendered (veo-3.1-generate-preview, GEMINI_VEO_MODEL honoured).
  const model = resolveModel(transport, DEFAULT_TIER);
  let created: CreateVeoClipResult | null;
  try {
    created = await guardedCall(
      {
        service: 'video',
        model,
        // The seconds Veo renders at the exact tier × resolution × audio rate — the flat video line
        // under-reserves a Standard clip ~3×. Audio is always on (the Gemini API cannot turn it off).
        units: VIDEO_SECONDS,
        unitCostUsd: costPerSecondUsd(model, resolutionFor(VIDEO_SECONDS), true, transport),
        userId,
        promptSummary: item.prompt.slice(0, 200),
        actualCost: submitActualCost,
      },
      () =>
        createVeoClip({
          request: {
            prompt: promptEn.slice(0, PROMPT_MAX_CHARS),
            aspect: outputFormat(item.aspect),
            durationSec: VIDEO_SECONDS,
            generateAudio: true,
          },
          sessionId: `agentq-${item.batch_id}`,
          ordinal: item.ordinal,
        }),
    );
  } catch (err) {
    // ⚠️ The platform's budget said no BEFORE anything reached Google. The charge above already landed, so
    // this is a failed submit like any other: refunded, and the item ends. It is not left queued for the
    // budget to recover: its ref has now been charged AND refunded, and a second debit under that same ref
    // is not a path the ledger's idempotency was built for.
    if (err instanceof BudgetExceededError) {
      await fail(svc, item, userId, 'the platform video budget is exhausted — try again later');
      return { action: 'failed', item };
    }
    created = null; // createVeoClip never throws; anything else is a refused submit
  }

  const outcome = created?.outcome;
  if (!outcome?.ok) {
    const reason = outcome?.reason === 'ambiguous'
      ? 'the provider did not confirm the clip' // never re-submitted — see the header
      : 'the provider refused the clip';
    await fail(svc, item, userId, reason);
    return { action: 'failed', item };
  }

  await svc.from('agent_video_queue')
    .update({ status: 'submitted', operation: outcome.operation.name, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  return { action: 'submitted', item };
}
