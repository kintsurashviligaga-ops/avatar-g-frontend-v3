/**
 * GET /api/studio/library — the signed-in user's durable media Library.
 *
 * Returns their COMPLETED generations (newest first) normalized to a media-card
 * shape for the studio Library grid. Reads through the user's own session client
 * so Supabase RLS enforces owner-only access — a user can only ever see their own
 * films. Unauthenticated → an empty list (200), never a 401: the Library is
 * additive UI, and an anonymous visitor simply has nothing filed yet.
 *
 * Films rendered in the conversational studio are filed here by the assemble
 * route (recordCompletedFilm), alongside any avatar/image/music/voice produce
 * jobs — one unified per-user media history.
 */
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { JOB_COLUMNS, recordCompletedAsset, type GenerationJobRow } from '@/lib/orchestrator/jobs';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';
import {
  createSignedAssetUrls,
  describeSupabaseObjectUrl,
  libraryMediaBuckets,
  ownStorageHosts,
  verifyFileableUrl,
} from '@/lib/orchestrator/storage-adapter';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { normalizeRoomGeometry, normalizeStyleGuide, type RoomGeometry, type StyleGuide } from '@/lib/orchestrator/interior';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface LibraryItem {
  id: string;
  /** service_type — 'film' | 'avatar' | 'image' | 'music' | 'voice' | 'interior'. */
  kind: string;
  /** Playable / downloadable media URL. */
  url: string;
  /** The human prompt that produced it (for the card + copy-prompt action). */
  prompt: string | null;
  /** '16:9' default; 'vertical' (9:16) films get a portrait card. */
  orientation: 'landscape' | 'vertical';
  createdAt: string;
  /** An interior 3D plan (the Interior designer's „3D plan"): `url` is the render it was made for, this is the plan. */
  plan?: { geometry: RoomGeometry; style: StyleGuide };
}

/** The plan an interior row holds, normalised like the studio's own reader (the viewer builds meshes from these numbers). */
function pickPlan(row: GenerationJobRow): LibraryItem['plan'] | undefined {
  if (row.service_type !== 'interior') return undefined;
  const r = row.result as Record<string, unknown> | null;
  if (!r || !r.geometry || typeof r.geometry !== 'object') return undefined;
  return { geometry: normalizeRoomGeometry(r.geometry), style: normalizeStyleGuide(r.style ?? {}) };
}

/**
 * May this row's stored storage URL be re-signed? Producer rows carry server-generated URLs. A MANUAL save carries a
 * URL the caller chose, so it is re-signed only when POST proved it readable (params.storage_verified) — rows filed
 * before that check existed keep their stored URL and simply expire with it.
 */
function mayResign(row: GenerationJobRow): boolean {
  const params = (row.params ?? {}) as Record<string, unknown>;
  return params.source !== 'manual-save' || params.storage_verified === true;
}

