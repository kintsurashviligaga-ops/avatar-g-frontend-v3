/** @jest-environment node */
/**
 * Isolated integration: real MCP transport, approval route and Music Studio
 * engine; real temporary PostgreSQL for approvals and a synthetic ledger.
 * OAuth/session, lease storage, provider and Supabase's JS transport are fakes.
 * Run via scripts/test-mcp-audio-integration.py; never uses production data.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest } from 'next/server';
import { POST as mcp } from '../../../app/api/mcp/gemini/route';
import { GET as consentGet, POST as consentPost } from '../../../app/api/mcp/consent/route';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { musicCapabilities } from '../../music/studio/capabilities';
import type { MusicDeps } from '../../music/studio/engine';

jest.mock('server-only', () => ({}));
jest.mock('./works', () => ({ readRecentWorks: jest.fn() }));
jest.mock('./auth', () => ({
  mcpOAuthConfig: () => ({ resource: 'https://myavatar.ge/api/mcp/gemini' }),
  authenticateMcp: async (req: Request) => req.headers.get('authorization') === 'Bearer synthetic-test-token' ?
    { userId: mockUserId, clientId: 'synthetic-client', scopes: ['mcp:read', 'mcp:write'], token: 'synthetic-test-token' } : null,
}));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: async () => null, RATE_LIMITS: { READ: {}, CHAT_USER: {} } }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => mockDb(), createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mockSessionUser ? { id: mockSessionUser } : null }, error: null }) } }) }));
jest.mock('../../music/studio/live', () => ({ liveMusicDeps: () => mockMusicDeps }));
jest.mock('../../music/studio/capabilities', () => ({
  ...jest.requireActual('../../music/studio/capabilities'),
  musicStudioEnabled: () => true,
}));
jest.mock('../../server/serviceSwitches', () => ({ serviceOffResponse: async () => null }));
jest.mock('../../env/previewIsolation', () => ({ paidWritesBlockedOnPreview: () => false }));
jest.mock('../../platform/afterResponse', () => ({ runAfterResponse: (work: () => Promise<unknown>) => { mockWorkers.push(work()); return true; } }));
jest.mock('../../agent/media/montageLive', () => ({ newWorkerId: () => 'synthetic-worker' }));
jest.mock('../../agent/react/bindLiveAgent', () => ({ runLiveAgent: jest.fn() }));

const exec = promisify(execFile);
const mockUserId = '00000000-0000-4000-8000-000000000001';
const mockOtherId = '00000000-0000-4000-8000-000000000002';
let mockSessionUser: string | null = mockUserId;
let mockMusicDeps: MusicDeps;
const mockWorkers: Promise<unknown>[] = [];
const socket = process.env.MCP_TEST_PGSOCKET ?? '';
const integration = socket ? test : test.skip;
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function mockSql(statement: string): Promise<string> {
  if (!/^\/(?:private\/)?tmp\/mcp-int-[A-Za-z0-9_-]+$/.test(socket)) throw new Error('Refusing non-test database socket');
  const result = await exec('psql', ['-X', '-qAt', '-h', socket, '-p', '55497', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', statement]);
  return result.stdout.trim();
}

function mockDb() {
  return { from: (table: string) => {
    if (table !== 'mcp_generation_approvals') throw new Error('Unexpected table');
    const where: string[] = [];
    let update: Record<string, unknown> | null = null;
    const sqlValue = (v: unknown) => v === null ? 'NULL' : typeof v === 'object' ? `${quote(JSON.stringify(v))}::jsonb` : quote(String(v));
    const column = (value: string) => { if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid column'); return value; };
    const query = {
      insert: async (row: Record<string, unknown>) => {
        const keys = Object.keys(row).map(column);
        await mockSql(`insert into public.mcp_generation_approvals (${keys.join(',')}) values (${keys.map((k) => sqlValue(row[k])).join(',')})`);
        return { error: null };
      },
      update: (value: Record<string, unknown>) => { update = value; return query; },
      select: (_fields: string) => query,
      eq: (field: string, value: unknown) => { where.push(`${column(field)}=${sqlValue(value)}`); return query; },
      gt: (field: string, value: unknown) => { where.push(`${column(field)}>${sqlValue(value)}`); return query; },
      maybeSingle: async () => {
        const clause = where.length ? `where ${where.join(' and ')}` : '';
        const operation = update ? `update public.mcp_generation_approvals set ${Object.entries(update).map(([k, v]) => `${column(k)}=${sqlValue(v)}`).join(',')} ${clause} returning *` : `select * from public.mcp_generation_approvals ${clause}`;
        const out = await mockSql(`with selected as (${operation}) select row_to_json(selected) from selected`);
        return { data: out ? JSON.parse(out) : null, error: null };
      },
    };
    return query;
  } };
}

function rpc(id: number, args: Record<string, unknown>, token = 'synthetic-test-token'): Request {
  return new Request('https://myavatar.ge/api/mcp/gemini', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'create_generation_task', arguments: args } }) });
}
async function result(res: Response) {
  const payload = await res.json();
  return { value: JSON.parse(payload.result.content[0].text), isError: payload.result.isError };
}

integration('MCP audio: user approval, reservation and fake worker are isolated and one-use', async () => {
  process.env.MCP_GEMINI_ENABLED = 'true';
  process.env.MCP_AUDIO_GENERATION_ENABLED = 'true';
  const env = { MUSIC_STUDIO_ENABLED: '1', GCP_PROJECT_ID: 'synthetic-project', GCP_PROJECT_NUMBER: '123456789012', GCP_SERVICE_ACCOUNT_EMAIL: 'synthetic@example.invalid', GCP_WORKLOAD_IDENTITY_POOL_ID: 'test', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'test' } as NodeJS.ProcessEnv;
  const store = memoryLeaseStore();
  let next = 10;
  let providerCalls = 0;
  mockMusicDeps = {
    store, caps: () => musicCapabilities(env), key: () => 'synthetic-quote-key', now: () => Date.now(),
    newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
    checkParent: async () => false, withinBudget: async () => true,
    reserve: async (user, credits, ref) => ({ charged: (await mockSql(`select public.mcp_test_reserve(${quote(user)}::uuid, ${credits}, ${quote(ref)})`)) === 't', reason: 'ok' }),
    refund: async () => 'nothing',
    generate: async () => { providerCalls++; return { bytes: Buffer.from('synthetic'), mime: 'audio/mpeg', providerRequestId: null, caption: null }; },
    save: async (id) => ({ bucket: 'renders', path: `synthetic/${id}`, url: 'https://example.invalid/test.mp3', mime: 'audio/mpeg', bytes: 1000, digest: 'test', qc: { durationSec: 30.8, codec: 'mp3', sampleRate: 44100, channels: 2, maxVolumeDb: -1, meanVolumeDb: -14 } }),
    resign: async (track) => track, every: () => () => undefined, audit: async () => undefined, maxLivePerUser: 2,
  };

  try {
    expect((await mcp(rpc(1, { kind: 'audio', script: 'Safe synthetic test' }, 'invalid'))).status).toBe(401);
    const args = { kind: 'audio', script: 'Safe synthetic test' };
    const initial = await result(await mcp(rpc(2, { ...args, confirmed: true })));
    expect(initial.value.status).toBe('approval_required');
    const approvalId = initial.value.approvalId as string;
    expect(await mockSql(`select credits from public.mcp_test_balances where user_id=${quote(mockUserId)}::uuid`)).toBe('100');
    expect((await result(await mcp(rpc(3, { ...args, approvalId })))).value.error).toBe('approval_invalid');
    mockSessionUser = mockOtherId;
    expect((await consentGet(new NextRequest(`https://myavatar.ge/api/mcp/consent?id=${approvalId}`))).status).toBe(404);
    mockSessionUser = mockUserId;
    const consentPage = await consentGet(new NextRequest(`https://myavatar.ge/api/mcp/consent?id=${approvalId}`));
    expect(await consentPage.text()).toContain('Safe synthetic test');
    const form = () => new URLSearchParams({ id: approvalId, decision: 'approve' });
    expect((await consentPost(new NextRequest('https://myavatar.ge/api/mcp/consent', { method: 'POST', headers: { origin: 'https://evil.example' }, body: form() }))).status).toBe(403);
    expect((await consentPost(new NextRequest('https://myavatar.ge/api/mcp/consent', { method: 'POST', headers: { origin: 'https://myavatar.ge' }, body: form() }))).status).toBe(200);
    const attempts = await Promise.all([mcp(rpc(4, { ...args, approvalId })), mcp(rpc(5, { ...args, approvalId }))]);
    const values = await Promise.all(attempts.map(result));
    expect(values.filter((v) => v.value.status === 'queued')).toHaveLength(1);
    expect(values.filter((v) => v.value.error === 'approval_invalid')).toHaveLength(1);
    await Promise.all(mockWorkers);
    expect(providerCalls).toBe(1);
    expect(await mockSql('select count(*) from public.mcp_test_ledger')).toBe('1');
    expect(await mockSql(`select credits from public.mcp_test_balances where user_id=${quote(mockUserId)}::uuid`)).toBe('97');
    const queued = values.find((v) => v.value.status === 'queued')!;
    expect(store.rows.get(queued.value.jobId)?.status).toBe('completed');
  } finally {
    delete process.env.MCP_GEMINI_ENABLED;
    delete process.env.MCP_AUDIO_GENERATION_ENABLED;
    mockSessionUser = mockUserId;
  }
});
