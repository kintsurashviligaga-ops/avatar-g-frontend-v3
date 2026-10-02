/** @jest-environment node */
/**
 * whatsapp-link — the number ↔ account binding, against an in-memory stand-in for the three tables.
 * Pinned: a code is single-use and expires; linking moves a number off any other account and replaces the account's
 * previous number; a missing table is 'unavailable' (never a throw); history is this number's turns only, oldest first.
 */
import {
  appendTurn,
  consumeConnectCode,
  createConnectCode,
  findLinkByNumber,
  findLinkByUser,
  isMissingTable,
  patchLinkMeta,
  recentTurns,
  unlink,
} from './whatsapp-link';

type Row = Record<string, unknown>;

/** Just enough of PostgREST's builder for this module: eq/gt/gte filters, order, limit, maybeSingle, select-after-write. */
function fakeDb(tables: Record<string, Row[]>, missing: string[] = []) {
  let seq = 0;
  return {
    tables,
    from(name: string) {
      const rows = (tables[name] ??= []);
      const filters: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'delete' | 'update' | 'insert' = 'select';
      let patch: Row = {};
      let order: { col: string; asc: boolean } | null = null;
      let limit = Infinity;
      let returning = false;
      const err = missing.includes(name) ? { code: 'PGRST205', message: `Could not find the table 'public.${name}'` } : null;
      const run = (single: boolean) => {
        if (err) return { data: null, error: err };
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'delete') {
          for (const r of hit) rows.splice(rows.indexOf(r), 1);
          return { data: returning ? hit : null, error: null };
        }
        if (op === 'update') {
          for (const r of hit) Object.assign(r, patch);
          return { data: returning ? hit : null, error: null };
        }
        let out = [...hit];
        if (order) out.sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
        out = out.slice(0, limit);
        return { data: single ? out[0] ?? null : out, error: null };
      };
      const b = {
        select() { if (op !== 'select') returning = true; return b; },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
        gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return b; },
        gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return b; },
        order(c: string, o: { ascending: boolean }) { order = { col: c, asc: o.ascending }; return b; },
        limit(n: number) { limit = n; return b; },
        delete() { op = 'delete'; return b; },
        update(p: Row) { op = 'update'; patch = p; return b; },
        insert(r: Row) {
          if (err) return Promise.resolve({ data: null, error: err });
          rows.push({ id: `id-${(seq += 1)}`, created_at: new Date(Date.now() + seq).toISOString(), ...r });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: () => Promise.resolve(run(true)),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run(false)).then(res, rej),
      };
      return b;
    },
  };
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const N1 = '995555000111';
const asClient = (db: ReturnType<typeof fakeDb>) => db as never;

test('isMissingTable knows both of PostgREST’s answers', () => {
  expect(isMissingTable({ code: '42P01' })).toBe(true);
  expect(isMissingTable({ code: 'PGRST205' })).toBe(true);
  expect(isMissingTable({ message: 'relation "x" does not exist' })).toBe(true);
  expect(isMissingTable({ code: '23505' })).toBe(false);
  expect(isMissingTable(null)).toBe(false);
});

