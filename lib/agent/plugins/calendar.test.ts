/** @jest-environment node */
import { icsEscape, icsFold, isTimeZone, localToUtc, prepareEvent, zoneOffsetMinutes } from './calendar';

const NOW = new Date('2026-11-20T12:00:00Z');

test('time zones: real IANA names only', () => {
  expect(isTimeZone('Asia/Tbilisi')).toBe(true);
  expect(isTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
  expect(isTimeZone('UTC')).toBe(true);
  for (const bad of ['Mars/Olympus', '', 'Asia/Tbilisi; DROP', '../etc']) expect(isTimeZone(bad)).toBe(false);
  expect(zoneOffsetMinutes('Asia/Tbilisi', NOW)).toBe(240);
});

test('wall clock → UTC, including both sides of a DST change; the spring-forward gap is refused', () => {
  expect(localToUtc('2026-11-21T15:00', 'Asia/Tbilisi')?.toISOString()).toBe('2026-11-21T11:00:00.000Z');
  expect(localToUtc('2026-07-01T09:30', 'Europe/Berlin')?.toISOString()).toBe('2026-07-01T07:30:00.000Z');
  expect(localToUtc('2026-12-01T09:30', 'Europe/Berlin')?.toISOString()).toBe('2026-12-01T08:30:00.000Z');
  expect(localToUtc('2026-03-29T02:30', 'Europe/Berlin')).toBeNull();
  expect(localToUtc('2026-13-01T10:00', 'Asia/Tbilisi')).toBeNull();
  expect(localToUtc('tomorrow', 'Asia/Tbilisi')).toBeNull();
});

test('a prepared event: Google Calendar link with the zone, and a valid .ics with an alarm', () => {
  const r = prepareEvent({ title: 'შეხვედრა, გეგმა; v2', start: '2026-11-21T15:00', durationMin: 45, timeZone: 'Asia/Tbilisi', details: 'line 1\nline 2', remindMin: 15 }, NOW, 'uid-1@myavatar.ge');
  if (!r.ok) throw new Error(r.reason);
  expect(r.startUtc).toBe('2026-11-21T11:00:00.000Z');
  expect(r.endUtc).toBe('2026-11-21T11:45:00.000Z');
  const u = new URL(r.googleCalendarLink);
  expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(u.searchParams.get('dates')).toBe('20261121T110000Z/20261121T114500Z');
  expect(u.searchParams.get('ctz')).toBe('Asia/Tbilisi');
  expect(r.ics).toContain('DTSTART:20261121T110000Z');
  expect(r.ics).toContain('SUMMARY:შეხვედრა\\, გეგმა\; v2');
  expect(r.ics).toContain('DESCRIPTION:line 1\\nline 2');
  expect(r.ics).toContain('TRIGGER:-PT15M');
  expect(r.ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  for (const line of r.ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
});

test('refusals are named, never guessed', () => {
  const base = { title: 'x', start: '2026-11-21T15:00', durationMin: 30, timeZone: 'Asia/Tbilisi' };
  expect(prepareEvent({ ...base, timeZone: 'Nowhere/City' }, NOW)).toEqual({ ok: false, reason: 'bad_time_zone' });
  expect(prepareEvent({ ...base, start: '2026-11-19T10:00' }, NOW)).toEqual({ ok: false, reason: 'in_the_past' });
  expect(prepareEvent({ ...base, durationMin: 2 }, NOW)).toEqual({ ok: false, reason: 'bad_input' });
  expect(prepareEvent({ ...base, title: '  ' }, NOW)).toEqual({ ok: false, reason: 'bad_input' });
});

test('ics escaping and folding never split a Georgian character', () => {
  expect(icsEscape('a\\b,c;d\ne')).toBe('a\\\\b\\,c\;d\\ne');
  const folded = icsFold('SUMMARY:' + 'ა'.repeat(60));
  expect(folded.split('\r\n ').join('')).toBe('SUMMARY:' + 'ა'.repeat(60));
  for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
});
