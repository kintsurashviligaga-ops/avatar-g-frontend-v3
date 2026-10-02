/**
 * The Skills tab's rules: every row's state follows a real signal; a guest is told what needs an account; Telegram is never
 * "available" while its webhook cannot link an account; a tool hidden in Plugins is noted, never marked unavailable.
 */
import { SKILL_GROUPS, skillGroups, skillRow, type SkillSignals } from './skills';

const base = (over: Partial<SkillSignals> = {}): SkillSignals => ({
  guest: false,
  liveVoice: true,
  serviceLive: () => true,
  research: { available: true, filesAvailable: true },
  channels: { telegramReady: true, whatsappReady: true },
  hidden: new Set(),
  ...over,
});

test('the five groups, in order, with every skill once', () => {
  expect(SKILL_GROUPS.map((g) => g.id)).toEqual(['talk', 'create', 'read', 'research', 'channels']);
  const all = SKILL_GROUPS.flatMap((g) => g.skills);
  expect(new Set(all).size).toBe(all.length);
  expect(skillGroups(base()).map((g) => g.rows.length)).toEqual([2, 3, 3, 1, 3]);
});

test('signed in, everything on: available — except Telegram, which stays "soon" with the bot note', () => {
  const rows = skillGroups(base()).flatMap((g) => g.rows);
  for (const r of rows.filter((x) => x.id !== 'telegram')) expect(`${r.id}:${r.state}`).toBe(`${r.id}:available`);
  expect(skillRow('telegram', base())).toEqual({ id: 'telegram', state: 'soon', note: 'tg' });
  expect(skillRow('whatsapp', base())).toEqual({ id: 'whatsapp', state: 'available', note: 'wa' });
});

test('a guest: chat stays available (with the guest note); account-only skills say so; the web channel is simply available', () => {
  const g = base({ guest: true });
  expect(skillRow('chat', g)).toEqual({ id: 'chat', state: 'available', note: 'guestChat' });
  for (const id of ['live', 'image', 'video', 'music', 'filesChat', 'videoChat', 'docs', 'research', 'whatsapp'] as const) {
    expect(skillRow(id, g).state).toBe('account');
  }
  expect(skillRow('web', g).state).toBe('available');
});

test('switched off on this deployment → soon (never "with an account" for something that does not exist here)', () => {
  const off = base({
    guest: true, liveVoice: false, serviceLive: (id) => id === 'chat',
    research: { available: false, filesAvailable: false }, channels: { telegramReady: false, whatsappReady: false },
  });
  for (const id of ['live', 'image', 'video', 'music', 'docs', 'research', 'whatsapp'] as const) expect(skillRow(id, off).state).toBe('soon');
  expect(skillRow('telegram', off)).toEqual({ id: 'telegram', state: 'soon' });
  expect(skillRow('whatsapp', off).note).toBeUndefined();
});

test('signals still loading → checking; a failed probe → unknown (not "soon")', () => {
  const loading = base({ research: 'checking', channels: 'checking' });
  expect(skillRow('research', loading).state).toBe('checking');
  expect(skillRow('docs', loading).state).toBe('checking');
  expect(skillRow('telegram', loading).state).toBe('checking');
  const failed = base({ research: 'unknown', channels: 'unknown' });
  expect(skillRow('research', failed).state).toBe('unknown');
  expect(skillRow('whatsapp', failed).state).toBe('unknown');
});

test('a generator hidden in Plugins is still available — only noted', () => {
  const s = base({ hidden: new Set(['music', 'remix'] as const) });
  expect(skillRow('music', s)).toEqual({ id: 'music', state: 'available', note: 'hidden' });
  expect(skillRow('image', s).note).toBeUndefined();
});
