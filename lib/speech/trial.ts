/**
 * lib/speech/trial.ts — the owner's listening trial of the read-aloud models (Phase 4, after the 2026-10-24 listening).
 *
 * ⚠️ The owner heard the default model (gemini-2.5-flash-preview-tts) on production start late and sound robotic in
 * ka/en/ru, and agreed to hear the same texts read by Gemini 3.8 Flash TTS and 3.8 Flash-Lite TTS. A link with
 * `?tts=<model id>` picks the model for this browser tab (sessionStorage, so it ends with the tab); `?tts=off` ends it
 * at once. The read-aloud request then names that model (lib/speech/request), and the route honours it for an ADMIN
 * account only (app/api/tts/gemini modelFor); for anyone else the request is read with the usual model. While a trial
 * is on, the replay cache is bypassed (lib/speech/player browserSpeechDeps): it would replay audio of another model,
 * and a replay would also make the model under trial sound faster than it is.
 */

/** The models the trial can pick: the default, so its timing is heard without the cache, and the two 3.8 ones. */
export const SPEECH_TRIAL_MODELS: readonly string[] = [
  'gemini-2.5-flash-preview-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
];

export const SPEECH_TRIAL_PARAM = 'tts';
export const SPEECH_TRIAL_KEY = 'myavatar:tts-trial';

/** What the trial reads: the page's query string and the tab's storage (null where there is none). */
export interface SpeechTrialEnv {
  readonly search: string;
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function browserEnv(): SpeechTrialEnv | null {
  if (typeof window === 'undefined') return null;
  let storage: SpeechTrialEnv['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage refused (private mode, blocked site data): the link still works for the page it opened.
  }
  return { search: window.location?.search ?? '', storage };
}

const allowed = (raw: string | null | undefined): string | null => {
  const id = (raw ?? '').trim().toLowerCase();
  return SPEECH_TRIAL_MODELS.includes(id) ? id : null;
};

/** The model the trial asks for, or null when no trial is on (the normal case, and always on the server). */
export function speechTrialModel(env: SpeechTrialEnv | null = browserEnv()): string | null {
  if (!env) return null;
  const param = new URLSearchParams(env.search).get(SPEECH_TRIAL_PARAM);
  if (param !== null) {
    const id = allowed(param);
    try {
      if (id) env.storage?.setItem(SPEECH_TRIAL_KEY, id);
      else env.storage?.removeItem(SPEECH_TRIAL_KEY);
    } catch {
      /* not kept: this page still uses the link's choice */
    }
    return id;
  }
  try {
    return allowed(env.storage?.getItem(SPEECH_TRIAL_KEY));
  } catch {
    return null;
  }
}

// The link is also read as the page loads: the studio may change its address (a new chat) before the first tap.
if (typeof window !== 'undefined') speechTrialModel();
