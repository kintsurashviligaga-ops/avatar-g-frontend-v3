/**
 * lib/agent/plugins/calendar.ts — the Calendar & Reminders plugin, the part that works with NO account and NO
 * Google verification: an event in the user's time zone becomes (1) a Google Calendar "add event" link the user opens
 * and saves themselves, and (2) a standard .ics file (RFC 5545) any calendar imports (Apple, Outlook, Google).
 * Nothing here reads or writes anyone's calendar: syncing with Google Calendar needs the calendar.events scope and
 * Google's OAuth verification (docs/plugins/GOOGLE_CALENDAR_GMAIL.md), and stored reminders need the agent_reminders
 * table (migration 20261120b, not applied while the database is paused).
 */

/** A real IANA zone name the runtime knows (Asia/Tbilisi, Europe/Berlin…). */
export function isTimeZone(tz: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) && tz !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset from UTC at that instant, in minutes (Tbilisi = +240). */
export function zoneOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A wall-clock time in a zone ("2026-11-21T15:00" in Asia/Tbilisi) as the UTC instant. Two passes settle the offset on
 * DST days; a time that does not exist (the spring-forward gap) or a malformed one is refused, never guessed.
 */
export function localToUtc(local: string, tz: string): Date | null {
  const m = LOCAL_RE.exec(local);
  if (!m || !isTimeZone(tz)) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  if (mo! < 1 || mo! > 12 || d! < 1 || d! > 31 || h! > 23 || mi! > 59) return null;
  const naive = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  let guess = naive - zoneOffsetMinutes(tz, new Date(naive)) * 60_000;
  guess = naive - zoneOffsetMinutes(tz, new Date(guess)) * 60_000;
  const back = new Date(guess + zoneOffsetMinutes(tz, new Date(guess)) * 60_000);
  if (back.getUTCHours() !== h || back.getUTCMinutes() !== mi || back.getUTCDate() !== d) return null;
  return new Date(guess);
}

export interface EventInput {
  title: string;
  /** Wall-clock start in `timeZone`, YYYY-MM-DDTHH:MM. */
  start: string;
  durationMin: number;
  timeZone: string;
  details?: string;
  location?: string;
  /** Minutes before the start for the calendar's own alarm (the .ics VALARM). */
  remindMin?: number;
}

export type PreparedEvent =
  | { ok: true; startUtc: string; endUtc: string; timeZone: string; googleCalendarLink: string; ics: string; icsFileName: string }
  | { ok: false; reason: 'bad_time_zone' | 'bad_time' | 'in_the_past' | 'bad_input' };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** RFC 5545 TEXT escaping. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding: 75 octets, continuation lines start with a space; never splits a UTF-8 character. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function prepareEvent(e: EventInput, now = new Date(), uid = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}@myavatar.ge`): PreparedEvent {
  const title = e.title.trim();
  if (!title || title.length > 200 || !Number.isInteger(e.durationMin) || e.durationMin < 5 || e.durationMin > 24 * 60) return { ok: false, reason: 'bad_input' };
  if (!isTimeZone(e.timeZone)) return { ok: false, reason: 'bad_time_zone' };
  const start = localToUtc(e.start, e.timeZone);
  if (!start) return { ok: false, reason: 'bad_time' };
  if (start.getTime() < now.getTime() - 60_000) return { ok: false, reason: 'in_the_past' };
  const end = new Date(start.getTime() + e.durationMin * 60_000);
  const details = (e.details ?? '').slice(0, 2000);
  const location = (e.location ?? '').slice(0, 300);

  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(start)}/${stamp(end)}`, ctz: e.timeZone });
  if (details) q.set('details', details);
  if (location) q.set('location', location);

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyAvatar//Agent G//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    ...(details ? [`DESCRIPTION:${icsEscape(details)}`] : []),
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    ...(e.remindMin && e.remindMin > 0 && e.remindMin <= 7 * 24 * 60
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, `TRIGGER:-PT${Math.round(e.remindMin)}M`, 'END:VALARM']
      : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const slug = title.toLowerCase().replace(/[^a-z0-9ა-ჰа-я]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
  return {
    ok: true,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    timeZone: e.timeZone,
    googleCalendarLink: `https://calendar.google.com/calendar/render?${q.toString()}`,
    ics: lines.map(icsFold).join('\r\n') + '\r\n',
    icsFileName: `${slug}.ics`,
  };
}
