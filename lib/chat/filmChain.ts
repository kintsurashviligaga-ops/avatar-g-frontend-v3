/**
 * lib/chat/filmChain.ts — a film whose every scene starts from the previous clip's REAL last frame.
 *
 * WHY. Scenes rendered side by side each start from their own storyboard frame, and nothing makes clip N end where clip
 * N+1 begins. PR #82 asked Veo to END each clip on the next scene's storyboard frame; on the paid 2026-10-16 ad Veo did
 * not (Google's own files show the frames went up, the clips ignored them), so every join jumped in pose, framing and
 * light. The owner chose the sequential fix that day: render scene 1, read its last frame out of the finished clip, start
 * scene 2 from that frame, and so on. A cut then continues the picture the viewer just saw.
 *
 * HOW. The film start (lib/chat/filmComposite) dispatches scene 1 only and stores the rest of the scenes' ready-made clip
 * requests here, server-side, keyed by the film's token id. Each poll of the film (lib/chat/providerRouter pollFilmTask)
 * asks `advanceFilmChain` whether the next scene is due: once its predecessor has landed, the poll that wins the scene's
 * claim extracts the last frame, hosts it, and dispatches the scene from it. The film token the browser holds never
 * changes and never carries a prompt: a forged token can only point at a plan the server wrote, and only its owner's
 * poll advances it.
 *
 * WHAT CAN GO WRONG, AND WHAT HAPPENS.
 *   • The predecessor failed (Google declined it, or its dispatch died): the scene starts from its own storyboard frame,
 *     so one bad scene costs one scene, not the rest of the film.
 *   • The last frame cannot be read or hosted: the same fallback, the storyboard frame.
 *   • The dispatch fails: the scene is recorded failed and its share of a paid film goes back, decided here from the
 *     dispatch this server just made (never from the client's token). The next scene then starts from its storyboard frame.
 *   • The poll that claimed a scene died mid-dispatch: after CHAIN_CLAIM_STALE_MS the scene is recorded failed and NOT sent
 *     again. A Veo submit has no idempotency key, so a second POST on an unclear outcome could pay twice (owner rule).
 *   • No store to keep the plan in: the start does not chain at all, and renders every scene at once as before.
 */
import 'server-only';
import type { Redis } from '@upstash/redis';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';

/** How long a chain plan and its steps are kept: the film token's own life (the status store's 6 h). */
export const FILM_CHAIN_TTL_SEC = 6 * 3600;
/**
 * The most scenes a film renders one after another. Each Veo clip takes ~1–3 min, so eight in a row stay inside the
 * browser's 25-minute poll window (lib/chat/filmStudioClient DEFAULT_FILM_MAX_POLL_MS); a longer film renders side by
 * side as before.
 */
export const FILM_CHAIN_MAX_SCENES = 8;
/** A claim older than this with no outcome recorded: its dispatch died (the poll route's own limit is 300 s). */
export const CHAIN_CLAIM_STALE_MS = 330_000;

/** One scene that waits for its predecessor: the clip request the start built for it, minus the start frame. */
export interface FilmChainScene {
  ordinal: number;
  seed: number;
  userPrompt: string;
  selectedOptions: Record<string, string>;
  /** The scene's own storyboard frame: its start when the predecessor gives no usable last frame. */
  storyboardFrame: string | null;
}

export interface FilmChainPlan {
  v: 1;
  tokenId: string;
  /** The film's owner. Only this user's polls advance the chain. */
  uid: string;
  sessionId: string;
  locale: string;
  compositeId: string;
  videoModel: string | null;
  forecast: { wholesaleGel: number; retailGel: number };
  /** Each chained scene's share of a PAID film (0 for an admin or free film), and the charge it is a share of. */
  sceneCredits: number;
  chargeRef: string | null;
  /** The scenes after the first, in film order. */
  scenes: FilmChainScene[];
  createdAt: number;
}

/** What became of a chained scene's dispatch: written once, the first outcome wins. */
export interface FilmChainStep {
  taskRef: string | null;
  status: 'queued' | 'failed';
  /** Where the scene started: the predecessor's last frame, its own storyboard frame, or no frame at all. */
  from: 'last-frame' | 'storyboard' | 'none';
  at: number;
  error?: string;
}

