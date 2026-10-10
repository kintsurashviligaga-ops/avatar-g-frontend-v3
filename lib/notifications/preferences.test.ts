/**
 * Notification preferences — the owner's PART H rules as code: moderate defaults, the site always on, a call never for
 * minor news, only places that exist for the person, a call window read in the person's zone.
 */
import {
  CALLABLE_EVENTS, channelsFor, DEFAULT_PREFS, eventForKind, insideCallWindow, normalizePrefs, NOTIFY_EVENTS, type NotifyPlace,
} from './preferences';

test('defaults are moderate: site everywhere, WhatsApp only for finished and approval, no SMS, no calls', () => {
  const p = normalizePrefs(undefined);
  expect(p.events).toEqual({
    task_completed: ['site', 'whatsapp'],
    approval_required: ['site', 'whatsapp'],
    needs_attention: ['site'],
    scheduled_report: ['site'],
    reminder: ['site'],
  });
  for (const e of NOTIFY_EVENTS) expect(p.events[e]).not.toEqual(expect.arrayContaining(['sms']));
  for (const e of NOTIFY_EVENTS) expect(p.events[e]).not.toEqual(expect.arrayContaining(['call']));
  expect(p.callWindow).toEqual({ from: '10:00', to: '20:00' });
  expect(p.timezone).toBe('Asia/Tbilisi');
  expect(normalizePrefs(DEFAULT_PREFS)).toEqual(p);
});

test('the site cannot be switched off and always comes first; duplicates and unknown places are dropped', () => {
  const p = normalizePrefs({ events: { task_completed: ['whatsapp', 'whatsapp', 'pigeon', 7, 'telegram'] } });
  expect(p.events.task_completed).toEqual(['site', 'whatsapp', 'telegram']);
  expect(normalizePrefs({ events: { reminder: [] } }).events.reminder).toEqual(['site']);
});

test('a call is allowed only for finished tasks, scheduled reports and reminders', () => {
  expect(CALLABLE_EVENTS).toEqual(['task_completed', 'scheduled_report', 'reminder']);
  const all = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, ['call']]));
  const p = normalizePrefs({ events: all });
  expect(p.events.task_completed).toContain('call');
  expect(p.events.scheduled_report).toContain('call');
  expect(p.events.reminder).toContain('call');
  expect(p.events.approval_required).not.toContain('call');
  expect(p.events.needs_attention).not.toContain('call');
});

test('a missing event keeps its default; unknown top-level keys vanish', () => {
  const p = normalizePrefs({ events: { reminder: ['site', 'telegram'] }, admin: true, v: 9 });
  expect(p.events.task_completed).toEqual(['site', 'whatsapp']);
  expect(p.events.reminder).toEqual(['site', 'telegram']);
  expect(p).not.toHaveProperty('admin');
  expect(p.v).toBe(1);
});

test('a broken call window or zone takes the default', () => {
  expect(normalizePrefs({ callWindow: { from: '21:00', to: '09:00' } }).callWindow).toEqual({ from: '10:00', to: '20:00' });
  expect(normalizePrefs({ callWindow: { from: '9', to: '25:00' } }).callWindow).toEqual({ from: '10:00', to: '20:00' });
  expect(normalizePrefs({ callWindow: { from: '08:30', to: '18:00' } }).callWindow).toEqual({ from: '08:30', to: '18:00' });
  expect(normalizePrefs({ timezone: 'Mars/Olympus' }).timezone).toBe('Asia/Tbilisi');
  expect(normalizePrefs({ timezone: 'Europe/Berlin' }).timezone).toBe('Europe/Berlin');
});

test('channelsFor: the wish ∩ what exists for the person; the site always', () => {
  const p = normalizePrefs({ events: { task_completed: ['site', 'whatsapp', 'telegram', 'sms', 'call'] } });
  const none = new Set<NotifyPlace>();
  expect(channelsFor(p, 'task_completed', none)).toEqual(['site']);
  expect(channelsFor(p, 'task_completed', new Set<NotifyPlace>(['whatsapp']))).toEqual(['site', 'whatsapp']);
  expect(channelsFor(p, 'task_completed', new Set<NotifyPlace>(['whatsapp', 'telegram', 'sms', 'call']))).toEqual(['site', 'whatsapp', 'telegram', 'sms', 'call']);
});

test('eventForKind: low credits needs attention, the rest is a finished task', () => {
  expect(eventForKind('credits_low')).toBe('needs_attention');
  for (const k of ['video', 'music', 'image', 'avatar', 'film', 'vfx', 'research', 'payment', 'generic']) expect(eventForKind(k)).toBe('task_completed');
});

test('insideCallWindow reads the clock in the person\'s zone', () => {
  const p = normalizePrefs({ callWindow: { from: '10:00', to: '20:00' }, timezone: 'Asia/Tbilisi' }); // UTC+4
  expect(insideCallWindow(p, new Date('2026-10-10T05:59:00Z'))).toBe(false); // 09:59 Tbilisi
  expect(insideCallWindow(p, new Date('2026-10-10T06:00:00Z'))).toBe(true); // 10:00
  expect(insideCallWindow(p, new Date('2026-10-10T15:59:00Z'))).toBe(true); // 19:59
  expect(insideCallWindow(p, new Date('2026-10-10T16:00:00Z'))).toBe(false); // 20:00
  expect(insideCallWindow({ ...p, timezone: 'Nope/Zone' }, new Date('2026-10-10T08:00:00Z'))).toBe(false);
});
