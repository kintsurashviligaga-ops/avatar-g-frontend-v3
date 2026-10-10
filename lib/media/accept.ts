/**
 * lib/media/accept.ts — file-picker `accept` lists that let an iPhone pick music.
 *
 * ⚠️ iOS SAFARI DOES NOT HONOUR THE `audio/*` WILDCARD. With only `audio/*` in the list, the Files picker hid or greyed
 * out every .mp3 the owner had in Files (report 2026-10-09 18:36Z: the Files app showed the tracks, the chat's picker did
 * not). Naming the MIME types AND the extensions makes them pickable. Every input that takes audio uses AUDIO_ACCEPT, never
 * a bare `audio/*`.
 */
export const AUDIO_ACCEPT = [
  'audio/*', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/flac', 'audio/webm', '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac',
].join(',');

/** `list` with every bare `audio/*` widened to AUDIO_ACCEPT (once). */
export function withAudioTypes(list: string): string {
  const parts = list.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.includes('audio/*')) return parts.join(',');
  const out: string[] = [];
  for (const p of parts) {
    if (p === 'audio/*') out.push(...AUDIO_ACCEPT.split(','));
    else out.push(p);
  }
  return Array.from(new Set(out)).join(',');
}
