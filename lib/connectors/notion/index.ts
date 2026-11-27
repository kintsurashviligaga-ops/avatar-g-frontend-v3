/**
 * lib/connectors/notion — the Notion plugin (Agent G): search, read and create pages in the user's Notion workspace.
 *
 * ACCESS IS WHAT THE USER GRANTS: Notion's own consent screen lets the user choose which pages the integration may see
 * (a "public integration", owner=user). Agent G sees nothing else. A page is created only as a child of a page the
 * user shared, and only by the user's own press (POST /api/connectors/notion/pages) — the model can only PREPARE it.
 *
 * ⚠️ CLOSED UNLESS: CONNECTORS_NOTION opens it (admin|all; empty = off), NOTION_OAUTH_CLIENT_ID + NOTION_OAUTH_CLIENT_SECRET
 * are set (a Notion public integration GG registers), CONNECTOR_TOKEN_KEY is valid, and migration 20261120a lets
 * connector_accounts hold provider 'notion'. Until then the plugin says "needs setup" and never pretends to be linked.
 */
import { connectorKeys } from '@/lib/connectors/google/crypto';
import type { ApiResult, TokenConnectorConfig, TokenConnectorSpec, TokenExchange } from '@/lib/connectors/oauth/types';

const API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';
const MAX_TEXT = 60_000;

export function notionConfig(env: NodeJS.ProcessEnv = process.env): TokenConnectorConfig | null {
  const clientId = (env.NOTION_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = (env.NOTION_OAUTH_CLIENT_SECRET ?? '').trim();
  const keys = connectorKeys(env);
  // Notion client ids are UUIDs; a pasted label must never open a dead flow.
  if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(clientId) || !clientSecret || !keys) return null;
  return { clientId, clientSecret, keys, scope: '' };
}

const basic = (cfg: TokenConnectorConfig) => `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;

export const notionSpec: TokenConnectorSpec = {
  id: 'notion',
  flag: 'CONNECTORS_NOTION',
  stateDomain: 'notion-oauth-state:v1',
  config: notionConfig,
  authorizeUrl(cfg, o) {
    // Notion's authorize endpoint has no PKCE: the signed, cookie-bound state carries the CSRF protection.
    const q = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', owner: 'user', redirect_uri: o.redirectUri, state: o.state });
    return `${API}/oauth/authorize?${q.toString()}`;
  },
  async exchange(cfg, o, f = fetch): Promise<TokenExchange> {
    let res: Response;
    try {
      res = await f(`${API}/oauth/token`, {
        method: 'POST',
        headers: { Authorization: basic(cfg), 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION },
        body: JSON.stringify({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri }),
      });
    } catch {
      return { ok: false, reason: 'failed' };
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body) return { ok: false, reason: body?.error === 'invalid_grant' ? 'denied' : 'failed' };
    if (typeof body.access_token !== 'string' || !body.access_token) return { ok: false, reason: 'failed' };
    const ws = typeof body.workspace_name === 'string' ? body.workspace_name.slice(0, 200) : null;
    return { ok: true, accessToken: body.access_token, scope: '', account: ws };
  },
  async revoke(cfg, token, f = fetch) {
    try {
      const res = await f(`${API}/oauth/revoke`, {
        method: 'POST',
        headers: { Authorization: basic(cfg), 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION },
        body: JSON.stringify({ token }),
      });
      return res.ok || res.status === 400 || res.status === 401;
    } catch {
      return false;
    }
  },
};

type Fetch = typeof fetch;

async function call<T>(token: string, path: string, init: { method?: string; body?: unknown }, f: Fetch): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await f(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (res.status === 401) return { ok: false, reason: 'not_connected' };
  if (res.status === 403) return { ok: false, reason: 'forbidden' };
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  if (res.status === 400) return { ok: false, reason: 'bad_input' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  const data = (await res.json().catch(() => null)) as T | null;
  return data === null ? { ok: false, reason: 'failed' } : { ok: true, data };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const plain = (rich: any): string => (Array.isArray(rich) ? rich.map((r) => (typeof r?.plain_text === 'string' ? r.plain_text : '')).join('') : '');

/** A page's title from its properties (the one property of type title), or "Untitled". */
export function pageTitle(page: any): string {
  const props = page?.properties && typeof page.properties === 'object' ? Object.values(page.properties) : [];
  const t = (props as any[]).find((p) => p?.type === 'title');
  return plain(t?.title).trim() || 'Untitled';
}

export interface NotionHit { id: string; title: string; url: string | null; editedAt: string | null }

export async function notionSearch(token: string, query: string, f: Fetch = fetch): Promise<ApiResult<NotionHit[]>> {
  const r = await call<{ results?: any[] }>(token, '/search', {
    method: 'POST',
    body: { query: query.slice(0, 200), page_size: 10, filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' } },
  }, f);
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.results ?? []).filter((p) => p?.object === 'page' && typeof p.id === 'string').map((p) => ({
      id: p.id, title: pageTitle(p), url: typeof p.url === 'string' ? p.url : null, editedAt: typeof p.last_edited_time === 'string' ? p.last_edited_time : null,
    })),
  };
}

/** One block as a line of text (headings, paragraphs, lists, to-dos, quotes, code); other block types are skipped. */
export function blockLine(b: any): string | null {
  const t = b?.type;
  const v = t ? b[t] : null;
  if (!v) return null;
  const text = plain(v.rich_text);
  switch (t) {
    case 'heading_1': return `# ${text}`;
    case 'heading_2': return `## ${text}`;
    case 'heading_3': return `### ${text}`;
    case 'bulleted_list_item': return `- ${text}`;
    case 'numbered_list_item': return `1. ${text}`;
    case 'to_do': return `- [${v.checked ? 'x' : ' '}] ${text}`;
    case 'quote': return `> ${text}`;
    case 'code': return '```\n' + text + '\n```';
    case 'paragraph': case 'callout': case 'toggle': return text;
    case 'child_page': return `[page] ${typeof v.title === 'string' ? v.title : ''}`;
    default: return null;
  }
}

