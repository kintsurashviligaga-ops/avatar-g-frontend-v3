/**
 * Map a recorded audio mime type to the file extension a transcription API will accept.
 *
 * ⚠️ WHY THIS EXISTS. Whisper-class endpoints dispatch on the FILENAME EXTENSION, not on the blob's mime
 * type. The server-side OpenAI call was uploading every recording as:
 *
 *   `chunk.${mimeType.includes('mpeg') ? 'mp3' : 'wav'}`
 *
 * — so the browser's actual `audio/webm;codecs=opus` (or `audio/mp4` on iOS) arrived labelled `.wav`.
 * The primary provider therefore rejected or garbled real mic audio EVERY time, the route logged
 * `[transcribe] primary STT failed`, fell through to Gemini — whose own comment in the route says it
 * "REJECTS the webm/mp4 the browser mic actually records" — and only then reached Replicate, which is
 * the slow one that polls. Two doomed provider round-trips stood in front of every single successful
 * transcription, which is a large part of "the mic takes forever" and all of "the mic does nothing".
 *
 * The client already had this exactly right — `extFor` inside OmniStudio's recorder — and the repo even
 * documents the failure ("a wrong extension makes Whisper reject the audio (a real cause of 'the mic
 * does nothing on mobile')"). The two sides simply never shared the function. Now they do.
 *
 * Order matters: a browser mime is `audio/webm;codecs=opus`, and `audio/mp4` must not be caught by an
 * `mp3`-ish test. Checked most-specific first.
 */

/** Extensions the OpenAI transcription endpoint accepts. */
export type AudioExt = 'webm' | 'mp4' | 'm4a' | 'mp3' | 'wav' | 'ogg' | 'flac';

export function audioExtFor(mimeType: string | null | undefined): AudioExt {
  const t = String(mimeType || '').toLowerCase();
  if (/mp4/.test(t)) return 'mp4';        // iOS Safari records audio/mp4
  if (/aac|m4a|x-m4a/.test(t)) return 'm4a';
  if (/webm/.test(t)) return 'webm';      // Chrome/Firefox default
  if (/ogg|opus/.test(t)) return 'ogg';
  if (/flac/.test(t)) return 'flac';
  if (/mpeg|mp3/.test(t)) return 'mp3';
  if (/wav|wave|x-wav/.test(t)) return 'wav';
  // Unknown → webm, because that is what a browser MediaRecorder produces by default. Defaulting to
  // 'wav' (the old behaviour) was the bug: it is the one guess that is almost never right for mic audio.
  return 'webm';
}

/** `chunk.<ext>` — the upload filename the transcription endpoint keys off. */
export function audioFileName(mimeType: string | null | undefined, base = 'chunk'): string {
  return `${base}.${audioExtFor(mimeType)}`;
}
