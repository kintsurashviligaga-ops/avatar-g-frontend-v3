import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { createGeminiVeoClip, pollGeminiVeoTask, fetchVeoVideoBuffer, hasGeminiVeoProvider } from '@/lib/ai/geminiVeo';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { addWatermark } from '@/lib/video/remixOps';
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
 */

const VIDEO_SECONDS = 8; // Veo's clip grid — see the project's scene-grid notes.

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
  prompts: string[], opts: { aspect?: string; watermark?: boolean } = {},
): Promise<{ batchId: string; count: number }> {
  const batchId = randomUUID();
  const rows = prompts.map((prompt, ordinal) => ({
    batch_id: batchId, user_id: userId, ordinal,
    prompt: prompt.slice(0, 2000),
    aspect: opts.aspect ?? '16:9',
    watermark: opts.watermark !== false,
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

async function fail(svc: Svc, item: QueueItem, userId: string, reason: string): Promise<void> {
  // Refund only what was actually charged for THIS item, under its own ref.
  if (item.credits > 0) {
    await refundCredits(userId, item.credits, `agentq:${item.id}`).catch(() => {});
  }
  await svc.from('agent_video_queue')
    .update({ status: 'failed', error: reason.slice(0, 300), credits: 0, updated_at: new Date().toISOString() })
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
    const res = await pollGeminiVeoTask(item.operation).catch(() => null);
    // `processing` covers every transient/unknown outcome by design — keep waiting rather than refunding
    // a clip that is still rendering. Only an explicit `failed` ends the item.
    if (!res || res.status === 'processing') return { action: 'pending', item };
    if (res.status === 'failed' || !res.uri) { await fail(svc, item, userId, 'the provider could not render this clip'); return { action: 'failed', item }; }

    const buf = await fetchVeoVideoBuffer(res.uri).catch(() => null);
    if (!buf) { await fail(svc, item, userId, 'video could not be downloaded'); return { action: 'failed', item }; }

    let url = await uploadBufferAndSign('uploads', `agentq/${item.id}.mp4`, buf, 'video/mp4', 604_800);
    if (!url) { await fail(svc, item, userId, 'video could not be hosted'); return { action: 'failed', item }; }

    // ⚠️ WATERMARK LAST. Anything that crops or scales must happen before it — stripVeoWatermark crops
    // the bottom of the frame and would cut off a mark applied earlier. Fail-open: an unmarked clip is
    // better than losing a render the user has already paid for.
    if (item.watermark) url = (await addWatermark(url).catch(() => null)) ?? url;

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

  if (!hasGeminiVeoProvider()) { await fail(svc, item, userId, 'video provider is not configured'); return { action: 'failed', item }; }

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
  const created = await createGeminiVeoClip({
    promptText: promptEn, aspect: item.aspect, durationSec: VIDEO_SECONDS,
  }).catch(() => null);

  if (!created?.operation) { await fail(svc, item, userId, 'the provider refused the clip'); return { action: 'failed', item }; }

  await svc.from('agent_video_queue')
    .update({ status: 'submitted', operation: created.operation, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  return { action: 'submitted', item };
}
