// Master Prompt §C.7 — fail-fast guards at phase boundaries. A precise error here is far
// cheaper to debug than a cryptic failure deep inside FFmpeg.

export function assertAssetsComplete(assets: {
  images: unknown[];
  voices: unknown[];
  music: string | null;
}): void {
  if (assets.images.length !== 5) throw new Error(`Expected 5 images, got ${assets.images.length}`);
  if (assets.voices.length !== 5) throw new Error(`Expected 5 voice clips, got ${assets.voices.length}`);
  if (!assets.music) throw new Error('Music track missing and no fallback produced');
}

/** ~2.5 words/sec comfortable narration => ~15 words for 6s; 18 is the hard ceiling. */
export function assertSixSecondScript(text: string): void {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > 18) throw new Error(`Script too long for 6s (${words} words): ${text}`);
}
