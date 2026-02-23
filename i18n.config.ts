export const i18n = {
	defaultLocale: "ka",
	locales: ["en", "ka"],
} as const;

export type Locale = (typeof i18n)["locales"][number];
