/**
 * lib/agent/mcp/client.ts — a SAFE MCP client foundation (GG's audit ACTION 3; v2.0 policy: "no open-ended
 * call_mcp_tool").
 *
 * Agent G never gets "call any tool on any server". It gets the tools of servers listed in an ALLOWLIST written in code
 * (MCP_SERVERS, a reviewed diff), each tool with its own input schema and a read-only effect:
 *
 *   - a server is an https URL on a public host (lib/agent/browser/policy isPublicHost), no user:pass, no redirects;
 *   - its bearer token, if any, is read from a NAMED server env var when the call is made, never passed through a model,
 *     never logged, never returned;
 *   - only allowlisted tool names are called, and their arguments are parsed by the tool's own zod schema first;
 *   - every call has a timeout and a response size cap; the answer comes back as UNTRUSTED TEXT (data, never
 *     instructions) cut to the tool's limit;
 *   - a tool the server lists but the allowlist does not is reported as `ignored`, never offered.
 *
 * Speaks MCP's Streamable HTTP transport: JSON-RPC 2.0 over POST, answered as JSON or as one SSE `message` event;
 * `initialize` first, then `notifications/initialized`, the Mcp-Session-Id header carried on every later call.
 *
 * MCP_SERVERS is EMPTY: this is the foundation. Turning a server on is a new entry here plus GG's OK.
 */
import { z } from 'zod';
import { isPublicHost } from '@/lib/agent/browser/policy';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_TIMEOUT_MS = 15_000;
export const MCP_MAX_RESPONSE_BYTES = 256 * 1024;

export interface McpToolSpec {
  /** What the tool is for, for Agent G's tool list. */
  description: string;
  input: z.ZodTypeAny;
  /** Only read tools are allowed through this client. */
  effect: 'read';
  /** The answer is cut to this many characters. */
  maxChars: number;
}

export interface McpServerSpec {
  id: string;
  url: string;
  /** The NAME of the env var holding the bearer token (never the token). */
  tokenEnv?: string;
  tools: Readonly<Record<string, McpToolSpec>>;
}

/** The allowlist. Empty until GG approves a server; each entry is a reviewed diff. */
export const MCP_SERVERS: readonly McpServerSpec[] = [];

export type McpError = 'not_allowed' | 'bad_input' | 'bad_server' | 'no_token' | 'timeout' | 'too_large' | 'protocol' | 'http' | 'tool_error';
export type McpResult<T> = ({ ok: true } & T) | { ok: false; error: McpError; message: string };

export interface McpDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

const ID = /^[a-z][a-z0-9_-]{1,40}$/;
const TOOL = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** A server spec that may be used: checked once, where it is written (and in its test). */
export function checkServerSpec(s: McpServerSpec): string | null {
  if (!ID.test(s.id)) return `server id "${s.id}"`;
  let u: URL;
  try { u = new URL(s.url); } catch { return `${s.id}: url`; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !isPublicHost(u.hostname)) {
    return `${s.id}: only an https URL on a public host`;
  }
  if (s.tokenEnv !== undefined && !/^[A-Z][A-Z0-9_]{2,60}$/.test(s.tokenEnv)) return `${s.id}: tokenEnv must be an env var name`;
  for (const [name, t] of Object.entries(s.tools)) {
    if (!TOOL.test(name)) return `${s.id}: tool name "${name}"`;
    if (t.effect !== 'read') return `${s.id}.${name}: only read tools`;
    if (!(Number.isInteger(t.maxChars) && t.maxChars > 0 && t.maxChars <= 100_000)) return `${s.id}.${name}: maxChars`;
  }
  return null;
}

const fail = (error: McpError, message: string) => ({ ok: false as const, error, message });

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MCP_MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The JSON-RPC message in a body: plain JSON, or the data of the SSE event that answers `id`. */
export function rpcMessageOf(body: string, contentType: string, id: number): Record<string, unknown> | null {
  const parse = (s: string) => { try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; } };
  if (!contentType.includes('text/event-stream')) return parse(body);
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    const m = data ? parse(data) : null;
    if (m && m.id === id) return m;
  }
  return null;
}

