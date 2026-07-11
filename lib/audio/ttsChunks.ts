/**
 * chunkForTts — split text into TTS-sized chunks so a long read is never truncated by a single
 * request. Breaks on sentence terminators (Latin · Georgian · CJK) and newlines, merges fragments
 * up to ~600 chars, and hard-splits any runaway sentence. Pure + dependency-free + tested.
 *
 * Callers synth + play the chunks back-to-back (pre-fetching the next while the current plays), so
 * even if the provider truncates ONE chunk the rest still play — the fix for "audio stops after a
 * word or two". Shared by the composer read-aloud (OmniStudio, MyAvatarChatV2) and the real-time
 * voice node (VoiceConversation).
 */
export function chunkForTts(text: string, maxChars = 600): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?。！？\n]+[.!?。！？]+|\S[^.!?。！？\n]*$/g) || [clean];
  const MAX = maxChars;
  const chunks: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (`${buf} ${s}`.trim().length > MAX) {
      if (buf) { chunks.push(buf.trim()); buf = ''; }
      if (s.length > MAX) { for (let k = 0; k < s.length; k += MAX) chunks.push(s.slice(k, k + MAX)); }
      else buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
