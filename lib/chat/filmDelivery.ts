/**
 * Say what a finished film actually contains when it is not what was asked for.
 *
 * ⚠️ A COMPLETELY SILENT FILM WAS REPORTED AS A CLEAN SUCCESS. /api/video/assemble is careful about
 * this: when ElevenLabs Music and MusicGen both miss, `resolveMusicBed` returns `{ url: null,
 * fallback: null }` and the route logs, in its own words, "SILENT (all music providers missed —
 * proceeding silent, not 500)". Both response shapes carry `scoreFallback` out to the client.
 *
 * And nothing read it. `assembleMaster`'s response cast lists `url | qa | message | error | musicUrl`
 * — `scoreFallback` is not in the cast or the return type, so it was dropped at the door. A user who
 * asked for a scored film received a video with no audio bed at all and was told nothing; the same
 * blindness hid the ElevenLabs-Music → MusicGen downgrade.
 *
 * The Director's Console made it worse by asserting the opposite: `filmAgentRoster` prints
 * "Sound — music & SFX bed ready" off `m?.sfxUrl || m?.audio === 'succeeded'`, which is a different
 * signal entirely from whether a score actually landed on the master.
 *
 * Pure and locale-aware, mirroring lib/video/remixDelivery so both surfaces state degradations the
 * same way.
 */

export type Loc = 'ka' | 'en' | 'ru';

export interface FilmDelivery {
  /**
   * What the score leg ended up doing.
   * `null`      → every music provider missed; the film has NO music bed.
   * `'musicgen'`→ the primary sang out and the backup engine produced the bed.
   * `undefined` → the route did not report (older response, or no music was requested).
   */
  scoreFallback?: string | null;
  /** True when the user asked for music at all — a deliberately silent film must not be warned about. */
  musicRequested?: boolean;
}

export function describeFilmDelivery(d: FilmDelivery | null | undefined, locale: Loc): string[] {
  const out: string[] = [];
  if (!d || !d.musicRequested) return out;

  // `undefined` means "not reported"; only an explicit null means "every provider missed".
  if (d.scoreFallback === null) {
    out.push(
      locale === 'en'
        ? '⚠️ No music could be generated — this film has no soundtrack.'
        : locale === 'ru'
          ? '⚠️ Музыку создать не удалось — фильм без саундтрека.'
          : '⚠️ მუსიკა ვერ შეიქმნა — ფილმს საუნდტრეკი არ აქვს.',
    );
  } else if (d.scoreFallback === 'musicgen') {
    out.push(
      locale === 'en'
        ? 'ℹ️ The soundtrack came from the backup engine (MusicGen) — the primary was unavailable.'
        : locale === 'ru'
          ? 'ℹ️ Саундтрек создан резервным движком (MusicGen) — основной был недоступен.'
          : 'ℹ️ საუნდტრეკი სარეზერვო ძრავამ შექმნა (MusicGen) — ძირითადი მიუწვდომელი იყო.',
    );
  }
  return out;
}