/** A completed job exposes its media either as a signed_url or inside result.url. */
function pickUrl(row: GenerationJobRow): string | null {
  if (typeof row.signed_url === 'string' && row.signed_url) return row.signed_url;
  const r = row.result as Record<string, unknown> | null;
  if (r && typeof r.url === 'string' && r.url) return r.url;
  return null;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  // Anonymous testers (no sign-in) see the shared DEMO library, read with the service
  // role since there's no session for RLS. Signed-in users see their own via RLS.
  const uid = user?.id ?? DEMO_VOICE_USER_ID;
  const client = user ? supabase : createServiceRoleClient();
  if (!client) return NextResponse.json({ items: [] });

  const limit = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 40) || 40));
  // offset enables infinite-scroll pagination from the client — capped only
  // implicitly by what's in the user's library; out-of-range returns [].
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0);
  // Optional service_type filter: one kind, or a comma list of them (the Library's Video tab is film + avatar). Unknown
  // kinds are dropped; a filter with none left matches nothing rather than everything.
  const kindParam = req.nextUrl.searchParams.get('kind');
  const kinds = kindParam === null ? null : kindParam.split(',').map((k) => k.trim()).filter((k): k is ProduceKind => (VALID_KINDS as string[]).includes(k));
  if (kinds && kinds.length === 0) return NextResponse.json({ items: [] });

  try {
    let query = client
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', uid)
      .eq('status', 'completed')
      .neq('service_type', 'voice') // trained voice models aren't playable Library media
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (kinds) query = kinds.length === 1 ? query.eq('service_type', kinds[0]) : query.in('service_type', kinds);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return NextResponse.json({ items: [] });

    // Belt and braces: the query is already `.eq('user_id', uid)` (and RLS for a session client); a row for anyone
    // else never reaches the signer below even if that filter is ever dropped.
    const owned = (data as GenerationJobRow[]).filter((row) => row.user_id === uid);
    const resignable = new Set<number>(); // indices into `rows`
    const rows: LibraryItem[] = [];
    for (const row of owned) {
      const url = pickUrl(row);
      if (!url) continue; // a completed row with no media is not a Library item
      const params = (row.params ?? {}) as Record<string, unknown>;
      if (mayResign(row)) resignable.add(rows.length);
      const plan = pickPlan(row);
      rows.push({
        id: row.id,
        kind: row.service_type,
        url,
        prompt: typeof params.prompt === 'string' && params.prompt ? params.prompt : null,
        orientation: params.orientation === 'vertical' ? 'vertical' : 'landscape',
        createdAt: row.created_at,
        ...(plan ? { plan } : {}),
      });
    }

    // ── RE-SIGN ON READ ─────────────────────────────────────────────────────────────────────────────
    //
    // ⚠️ THE LIBRARY DECAYED. Every producer stores a SIGNED url in `signed_url` — surgicalOps signs for
    // WEEK_SEC, the music and image routes for 604800s — and this route used to hand that exact string
    // back forever. The ROW is permanent, so a card kept rendering; the URL behind it expired after
    // seven days and returned 400. A user's whole back catalogue silently rotted, oldest first, and the
    // failure looked like broken thumbnails rather than an expiry.
    //
    // The stored string still carries everything needed to fix it: parseSupabaseObjectUrl recovers the
    // bucket and path from a signed URL, so a fresh token can be minted per request without any schema
    // change or backfill — this repairs rows written months ago, not just new ones.
    //
    // Done in ONE batched call per bucket rather than N sequential ones: a 40-item page would otherwise
    // be 40 round trips to Supabase inside a request the browser is waiting on.
    //
    // ⚠️ THE SIGNER IS THE SERVICE ROLE, so only what is provably ours is re-signed: a SIGNED url (a public one never
    // expires — re-signing it would turn a guessed private path into a working link) on OUR project host (any
    // `*.supabase.co` parses, and another tenant can have a `renders` bucket too), in one of OUR media buckets, on a
    // row whose URL we wrote or verified (mayResign).
    const hosts = ownStorageHosts();
    const buckets = libraryMediaBuckets();
    const byBucket = new Map<string, Map<string, number[]>>(); // bucket → path → indices into `rows`
    rows.forEach((item, i) => {
      if (!resignable.has(i)) return;
      const ref = describeSupabaseObjectUrl(item.url);
      if (!ref) return; // an external provider URL is time-limited by its issuer; leave it alone
      if (ref.access !== 'sign' || !hosts.has(ref.host) || !buckets.has(ref.bucket)) return;
      const paths = byBucket.get(ref.bucket) ?? new Map<string, number[]>();
      paths.set(ref.path, [...(paths.get(ref.path) ?? []), i]);
      byBucket.set(ref.bucket, paths);
    });

    await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
      const list = [...paths.keys()];
      // 24h: comfortably longer than any session, short enough that a leaked URL is not permanent.
      const signed = await createSignedAssetUrls(bucket, list, 86_400).catch(() => list.map(() => null));
      list.forEach((path, k) => {
        const fresh = signed[k];
        if (!fresh) return; // signing failed (deleted object?) — keep the stored URL rather than blanking the card
        for (const i of paths.get(path) ?? []) {
          const row = rows[i];
          if (row) row.url = fresh;
        }
      });
    }));

    const items = rows;

    // Short PRIVATE browser cache: the library changes rarely, so this cuts refetches on tab-switches.
    // It must stay well under the 24h signing TTL above — a cached page holding stale tokens past their
    // expiry would reintroduce exactly the 400s this route now prevents. 30s against 24h is safe.
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

/**
 * POST /api/studio/library — explicitly file a generated media URL into the user's
 * Library (FIX 5 "📚 ბიბლიოთეკაში შენახვა"). Most generators auto-record, but
 * remix / product-ad / lip-sync results don't — this gives the user a one-click save
 * for ANY result.
 *
 * ⚠️ SIGNED-IN ONLY, AND ONLY A URL THE CALLER CAN ALREADY READ. Anonymous saves used to land in the shared demo
 * library, and any https URL was accepted — including a guessed path in our private buckets, which GET then
 * re-signed with the service role. Now: 401 without a session; one of OUR storage objects only through a currently
 * valid signed URL (verifyFileableUrl probes it); anything else must be a public http(s) address (no internal host).
 */