/** One leg of the film as this poll sees it. */
export interface FilmChainLeg {
  ordinal: number;
  status: 'pending' | 'succeeded' | 'failed' | 'skipped';
  url: string | null;
}

/** The next scene to dispatch, and where it starts. */
export type FilmChainNext =
  | { ordinal: number; from: 'last-frame'; sourceUrl: string }
  | { ordinal: number; from: 'storyboard' };

/**
 * Whether this film renders its scenes one after another. Every scene must go to Veo (the Google-only boundary), which
 * takes a first frame; reference mode composes each scene from the uploads instead, so it has no first frame to give.
 * A music video cuts between different shots on the beat, so its scenes are not continuations of each other.
 * FILM_SEQUENTIAL_CHAIN=0 turns it off.
 */
export function filmSequentialChainOn(opts: {
  sceneCount: number;
  googleOnly: boolean;
  referenceMode: boolean;
  musicVideo: boolean;
  owner: string | null | undefined;
}): boolean {
  if (/^(0|false|off)$/i.test((process.env.FILM_SEQUENTIAL_CHAIN || '').trim())) return false;
  if (!opts.owner || opts.owner === 'anonymous') return false;
  return opts.googleOnly && !opts.referenceMode && !opts.musicVideo
    && opts.sceneCount >= 2 && opts.sceneCount <= FILM_CHAIN_MAX_SCENES;
}

/**
 * The next scene due, or null while its predecessor is still rendering (or nothing is left to send). Scenes go in film
 * order, one at a time: the first chained scene without an outcome is the only candidate.
 */
export function chainNextStep(
  plan: Pick<FilmChainPlan, 'scenes'>,
  legs: readonly FilmChainLeg[],
  steps: ReadonlyMap<number, FilmChainStep>,
): FilmChainNext | null {
  const next = plan.scenes.find((s) => !steps.has(s.ordinal));
  if (!next) return null;
  const before = [...legs].filter((l) => l.ordinal < next.ordinal).sort((a, b) => b.ordinal - a.ordinal)[0];
  if (!before) return { ordinal: next.ordinal, from: 'storyboard' };
  if (before.status === 'succeeded' && before.url) return { ordinal: next.ordinal, from: 'last-frame', sourceUrl: before.url };
  if (before.status === 'failed' || before.status === 'skipped' || before.status === 'succeeded') {
    return { ordinal: next.ordinal, from: 'storyboard' };
  }
  return null;
}

// ─── Store (Upstash Redis; a process-local map only where FILM_CHAIN_MEMORY=1, for a single dev/test server) ───────

let client: Redis | null = null;
let resolved = false;
function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const env = upstashRestEnv();
  if (env) client = createUpstashRedis(env.url, env.token);
  return client;
}

/** Test hook: point the store at a fake client (null = no Redis). */
export function __setFilmChainRedisForTests(fake: Redis | null): void {
  client = fake;
  resolved = true;
  memory.clear();
}

const memory = new Map<string, { value: string; exp: number }>();
const memoryAllowed = (): boolean => /^(1|true|on)$/i.test((process.env.FILM_CHAIN_MEMORY || '').trim());

const planKey = (tokenId: string) => `film:chain:${tokenId}`;
const stepKey = (tokenId: string, ordinal: number) => `film:chain:${tokenId}:step:${ordinal}`;
const claimKey = (tokenId: string, ordinal: number) => `film:chain:${tokenId}:claim:${ordinal}`;

function memGet(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { memory.delete(key); return null; }
  return hit.value;
}
function memSetNx(key: string, value: string, ttlSec: number): boolean {
  if (memGet(key) !== null) return false;
  memory.set(key, { value, exp: Date.now() + ttlSec * 1000 });
  return true;
}

/** Whether a chain plan can be kept where every poll can read it. Without it the film renders side by side. */
export function filmChainStoreReady(): boolean {
  return redis() !== null || memoryAllowed();
}

