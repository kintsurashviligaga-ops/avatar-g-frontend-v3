/**
 * lib/services/serviceCatalogue.ts
 * ===============================
 * THE canonical list of the ten official services.
 *
 * WHY THIS EXISTS: the repo already had FIVE service registries — lib/service-registry.ts (22 entries),
 * lib/registry.ts (14), lib/services/registry.ts (19), components/dashboard/omni/i18n.ts (8) and the
 * ServiceHub card array (2) — none of which is the ten-service product. They disagree on ids, on names and
 * on which services exist, so any UI built on one of them shows a different platform from the next.
 *
 * This module is the one the SIDEBAR and the SERVICE HUB read. It is deliberately narrow: identity, copy,
 * icon, route and billing key. It does NOT replace the others (they carry pipeline topology and agent
 * wiring that this has no opinion about) — but it is the list a user is shown.
 *
 * PURE + TOTAL: no imports, no I/O, never throws. `ServiceId` matches the billing `ServiceType` exactly so
 * a catalogue entry can be priced without a mapping table.
 */

export type ServiceId =
  | 'chat' | 'image' | 'video' | 'music' | 'avatar'
  | 'remix' | 'montage' | 'dubbing' | 'model3d' | 'presentation';

export type ServiceLocale = 'ka' | 'en' | 'ru';

export interface LocalizedCopy {
  ka: string;
  en: string;
  ru: string;
}

export interface ServiceEntry {
  id: ServiceId;
  /** Emoji shown in the sidebar rail and the hub card. */
  icon: string;
  name: LocalizedCopy;
  tagline: LocalizedCopy;
  /** Where the sidebar sends the user. `hash` targets a surface inside the workspace shell; `path` is a
   *  real route. Both are locale-relative — the caller prefixes `/${locale}`. */
  target: { kind: 'hash'; hash: string } | { kind: 'path'; path: string };
  /** False while the service has no working surface yet — rendered, but visibly "coming soon" rather than
   *  silently linking somewhere that 404s or 501s. Honesty in the UI beats a dead click. */
  live: boolean;
}

export const SERVICE_CATALOGUE: readonly ServiceEntry[] = [
  {
    id: 'chat', icon: '💬', live: true, target: { kind: 'hash', hash: '' },
    name: { ka: 'ჩატი', en: 'Chat', ru: 'Чат' },
    tagline: { ka: 'AI ასისტენტი', en: 'AI assistant', ru: 'AI-ассистент' },
  },
  {
    id: 'image', icon: '🖼', live: true, target: { kind: 'hash', hash: 'omni' },
    name: { ka: 'სურათი', en: 'Image', ru: 'Изображение' },
    tagline: { ka: 'Imagen 4 გენერაცია', en: 'Imagen 4 generation', ru: 'Генерация Imagen 4' },
  },
  {
    id: 'video', icon: '🎬', live: true, target: { kind: 'hash', hash: 'film' },
    name: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
    tagline: { ka: 'Veo 3.1, ხმით', en: 'Veo 3.1, with audio', ru: 'Veo 3.1, со звуком' },
  },
  {
    id: 'music', icon: '🎵', live: true, target: { kind: 'hash', hash: 'omni' },
    name: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
    tagline: { ka: 'Lyria 3', en: 'Lyria 3', ru: 'Lyria 3' },
  },
  {
    id: 'avatar', icon: '🧑‍🎤', live: true, target: { kind: 'hash', hash: 'lipsync' },
    name: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' },
    tagline: { ka: 'მოლაპარაკე ავატარი', en: 'Talking avatar', ru: 'Говорящий аватар' },
  },
  {
    id: 'remix', icon: '🔀', live: true, target: { kind: 'hash', hash: 'omni' },
    name: { ka: 'რემიქსი', en: 'Remix', ru: 'Ремикс' },
    tagline: { ka: 'აუდიო, სურათი, ვიდეო', en: 'Audio, image, video', ru: 'Аудио, фото, видео' },
  },
  {
    id: 'montage', icon: '✂️', live: true, target: { kind: 'hash', hash: 'film' },
    name: { ka: 'მონტაჟი', en: 'Montage', ru: 'Монтаж' },
    tagline: { ka: 'ავტომატური მონტაჟი', en: 'Automatic editing', ru: 'Автомонтаж' },
  },
  {
    // Backend landed (validation + pricing + budget gate); the provider legs are not wired, so the tile is
    // shown as not-yet-live rather than linking to a 501.
    id: 'dubbing', icon: '🎙', live: false, target: { kind: 'path', path: '/dubbing' },
    name: { ka: 'დუბლაჟი', en: 'Dubbing', ru: 'Дубляж' },
    tagline: { ka: 'ხმის კლონი და თარგმანი', en: 'Voice clone and translation', ru: 'Клон голоса и перевод' },
  },
  {
    id: 'model3d', icon: '🧊', live: false, target: { kind: 'path', path: '/3d' },
    name: { ka: '3D მოდელი', en: '3D Model', ru: '3D-модель' },
    tagline: { ka: 'ტექსტიდან GLB-მდე', en: 'Text to GLB', ru: 'Из текста в GLB' },
  },
  {
    id: 'presentation', icon: '📊', live: false, target: { kind: 'path', path: '/slides' },
    name: { ka: 'პრეზენტაცია', en: 'Presentation', ru: 'Презентация' },
    tagline: { ka: 'სლაიდები და PDF', en: 'Slides and PDF', ru: 'Слайды и PDF' },
  },
] as const;

export function getService(id: string | null | undefined): ServiceEntry | null {
  if (!id) return null;
  return SERVICE_CATALOGUE.find((s) => s.id === id) ?? null;
}

/** Services with a working surface today — what the hub shows first. */
export function liveServices(): ServiceEntry[] {
  return SERVICE_CATALOGUE.filter((s) => s.live);
}

/** Resolve a catalogue entry to a href for the given locale. Hash targets stay on the workspace route. */
export function serviceHref(entry: ServiceEntry, locale: string): string {
  const loc = locale === 'en' || locale === 'ru' ? locale : 'ka';
  if (entry.target.kind === 'path') return `/${loc}${entry.target.path}`;
  return entry.target.hash ? `/${loc}/dashboard#${entry.target.hash}` : `/${loc}/dashboard`;
}

/** Localized field with an explicit ka fallback — ka is this product's default, not English. */
export function serviceName(entry: ServiceEntry, locale: string): string {
  const loc: ServiceLocale = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return entry.name[loc] || entry.name.ka;
}

export function serviceTagline(entry: ServiceEntry, locale: string): string {
  const loc: ServiceLocale = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return entry.tagline[loc] || entry.tagline.ka;
}