/** The page's title and text (top-level blocks, up to 3 pages of 100; long pages are cut). */
export async function notionReadPage(token: string, pageId: string, f: Fetch = fetch): Promise<ApiResult<{ title: string; text: string; truncated: boolean; url: string | null }>> {
  const page = await call<any>(token, `/pages/${encodeURIComponent(pageId)}`, {}, f);
  if (!page.ok) return page;
  const lines: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 3; i++) {
    const q: string = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : '?page_size=100';
    const r: ApiResult<{ results?: any[]; has_more?: boolean; next_cursor?: string | null }> = await call(token, `/blocks/${encodeURIComponent(pageId)}/children${q}`, {}, f);
    if (!r.ok) return r;
    for (const b of r.data.results ?? []) { const l = blockLine(b); if (l !== null) lines.push(l); }
    if (!r.data.has_more || !r.data.next_cursor) break;
    cursor = r.data.next_cursor;
  }
  const full = lines.join('\n');
  return { ok: true, data: { title: pageTitle(page.data), text: full.slice(0, MAX_TEXT), truncated: full.length > MAX_TEXT, url: typeof page.data.url === 'string' ? page.data.url : null } };
}

/** Notion caps one rich_text item at 2000 characters and one request at 100 blocks. */
export function textToBlocks(text: string): any[] {
  const out: any[] = [];
  for (const raw of text.split(/\n{2,}|\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let type = 'paragraph';
    let body = line;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { type = `heading_${h[1]!.length}`; body = h[2]!; }
    else if (/^[-*]\s+/.test(line)) { type = 'bulleted_list_item'; body = line.replace(/^[-*]\s+/, ''); }
    for (let i = 0; i < body.length || i === 0; i += 2000) {
      out.push({ object: 'block', type, [type]: { rich_text: [{ type: 'text', text: { content: body.slice(i, i + 2000) } }] } });
      if (out.length >= 100) return out;
    }
  }
  return out;
}

/** Creates a page under a page the user shared with the integration. Only the user's own press calls this. */
export async function notionCreatePage(token: string, o: { parentId: string; title: string; text: string }, f: Fetch = fetch): Promise<ApiResult<{ id: string; url: string | null }>> {
  const r = await call<any>(token, '/pages', {
    method: 'POST',
    body: {
      parent: { page_id: o.parentId },
      properties: { title: { title: [{ type: 'text', text: { content: o.title.slice(0, 200) } }] } },
      children: textToBlocks(o.text),
    },
  }, f);
  if (!r.ok) return r;
  return typeof r.data?.id === 'string' ? { ok: true, data: { id: r.data.id, url: typeof r.data.url === 'string' ? r.data.url : null } } : { ok: false, reason: 'failed' };
}
