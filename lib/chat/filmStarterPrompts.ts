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
    // 🎬 მუსიკალური ვიდეო
    '30-წამიანი ჰიპ-ჰოპის ვიდეო კლიპი. ატვირთული პერსონაჟი ასრულებს ვოკალს, ტუჩების ზუსტი სინქრონიზაციით (Lipsync) ტრეკზე. კამერა აკეთებს დინამიურ 360-გრადუსიან Orbit მოძრაობას მის გარშემო, ნეონის განათება იცვლება მუსიკის ბიტზე, კინემატოგრაფიული ვიზუალი.',
    // 📱 სარეკლამო ვიდეო
    '30-წამიანი დინამიური რეკლამა Instagram-ისა და TikTok-ისთვის, ფორმატი 9:16. ახალგაზრდა მოდელი მოდურ ტანსაცმელში, კამერის სწრაფი Whip Pan მოძრაობები და მოდერნისტული ჭრები, ნათელი კომერციული სტუდიური განათება, ულტრა მაღალი 4K დეტალიზაცია.',
    // 🤖 ფილმის სცენა
    '30-წამიანი ფილმის ექშენ სცენა მომავალზე. უზარმაზარი კიბერპანკ რობოტი გადაადგილდება წვიმიან, ნისლიან მეგაპოლისში. კამერის ხედი: Low Angle, რათა გამოჩნდეს რობოტის მასშტაბი. რეალისტური მეტალის ანარეკლები, კინემატოგრაფიული ანამორფული ობიექტივი.',
  ],
  en: [
    'A 30-second hip-hop music video. The uploaded character performs vocals with precise lip-sync to the track. The camera does a dynamic 360° orbit around them, neon lighting pulses to the beat, cinematic visuals.',
    'A 30-second dynamic ad for Instagram and TikTok, 9:16 format. A young model in fashionable clothing, fast Whip Pan camera moves and modern cuts, bright commercial studio lighting, ultra-high 4K detail.',
    'A 30-second sci-fi action scene set in the future. A massive cyberpunk robot moves through a rainy, foggy megacity. Camera: Low Angle to reveal the robot’s scale. Realistic metal reflections, cinematic anamorphic lens.',
  ],
  ru: [
    '30-секундный хип-хоп клип. Загруженный персонаж исполняет вокал с точной синхронизацией губ (Lipsync) под трек. Камера делает динамичный 360° Orbit вокруг него, неоновый свет пульсирует под бит, кинематографичная картинка.',
    '30-секундная динамичная реклама для Instagram и TikTok, формат 9:16. Молодая модель в модной одежде, быстрые движения Whip Pan и современный монтаж, яркий коммерческий студийный свет, сверхвысокая детализация 4K.',
    '30-секундная sci-fi экшен-сцена будущего. Огромный киберпанк-робот движется по дождливому туманному мегаполису. Ракурс: Low Angle, чтобы показать масштаб робота. Реалистичные металлические отражения, кинематографичный анаморфный объектив.',
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
