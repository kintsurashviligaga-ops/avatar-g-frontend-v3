/**
 * Lyrics section tags for the Music panel (Phase 7.6 M2, behind NEXT_PUBLIC_MUSIC_UX_V2). Lyria reads `[Verse]`,
 * `[Chorus]` … in the lyrics as song sections (lib/ai/lyriaMusic passes them through as written), so one tap puts the tag
 * on its own line instead of the user having to know the bracket syntax.
 *
 * Pure: the panel calls it and hands the result to its own onLyrics (the same LYRICS_MAX cut applies there).
 */
export const LYRICS_SECTIONS = ['Verse', 'Chorus', 'Bridge', 'Outro'] as const;
export type LyricsSection = (typeof LYRICS_SECTIONS)[number];

/**
 * The lyrics with `[Section]` on its own line at `at` (default: the end), and where the caret goes after it (the start of
 * the empty line under the tag, so typing continues the section).
 */
export function insertSectionTag(text: string, section: LyricsSection, at?: number): { text: string; caret: number } {
  const pos = Math.max(0, Math.min(text.length, at ?? text.length));
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lead = before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tag = `[${section}]\n`;
  const next = `${before}${lead}${tag}${after}`;
  return { text: next, caret: before.length + lead.length + tag.length };
}

/** The section tags the lyrics already hold, in order (for a quick "Verse · Chorus" read-back). */
export function sectionsIn(text: string): LyricsSection[] {
  const out: LyricsSection[] = [];
  for (const m of text.matchAll(/^\s*\[(verse|chorus|bridge|outro)\]\s*$/gimu)) {
    const name = m[1]!.toLowerCase();
    out.push((name.charAt(0).toUpperCase() + name.slice(1)) as LyricsSection);
  }
  return out;
}
