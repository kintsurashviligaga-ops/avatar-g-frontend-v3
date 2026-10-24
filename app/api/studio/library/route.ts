/**
 * GET /api/studio/library — the signed-in user's durable media Library.
 *
 * Returns their COMPLETED generations (newest first) normalized to a media-card
 * shape for the studio Library grid. Reads through the user's own session client
 * so Supabase RLS enforces owner-only access — a user can only ever see their own
 * films. Unauthenticated → the shared demo library (200), never a 401, marked `demo: true`.
 *
 * The answer (§4.2.7: empty, signed-out/demo, unavailable and failed are told apart):
 *   200 { items, demo, nextCursor }   items may be [] (no works, or a page past the end)
 *   503 { items: [], error: 'library_unavailable' }   the database or the demo reader could not be reached
 *   500 { items: [], error: 'library_failed' }        anything else went wrong
 * A failure used to be a 200 with no items, which both Library screens showed as „nothing created yet".
 * `items: []` stays in the error bodies for any reader that looks only at `items`.
 *
 * Stars (§4.2.4): a signed-in caller's items carry `favorite`, and `favorite=1` reads only the starred works, paged like any
 * tab, so the Favorites tab covers the whole collection (it used to filter the newest 60 in one browser). The stars live
 * in public.library_favorites (supabase/migrations/20261024a), read through the caller's own session (RLS: owner only)
 * and written by PATCH below. Without that table a page still loads with every star off, and `favorite=1` answers
 * 503 { items: [], error: 'favorites_unavailable' }.
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
  provenOwnSignedLink,
  verifyFileableUrl,
} from '@/lib/orchestrator/storage-adapter';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { normalizeRoomGeometry, normalizeStyleGuide, type RoomGeometry, type StyleGuide } from '@/lib/orchestrator/interior';
import { serverTiming } from '@/lib/perf/serverTiming';

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
  /** When `url` stops working, if this answer minted it (ISO). Absent: a link this route did not sign (its issuer decides). */
  expiresAt?: string;
  /** The signed-in owner starred it. Absent on the demo library, and when the stars could not be read. */
  favorite?: boolean;
}

/** How long a link minted here works. 24 h: longer than any session, short enough that a leaked link is not permanent. */
const SIGNED_TTL_SEC = 86_400;

// ── Stable pages (§4.2.4) ─────────────────────────────────────────────────────────────────────────────────────────
// `offset` pages shift when a file is saved or deleted between two reads: the next page repeats or skips a row. A
// `before` cursor names the last row a page ended on, (created_at, id), and the next page starts strictly after it in
// the same order, so an insert at the top or a delete above never moves it. `offset` still works for the paged /library
// grid. The cursor is opaque to clients: base64url of {t, i}.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/;
const CURSOR_ID = /^[A-Za-z0-9:_.-]{1,200}$/;

export function encodeLibraryCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt, i: id })).toString('base64url');
}

/** The (created_at, id) a cursor names, or null when it is not one of ours. Both parts go into a PostgREST filter. */
export function decodeLibraryCursor(raw: string | null): { t: string; i: string } | null {
  if (!raw || raw.length > 512) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (typeof v.t !== 'string' || typeof v.i !== 'string') return null;
    if (!CURSOR_TIME.test(v.t) || Number.isNaN(Date.parse(v.t)) || !CURSOR_ID.test(v.i)) return null;
    return { t: v.t, i: v.i };
  } catch {
    return null;
  }
}

