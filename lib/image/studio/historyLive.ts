import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ImageError } from './errors';
import { IMAGE_KIND } from './contracts';
import type { ImageDeps } from './engine';
import type { ImageHistoryIO } from './history';

export function imageHistoryIO(deps: ImageDeps): ImageHistoryIO {
  return {
    async read(id, userId) {
      const row = await deps.store.read(id);
      return row?.userId === userId ? row : null;
    },
    async children(id, userId, limit) {
      const { data, error } = await createServiceRoleClient().from('generation_jobs')
        .select('id').eq('user_id', userId).eq('service_type', 'image')
        .eq('params->_exec->>kind', IMAGE_KIND).eq('params->_job->request->>parentJobId', id)
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw new ImageError('jobs_unavailable', 'Version history is unavailable.', 503);
      const rows = await Promise.all((data ?? []).map(r => deps.store.read(r.id)));
      return rows.filter((r): r is NonNullable<typeof r> => !!r && r.userId === userId);
    },
    resign: deps.resign,
  };
}
