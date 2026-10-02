/**
 * lib/research/runtime.ts — the real wiring of the research saga: the service-role Supabase client, the production ledger
 * (lib/orchestrator/ledger — the ONLY module allowed to call the money RPCs), the Interactions client (header key,
 * redirect: manual), the connectors store, the notifications table and the ops alerts. Routes call getResearchRuntime();
 * tests build the service with fakes (lib/research/testing/fakes.ts) instead.
 *
 * Built per request on purpose (every piece is a thin closure): a test that mocks the Supabase module, the ledger or
 * `fetch` is honoured by the next call, and nothing here holds state between requests.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createLocalFilesStore, type LocalFilesStore } from '@/lib/connectors/localFiles';
import { notifyUser } from '@/lib/notifications/dispatch';
import { opsMarker } from '@/lib/observability/reliability';
import { reportError } from '@/lib/observability/report-error';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createInteractionsClient } from './interactionsClient';
import type { LiveReportDeps } from './liveContext';
import { notificationText } from './notify';
import { createResearchService, type ResearchService } from './service';
import { createSupabaseResearchStore, type ResearchStore } from './store';

type Db = ReturnType<typeof createServiceRoleClient>;

export interface ResearchRuntime {
  db: Db;
  store: ResearchStore;
  files: LocalFilesStore;
  service: ResearchService;
}

export function getResearchRuntime(): ResearchRuntime | null {
  let db: Db;
  try {
    db = createServiceRoleClient();
  } catch {
    return null;
  }
  if (!db) return null;
  const store = createSupabaseResearchStore(db as never);
  const files = createLocalFilesStore(db as never);
  const service = createResearchService({
    store,
    client: createInteractionsClient(),
    ledger: {
      deduct: (userId, credits, ref) => deductCredits(userId, credits, ref),
      refundByRef: (userId, ref, claimed) => refundDebitByRef(userId, ref, claimed),
    },
    files: { loadForRun: files.loadForRun },
    async notify(job, outcome) {
      // The bell, plus Web Push and the user's linked WhatsApp. The service already notifies a job once (notified_at
      // compare-and-set); the dedupe key is a second lock for the outside channels.
      await notifyUser({
        userId: job.user_id,
        kind: 'research',
        title: notificationText(job, outcome),
        body: '',
        url: '/dashboard',
        dedupeKey: `research:${job.id}:${outcome}`,
        locale: job.locale === 'en' || job.locale === 'ru' ? job.locale : 'ka',
      });
    },
    alert(marker, data) {
      opsMarker('error', marker, data);
      reportError(new Error(marker), data);
    },
    now: () => Date.now(),
    newId: () => randomUUID(),
  });
  return { db, store, files, service };
}

/** What a Live call needs to talk about a report: the CALLER'S OWN finished report, or nothing. */
export function researchLiveDeps(): LiveReportDeps {
  return {
    async getReport(userId, id) {
      const rt = getResearchRuntime();
      if (!rt) return null;
      const job = await rt.store.getForUser(id, userId);
      if (!job || job.status !== 'completed' || !job.report_md) return null;
      return { report: job.report_md, title: job.title };
    },
  };
}
