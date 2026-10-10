/** @jest-environment node */
import { deliverResult, DELIVERY_LINK_TTL_SEC, WA_MEDIA_MAX_BYTES, type DeliveryDeps } from './delivery';
import type { TaskView } from '@/lib/tasks/taskView';

const ok = { ok: true, status: 200, errorCode: null, messageIds: ['wamid.1'] };
const task = (result: Partial<NonNullable<TaskView['result']>> | null): TaskView => ({
  id: 't', kind: 'agent-audio-extract', service: 'audio', status: result ? 'succeeded' : 'running', stage: null, pct: null, attempt: 1,
  result: result ? ({ url: 'https://store.example/object/sign/job-artifacts/u1/a.mp3?token=x', media: 'audio', name: 'song.mp3', ...result } as TaskView['result']) : null,
  error: null, cancellable: false, label: 'MP3', position: null, createdAt: null, updatedAt: null,
});

function deps(o: Partial<DeliveryDeps> = {}) {
  const sent: Array<{ kind: string; to: string; body: unknown }> = [];
  const d: DeliveryDeps = {
    origin: 'https://myavatar.example',
    signOwn: async (_u, userId, ttl) => (userId === 'u1' && ttl === DELIVERY_LINK_TTL_SEC ? 'https://store.example/signed-15min' : null),
    sendMedia: async (to, m) => { sent.push({ kind: 'media', to, body: m }); return ok; },
    sendText: async (to, t) => { sent.push({ kind: 'text', to, body: t }); return ok; },
    ...o,
  };
  return { d, sent };
}

describe('WhatsApp result delivery', () => {
  it('sends the file itself through a 15-minute signed link of our own storage', async () => {
    const { d, sent } = deps();
    expect(await deliverResult(d, { to: '995555000111', userId: 'u1', task: task({ bytes: 4_000_000 }), lang: 'ka' })).toEqual({ sent: true, mode: 'media' });
    expect(sent).toEqual([{ kind: 'media', to: '995555000111', body: { kind: 'audio', link: 'https://store.example/signed-15min', caption: 'MP3', filename: 'song.mp3' } }]);
  });

  it('too big for WhatsApp, or not the caller\'s own file: a sign-in Library link instead (never a public link)', async () => {
    const big = deps();
    expect(await deliverResult(big.d, { to: '995', userId: 'u1', task: task({ media: 'video', bytes: WA_MEDIA_MAX_BYTES.video + 1 }), lang: 'en' })).toEqual({ sent: true, mode: 'link' });
    expect(big.sent[0]!.body).toBe('MP3 is ready. Open and download it in your Library (after signing in): https://myavatar.example/en/library');
    const other = deps();
    expect(await deliverResult(other.d, { to: '995', userId: 'u2', task: task({}), lang: 'ka' })).toEqual({ sent: true, mode: 'link' });
    expect(other.sent.map((s) => s.kind)).toEqual(['text']);
  });

  it('outside the 24 h window nothing can go: says so instead of pretending', async () => {
    const closed = { ok: false, status: 400, errorCode: 131047, messageIds: [] };
    const { d } = deps({ sendMedia: async () => closed, sendText: async () => closed });
    expect(await deliverResult(d, { to: '995', userId: 'u1', task: task({}), lang: 'ka' })).toEqual({ sent: false, mode: 'none', reason: 'outside_window' });
  });

  it('a media send error falls back to the link; unfinished tasks are refused; nothing throws', async () => {
    const { d, sent } = deps({ sendMedia: async () => ({ ok: false, status: 400, errorCode: 131053, messageIds: [] }) });
    expect(await deliverResult(d, { to: '995', userId: 'u1', task: task({}), lang: 'ru' })).toEqual({ sent: true, mode: 'link' });
    expect(sent).toHaveLength(1);
    expect(await deliverResult(d, { to: '995', userId: 'u1', task: task(null), lang: 'ru' })).toEqual({ sent: false, mode: 'none', reason: 'not_finished' });
    const boom = deps({ signOwn: async () => { throw new Error('x'); } });
    expect(await deliverResult(boom.d, { to: '995', userId: 'u1', task: task({}), lang: 'ka' })).toEqual({ sent: false, mode: 'none', reason: 'send_failed' });
  });
});
