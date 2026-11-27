/**
 * lib/agent/plugins/tools.ts — the Agent G tools of the Notion, GitHub and Calendar plugins. Each one is offered only
 * when its plugin is open to this request (the route decides from the session and the flags; closed = the model never
 * hears of it), so with every flag empty Agent G's tool list is exactly what it was.
 *
 * Effects (lib/agent/tools/registry): reads of the user's own linked data are `inspect`; anything that would write
 * somewhere else is `prepare` — the model returns a draft and the USER saves it (Notion: the card's Save button;
 * GitHub: github.com's own Submit; Calendar: the user's own "Save" in Google Calendar, or importing the .ics).
 */
import { z } from 'zod';
import { defineTool, type ToolSpec } from '@/lib/agent/tools/registry';
import type { TokenConnectorDeps } from '@/lib/connectors/oauth/types';
import { linkedToken } from '@/lib/connectors/oauth/token';
import { prepareEvent } from './calendar';
import { pluginToolMessage, pluginToolNext } from './messages';

/** What the plugin tools read from the run's context (a subset of lib/agent/react/bindLiveAgent AgentContext). */
export interface PluginToolContext {
  userId: string;
  notionDeps?: TokenConnectorDeps;
  githubDeps?: TokenConnectorDeps;
  /** The Calendar plugin (AGENT_PLUGINS open to this user): links and .ics only, no account. */
  calendar?: boolean;
  /** Receives the last Notion page draft; the route hands it to the client's Save card. */
  onNotionDraft?: (draft: NotionDraft) => void;
}

export interface NotionDraft { parentId: string; title: string; text: string }

export const notionToolOn = (ctx: PluginToolContext): boolean => !!ctx.notionDeps?.cfg && !!ctx.notionDeps.store && ctx.notionDeps.tableReady;
export const githubToolOn = (ctx: PluginToolContext): boolean => !!ctx.githubDeps?.cfg && !!ctx.githubDeps.store && ctx.githubDeps.tableReady;
export const calendarToolOn = (ctx: PluginToolContext): boolean => ctx.calendar === true;

const fail = (plugin: 'notion' | 'github', reason: string) => ({ error: reason, message: pluginToolMessage(plugin, reason), next: pluginToolNext(plugin, reason) });

/** A Notion page id: 32 hex characters, with or without the dashes of a UUID. */
const NOTION_ID = z.string().trim().regex(/^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/);
const REPO = z.string().trim().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/);

export const PLUGIN_NOTE =
  'Plugins. Notion: notion_search finds pages the user shared with MyAvatar, notion_read_page reads one, ' +
  'notion_prepare_page drafts a new page under a shared page — it is saved only when the user presses Save on the card. ' +
  'GitHub: github_list_repos, github_list_issues (issues and pull requests) and github_read_file read; ' +
  'github_prepare_issue gives a link to github.com with the issue filled in, which the user submits there. ' +
  'Calendar: calendar_prepare_event turns a time in the user\'s time zone into a Google Calendar link and an .ics file; ' +
  'it saves nothing in anyone\'s calendar. Never say a page, issue or event was created; say what the user must press. ' +
  'When a tool answers not_connected, tell the user, in their language, to connect it with the Connectors button next to "+".';

