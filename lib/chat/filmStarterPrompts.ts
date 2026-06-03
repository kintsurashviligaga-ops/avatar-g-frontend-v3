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

const STARTERS: Record<StarterLang, readonly string[]> = {
  ka: [
    'ნისლიან მთებში მარტოსული მოგზაური გამთენიისას — ნელი კინემატოგრაფიული პანორამა, თბილი ოქროსფერი შუქი.',
    'ნეონით განათებული ღამის ქალაქი წვიმაში — კამერა მიჰყვება პერსონაჟს, კინემატოგრაფიული ანარეკლები.',
    'მყუდრო კაფე დილით, ორთქლი ამოდის ცხელი ყავიდან — ახლო ხედები, რბილი ბუნებრივი განათება.',
  ],
  en: [
    'A lone traveler in misty mountains at dawn — slow cinematic pan, warm golden light.',
    'A neon-lit city at night in the rain — camera tracking a character, cinematic reflections.',
    'A cozy café in the morning, steam rising from hot coffee — close-ups, soft natural light.',
  ],
  ru: [
    'Одинокий путник в туманных горах на рассвете — медленная кинопанорама, тёплый золотой свет.',
    'Неоновый ночной город под дождём — камера следует за персонажем, кинематографичные отражения.',
    'Уютное кафе утром, пар поднимается над горячим кофе — крупные планы, мягкий естественный свет.',
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
