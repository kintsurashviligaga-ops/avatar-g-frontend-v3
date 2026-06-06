/**
 * lib/chat/filmStarterPrompts.ts
 * ==============================
 * Localized first-run "director script" starter prompts for the Conversational
 * Film Studio empty state.
 *
 * The pristine studio screen is otherwise just a welcome bubble over a large
 * empty canvas — a first-time user has no idea what to type into a 30-second
 * cinematic engine. These are EXAMPLE scripts the user can tap to pre-fill the
 * composer; they are never auto-submitted (the user still reviews/edits and
 * presses generate), so the chips guide without ever spending on the user's
 * behalf.
 *
 * Kept as pure data + a tiny selector (no JSX, no client deps) so the copy is
 * unit-testable in isolation and the component stays lean. Georgian is the
 * canonical platform language; en/ru mirror it at parity.
 */

export type StarterLang = 'ka' | 'en' | 'ru';

// ONE flagship starter (Task 4): the premium 30-second music-video generator.
// The studio is a music-clip engine first — a single, unmistakable template beats
// three competing example scripts. It primes the exact winning flow (upload a
// photo + a song → the character performs the track with lip-sync → a cinematic
// 360° orbit, exactly 30 seconds) so the user's very first generation showcases
// the product at its best.
const STARTERS: Record<StarterLang, readonly string[]> = {
  ka: [
    '🔥 პრემიუმ მუსიკალური კლიპი — ატვირთე შენი ფოტო და სიმღერა. პერსონაჟი ასრულებს ვოკალს ტუჩების ზუსტი სინქრონიზაციით (Lipsync), კამერა აკეთებს კინემატოგრაფიულ 360° Orbit მოძრაობას, ნეონის განათება პულსირებს ბიტზე. ზუსტად 30 წამი, კინოხარისხი.',
  ],
  en: [
    '🔥 Premium music video — upload your photo and your song. The character performs the vocals with precise lip-sync, the camera sweeps in a cinematic 360° orbit, neon lighting pulses to the beat. Exactly 30 seconds, cinema quality.',
  ],
  ru: [
    '🔥 Премиум музыкальный клип — загрузите свою фотографию и песню. Персонаж исполняет вокал с точной синхронизацией губ (Lipsync), камера делает кинематографичный 360° Orbit, неоновый свет пульсирует под бит. Ровно 30 секунд, кинокачество.',
  ],
};

/**
 * The localized starter scripts for the studio empty state. Unknown/empty
 * locales fall back to Georgian (the canonical platform language). The returned
 * array is read-only — callers map it to chips, never mutate it.
 */
export function filmStarterPrompts(locale: string): readonly string[] {
  const loc: StarterLang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return STARTERS[loc];
}