const VALID_KINDS: ProduceKind[] = ['film', 'avatar', 'interior', 'image', 'music', 'voice'];
const REFUSAL: Record<string, string> = {
  invalid_url: 'A public http(s) media URL is required.',
  not_media_bucket: 'That storage object cannot be saved to the library.',
  unsigned: 'A storage URL must be a valid signed link.',
  not_readable: 'That link has expired or cannot be read.',
};
export async function POST(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; kind?: unknown; prompt?: unknown };
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url || url.length > 4096 || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ success: false, error: REFUSAL.invalid_url }, { status: 400 });
  }
  const verdict = await verifyFileableUrl(url, { isPublicUrl: isPublicHttpUrl });
  if (!verdict.ok) return NextResponse.json({ success: false, error: REFUSAL[verdict.reason] ?? REFUSAL.invalid_url }, { status: 400 });
  // Normalize the client's kind to a valid service_type; anything else → 'film' (video).
  const rawKind = typeof body.kind === 'string' ? body.kind.trim() : '';
  const kind: ProduceKind = (VALID_KINDS as string[]).includes(rawKind) ? (rawKind as ProduceKind) : 'film';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 500) : null;
  // ONE FILE, ONE LIBRARY ROW. Remix, character swap and product ad file their result server-side (vremix:* rows) and
  // the studio also auto-saves it here, so every such render showed twice. A storage object of ours the caller already
  // has in the Library is answered as saved, with no second row. Read through the caller's own session (RLS: owner
  // only); a failed check files as before, since a duplicate costs less than a lost save.
  const ref = verdict.kind === 'own-signed' ? describeSupabaseObjectUrl(url) : null;
  if (ref) {
    try {
      const pattern = objectUrlPattern(ref.bucket, ref.path);
      const found = await Promise.all(['signed_url', 'result->>url'].map((column) =>
        supabase.from('generation_jobs').select('id').eq('user_id', user.id).like(column, pattern).limit(1)));
      if (found.some((r) => !r.error && Array.isArray(r.data) && r.data.length > 0)) {
        return NextResponse.json({ success: true, already: true });
      }
    } catch { /* file it */ }
  }
  try {
    const ok = await recordCompletedAsset({
      id: randomUUID(), userId: user.id, serviceType: kind, url, prompt, source: 'manual-save',
      storageVerified: verdict.kind === 'own-signed',
    });
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: 'Could not save to the library.' }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 502 });
  }
}

/**
 * DELETE /api/studio/library?id=<job_id> — delete a Library item: the row AND, when it is provably ours and nothing
 * else in the Library points at it, the stored file.
 *
 * ⚠️ THE FILE USED TO STAY. Both Library screens confirm with "delete this file permanently", but this route only
 * removed the generation_jobs row: the object stayed in storage, and a link copied or shared before the delete kept
 * playing until its token expired. Now the object goes with the row, under the same proof GET demands before it
 * re-signs with the service role (a SIGNED url on OUR host, in one of OUR media buckets), plus two more:
 *   • not a manual save — POST proves a manual save was READABLE, not that it was the caller's to destroy;
 *   • no other generation_jobs row names the object (the same film filed twice, or saved again by hand) — the
 *     object goes with the last of them.
 * Anything that fails a check, or that cannot be checked, is kept: an orphaned file costs storage, a wrongly
 * deleted one is gone.
 *
 * The row is deleted through the caller's own session (RLS: owner-only), and only a row that delete actually
 * returned can touch storage — a tampered id deletes nothing and removes nothing. 401 when signed out.
 * `storage` in the response says what happened to the file: deleted | kept | failed | none (no file of ours).
 */
type StorageOutcome = 'deleted' | 'kept' | 'failed' | 'none';

/**
 * A LIKE pattern for "a URL naming this object". Every character outside a plain path alphabet becomes `%`, so it
 * matches the object however a row spelled it (percent-encoded or not); LIKE's own wildcards can only widen the
 * match, which keeps more files, never fewer.
 */
function objectUrlPattern(bucket: string, path: string): string {
  const loose = (s: string) => s.replace(/[^A-Za-z0-9/._-]/g, '%');
  return `%/${loose(bucket)}/${loose(path)}%`;
}

async function removeLibraryObject(row: GenerationJobRow): Promise<StorageOutcome> {
  const url = pickUrl(row);
  const ref = url ? describeSupabaseObjectUrl(url) : null;
  if (!ref) return 'none'; // no media, or a provider's URL — nothing of ours to delete
  const params = (row.params ?? {}) as Record<string, unknown>;
  if (params.source === 'manual-save') return 'kept';
  if (ref.access !== 'sign' || !ownStorageHosts().has(ref.host) || !libraryMediaBuckets().has(ref.bucket)) return 'kept';
  try {
    const svc = createServiceRoleClient();
    const pattern = objectUrlPattern(ref.bucket, ref.path);
    const others = await Promise.all(['signed_url', 'result->>url'].map((column) =>
      svc.from('generation_jobs').select('id').like(column, pattern).neq('id', row.id).limit(1)));
    if (others.some((r) => r.error || !Array.isArray(r.data) || r.data.length > 0)) return 'kept';
    const { error } = await svc.storage.from(ref.bucket).remove([ref.path]);
    return error ? 'failed' : 'deleted';
  } catch {
    return 'failed';
  }
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
  try {
    const { data, error } = await supabase
      .from('generation_jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select(JOB_COLUMNS);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    const deleted = (Array.isArray(data) ? (data as unknown as GenerationJobRow[]) : []).find((row) => row.id === id && row.user_id === user.id);
    const storage = deleted ? await removeLibraryObject(deleted) : 'none';
    if (storage === 'failed') {
      // eslint-disable-next-line no-console
      console.warn('[library] row deleted, stored file could not be removed', { id });
    }
    return NextResponse.json({ success: true, storage });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'delete failed' }, { status: 500 });
  }
}
