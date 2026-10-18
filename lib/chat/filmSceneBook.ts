/**
 * lib/chat/filmSceneBook.ts — where a scene redo (./filmSceneRedo) keeps its state: the film's scene book, the film's
 * last delivered stitch, and each redo with its claims. Upstash Redis, shared by every instance; a process-local map
 * only where FILM_CHAIN_MEMORY=1 (a single dev/test server, the same switch the sequential chain uses).
 *
 * Every record is written by the server and owner-bound: a read for any other account finds nothing. With no store a
 * redo is simply not offered (the routes answer 503), so nothing is charged that could not be followed through.
 */
import 'server-only';
import type { Redis } from '@upstash/redis';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';
import { FILM_BOOK_TTL_SEC, type FilmRedoJob, type FilmSceneBook, type FilmStitchRecord } from './filmSceneRedo';

/** One render of a scene at a time: held while it renders, cleared when it lands, fails or is given up on. */
const BUSY_TTL_SEC = 30 * 60;
/** One stitch of a film at a time (a stitch runs for at most the route's 600 s). */
const STITCH_TTL_SEC = 11 * 60;

let client: Redis | null = null;
let resolved = false;
function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const env = upstashRestEnv();
  if (env) client = createUpstashRedis(env.url, env.token);
  return client;
}

const memory = new Map<string, { value: string; exp: number }>();
const memoryAllowed = (): boolean => /^(1|true|on)$/i.test((process.env.FILM_CHAIN_MEMORY || '').trim());

/** Test hook: point the store at a fake client (null = no Redis). */
export function __setFilmSceneBookRedisForTests(fake: Redis | null): void {
  client = fake;
  resolved = true;
  memory.clear();
}

const bookKey = (t: string) => `film:scenes:${t}`;
const stitchKey = (t: string) => `film:stitched:${t}`;
const jobKey = (t: string, n: number) => `film:redo:${t}:${n}`;
const busyKey = (t: string, n: number) => `film:redo:${t}:${n}:busy`;
const countKey = (t: string, n: number) => `film:redo:${t}:${n}:n`;
const stitchingKey = (t: string) => `film:redo:${t}:stitching`;

function memGet(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { memory.delete(key); return null; }
  return hit.value;
}

/** Whether a redo can be followed through on this deployment. */
export function filmSceneBookReady(): boolean {
  return redis() !== null || memoryAllowed();
}

async function put(key: string, value: unknown, ttlSec: number): Promise<boolean> {
  const raw = JSON.stringify(value);
  const r = redis();
  if (r) {
    try { await r.set(key, raw, { ex: ttlSec }); return true; } catch { return false; }
  }
  if (!memoryAllowed()) return false;
  memory.set(key, { value: raw, exp: Date.now() + ttlSec * 1000 });
  return true;
}

async function read<T>(key: string): Promise<T | null> {
  const r = redis();
  let raw: unknown = null;
  if (r) {
    try { raw = await r.get(key); } catch { return null; }
  } else if (memoryAllowed()) {
    raw = memGet(key);
  }
  if (raw == null) return null;
  try { return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T; } catch { return null; }
}

/** SET NX: true when this caller now holds the key. A store that cannot answer holds nothing. */
async function claim(key: string, ttlSec: number): Promise<boolean> {
  const r = redis();
  if (r) {
    try { return (await r.set(key, String(Date.now()), { nx: true, ex: ttlSec })) === 'OK'; } catch { return false; }
  }
  if (!memoryAllowed() || memGet(key) !== null) return false;
  memory.set(key, { value: String(Date.now()), exp: Date.now() + ttlSec * 1000 });
  return true;
}

async function drop(key: string): Promise<void> {
  const r = redis();
  if (r) {
    try { await r.del(key); } catch { /* the TTL clears it */ }
    return;
  }
  memory.delete(key);
}

// ─── The scene book ────────────────────────────────────────────────────────────────────────────────────────────

export async function saveFilmSceneBook(book: FilmSceneBook): Promise<boolean> {
  return put(bookKey(book.tokenId), book, FILM_BOOK_TTL_SEC);
}

/** The film's scene book, for its owner only. */
export async function getFilmSceneBook(tokenId: string, uid: string): Promise<FilmSceneBook | null> {
  if (!tokenId || !uid) return null;
  const book = await read<FilmSceneBook>(bookKey(tokenId));
  return book && book.v === 1 && book.tokenId === tokenId && book.uid === uid && Array.isArray(book.scenes) ? book : null;
}

// ─── The film's last delivered stitch ───────────────────────────────────────────────────────────────────────────

export async function saveFilmStitchRecord(rec: FilmStitchRecord): Promise<boolean> {
  return put(stitchKey(rec.tokenId), rec, FILM_BOOK_TTL_SEC);
}

/** What the film's last delivered stitch was cut from, for its owner only. */
export async function getFilmStitchRecord(tokenId: string, uid: string): Promise<FilmStitchRecord | null> {
  if (!tokenId || !uid) return null;
  const rec = await read<FilmStitchRecord>(stitchKey(tokenId));
  return rec && rec.v === 1 && rec.tokenId === tokenId && rec.uid === uid && Array.isArray(rec.segments) ? rec : null;
}

// ─── Redo jobs ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function saveFilmRedoJob(job: FilmRedoJob): Promise<boolean> {
  return put(jobKey(job.tokenId, job.ordinal), job, FILM_BOOK_TTL_SEC);
}

/** The scene's latest redo, for its owner only. */
export async function getFilmRedoJob(tokenId: string, ordinal: number, uid: string): Promise<FilmRedoJob | null> {
  if (!tokenId || !uid || !Number.isInteger(ordinal)) return null;
  const job = await read<FilmRedoJob>(jobKey(tokenId, ordinal));
  return job && job.v === 1 && job.tokenId === tokenId && job.ordinal === ordinal && job.uid === uid ? job : null;
}

/** Hold the scene while one render of it is out. false: one already is (or the store did not answer). */
export async function claimSceneRender(tokenId: string, ordinal: number): Promise<boolean> {
  return claim(busyKey(tokenId, ordinal), BUSY_TTL_SEC);
}

export async function releaseSceneRender(tokenId: string, ordinal: number): Promise<void> {
  await drop(busyKey(tokenId, ordinal));
}

/** The next attempt number of a scene's redo (1, 2, …), or null when the store cannot count. */
export async function nextRedoAttempt(tokenId: string, ordinal: number): Promise<number | null> {
  const key = countKey(tokenId, ordinal);
  const r = redis();
  if (r) {
    try {
      const n = Number(await r.incr(key));
      await r.expire(key, FILM_BOOK_TTL_SEC).catch(() => undefined);
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
  if (!memoryAllowed()) return null;
  const n = Number(memGet(key) ?? 0) + 1;
  memory.set(key, { value: String(n), exp: Date.now() + FILM_BOOK_TTL_SEC * 1000 });
  return n;
}

/** One stitch of the film at a time. false: one is running (or the store did not answer). */
export async function claimFilmRestitch(tokenId: string): Promise<boolean> {
  return claim(stitchingKey(tokenId), STITCH_TTL_SEC);
}

export async function releaseFilmRestitch(tokenId: string): Promise<void> {
  await drop(stitchingKey(tokenId));
}
