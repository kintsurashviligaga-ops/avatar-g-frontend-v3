/**
 * lib/connectors/github — the GitHub plugin (Agent G): see the user's repositories, issues, pull requests and files,
 * analyse them, and PREPARE an issue the user files themselves.
 *
 * READ ONLY ON OUR SIDE: every call here is a GET. "Prepare an issue" builds github.com's own new-issue link with the
 * title and body filled in; the user opens it and presses Submit on GitHub. Nothing is written with the token.
 * Scope: GITHUB_CONNECTOR_SCOPE, default `read:user` (public repositories and the profile). Private repositories need
 * `repo`, which GitHub grants read AND write; GG decides that (the code still only reads).
 *
 * ⚠️ CLOSED UNLESS: CONNECTORS_GITHUB opens it (admin|all; empty = off), GITHUB_OAUTH_CLIENT_ID + GITHUB_OAUTH_CLIENT_SECRET
 * (a GitHub OAuth App GG registers, callback /api/connectors/github/callback), a valid CONNECTOR_TOKEN_KEY, and migration
 * 20261120a. Until then the plugin says "needs setup".
 */
import { connectorKeys } from '@/lib/connectors/google/crypto';
import type { ApiResult, TokenConnectorConfig, TokenConnectorSpec, TokenExchange } from '@/lib/connectors/oauth/types';

const API = 'https://api.github.com';
const MAX_FILE_CHARS = 60_000;
const ALLOWED_SCOPES = new Set(['read:user', 'public_repo', 'repo']);

export function githubConfig(env: NodeJS.ProcessEnv = process.env): TokenConnectorConfig | null {
  const clientId = (env.GITHUB_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = (env.GITHUB_OAUTH_CLIENT_SECRET ?? '').trim();
  const keys = connectorKeys(env);
  // OAuth App ids are `Ov23…` (new) or 20 hex characters (old).
  if (!/^(Ov23[A-Za-z0-9]{16}|[0-9a-f]{20})$/.test(clientId) || !clientSecret || !keys) return null;
  const asked = (env.GITHUB_CONNECTOR_SCOPE ?? 'read:user').split(/[\s,]+/).filter(Boolean);
  if (asked.length === 0 || asked.some((s) => !ALLOWED_SCOPES.has(s))) return null;
  return { clientId, clientSecret, keys, scope: Array.from(new Set(['read:user', ...asked])).join(' ') };
}

export const githubSpec: TokenConnectorSpec = {
  id: 'github',
  flag: 'CONNECTORS_GITHUB',
  stateDomain: 'github-oauth-state:v1',
  config: githubConfig,
  authorizeUrl(cfg, o) {
    const q = new URLSearchParams({
      client_id: cfg.clientId, redirect_uri: o.redirectUri, scope: cfg.scope, state: o.state,
      code_challenge: o.challenge, code_challenge_method: 'S256', allow_signup: 'false',
    });
    return `https://github.com/login/oauth/authorize?${q.toString()}`;
  },
  async exchange(cfg, o, f = fetch): Promise<TokenExchange> {
    let res: Response;
    try {
      res = await f('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier }),
      });
    } catch {
      return { ok: false, reason: 'failed' };
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    // GitHub answers 200 with {error} for a bad code.
    if (!res.ok || !body || typeof body.error === 'string') return { ok: false, reason: body?.error === 'bad_verification_code' || body?.error === 'access_denied' ? 'denied' : 'failed' };
    if (typeof body.access_token !== 'string' || !body.access_token) return { ok: false, reason: 'failed' };
    const scope = typeof body.scope === 'string' ? body.scope.replace(/,/g, ' ') : '';
    if (!scope.split(' ').includes('read:user')) return { ok: false, reason: 'scope_missing' };
    const login = await githubLogin(body.access_token, f);
    return { ok: true, accessToken: body.access_token, scope, account: login };
  },
  async revoke(cfg, token, f = fetch) {
    try {
      const res = await f(`${API}/applications/${encodeURIComponent(cfg.clientId)}/grant`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
          Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ access_token: token }),
      });
      return res.status === 204 || res.status === 404 || res.status === 422;
    } catch {
      return false;
    }
  },
};

type Fetch = typeof fetch;

async function get<T>(token: string, path: string, f: Fetch, accept = 'application/vnd.github+json'): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await f(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MyAvatar-AgentG' } });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (res.status === 401) return { ok: false, reason: 'not_connected' };
  if (res.status === 403 || res.status === 429) return { ok: false, reason: res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429 ? 'rate_limited' : 'forbidden' };
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  const data = (accept.endsWith('.raw') ? await res.text().catch(() => null) : await res.json().catch(() => null)) as T | null;
  return data === null ? { ok: false, reason: 'failed' } : { ok: true, data };
}

