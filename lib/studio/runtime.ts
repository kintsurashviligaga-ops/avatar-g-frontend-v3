/**
 * The real wiring for the studio saga — the only place that knows which ledger, store, provider, Redis and
 * storage the saga talks to. Routes call getStudioRuntime(); tests build the saga with fakes instead.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/platform/redis';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { opsMarker } from '@/lib/observability/reliability';
import { createHiggsfieldAdapter } from '@/lib/providers/higgsfield/adapter';
import { webhookUrlForJob } from '@/lib/providers/higgsfield/webhookAuth';
import { createStudioSaga, type StudioSaga } from '@/lib/studio/saga';
import { createRedisSemaphore, type SemaphoreRedis } from '@/lib/studio/semaphore';
import { copyOutputsToStorage, signOutputs } from '@/lib/studio/outputs';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import type { Signer } from '@/lib/studio/media';
import { createSupabaseStudioStore, type StoredOutput, type StudioJob, type StudioStore } from '@/lib/studio/store';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';

/** generation_jobs.service_type only allows the ProduceKind values; the studio service rides in `subtype`. */
const LIBRARY_KIND: Record<StudioJob['service'], ProduceKind> = {
  image: 'image',
  video: 'film',
  avatar: 'avatar',
  motion: 'film',
  remix: 'film',
};

export interface StudioRuntime {
  saga: StudioSaga;
  store: StudioStore;
  signOutputs: (outputs: StoredOutput[]) => Promise<string[]>;
}

export function getStudioRuntime(): StudioRuntime | null {
  let sb: ReturnType<typeof createServiceRoleClient>;
  try {
    sb = createServiceRoleClient();
  } catch {
    return null;
  }
  if (!sb) return null;
  const store = createSupabaseStudioStore(sb as never);
  const redis = getRedisClient() as unknown as SemaphoreRedis | null;

  const saga = createStudioSaga({
    store,
    provider: createHiggsfieldAdapter(),
    ledger: {
      deduct: (userId, credits, ref) => deductCredits(userId, credits, ref),
      refundByRef: (userId, ref, claimed) => refundDebitByRef(userId, ref, claimed),
    },
    semaphore: createRedisSemaphore(redis),
    copyOutputs: copyOutputsToStorage,
    async fileInLibrary(job, outputs) {
      const [first] = await signOutputs(outputs.slice(0, 1));
      if (!first) return;
      await recordCompletedAsset({
        id: `studio_${job.id}`,
        userId: job.user_id,
        serviceType: LIBRARY_KIND[job.service],
        url: first,
        prompt: job.prompt_original ?? (typeof job.input.prompt === 'string' ? job.input.prompt : null),
        source: 'studio',
        subtype: job.service,
      });
    },
    webhookUrlFor: (jobId) => webhookUrlForJob(jobId),
    translatePrompt: (text, medium) => promptToEnglish(text, medium),
    alert(marker, data) {
      opsMarker('error', marker, data);
      reportError(new Error(marker), data);
    },
    now: () => Date.now(),
    newId: () => randomUUID(),
  });

  return { saga, store, signOutputs: (o) => signOutputs(o) };
}

/** Signs a reference the browser uploaded through /api/upload/sign (the `uploads` bucket). */
export const signUploadedReference: Signer = (path, expiresSec) =>
  createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', path, expiresSec);