export const PLUGIN_TOOL_SPECS: ReadonlyArray<ToolSpec<PluginToolContext>> = [
  defineTool({
    name: 'notion_search',
    effect: 'inspect',
    description: "READ ONLY — find pages in the user's Notion that they shared with MyAvatar. Input {query}. Returns {pages: [{id, title, url, editedAt}]}. Free.",
    input: z.object({ query: z.string().trim().max(200).default('') }),
    offered: notionToolOn,
    limit: 3,
    run: async ({ query }, ctx) => {
      const token = await linkedToken(ctx.notionDeps!, ctx.userId);
      if (!token) return fail('notion', 'not_connected');
      const { notionSearch } = await import('@/lib/connectors/notion');
      const r = await notionSearch(token, query);
      if (!r.ok) return fail('notion', r.reason);
      return r.data.length ? { pages: r.data } : { pages: [], next: pluginToolNext('notion', 'empty') };
    },
  }),
  defineTool({
    name: 'notion_read_page',
    effect: 'inspect',
    description: 'READ ONLY — the title and text of one Notion page. Input {id} from notion_search. Returns {title, text, truncated, url}. Free.',
    input: z.object({ id: NOTION_ID }),
    offered: notionToolOn,
    limit: 4,
    run: async ({ id }, ctx) => {
      const token = await linkedToken(ctx.notionDeps!, ctx.userId);
      if (!token) return fail('notion', 'not_connected');
      const { notionReadPage } = await import('@/lib/connectors/notion');
      const r = await notionReadPage(token, id);
      return r.ok ? r.data : fail('notion', r.reason);
    },
  }),
  defineTool({
    name: 'notion_prepare_page',
    effect: 'prepare',
    description:
      'PREPARE ONLY — draft a new Notion page under a page the user shared (parentId from notion_search). Input {parentId, title, text (markdown-ish: # headings, - lists)}. ' +
      'Returns the draft; NOTHING is saved until the user presses Save on the card.',
    input: z.object({ parentId: NOTION_ID, title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(20_000) }),
    offered: notionToolOn,
    limit: 2,
    run: async ({ parentId, title, text }, ctx) => {
      ctx.onNotionDraft?.({ parentId, title, text });
      return { prepared: true, saved: false, title, chars: text.length, next: 'Tell the user the draft is on the card and is saved to Notion only when they press Save.' };
    },
  }),
  defineTool({
    name: 'github_list_repos',
    effect: 'inspect',
    description: 'READ ONLY — the GitHub repositories the user can see (30 most recently pushed). Input {}. Returns {repos: [{fullName, private, description, defaultBranch, openIssues, pushedAt}]}. Free.',
    input: z.object({}).passthrough(),
    offered: githubToolOn,
    limit: 2,
    run: async (_a, ctx) => {
      const token = await linkedToken(ctx.githubDeps!, ctx.userId);
      if (!token) return fail('github', 'not_connected');
      const { githubListRepos } = await import('@/lib/connectors/github');
      const r = await githubListRepos(token);
      return r.ok ? { repos: r.data } : fail('github', r.reason);
    },
  }),
  defineTool({
    name: 'github_list_issues',
    effect: 'inspect',
    description: "READ ONLY — a repository's issues and/or pull requests (30 most recently updated). Input {repo: 'owner/name', kind?: 'issue'|'pr'|'all', state?: 'open'|'closed'|'all'}. Free.",
    input: z.object({ repo: REPO, kind: z.enum(['issue', 'pr', 'all']).default('all'), state: z.enum(['open', 'closed', 'all']).default('open') }),
    offered: githubToolOn,
    limit: 4,
    run: async ({ repo, kind, state }, ctx) => {
      const token = await linkedToken(ctx.githubDeps!, ctx.userId);
      if (!token) return fail('github', 'not_connected');
      const { githubListIssues } = await import('@/lib/connectors/github');
      const r = await githubListIssues(token, { repo, kind, state });
      return r.ok ? { items: r.data } : fail('github', r.reason);
    },
  }),
  defineTool({
    name: 'github_read_file',
    effect: 'inspect',
    description: "READ ONLY — one file's text from a repository. Input {repo: 'owner/name', path, ref?}. Returns {path, text, truncated}. Free.",
    input: z.object({ repo: REPO, path: z.string().trim().min(1).max(400), ref: z.string().trim().max(200).optional() }),
    offered: githubToolOn,
    limit: 6,
    run: async ({ repo, path, ref }, ctx) => {
      const token = await linkedToken(ctx.githubDeps!, ctx.userId);
      if (!token) return fail('github', 'not_connected');
      const { githubReadFile } = await import('@/lib/connectors/github');
      const r = await githubReadFile(token, { repo, path, ...(ref ? { ref } : {}) });
      return r.ok ? r.data : fail('github', r.reason);
    },
  }),
  defineTool({
    name: 'github_prepare_issue',
    effect: 'prepare',
    description:
      "PREPARE ONLY — a link to github.com's new-issue page with the title and body filled in. Input {repo, title, body, labels?}. " +
      'Opening it files NOTHING: the user reviews it and presses Submit on GitHub.',
    input: z.object({ repo: REPO, title: z.string().trim().min(1).max(250), body: z.string().trim().max(6000).default(''), labels: z.array(z.string().trim().min(1).max(50)).max(5).optional() }),
    offered: githubToolOn,
    limit: 3,
    run: async (o) => {
      const { prepareIssueLink } = await import('@/lib/connectors/github');
      const link = prepareIssueLink(o);
      return link ? { prepared: true, filed: false, link, next: 'Give the user the link; the issue exists only after they press Submit on GitHub.' } : fail('github', 'bad_input');
    },
  }),
  defineTool({
    name: 'calendar_prepare_event',
    effect: 'prepare',
    description:
      "PREPARE ONLY — an event in the user's time zone as a Google Calendar link and an .ics file. Input {title, start: 'YYYY-MM-DDTHH:MM' (wall clock in timeZone), " +
      "durationMin (5-1440), timeZone (IANA, e.g. 'Asia/Tbilisi'), details?, location?, remindMin?}. Saves nothing in any calendar.",
    input: z.object({
      title: z.string().trim().min(1).max(200),
      start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      durationMin: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(5).max(1440)).default(60),
      timeZone: z.string().trim().min(1).max(64).default('Asia/Tbilisi'),
      details: z.string().trim().max(2000).optional(),
      location: z.string().trim().max(300).optional(),
      remindMin: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(0).max(10_080)).optional(),
    }),
    offered: calendarToolOn,
    limit: 4,
    run: async (o) => {
      const r = prepareEvent(o);
      if (!r.ok) return { error: r.reason, message: pluginToolMessage('calendar', r.reason), next: pluginToolNext('calendar', r.reason) };
      return {
        prepared: true, saved: false, startUtc: r.startUtc, endUtc: r.endUtc, timeZone: r.timeZone,
        googleCalendarLink: r.googleCalendarLink, icsFileName: r.icsFileName, ics: r.ics,
        next: 'Give the user the Google Calendar link (they press Save there). The .ics text can be saved with workspace_write_file when the workspace is open.',
      };
    },
  }),
];
