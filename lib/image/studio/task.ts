import type { TaskRow, TaskView } from '@/lib/tasks/taskView';
import type { TaskKind } from '@/lib/tasks/taskService';
import { leaseRowOf } from '@/lib/orchestrator/jobLease';
import { IMAGE_KIND } from './contracts';
import { imageStatus, imageView, cancelImage, type ImageDeps } from './engine';

function project(row: TaskRow, view: ReturnType<typeof imageView>): TaskView {
  const out = view.result;
  return {
    id: row.id, kind: IMAGE_KIND, service: 'image', status: view.status,
    stage: view.stage, pct: view.progress, attempt: view.attempt, error: view.error,
    cancellable: view.cancellable, position: null,
    label: typeof row.params?.prompt === 'string' ? row.params.prompt.slice(0, 160) : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    result: out && typeof out.url === 'string' ? {
      url: out.url, media: 'image', width: Number(out.width), height: Number(out.height), bytes: Number(out.bytes),
    } : null,
  };
}
/** Additive adapter to the existing unified Task API, with unknown progress represented by null. */
export function imageTaskKind(deps: () => ImageDeps, startWorker: (id: string) => void): TaskKind {
  return {
    async status(row, userId) {
      try {
        const status = await imageStatus(deps(), userId, row.id);
        return { task: project(row, status.view), needsWorker: status.needsWorker };
      } catch { return null; }
    },
    view(row) {
      const lease = leaseRowOf(row as unknown as Record<string, unknown>);
      return lease?.exec?.kind === IMAGE_KIND ? project(row, imageView(lease)) : null;
    },
    async cancel(userId, id) {
      try { await cancelImage(deps(), userId, id); return 'ok'; }
      catch (e) {
        const code = (e as { code?: string }).code;
        return code === 'not_running' ? 'not_running' : code === 'jobs_unavailable' ? 'busy' : 'not_found';
      }
    },
    startWorker,
  };
}
