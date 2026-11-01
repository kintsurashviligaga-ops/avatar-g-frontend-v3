/**
 * lib/voice/sttTrial.ts — the owner's trial of the dictation models (Phase 4, after the 2026-10-25 TimeoutError).
 *
 * ⚠️ The owner's dictation on Production ended in "Gemini STT network error on gemini-3.8-flash: TimeoutError" and the
 * words came into the box late. The default is now 3.6 Flash (lib/ai/google/models DEFAULT_STT_MODEL), and whether it,
 * or a Flash-Lite model, is fast enough and right in Georgian can only be heard on the owner's own phone. A link with
 * `?stt=<model id>` picks the model for this browser tab (sessionStorage, so it ends with the tab); `?stt=off` ends it
 * at once. The recorder's request then names that model (components/chat/composer/useDictation), and the route
 * honours it for an ADMIN account only, with no step-downs, so the timing is that model's alone
 * (app/api/voice/transcribe); for anyone else the request is transcribed as usual. `?micstats=1` on the same link
 * shows the timings, and the line names the model under trial. `?stt=chirp_3` runs Cloud Speech-to-Text's Chirp 3
 * alone (lib/voice-v2v/chirpStt, 2026-10-30). Since 2026-11-01 Chirp 3 is everyone's engine, with Gemini behind it, so
 * a Gemini model named here is how the owner hears Gemini alone again.
 */
import { STT_TRIAL_MODELS } from '@/lib/ai/google/models';

export const STT_TRIAL_PARAM = 'stt';
export const STT_TRIAL_KEY = 'myavatar:stt-trial';

/** What the trial reads: the page's query string and the tab's storage (null where there is none). */
export interface SttTrialEnv {
  readonly search: string;
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function browserEnv(): SttTrialEnv | null {
  if (typeof window === 'undefined') return null;
  let storage: SttTrialEnv['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage refused (private mode, blocked site data): the link still works for the page it opened.
  }
  return { search: window.location?.search ?? '', storage };
}

/** Only a model the route would honour (lib/ai/google/models STT_TRIAL_MODELS); anything else is "no trial". */
const allowed = (raw: string | null | undefined): string | null => {
  const id = (raw ?? '').trim().toLowerCase();
  return STT_TRIAL_MODELS.includes(id) ? id : null;
};

/** The model the trial asks for, or null when no trial is on (the normal case, and always on the server). */
export function sttTrialModel(env: SttTrialEnv | null = browserEnv()): string | null {
  if (!env) return null;
  let param: string | null = null;
  try { param = new URLSearchParams(env.search).get(STT_TRIAL_PARAM); } catch { /* malformed */ }
  if (param !== null) {
    const id = allowed(param);
    try {
      if (id) env.storage?.setItem(STT_TRIAL_KEY, id);
      else env.storage?.removeItem(STT_TRIAL_KEY);
    } catch {
      /* not kept: this page still uses the link's choice */
    }
    return id;
  }
  try {
    return allowed(env.storage?.getItem(STT_TRIAL_KEY));
  } catch {
    return null;
  }
}

// The link is also read as the page loads: the studio may change its address (a new chat) before the first tap.
if (typeof window !== 'undefined') sttTrialModel();
