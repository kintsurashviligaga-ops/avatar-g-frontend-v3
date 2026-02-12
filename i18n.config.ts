export const i18n = {
	defaultLocale: "ka",
	locales: ["ka", "en", "ru"],
} as const;

export type Locale = (typeof i18n)["locales"][number];
