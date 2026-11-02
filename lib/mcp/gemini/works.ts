import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '../../env/public';
import { isPublicHttpUrl } from '../../security/allowlistedAudioFetch';
import { createSignedAssetUrls, describeSupabaseObjectUrl, libraryMediaBuckets, ownStorageHosts, provenOwnSignedLink } from '../../orchestrator/storage-adapter';

type Principal = { userId: string; token: string };
type Work = { id: string; kind: string; createdAt: string; prompt: string | null; url: string; expiresAt?: string };
const TTL_SECONDS = 900;

/** Read only the owner's rows via their own RLS client. Never send their bearer
 * token to an arbitrary API or sign an object on an untrusted host/bucket. */
export async function readRecentWorks(principal: Principal, limit: number): Promise<Work[]> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon } = publicEnv;
  if (!url || !anon) throw new Error('library_unavailable');
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${principal.token}` } } });
  const { data, error } = await client.from('generation_jobs')
    .select('id,user_id,service_type,created_at,signed_url,result,params')
    .eq('user_id', principal.userId).eq('status', 'completed').neq('service_type', 'voice')
    .order('created_at', { ascending: false }).limit(limit);
  if (error || !Array.isArray(data)) throw new Error('library_unavailable');

  const hosts = ownStorageHosts();
  const buckets = libraryMediaBuckets();
  const works: Work[] = [];
  const sign: Array<{ work: Work; bucket: string; path: string }> = [];
  for (const row of data) {
    if (row.user_id !== principal.userId) continue;
    const raw = typeof row.signed_url === 'string' && row.signed_url ? row.signed_url :
      row.result && typeof row.result === 'object' && typeof row.result.url === 'string' ? row.result.url : '';
    if (!raw || !/^https:\/\//i.test(raw) || !isPublicHttpUrl(raw)) continue;
    const ref = describeSupabaseObjectUrl(raw);
    const params = row.params && typeof row.params === 'object' ? row.params : {};
    const item: Work = { id: row.id, kind: row.service_type, createdAt: row.created_at, prompt: typeof params.prompt === 'string' ? params.prompt : null, url: raw };
    if (ref && hosts.has(ref.host)) {
      // Mirror the Library's protections before its service-role signer is used.
      if (!buckets.has(ref.bucket)) continue;
      if (ref.access === 'sign') {
        if (params.source === 'manual-save' && params.storage_verified !== true && !(await provenOwnSignedLink(raw))) continue;
        item.url = '';
        sign.push({ work: item, bucket: ref.bucket, path: ref.path });
      }
    }
    works.push(item);
  }

  const grouped = new Map<string, Array<{ work: Work; path: string }>>();
  for (const item of sign) grouped.set(item.bucket, [...(grouped.get(item.bucket) ?? []), item]);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  await Promise.all([...grouped.entries()].map(async ([bucket, entries]) => {
    const signed = await createSignedAssetUrls(bucket, entries.map((entry) => entry.path), TTL_SECONDS).catch(() => []);
    entries.forEach(({ work }, i) => { if (signed[i] && /^https:\/\//i.test(signed[i]!) && isPublicHttpUrl(signed[i]!)) { work.url = signed[i]!; work.expiresAt = expiresAt; } });
  }));
  // A failed re-sign must never return the expired stored URL as a fresh asset.
  return works.filter((work) => Boolean(work.url));
}
