/**
 * lib/chat/videoProvider.ts
 * =========================
 * Single source of truth for "can the video render path actually fire?".
 *
 * The 30-second film pipeline historically degraded silently: when neither the
 * LTX credential (any alias) NOR the Replicate failover token was provisioned,
 * `renderClip` returned `skipped` for every leg, the storyboard engine had
 * ALREADY run, and the user watched the pipeline crawl to the ~38% mark before
 * collapsing into "Video skipped (no provider)" — having potentially consumed a
 * founder free-film slot / wallet debit for infrastructure that was never wired.
 *
 * This module gates the WHOLE pipeline at the door: `hasVideoProvider()` is the
 * strict pre-flight the orchestrator runs BEFORE planning scenes or touching the
 * ledger. A missing provider becomes a clean, localized, zero-cost halt instead
 * of a half-burned transaction.
 *
 * Kept free of `server-only`, Next, and Supabase imports so it is unit-testable
 * in isolation: it reads ONLY an injected env map and returns names + booleans,
 * never a secret value. Mirrors the alias contract of `ltxKey` + the assemble
 * route's Replicate failover env.
 */

import { hasLtxApiKey, LTX_API_KEY_ALIASES } from './ltxKey';

/** The Replicate failover token name — arms LTX clip failover when LTX is down. */
export const REPLICATE_API_KEY_ALIASES = ['REPLICATE_API_TOKEN'] as const;

/** True when REPLICATE_API_TOKEN carries a non-empty value. */
export function hasReplicateToken(env: NodeJS.ProcessEnv = process.env): boolean {
  for (const name of REPLICATE_API_KEY_ALIASES) {
    const v = env[name];
    if (typeof v === 'string' && v.trim().length > 0) return true;
  }
  return false;
}

/** What Veo on Vertex AI needs besides the project and bucket: Workload Identity (all four) or a service-account key. */
const VEO_VERTEX_WIF_VARS = [
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const;

/**
 * True iff the Veo route is set up — Vertex AI only (MASTER TASK v3.1): GCP_PROJECT_ID, GCP_VEO_BUCKET and one auth
 * mode present, and VEO_TRANSPORT unset / `auto` / `vertex`. An AI Studio key (GEMINI_API_KEY) does not count and
 * GEMINI_VEO_ENABLED no longer applies: the Developer API is not a Veo transport.
 *
 * Mirrors lib/veo/engine veoTransport() by variable PRESENCE, against an injectable `env`, because this module's whole
 * contract is that every predicate is testable with a fake environment and free of server-only imports. The engine
 * still validates the values (and refuses before any provider I/O) when a clip is actually created.
 */
export function hasVeoVertexEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const set = (name: string): boolean => Boolean((env[name] ?? '').trim());
  const pin = (env.VEO_TRANSPORT ?? '').trim().toLowerCase();
  if (pin && pin !== 'auto' && pin !== 'vertex') return false;
  if (!set('GCP_PROJECT_ID') || !set('GCP_VEO_BUCKET')) return false;
  return VEO_VERTEX_WIF_VARS.every(set) || set('GCP_SERVICE_ACCOUNT_KEY');
}

/**
 * True iff at least one video render provider is configured.
 *
 * ⚠️ THIS DID NOT COUNT VEO, AND THAT IS A TRAP FOR ANYONE MOVING TO A GEMINI-ONLY SETUP. The predicate
 * was `hasLtxApiKey(env) || hasReplicateToken(env)`, while Veo has been the PRIMARY clip engine for some
 * time (ServiceManager tries it before Runway/Kling/LTX). So on a config with a Veo route and no
 * Replicate/LTX token — exactly what "remove the legacy engines"
 * produces — filmComposite's guard fires first:
 *
 *   if (!hasVideoProvider()) return { …, status: 'skipped', … }
 *
 * and EVERY scene is skipped before Veo is ever asked. The film comes back empty with no error naming a
 * cause, on a configuration that can in fact render perfectly well. The comment above that guard warns
 * about precisely this shape of mistake for the LTX/Replicate pair ("re-creating the ~38%
 * silent-skip-after-spend trap") — Veo was simply never added when it became primary.
 */
export function hasVideoProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  return hasVeoVertexEnv(env) || hasLtxApiKey(env) || hasReplicateToken(env);
}