describe('codes and linking', () => {
  test('a code links the sender to the code’s owner exactly once', async () => {
    const db = fakeDb({});
    const minted = await createConnectCode(asClient(db), U1);
    if (minted === 'unavailable') throw new Error('unexpected');
    expect(minted.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(db.tables.agent_g_connect_codes[0]).toMatchObject({ user_id: U1, channel: 'whatsapp' });

    expect(await consumeConnectCode(asClient(db), minted.code, N1, { locale: 'ka', profile_name: 'Nino' })).toEqual({ userId: U1 });
    expect(await consumeConnectCode(asClient(db), minted.code, N1, { locale: 'ka' })).toBe('not_found');

    const link = await findLinkByNumber(asClient(db), N1);
    expect(link.state).toBe('linked');
    if (link.state !== 'linked') return;
    expect(link.link).toMatchObject({ userId: U1, waId: N1, meta: { alerts: true, locale: 'ka', profile_name: 'Nino' } });
    expect(link.link.meta.last_inbound_at).toEqual(link.link.meta.linked_at);
  });

  test('a new code replaces the user’s older WhatsApp code (and leaves a Telegram code alone)', async () => {
    const db = fakeDb({ agent_g_connect_codes: [{ id: 't', user_id: U1, code: 'TELEGRAM', channel: 'telegram', expires_at: '2999-01-01' }] });
    await createConnectCode(asClient(db), U1);
    await createConnectCode(asClient(db), U1);
    expect(db.tables.agent_g_connect_codes.filter((r) => r.channel === 'whatsapp')).toHaveLength(1);
    expect(db.tables.agent_g_connect_codes.some((r) => r.code === 'TELEGRAM')).toBe(true);
  });

  test('an expired code, or a Telegram code, does not link', async () => {
    const db = fakeDb({
      agent_g_connect_codes: [
        { id: 'a', user_id: U1, code: 'OLDCODE2', channel: 'whatsapp', expires_at: '2000-01-01T00:00:00Z' },
        { id: 'b', user_id: U1, code: 'TGCODE23', channel: 'telegram', expires_at: '2999-01-01T00:00:00Z' },
      ],
    });
    expect(await consumeConnectCode(asClient(db), 'OLDCODE2', N1, {})).toBe('not_found');
    expect(await consumeConnectCode(asClient(db), 'TGCODE23', N1, {})).toBe('not_found');
    expect(db.tables.agent_g_channels ?? []).toHaveLength(0);
  });

  test('the number leaves any other account, and the account’s previous number is replaced', async () => {
    const db = fakeDb({
      agent_g_channels: [
        { id: 'old-owner', user_id: U2, type: 'whatsapp', status: 'connected', external_id: N1, meta: {} },
        { id: 'old-number', user_id: U1, type: 'whatsapp', status: 'connected', external_id: '995599999999', meta: {} },
        { id: 'tg', user_id: U1, type: 'telegram', status: 'connected', external_id: '42', meta: {} },
      ],
      agent_g_connect_codes: [{ id: 'c', user_id: U1, code: 'ABCD2345', channel: 'whatsapp', expires_at: '2999-01-01T00:00:00Z' }],
    });
    expect(await consumeConnectCode(asClient(db), 'ABCD2345', N1, {})).toEqual({ userId: U1 });
    const ws = db.tables.agent_g_channels.filter((r) => r.type === 'whatsapp');
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ user_id: U1, external_id: N1 });
    expect(db.tables.agent_g_channels.some((r) => r.id === 'tg')).toBe(true);
  });

  test('missing tables → unavailable, never a throw', async () => {
    const db = fakeDb({}, ['agent_g_channels', 'agent_g_connect_codes', 'agent_g_channel_events']);
    expect(await findLinkByNumber(asClient(db), N1)).toEqual({ state: 'unavailable' });
    expect(await findLinkByUser(asClient(db), U1)).toEqual({ state: 'unavailable' });
    expect(await createConnectCode(asClient(db), U1)).toBe('unavailable');
    expect(await consumeConnectCode(asClient(db), 'ABCD2345', N1, {})).toBe('unavailable');
  });
});

describe('meta, unlink and history', () => {
  const linked = () => fakeDb({
    agent_g_channels: [{ id: 'L', user_id: U1, type: 'whatsapp', status: 'connected', external_id: N1, meta: { alerts: true, locale: 'ka' } }],
  });

  test('patchLinkMeta merges; unlink removes the row', async () => {
    const db = linked();
    const found = await findLinkByUser(asClient(db), U1);
    if (found.state !== 'linked') throw new Error('unexpected');
    await patchLinkMeta(asClient(db), found.link, { alerts: false });
    expect(db.tables.agent_g_channels[0].meta).toEqual({ alerts: false, locale: 'ka' });
    expect(await unlink(asClient(db), 'L')).toBe(true);
    expect(await findLinkByUser(asClient(db), U1)).toEqual({ state: 'unlinked' });
  });

  test('history: this number’s turns only, oldest first, text bounded', async () => {
    const db = linked();
    const found = await findLinkByNumber(asClient(db), N1);
    if (found.state !== 'linked') throw new Error('unexpected');
    await appendTurn(asClient(db), found.link, 'user', 'first');
    await appendTurn(asClient(db), found.link, 'assistant', 'x'.repeat(5000));
    await appendTurn(asClient(db), { ...found.link, waId: '995500000000' }, 'user', 'another number');
    const turns = await recentTurns(asClient(db), found.link);
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(turns[0].content).toBe('first');
    expect(turns[1].content).toHaveLength(2000);
  });
});