const parse = <T>(raw: unknown): T | null => {
  if (raw == null) return null;
  try { return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T; } catch { return null; }
};

/** Keep the plan. True only once it is stored where the next poll will find it. */
export async function saveFilmChainPlan(plan: FilmChainPlan): Promise<boolean> {
  const r = redis();
  if (r) {
    try {
      await r.set(planKey(plan.tokenId), JSON.stringify(plan), { ex: FILM_CHAIN_TTL_SEC });
      return true;
    } catch {
      return false;
    }
  }
  if (!memoryAllowed()) return false;
  memory.set(planKey(plan.tokenId), { value: JSON.stringify(plan), exp: Date.now() + FILM_CHAIN_TTL_SEC * 1000 });
  return true;
}

export async function getFilmChainPlan(tokenId: string): Promise<FilmChainPlan | null> {
  const r = redis();
  let raw: unknown = null;
  if (r) {
    try { raw = await r.get(planKey(tokenId)); } catch { return null; }
  } else if (memoryAllowed()) {
    raw = memGet(planKey(tokenId));
  }
  const plan = parse<FilmChainPlan>(raw);
  return plan && plan.v === 1 && plan.tokenId === tokenId && Array.isArray(plan.scenes) ? plan : null;
}

/** The outcomes recorded so far for the plan's scenes. A store that cannot answer reads as null. */
export async function getFilmChainSteps(plan: FilmChainPlan): Promise<Map<number, FilmChainStep> | null> {
  const out = new Map<number, FilmChainStep>();
  if (plan.scenes.length === 0) return out;
  const keys = plan.scenes.map((s) => stepKey(plan.tokenId, s.ordinal));
  const r = redis();
  let raws: unknown[];
  if (r) {
    try { raws = await r.mget(...keys); } catch { return null; }
  } else if (memoryAllowed()) {
    raws = keys.map(memGet);
  } else {
    return null;
  }
  plan.scenes.forEach((s, i) => {
    const step = parse<FilmChainStep>(raws[i]);
    if (step && (step.status === 'queued' || step.status === 'failed')) out.set(s.ordinal, step);
  });
  return out;
}

/** Record a scene's outcome. The first write wins, so a late, stale writer cannot replace it. */
export async function recordFilmChainStep(tokenId: string, ordinal: number, step: FilmChainStep): Promise<boolean> {
  const r = redis();
  if (r) {
    try {
      return (await r.set(stepKey(tokenId, ordinal), JSON.stringify(step), { nx: true, ex: FILM_CHAIN_TTL_SEC })) === 'OK';
    } catch {
      return false;
    }
  }
  return memoryAllowed() ? memSetNx(stepKey(tokenId, ordinal), JSON.stringify(step), FILM_CHAIN_TTL_SEC) : false;
}

/**
 * Claim the right to dispatch a scene. 'claimed': this poll sends it. 'held': another poll is sending it now. 'stale': a
 * claim exists whose poll never recorded an outcome. 'unavailable': the store cannot answer, so nobody sends it this tick.
 */
export async function claimFilmChainStep(tokenId: string, ordinal: number, now: number): Promise<'claimed' | 'held' | 'stale' | 'unavailable'> {
  const key = claimKey(tokenId, ordinal);
  const r = redis();
  let won: boolean;
  let held: unknown;
  if (r) {
    try {
      won = (await r.set(key, String(now), { nx: true, ex: FILM_CHAIN_TTL_SEC })) === 'OK';
      held = won ? null : await r.get(key);
    } catch {
      return 'unavailable';
    }
  } else if (memoryAllowed()) {
    won = memSetNx(key, String(now), FILM_CHAIN_TTL_SEC);
    held = won ? null : memGet(key);
  } else {
    return 'unavailable';
  }
  if (won) return 'claimed';
  const since = Number(held);
  return Number.isFinite(since) && now - since > CHAIN_CLAIM_STALE_MS ? 'stale' : 'held';
}

