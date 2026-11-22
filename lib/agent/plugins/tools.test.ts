/** @jest-environment node */
/** The plugin tools: a dead link is said with a next step; the Notion draft goes to the card, never to Notion. */
import { randomBytes } from 'node:crypto';
import { bindTools } from '@/lib/agent/tools/registry';
import { connectorKeys, encryptToken } from '@/lib/connectors/google/crypto';
import { PLUGIN_TOOL_SPECS, type PluginToolContext } from './tools';

const keys = connectorKeys({ CONNECTOR_TOKEN_KEY: randomBytes(32).toString('base64') } as never)!;
const deps = (sealed: string | null) => ({ cfg: { clientId: 'c', clientSecret: 's', keys, scope: '' }, tableReady: true, store: { get: async () => (sealed ? { userId: 'u', sealedRefreshToken: sealed, scope: '', email: null } : null), put: async () => true, remove: async () => true } });
const tool = (ctx: PluginToolContext, name: string) => bindTools(PLUGIN_TOOL_SPECS, ctx).find((t) => t.name === name)!;
const ID = '12345678123412341234123456789abc';

afterEach(() => jest.restoreAllMocks());

test('nothing is offered with an empty context', () => {
  expect(bindTools(PLUGIN_TOOL_SPECS, { userId: 'u' })).toEqual([]);
});

test('Notion not linked: not_connected with a reconnect hint; no request is made', async () => {
  const f = jest.spyOn(global, 'fetch');
  const r = await tool({ userId: 'u', notionDeps: deps(null) }, 'notion_search').run({ query: 'x' });
  expect(r).toMatchObject({ error: 'not_connected', next: expect.stringContaining('Connectors button') });
  expect(f).not.toHaveBeenCalled();
});

test('Notion linked: search goes out with the decrypted token; an empty result says how to share a page', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) } as Response);
  const r = await tool({ userId: 'u', notionDeps: deps(encryptToken('ntn_tok', 'u', keys)) }, 'notion_search').run({ query: 'plan' });
  expect(r).toMatchObject({ pages: [], next: expect.stringContaining('Connections') });
  expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer ntn_tok' });
});

test('a sealed token from another user does not decrypt: not_connected', async () => {
  const r = await tool({ userId: 'u', notionDeps: deps(encryptToken('ntn_tok', 'someone-else', keys)) }, 'notion_read_page').run({ id: ID });
  expect(r).toMatchObject({ error: 'not_connected' });
});

test('notion_prepare_page hands the draft to the card and saves nothing', async () => {
  const f = jest.spyOn(global, 'fetch');
  const onNotionDraft = jest.fn();
  const r = await tool({ userId: 'u', notionDeps: deps(encryptToken('t', 'u', keys)), onNotionDraft }, 'notion_prepare_page').run({ parentId: ID, title: 'T', text: 'body' });
  expect(r).toMatchObject({ prepared: true, saved: false });
  expect(onNotionDraft).toHaveBeenCalledWith({ parentId: ID, title: 'T', text: 'body' });
  expect(f).not.toHaveBeenCalled();
});

test('github_prepare_issue returns a github.com link and files nothing', async () => {
  const f = jest.spyOn(global, 'fetch');
  const r = (await tool({ userId: 'u', githubDeps: deps(encryptToken('t', 'u', keys)) }, 'github_prepare_issue').run({ repo: 'o/r', title: 'Bug', body: 'b' })) as { link: string; filed: boolean };
  expect(r.filed).toBe(false);
  expect(r.link.startsWith('https://github.com/o/r/issues/new?')).toBe(true);
  expect(f).not.toHaveBeenCalled();
});

test('calendar_prepare_event: a bad zone is named; a good one gives the link and the .ics', async () => {
  const t = tool({ userId: 'u', calendar: true }, 'calendar_prepare_event');
  await expect(t.run({ title: 'x', start: '2099-01-01T10:00', timeZone: 'Moon/Base' })).resolves.toMatchObject({ error: 'bad_time_zone' });
  const ok = (await t.run({ title: 'Call', start: '2099-01-01T10:00', durationMin: '30', timeZone: 'Asia/Tbilisi' })) as Record<string, string>;
  expect(ok.startUtc).toBe('2099-01-01T06:00:00.000Z');
  expect(ok.googleCalendarLink).toContain('calendar.google.com');
  expect(ok.ics).toContain('BEGIN:VEVENT');
});
