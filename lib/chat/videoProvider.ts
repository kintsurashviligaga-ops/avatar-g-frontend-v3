/** Names-only video readiness. Veo is the exclusive generation engine in v32. */
import { vertexConfig } from '@/lib/veo/vertexAuth';

/** Deprecated compatibility exports never enable legacy generation. */
export const REPLICATE_API_KEY_ALIASES = [] as const;
export function hasReplicateToken(_env: NodeJS.ProcessEnv = process.env): boolean { return false; }
export const GEMINI_API_KEY_ALIASES = ['GEMINI_API_KEY'] as const;

export function hasGeminiVeoKey(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.GEMINI_VEO_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(flag) && !!env.GEMINI_API_KEY?.trim();
}

function videoTransport(env: NodeJS.ProcessEnv): 'vertex' | 'gemini' | null {
  for (const value of [env.GEMINI_TRANSPORT, env.VEO_TRANSPORT]) {
    if (value !== undefined && !['vertex', 'gemini'].includes(value.trim().toLowerCase())) return null;
  }
  const forced = env.GEMINI_TRANSPORT?.trim().toLowerCase() === 'vertex'
    ? 'vertex' : env.VEO_TRANSPORT?.trim().toLowerCase();
  if (forced && forced !== 'vertex' && forced !== 'gemini') return null;
  const vertex = vertexConfig(env) !== null;
  if (forced === 'vertex') return vertex ? 'vertex' : null;
  if (forced === 'gemini') return hasGeminiVeoKey(env) ? 'gemini' : null;
  return vertex ? 'vertex' : hasGeminiVeoKey(env) ? 'gemini' : null;
}

export function hasVideoProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  return videoTransport(env) !== null;
}

export interface VideoProviderStatus {
  ready: boolean;
  veo: boolean;
  transport: 'vertex' | 'gemini' | null;
  /** Deprecated response fields are always false. */
  ltx: false;
  replicate: false;
  checkedEnv: { ltx: readonly string[]; replicate: readonly string[]; google: readonly string[] };
}

export function computeVideoProviderStatus(env: NodeJS.ProcessEnv = process.env): VideoProviderStatus {
  const transport = videoTransport(env);
  return { ready: transport !== null, veo: transport !== null, transport, ltx: false, replicate: false,
    checkedEnv: { ltx: [], replicate: [], google: ['GEMINI_API_KEY', 'GCP_PROJECT_ID', 'GCP_VEO_BUCKET', 'GCP_VEO_LOCATION'] } };
}

// Retained only for the retired LTX dispatcher's compatibility. It can never select a paid provider.
export type VideoPrimaryProvider = 'ltx' | 'replicate' | null;
export interface VideoPrimaryDecision { primary: VideoPrimaryProvider; reason: 'ltx-key-present' | 'ltx-key-absent' | 'no-provider'; }
export function selectVideoPrimaryProvider(_env: NodeJS.ProcessEnv = process.env): VideoPrimaryDecision {
  return { primary: null, reason: 'no-provider' };
}

/**
 * Localized, user-facing error shown when the pipeline halts for a missing
 * video provider. Georgian is the canonical copy (the platform is Georgian
 * first); en/ru mirror it. Never leaks env-var names to the end user.
 */
export function videoProviderUnavailableMessage(locale: string): string {
  const loc = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  if (loc === 'en') {
    return 'System error: the video provider is unavailable. Please configure the API variables.';
  }
  if (loc === 'ru') {
    return 'Системная ошибка: видео-провайдер недоступен. Пожалуйста, заполните переменные API.';
  }
  return 'სისტემური ხარვეზი: ვიდეო პროვაიდერი მიუწვდომელია. გთხოვთ, შეავსოთ API ცვლადები.';
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
    return "Couldn't connect to the video provider. Your balance is protected.";
  }
  if (loc === 'ru') {
    return 'Не удалось подключиться к видео-провайдеру. Баланс сохранён.';
  }
  return 'ვიდეო პროვაიდერთან კავშირი ვერ დამყარდა. ბალანსი დაცულია.';
}