// ─── Advance ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FilmChainDeps {
  extractLastFrame: (videoUrl: string) => Promise<Buffer | null>;
  /** Host the frame where Veo can fetch it; its signed address, or null. */
  hostFrame: (plan: FilmChainPlan, ordinal: number, jpeg: Buffer) => Promise<string | null>;
  /** Send the scene's clip request from `startFrame` (null = the request as the start built it). */
  dispatch: (plan: FilmChainPlan, scene: FilmChainScene, startFrame: string | null) => Promise<{ taskRef: string | null; status: 'queued' | 'failed'; error?: string }>;
  /** A queued scene of a paid film: its operation and share, for the refund a later Google failure earns (R3-A). */
  recordShare: (plan: FilmChainPlan, ordinal: number, taskRef: string) => Promise<void>;
  /** A scene of a paid film that will produce nothing: its share back, once. */
  refundScene: (plan: FilmChainPlan, ordinal: number) => Promise<void>;
  now?: () => number;
  store?: {
    claim: typeof claimFilmChainStep;
    record: typeof recordFilmChainStep;
  };
}

/**
 * Dispatch the next scene if it is due and this poll wins its claim. Returns the outcome it recorded (or found stale), or
 * null when nothing was due or another poll holds the scene. Never throws.
 */
export async function advanceFilmChain(
  plan: FilmChainPlan,
  legs: readonly FilmChainLeg[],
  steps: ReadonlyMap<number, FilmChainStep>,
  uid: string | null | undefined,
  deps: FilmChainDeps,
): Promise<{ ordinal: number; step: FilmChainStep } | null> {
  if (!uid || uid !== plan.uid) return null;
  const next = chainNextStep(plan, legs, steps);
  if (!next) return null;
  const scene = plan.scenes.find((s) => s.ordinal === next.ordinal);
  if (!scene) return null;
  const now = deps.now ?? Date.now;
  const store = deps.store ?? { claim: claimFilmChainStep, record: recordFilmChainStep };

  try {
    const claim = await store.claim(plan.tokenId, scene.ordinal, now());
    if (claim === 'held' || claim === 'unavailable') return null;
    if (claim === 'stale') {
      const step: FilmChainStep = { taskRef: null, status: 'failed', from: 'none', at: now(), error: 'dispatch outcome unknown — not sent again' };
      if (await store.record(plan.tokenId, scene.ordinal, step)) await deps.refundScene(plan, scene.ordinal).catch(() => undefined);
      return { ordinal: scene.ordinal, step };
    }

    let startFrame: string | null = null;
    let from: FilmChainStep['from'] = 'none';
    if (next.from === 'last-frame') {
      const jpeg = await deps.extractLastFrame(next.sourceUrl).catch(() => null);
      const hosted = jpeg ? await deps.hostFrame(plan, scene.ordinal, jpeg).catch(() => null) : null;
      if (hosted) { startFrame = hosted; from = 'last-frame'; }
    }
    if (!startFrame && scene.storyboardFrame) { startFrame = scene.storyboardFrame; from = 'storyboard'; }

    const sent = await deps.dispatch(plan, scene, startFrame).catch((err): { taskRef: null; status: 'failed'; error: string } => ({
      taskRef: null, status: 'failed', error: err instanceof Error ? err.message : String(err),
    }));
    const queued = sent.status === 'queued' && !!sent.taskRef;
    const step: FilmChainStep = {
      taskRef: queued ? sent.taskRef : null,
      status: queued ? 'queued' : 'failed',
      from,
      at: now(),
      ...(sent.error ? { error: sent.error.slice(0, 200) } : {}),
    };
    const recorded = await store.record(plan.tokenId, scene.ordinal, step);
    if (recorded && queued && step.taskRef) await deps.recordShare(plan, scene.ordinal, step.taskRef).catch(() => undefined);
    if (recorded && !queued) await deps.refundScene(plan, scene.ordinal).catch(() => undefined);
    // eslint-disable-next-line no-console
    console.log(`[filmChain] ${plan.tokenId} scene ${scene.ordinal}: ${step.status} from ${from}${step.error ? ` (${step.error})` : ''}`);
    return { ordinal: scene.ordinal, step };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[filmChain] ${plan.tokenId} scene ${scene.ordinal} advance threw:`, err instanceof Error ? err.message : err);
    return null;
  }
}