/** Names-only presence snapshot for diagnostics / the client status dot. */
export interface VideoProviderStatus {
  /** Either LTX or Replicate is present → the render path can fire. */
  ready: boolean;
  ltx: boolean;
  replicate: boolean;
  /** Full alias precedence lists consulted (names only, never values). */
  checkedEnv: {
    ltx: readonly string[];
    replicate: readonly string[];
  };
}

export function computeVideoProviderStatus(env: NodeJS.ProcessEnv = process.env): VideoProviderStatus {
  const ltx = hasLtxApiKey(env);
  const replicate = hasReplicateToken(env);
  return {
    ready: ltx || replicate,
    ltx,
    replicate,
    checkedEnv: {
      ltx: LTX_API_KEY_ALIASES,
      replicate: REPLICATE_API_KEY_ALIASES,
    },
  };
}

/** Which provider the video render path should drive as PRIMARY (null = halt). */
export type VideoPrimaryProvider = 'ltx' | 'replicate' | null;

export interface VideoPrimaryDecision {
  /** The provider to render with first. `null` means no provider — caller halts. */
  primary: VideoPrimaryProvider;
  /**
   * Machine-readable rationale, surfaced verbatim in response metadata
   * (`primaryProviderReason`) so a Replicate-only render is observably explained
   * rather than looking like a silent LTX bypass.
   */
  reason: 'ltx-key-present' | 'ltx-key-absent' | 'no-provider';
}

/**
 * Single source of truth for the LTX-vs-Replicate PRIMARY selection.
 *
 * LTX is the director provider and wins whenever its key is present (any alias).
 * With NO LTX key, a provisioned Replicate token is promoted from "402 failover"
 * to the PRIMARY render path — this is what lets a Replicate-only deployment
 * actually emit clips instead of passing the `hasVideoProvider` pre-flight and
 * then skipping every leg AFTER a founder slot / wallet debit was reserved.
 * With neither, the decision is a clean `null` halt (the pipeline must not spend).
 *
 * Pure + env-injectable so the just-shipped Replicate-primary behavior is
 * testable without standing up the heavy `ServiceManager`.
 */
export function selectVideoPrimaryProvider(env: NodeJS.ProcessEnv = process.env): VideoPrimaryDecision {
  if (hasLtxApiKey(env)) return { primary: 'ltx', reason: 'ltx-key-present' };
  if (hasReplicateToken(env)) return { primary: 'replicate', reason: 'ltx-key-absent' };
  return { primary: null, reason: 'no-provider' };
}

/**
 * Localized, user-facing error shown when the pipeline halts for a missing
 * video provider. Georgian is the canonical copy (the platform is Georgian
 * first); en/ru mirror it. Never leaks env-var names to the end user, and since
 * 2026-10-10 (Omnichannel A3) no technical words either: the person reads
 * „temporarily unavailable", the configuration gap stays in the logs.
 */
export function videoProviderUnavailableMessage(locale: string): string {
  const loc = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  if (loc === 'en') {
    return 'Video creation is temporarily unavailable. Please try again a little later.';
  }
  if (loc === 'ru') {
    return 'Создание видео временно недоступно. Попробуйте чуть позже.';
  }
  return 'ვიდეოს შექმნა დროებით მიუწვდომელია. სცადე ცოტა ხანში.';
}

/**
 * RUNTIME failure copy — distinct from `videoProviderUnavailableMessage`.
 *
 * The "unavailable" message above is shown when NO provider is configured (a
 * deployment/config gap). THIS message is shown when a provider IS configured
 * but the upstream synthesis request times out or throws mid-pipeline (the
 * ~38% "scene synthesis" failure). It is paired with an atomic ledger rollback,
 * so it makes an explicit promise to the user: their balance was returned. The
 * Georgian copy is the canonical, verbatim string surfaced by the studio.
 */
export function videoProviderConnectionFailedMessage(locale: string): string {
  const loc = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  if (loc === 'en') {
    return "Couldn't reach the video service. Your balance is protected.";
  }
  if (loc === 'ru') {
    return 'Не удалось связаться с видеосервисом. Баланс сохранён.';
  }
  return 'ვიდეოს სერვისთან კავშირი ვერ დამყარდა. ბალანსი დაცულია.';
}