/** Text of a tools/call result: its text parts joined; any other part is named, not passed on. */
export function textOfResult(result: unknown, maxChars: number): { text: string; isError: boolean } {
  const r = (result ?? {}) as { content?: unknown; isError?: unknown };
  const parts = Array.isArray(r.content) ? r.content : [];
  const text = parts.map((p) => {
    const c = (p ?? {}) as { type?: unknown; text?: unknown };
    return c.type === 'text' && typeof c.text === 'string' ? c.text : `[${typeof c.type === 'string' ? c.type : 'part'} not shown]`;
  }).join('\n');
  return { text: text.length > maxChars ? `${text.slice(0, maxChars)}\n…[cut]` : text, isError: r.isError === true };
}

export interface McpClient {
  /** The allowlisted tools this server really has; anything else it lists is `ignored`. */
  listTools(): Promise<McpResult<{ tools: string[]; ignored: string[] }>>;
  callTool(name: string, args: unknown): Promise<McpResult<{ text: string; untrusted: true }>>;
}

export function mcpClient(spec: McpServerSpec, deps: McpDeps): McpClient {
  const bad = checkServerSpec(spec);
  let session: string | null = null;
  let initialized = false;
  let seq = 0;

  async function post(payload: Record<string, unknown>, expectAnswer: boolean): Promise<McpResult<{ message: Record<string, unknown> | null }>> {
    if (bad) return fail('bad_server', bad);
    let token: string | undefined;
    if (spec.tokenEnv) {
      token = deps.env[spec.tokenEnv];
      if (!token) return fail('no_token', `${spec.id} is not configured on this server.`);
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (session) headers['mcp-session-id'] = session;
    let res: Response;
    try {
      res = await deps.fetch(spec.url, {
        method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return name === 'TimeoutError' || name === 'AbortError' ? fail('timeout', `${spec.id} did not answer in time.`) : fail('http', `${spec.id} could not be reached.`);
    }
    if (!res.ok) return fail('http', `${spec.id} answered ${res.status}.`);
    const sid = res.headers.get('mcp-session-id');
    if (sid && /^[\x21-\x7e]{1,200}$/.test(sid)) session = sid;
    if (!expectAnswer) return { ok: true, message: null };
    const body = await readCapped(res).catch(() => null);
    if (body === null) return fail('too_large', `${spec.id} answered with too much.`);
    const msg = rpcMessageOf(body, res.headers.get('content-type') ?? '', payload.id as number);
    if (!msg) return fail('protocol', `${spec.id} gave no answer to the request.`);
    if (msg.error) return fail('tool_error', `${spec.id}: ${String((msg.error as { message?: unknown }).message ?? 'error').slice(0, 200)}`);
    return { ok: true, message: msg };
  }

  async function init(): Promise<McpResult<object>> {
    if (initialized) return { ok: true };
    const r = await post({
      jsonrpc: '2.0', id: ++seq, method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'myavatar-agent-g', version: '1.0' } },
    }, true);
    if (!r.ok) return r;
    const n = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
    if (!n.ok) return n;
    initialized = true;
    return { ok: true };
  }

  return {
    async listTools() {
      const i = await init();
      if (!i.ok) return i;
      const r = await post({ jsonrpc: '2.0', id: ++seq, method: 'tools/list', params: {} }, true);
      if (!r.ok) return r;
      const listed = ((r.message?.result as { tools?: unknown } | undefined)?.tools);
      const names = Array.isArray(listed) ? listed.map((t) => (t as { name?: unknown })?.name).filter((n): n is string => typeof n === 'string') : [];
      return { ok: true, tools: names.filter((n) => n in spec.tools), ignored: names.filter((n) => !(n in spec.tools)) };
    },
    async callTool(name, args) {
      const tool = Object.prototype.hasOwnProperty.call(spec.tools, name) ? spec.tools[name] : undefined;
      if (!tool) return fail('not_allowed', `${spec.id}.${name} is not an allowed tool.`);
      const parsed = tool.input.safeParse(args);
      if (!parsed.success) return fail('bad_input', `${spec.id}.${name}: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
      const i = await init();
      if (!i.ok) return i;
      const r = await post({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: parsed.data } }, true);
      if (!r.ok) return r;
      const { text, isError } = textOfResult(r.message?.result, tool.maxChars);
      if (isError) return fail('tool_error', `${spec.id}.${name}: ${text.slice(0, 300)}`);
      return { ok: true, text, untrusted: true };
    },
  };
}

/** The allowlisted server by id, or null. Never a server the list does not name. */
export function allowedServer(id: string, servers: readonly McpServerSpec[] = MCP_SERVERS): McpServerSpec | null {
  return servers.find((s) => s.id === id) ?? null;
}
