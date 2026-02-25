import { routing } from './i18n/routing';

export const i18n = {
  defaultLocale: routing.defaultLocale,
  locales: [...routing.locales],
} as const;

export type Locale = (typeof i18n)["locales"][number];
