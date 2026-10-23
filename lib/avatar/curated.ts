/**
 * lib/avatar/curated.ts — which faces a talking avatar may have (MASTER TASK v3.1, Phase 1 PR 9). Pure, client-safe.
 *
 * GG (2026-10-22): built-in avatars only for now. A built-in avatar is one of the Avatar panel's presets
 * (lib/studio/templates AVATAR_TEMPLATES), which the server loads from its own files (lib/avatar/curatedFace): the
 * browser names the face, it never uploads it.
 *
 * Everything else is a CUSTOM avatar and answers `capability_unavailable` before any charge: the user's own photo, a
 * video to dub, a recorded or uploaded voice, the Digital Twin's face. Google documents no engine that renders a file
 * of a person's own face speaking their own audio (Veo 3.1 takes no audio input), and its custom Live Avatar is
 * allowlist-only (docs/master-v3.1 CAPABILITY_MATRIX "Avatar / lip-sync"). The draft stays in the composer, so a
 * built-in face can be picked and the same words sent again.
 */
import { AVATAR_TEMPLATES } from '@/lib/studio/templates';

/** The gap a custom-avatar refusal names (`gap` beside `capability_unavailable`). */
export const CUSTOM_AVATAR_GAP = 'custom_avatar';

/** The built-in faces, by the public path the panel, its cards and stockAvatarFace give them. */
export const CURATED_AVATAR_FACES: readonly string[] = [...new Set(AVATAR_TEMPLATES.map((t) => t.values.preset))];

/** `face` when it is a built-in avatar's path, else null (an upload, a signed URL, the twin's face, anything else). */
export function curatedAvatarFace(face: unknown): string | null {
  return typeof face === 'string' && CURATED_AVATAR_FACES.includes(face) ? face : null;
}

const GAP = {
  ka: 'საკუთარი ავატარი ჯერ მიუწვდომელია: შენი ფოტოს, ვიდეოს ან ხმის ავატარს Google-ის დადასტურებული ძრავა ჯერ არ აქვს. აირჩიე ერთ-ერთი მზა ავატარი — არაფერი ჩამოგეჭრა.',
  en: 'Custom avatars are not available yet: Google has no verified engine for an avatar from your own photo, video or voice. Pick one of the built-in avatars. Nothing was charged.',
  ru: 'Собственный аватар пока недоступен: у Google нет проверенного движка для аватара из вашего фото, видео или голоса. Выберите один из готовых аватаров. Ничего не списано.',
} as const;

const KEPT = { ka: 'შენი ტექსტი შენახულია.', en: 'Your message is kept.', ru: 'Ваше сообщение сохранено.' } as const;

/** The precise gap, in the user's language. `kept`: the composer still holds the draft (the browser's own refusal). */
export function customAvatarText(locale: string, opts: { kept?: boolean } = {}): string {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return opts.kept ? `${GAP[lang]} ${KEPT[lang]}` : GAP[lang];
}

/** The body every avatar entry point answers a custom-avatar request with (422), before any charge or write. */
export function customAvatarBody(locale: string) {
  return {
    success: false as const, error: 'capability_unavailable', code: 'capability_unavailable', gap: CUSTOM_AVATAR_GAP,
    message: customAvatarText(locale), refunded: false as const,
  };
}