async function githubLogin(token: string, f: Fetch): Promise<string | null> {
  const r = await get<{ login?: unknown }>(token, '/user', f);
  return r.ok && typeof r.data.login === 'string' ? r.data.login.slice(0, 100) : null;
}

/** owner/repo as GitHub allows them; anything else is refused before a request is made. */
export const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const path = (repo: string) => repo.split('/').map(encodeURIComponent).join('/');

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RepoRow { fullName: string; private: boolean; description: string | null; defaultBranch: string; openIssues: number; pushedAt: string | null }

export async function githubListRepos(token: string, f: Fetch = fetch): Promise<ApiResult<RepoRow[]>> {
  const r = await get<any[]>(token, '/user/repos?per_page=30&sort=pushed&affiliation=owner,collaborator,organization_member', f);
  if (!r.ok) return r;
  return { ok: true, data: (Array.isArray(r.data) ? r.data : []).map((x) => ({
    fullName: String(x.full_name), private: !!x.private, description: typeof x.description === 'string' ? x.description.slice(0, 300) : null,
    defaultBranch: String(x.default_branch ?? 'main'), openIssues: Number(x.open_issues_count ?? 0), pushedAt: typeof x.pushed_at === 'string' ? x.pushed_at : null,
  })) };
}

export interface IssueRow { number: number; title: string; state: string; kind: 'issue' | 'pr'; author: string | null; labels: string[]; updatedAt: string | null; url: string; body: string }

export async function githubListIssues(token: string, o: { repo: string; kind: 'issue' | 'pr' | 'all'; state: 'open' | 'closed' | 'all' }, f: Fetch = fetch): Promise<ApiResult<IssueRow[]>> {
  if (!REPO_RE.test(o.repo)) return { ok: false, reason: 'bad_input' };
  // The issues endpoint returns pull requests too (with a pull_request key): one call covers both kinds.
  const r = await get<any[]>(token, `/repos/${path(o.repo)}/issues?per_page=30&state=${o.state}&sort=updated`, f);
  if (!r.ok) return r;
  const rows: IssueRow[] = (Array.isArray(r.data) ? r.data : []).map((x) => ({
    number: Number(x.number), title: String(x.title ?? '').slice(0, 300), state: String(x.state ?? ''), kind: x.pull_request ? 'pr' : 'issue',
    author: typeof x.user?.login === 'string' ? x.user.login : null, labels: Array.isArray(x.labels) ? x.labels.map((l: any) => String(l?.name ?? '')).filter(Boolean) : [],
    updatedAt: typeof x.updated_at === 'string' ? x.updated_at : null, url: String(x.html_url ?? ''), body: typeof x.body === 'string' ? x.body.slice(0, 1500) : '',
  }));
  return { ok: true, data: o.kind === 'all' ? rows : rows.filter((x) => x.kind === o.kind) };
}

export async function githubReadFile(token: string, o: { repo: string; path: string; ref?: string }, f: Fetch = fetch): Promise<ApiResult<{ path: string; text: string; truncated: boolean }>> {
  if (!REPO_RE.test(o.repo) || !/^[^\0]{1,400}$/.test(o.path) || o.path.split('/').includes('..') || (o.ref && !/^[A-Za-z0-9._/-]{1,200}$/.test(o.ref))) return { ok: false, reason: 'bad_input' };
  const p = o.path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  const r = await get<string>(token, `/repos/${path(o.repo)}/contents/${p}${o.ref ? `?ref=${encodeURIComponent(o.ref)}` : ''}`, f, 'application/vnd.github.raw');
  if (!r.ok) return r;
  if (/\0/.test(r.data.slice(0, 2000))) return { ok: false, reason: 'bad_input' };
  return { ok: true, data: { path: o.path, text: r.data.slice(0, MAX_FILE_CHARS), truncated: r.data.length > MAX_FILE_CHARS } };
}

/**
 * The new-issue page on github.com with the title and body filled in. Opening it files nothing: the user reviews and
 * presses Submit on GitHub. GitHub truncates very long URLs, so the body is capped at 6000 characters.
 */
export function prepareIssueLink(o: { repo: string; title: string; body: string; labels?: string[] }): string | null {
  if (!REPO_RE.test(o.repo)) return null;
  const q = new URLSearchParams({ title: o.title.slice(0, 250), body: o.body.slice(0, 6000) });
  if (o.labels?.length) q.set('labels', o.labels.slice(0, 5).join(','));
  return `https://github.com/${path(o.repo)}/issues/new?${q.toString()}`;
}
