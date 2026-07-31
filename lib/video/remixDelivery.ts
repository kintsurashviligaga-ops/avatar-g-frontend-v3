/**
 * Say what the remix actually delivered when it isn't what was asked for.
 *
 * ⚠️ TWO SILENT SUBSTITUTIONS, BOTH PRESENTED AS PLAIN SUCCESS.
 *
 * 1 · STILL PAN INSTEAD OF A VIDEO. The restyle / character / background paths animate a keyframe with
 *     Kling i2v, and when that misses they fall back to `kenBurnsClip` — a slow pan across ONE STILL
 *     IMAGE. Keeping the fallback is right; a user who asked to restyle their video should not walk
 *     away with nothing. But a 5-second pan over a single frame is not a lesser version of a restyled
 *     video, it is a different artefact, and the card called it done.
 *
 * 2 · A NEW CLIP INSTEAD OF THEIR OWN VIDEO. `character` first tries roop, which swaps the face
 *     THROUGHOUT the original footage with its motion intact. On a miss it regenerates from a single
 *     frame — because Kling is i2v-only — so the user's own video is gone and a fresh ~5s clip stands
 *     in its place. That is the substitution most worth stating out loud.
 *
 * 3 · THE ASPECT RATIO WAS DROPPED. Kling v2.1 infers the output ratio from the start image and ignores
 *     `aspect_ratio`, so the route post-fits with ffmpeg. That fit is fail-open — correct — but when it
 *     missed, the requested aspect simply did not happen and the UI kept displaying it as honoured.
 *
 * Pure and locale-aware so the wording is testable and the note can be attached wherever a remix lands.
 */

export type RemixMethod = 'faceswap' | 'reanimated' | 'stillPan' | string;
export type Loc = 'ka' | 'en' | 'ru';

export interface RemixDelivery {
  method?: RemixMethod | null;
  aspectApplied?: boolean | null;
}

/** Empty when everything the user asked for is what they got — no note, no noise. */
export function describeRemixDelivery(d: RemixDelivery | null | undefined, locale: Loc): string[] {
  const out: string[] = [];
  if (!d) return out;

  if (d.method === 'stillPan') {
    out.push(
      locale === 'en'
        ? '⚠️ The video engine was unavailable, so this is a moving pan over a single restyled frame — not a re-animated clip.'
        : locale === 'ru'
          ? '⚠️ Видеодвижок был недоступен — это панорама по одному кадру, а не переанимированный клип.'
          : '⚠️ ვიდეო-ძრავა მიუწვდომელი იყო — ეს ერთ კადრზე გადაადგილებაა და არა ხელახლა გაანიმაციებული კლიპი.',
    );
  } else if (d.method === 'reanimated') {
    out.push(
      locale === 'en'
        ? 'ℹ️ Generated as a new clip from one frame — the original motion is not preserved.'
        : locale === 'ru'
          ? 'ℹ️ Создано как новый клип из одного кадра — исходное движение не сохранено.'
          : 'ℹ️ შეიქმნა ახალი კლიპი ერთი კადრიდან — ორიგინალის მოძრაობა არ შენარჩუნებულა.',
    );
  }

  // Only meaningful when the route reported on it at all; `undefined` means this op never fits an aspect.
  if (d.aspectApplied === false) {
    out.push(
      locale === 'en'
        ? '⚠️ Kept the source aspect ratio — the requested one could not be applied.'
        : locale === 'ru'
          ? '⚠️ Сохранено исходное соотношение сторон — запрошенное применить не удалось.'
          : '⚠️ შენარჩუნდა წყაროს პროპორცია — მოთხოვნილი ვერ დაედო.',
    );
  }
  return out;
}
