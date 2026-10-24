/**
 * lib/speech/request.ts — the browser's one request for one chunk of speech (MASTER TASK v3.1 §5.3.4).
 *
 * POST /api/tts/gemini once, wait at most SPEECH_CLIENT_DEADLINE_MS (a little longer than the route's own deadline, so
 * the route's 504 arrives first), and abort the request the moment the caller's signal aborts — stop, another message,
 * unmount — so the route stops as well instead of finishing a synthesis nobody will hear. A miss is null and is never
 * retried here: the route owns the retry budget (lib/speech/deadline), and retrying on top of it would multiply it.
 *
 * `speechResult` says why a chunk came back without audio (the route's status and error code), for a caller that tells
 * the user something different for each: the voice call stops on the platform's AI limit instead of "no answer".
 */
import { SPEECH_CLIENT_DEADLINE_MS, speechDeadline } from './deadline';
import { speechProfile, type SpeechLocale } from './contract';

export const SPEECH_ROUTE = '/api/tts/gemini';

/** One chunk's audio, and what made it (lib/speech/contract speechProfile; null when the headers do not say). */
export interface SpeechAnswer {
  readonly blob: Blob;
  readonly profile: string | null;
}

/** The WAV for `text`, or null (refused, failed, timed out or cancelled). */
export async function requestSpeech(
  text: string,
  locale: SpeechLocale,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob | null> {
  return (await fetchSpeech(text, locale, signal, fetchImpl))?.blob ?? null;
}

/** requestSpeech, with the profile the answer's headers state. */
export async function fetchSpeech(
  text: string,
  locale: SpeechLocale,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SpeechAnswer | null> {
  const result = await speechResult(text, locale, signal, fetchImpl);
  return result.ok ? result.answer : null;
}

/**
 * Why a chunk has no audio. `status` is the route's HTTP status, or 0 when no answer arrived (offline, timed out,
 * cancelled) or the answer was empty. `error` is the route's error code (its JSON `error`), when it sent one.
 */
export interface SpeechMiss {
  readonly status: number;
  readonly error: string | null;
}

export type SpeechResult =
  | { readonly ok: true; readonly answer: SpeechAnswer }
  | { readonly ok: false; readonly miss: SpeechMiss };

const NO_ANSWER: SpeechResult = { ok: false, miss: { status: 0, error: null } };

/** fetchSpeech, and on a miss the reason the route gave. */
export async function speechResult(
  text: string,
  locale: SpeechLocale,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SpeechResult> {
  const deadline = speechDeadline(SPEECH_CLIENT_DEADLINE_MS, signal);
  try {
    // The caller already moved on: nothing is asked for.
    if (deadline.signal.aborted) return NO_ANSWER;
    const res = await fetchImpl(SPEECH_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text, locale }),
      signal: deadline.signal,
    });
    // Signed out (the session ended while the page stayed open): the app's sign-in prompt opens instead of a silent miss.
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('myavatar:auth-required'));
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return { ok: false, miss: { status: res.status, error: typeof body?.error === 'string' ? body.error : null } };
    }
    const blob = await res.blob();
    // Cancelled while the body was arriving: the caller has moved on, so nothing is handed back to play.
    if (deadline.signal.aborted || !blob.size) return NO_ANSWER;
    return { ok: true, answer: { blob, profile: speechProfile(res.headers) } };
  } catch {
    return NO_ANSWER;
  } finally {
    deadline.dispose();
  }
}
