export const safeGet = (sp: URLSearchParams | null | undefined, key: string) =>
  sp?.get?.(key) ?? null;