/** A no-store error answer: never „you have no works". */
function failure(status: 503 | 500, timing: ReturnType<typeof serverTiming>, error = status === 503 ? 'library_unavailable' : 'library_failed') {
  return NextResponse.json(
    { items: [], error },
    { status, headers: { 'Cache-Control': 'private, no-store', ...timing.headers() } },
  );
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
 * URL the caller chose, so it is re-signed only when POST proved it readable (params.storage_verified). A row filed
 * before that check existed is re-signed once its stored token proves the link was ours (provenOwnSignedLink, in GET).
 */
function mayResign(row: GenerationJobRow): boolean {
  const params = (row.params ?? {}) as Record<string, unknown>;
  return params.source !== 'manual-save' || params.storage_verified === true;
}

/** How many legacy manual saves one page proves (one ranged GET each, in parallel). A page is at most 60 rows. */
const LEGACY_PROOFS_PER_PAGE = 60;

/** A completed job exposes its media either as a signed_url or inside result.url. */
function pickUrl(row: GenerationJobRow): string | null {
  if (typeof row.signed_url === 'string' && row.signed_url) return row.signed_url;
  const r = row.result as Record<string, unknown> | null;
  if (r && typeof r.url === 'string' && r.url) return r.url;
  return null;
}

export async function GET(req: NextRequest) {
  // Spans (auth, db, proof, sign) only for a request that opts in with a trace id (lib/perf/serverTiming); every
  // other request is answered exactly as before.
  const timing = serverTiming(req);
  const { supabase, user } = await timing.time('auth', authedClientFromRequest(req));
  // Anonymous testers (no sign-in) see the shared DEMO library, read with the service
  // role since there's no session for RLS. Signed-in users see their own via RLS.
  const uid = user?.id ?? DEMO_VOICE_USER_ID;
  const demo = !user;
  const client = user ? supabase : createServiceRoleClient();
  if (!client) return failure(503, timing);

  const limit = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 40) || 40));
  // offset enables infinite-scroll pagination from the client — capped only
  // implicitly by what's in the user's library; out-of-range returns [].
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0);
  // Optional service_type filter: one kind, or a comma list of them (the Library's Video tab is film + avatar). Unknown
  // kinds are dropped; a filter with none left matches nothing rather than everything.
  const kindParam = req.nextUrl.searchParams.get('kind');
  const kinds = kindParam === null ? null : kindParam.split(',').map((k) => k.trim()).filter((k): k is ProduceKind => (VALID_KINDS as string[]).includes(k));
  // Only the starred works. A signed-out visitor has none (the demo library is nobody's to star).
  const favoritesOnly = req.nextUrl.searchParams.get('favorite') === '1';
  if ((kinds && kinds.length === 0) || (favoritesOnly && !user)) {
    return NextResponse.json({ items: [], demo, nextCursor: null }, { headers: { 'Cache-Control': 'private, no-store', ...timing.headers() } });
  }
  // A malformed cursor is refused rather than read as „from the top", which would repeat the first page.
  const beforeParam = req.nextUrl.searchParams.get('before');
  const before = decodeLibraryCursor(beforeParam);
  if (beforeParam !== null && !before) {
    return NextResponse.json({ items: [], error: 'bad_cursor' }, { status: 400, headers: { 'Cache-Control': 'private, no-store', ...timing.headers() } });
  }

  try {
    let query = client
      .from('generation_jobs')
      // The inner join keeps only rows the caller starred (RLS lets them see their own stars only), in the same order and
      // with the same cursor as every other tab.
      .select(favoritesOnly ? `${JOB_COLUMNS},library_favorites!inner(job_id)` : JOB_COLUMNS)
      .eq('user_id', uid)
      .eq('status', 'completed')
      .neq('service_type', 'voice') // trained voice models aren't playable Library media
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }) // one total order, so a cursor (and two rows in the same instant) is stable
      .range(before ? 0 : offset, (before ? 0 : offset) + limit - 1);
    if (kinds) query = kinds.length === 1 ? query.eq('service_type', kinds[0]) : query.in('service_type', kinds);
    // Strictly after the cursor's row. Both values passed decodeLibraryCursor (no quote, comma or parenthesis) and are
    // double-quoted, so neither can end the filter.
    if (before) query = query.or(`created_at.lt."${before.t}",and(created_at.eq."${before.t}",id.lt."${before.i}")`);

    const { data, error } = await timing.time('db', Promise.resolve(query));
    if (error || !Array.isArray(data)) return failure(503, timing, favoritesOnly ? 'favorites_unavailable' : undefined);
    // A full page may have more behind it. The cursor is the last ROW read (a row without media is skipped below, but
    // it still marks where this page ended).
    const last = data.length === limit ? (data as unknown as GenerationJobRow[])[data.length - 1] : undefined;
    const nextCursor = last ? encodeLibraryCursor(last.created_at, last.id) : null;

    // Belt and braces: the query is already `.eq('user_id', uid)` (and RLS for a session client); a row for anyone
    // else never reaches the signer below even if that filter is ever dropped.
    const owned = (data as unknown as GenerationJobRow[]).filter((row) => row.user_id === uid);
    const resignable = new Set<number>(); // indices into `rows`
    const unproven = new Map<number, GenerationJobRow>(); // legacy manual saves, proven below or left as stored
    const rows: LibraryItem[] = [];
    for (const row of owned) {
      const url = pickUrl(row);
      if (!url) continue; // a completed row with no media is not a Library item
      const params = (row.params ?? {}) as Record<string, unknown>;
      if (mayResign(row)) resignable.add(rows.length);
      else unproven.set(rows.length, row);
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
    // A manual save filed before POST probed it is re-signed once its own stored token proves the link was ours
    // (provenOwnSignedLink); the proof is written back so the next read skips the probe. Bounded per page.
    // Which of this page the caller starred, read while the links are proven and signed. A failed read leaves `favorite`
    // out (the screen shows the star off), never fails the page.
    const starred = user && !favoritesOnly && rows.length
      ? timing.time('fav', Promise.resolve(client.from('library_favorites').select('job_id').in('job_id', rows.map((r) => r.id))))
        .then(({ data: favs, error: favError }) => (favError || !Array.isArray(favs) ? null : new Set(favs.map((f) => String((f as { job_id: unknown }).job_id)))))
        .catch(() => null)
      : Promise.resolve(null);

    const legacy = [...unproven.entries()].slice(0, LEGACY_PROOFS_PER_PAGE);
    const svc = legacy.length ? createServiceRoleClient() : null;
    await timing.time('proof', Promise.all(legacy.map(async ([i, row]) => {
      const item = rows[i];
      if (!item || !(await provenOwnSignedLink(item.url))) return;
      resignable.add(i);
      const params = (row.params ?? {}) as Record<string, unknown>;
      try {
        await svc?.from('generation_jobs').update({ params: { ...params, storage_verified: true } }).eq('id', row.id).eq('user_id', uid);
      } catch { /* the proof is simply repeated on the next read */ }
    })));

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

    const signedAt = Date.now();
    await timing.time('sign', Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
      const list = [...paths.keys()];
      const signed = await createSignedAssetUrls(bucket, list, SIGNED_TTL_SEC).catch(() => list.map(() => null));
      // The clock was read before signing, so this is never later than the token's own expiry.
      const expiresAt = new Date(signedAt + SIGNED_TTL_SEC * 1000).toISOString();
      list.forEach((path, k) => {
        const fresh = signed[k];
        if (!fresh) return; // signing failed (deleted object?) — keep the stored URL rather than blanking the card
        for (const i of paths.get(path) ?? []) {
          const row = rows[i];
          if (row) { row.url = fresh; row.expiresAt = expiresAt; }
        }
      });
    })));

    const stars = favoritesOnly ? null : await starred;
    if (user && (favoritesOnly || stars)) for (const item of rows) item.favorite = favoritesOnly || stars!.has(item.id);
    const items = rows;

    // NOT CACHED BY THE BROWSER (§4.2). The page is one account's works with signed links in it, and a browser cache keys
    // by URL, not by account: on a shared device the next account could be served this answer. Both Library screens
    // keep it instead in lib/library/libraryQuery, keyed by the account and dropped when the session changes; they
    // fetch with `no-store`, which this header now matches (it said `private, max-age=30`, which they never used).
    return NextResponse.json({ items, demo, nextCursor }, { headers: { 'Cache-Control': 'private, no-store', ...timing.headers() } });
  } catch {
    return failure(500, timing);
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

/**
 * PATCH /api/studio/library — star or unstar works (§4.2.4). Body `{ id, favorite }` for one work, or
 * `{ ids, favorite }` (at most MAX_FAVORITE_IDS) for the one-time move of the stars a browser kept before stars were the
 * account's (lib/library/libraryQuery migrateDeviceFavorites).
 *
 * ⚠️ NOT ON THE WORK'S OWN ROW. A star is a row in public.library_favorites, never a write to generation_jobs: every write
 * there moves its updated_at, and the bell's feed, the task tray and the delivery outbox read a recent updated_at as
 * "this just finished" (supabase/migrations/20261024a). Written through the service role (nobody else may write the
 * table), so the caller is checked by hand first: a work is starred only when the caller's OWN session can read it as one
 * of their finished Library works, and an unstar deletes only the caller's own stars. An id that is not theirs (a
 * browser shared by two accounts keeps both accounts' old stars) is skipped, and nothing says whose it is.
 *
 * 401 signed out · 400 a malformed body · 404 the one work named is not the caller's · 503 the stars cannot be written
 * (no table yet, no service role). Success: `{ success: true, favorite, ids }`, ids being the works now in that state.
 */
const MAX_FAVORITE_IDS = 200;
const FAVORITE_ID = /^[A-Za-z0-9:_.-]{1,200}$/;

export async function PATCH(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401, headers });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; ids?: unknown; favorite?: unknown };
  const one = typeof body.id === 'string';
  const raw: unknown[] | null = one ? [body.id] : Array.isArray(body.ids) ? body.ids : null;
  if (typeof body.favorite !== 'boolean' || !raw || raw.length === 0 || raw.length > MAX_FAVORITE_IDS
    || !raw.every((v): v is string => typeof v === 'string' && FAVORITE_ID.test(v))) {
    return NextResponse.json({ success: false, error: 'invalid_request' }, { status: 400, headers });
  }
  const favorite = body.favorite;
  const ids = [...new Set(raw as string[])];
  const svc = createServiceRoleClient();
  if (!svc) return NextResponse.json({ success: false, error: 'favorites_unavailable' }, { status: 503, headers });
  try {
    if (!favorite) {
      const { error } = await svc.from('library_favorites').delete().eq('user_id', user.id).in('job_id', ids);
      if (error) return NextResponse.json({ success: false, error: 'favorites_unavailable' }, { status: 503, headers });
      return NextResponse.json({ success: true, favorite, ids }, { headers });
    }
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('id')
      .in('id', ids)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .neq('service_type', 'voice');
    if (error || !Array.isArray(data)) return NextResponse.json({ success: false, error: 'library_unavailable' }, { status: 503, headers });
    const asked = new Set(ids);
    const mine = data.map((r) => String((r as { id: unknown }).id)).filter((id) => asked.has(id));
    if (mine.length === 0) {
      return one
        ? NextResponse.json({ success: false, error: 'not_found' }, { status: 404, headers })
        : NextResponse.json({ success: true, favorite, ids: [] }, { headers });
    }
    const { error: starError } = await svc
      .from('library_favorites')
      .upsert(mine.map((job_id) => ({ user_id: user.id, job_id })), { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (starError) return NextResponse.json({ success: false, error: 'favorites_unavailable' }, { status: 503, headers });
    return NextResponse.json({ success: true, favorite, ids: mine }, { headers });
  } catch {
    return NextResponse.json({ success: false, error: 'favorite_failed' }, { status: 500, headers });
  }
}
