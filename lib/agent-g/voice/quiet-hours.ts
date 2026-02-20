export type QuietHours = {
  enabled?: boolean;
  start?: string;
  end?: string;
  timezoneOffsetMinutes?: number;
};

function parseMinutes(value?: string): number | null {
  if (!value) return null;
  const parts = value.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function isInQuietHours(config: QuietHours | null | undefined, now = new Date()): boolean {
  if (!config?.enabled) return false;

  const start = parseMinutes(config.start);
  const end = parseMinutes(config.end);
  if (start === null || end === null) return false;

  const offset = Number(config.timezoneOffsetMinutes ?? 0);
  const local = new Date(now.getTime() + offset * 60_000);
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();

  if (start <= end) {
    return mins >= start && mins < end;
  }

  return mins >= start || mins < end;
}
