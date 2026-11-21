/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any -- mock deps */
import { createJob, actOnJob, pollJob, paths, type JobRow, type Studio3dDeps } from './service';
import { chargeRef, refundRef, referenceRef } from '../pipeline';

const UID = 'user-1';
const IMG = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/uploads/user-1/cat.png?token=a';
const GLB = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/user-1/old/model.glb?token=b';
const PREVIEW = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/user-1/old/preview.png?token=c';
const EXEC = 'projects/p/locations/europe-west4/jobs/studio3d/executions/e1';

function mockDeps(over: Partial<{ safety: string | null; photo: string | null | 'throw'; image: boolean; deduct: 'ok' | 'insufficient'; running: number; queued: number; today: number; active: number; engineStart: 'ok' | 'throw'; engineState: string; noEngine: boolean }> = {}) {
  const rows = new Map<string, JobRow>();
  const files = new Map<string, unknown>();
  const ledger: any[] = [];
  const debited = new Set<string>();
  const engineCalls: any[] = [];
  const visionCalls: string[] = [];
  let n = 0;
  const deps: Studio3dDeps = {
    store: {
      get: async (id) => rows.get(id) ?? null,
      insert: async (r) => (rows.set(r.id, r), true),
      update: async (r) => (rows.set(r.id, r), true),
      counts: async () => ({ running: over.running ?? 0, queued: over.queued ?? 0, todayTotal: over.today ?? 0, userActive: over.active ?? 0 }),
      oldestQueuedId: async () => [...rows.values()].find((r) => r.state.step === 'queued')?.id ?? null,
    },
    ledger: {
      deductOnce: async (uid, credits, ref) => {
        if (over.deduct === 'insufficient') return { ok: false, reason: 'insufficient' };
        if (debited.has(ref)) return { ok: false, reason: 'replay' };
        debited.add(ref);
        ledger.push({ op: 'debit', uid, credits, ref });
        return { ok: true };
      },
      refund: async (uid, credits, ref) => (ledger.push({ op: 'refund', uid, credits, ref }), { ok: true }),
    },
    storage: {
      signRead: async (p) => `https://signed/${p}`,
      signReadAny: async (b, p) => `https://signed/${b}/${p}`,
      signUpload: async (p) => `https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/upload/sign/studio3d/${p}?token=u`,
      putBase64: async (p) => (files.set(p, 'img'), true),
      readJson: async (p) => files.get(p) ?? null,
      pathOfOwnUrl: (u) => {
        const m = u.match(/\/object\/sign\/([^/]+)\/([^?]+)/);
        return m ? { bucket: m[1], path: m[2] } : null;
      },
    },
    gemini: {
      image: async () => (over.image === false ? null : { base64: 'aGk=', mimeType: 'image/png' }),
      text: async () => (over.safety === undefined ? 'ALLOW' : over.safety),
      vision: async (_p, url) => {
        visionCalls.push(url);
        if (over.photo === 'throw') throw new Error('vertex down');
        return over.photo === undefined ? 'OBJECT' : over.photo;
      },
    },
    engine: over.noEngine ? null : {
      start: async (spec) => {
        engineCalls.push(spec);
        if (over.engineStart === 'throw') throw new Error('403');
        return { execution: EXEC };
      },
      status: async () => ({ state: (over.engineState as any) ?? 'running' }),
    },
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
    now: () => 1_700_000_000_000,
  };
  return { deps, rows, files, ledger, engineCalls, visionCalls };
}

describe('3D Studio service (mocked deps)', () => {
  it('text → reference (✦8 charged) → approve → GPU → delivered (✦14 once) with signed model links', async () => {
    const m = mockDeps();
    const created = await createJob(m.deps, UID, { mode: 'text', prompt: 'a red vintage car' });
    expect(created).toMatchObject({ ok: true, step: 'awaiting_approval', quote: [{ credits: 8 }, { credits: 14 }] });
    const id = (created as any).id;
    expect((created as any).referenceUrl).toBe(`https://signed/${paths(UID, id).reference}`);
    expect(m.ledger).toEqual([{ op: 'debit', uid: UID, credits: 8, ref: referenceRef(id) }]);

    const approved = await actOnJob(m.deps, UID, id, 'approve');
    expect(approved).toMatchObject({ ok: true, step: 'shape' });
    expect(m.engineCalls[0]).toMatchObject({ jobId: id, mode: 'text', grid: 1024, imageUrl: `https://signed/${paths(UID, id).reference}` });
    expect(m.ledger[1]).toEqual({ op: 'debit', uid: UID, credits: 14, ref: chargeRef(id) });

    m.files.set(paths(UID, id).manifest, { v: 1, jobId: id, step: 'texture' });
    expect(await pollJob(m.deps, UID, id)).toMatchObject({ step: 'texture' });

    m.files.set(paths(UID, id).manifest, { v: 1, jobId: id, step: 'done', faces: 48000, gpuSeconds: 97 });
    const done = await pollJob(m.deps, UID, id);
    expect(done).toMatchObject({ step: 'done', model: { glbUrl: `https://signed/${paths(UID, id).glb}`, faces: 48000 } });
    await pollJob(m.deps, UID, id);
    expect(m.ledger).toHaveLength(2); // the delivery "charge" replays the hold: never a second debit
  });

  it('image mode goes straight to the GPU; high detail uses the 1536 grid and ✦20', async () => {
    const m = mockDeps();
    const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG, detail: 'high' });
    expect(r).toMatchObject({ ok: true, step: 'shape', quote: [{ credits: 20 }] });
    expect(m.engineCalls[0]).toMatchObject({ grid: 1536, imageUrl: 'https://signed/uploads/user-1/cat.png' });
    expect(m.ledger).toEqual([{ op: 'debit', uid: UID, credits: 20, ref: chargeRef((r as any).id) }]);
  });

  it('retexture repaints the model preview and sends the old mesh', async () => {
    const m = mockDeps();
    const r = await createJob(m.deps, UID, { mode: 'retexture', prompt: 'gold metal', meshUrl: GLB, imageUrl: PREVIEW });
    expect(r).toMatchObject({ ok: true, step: 'awaiting_approval', quote: [{ credits: 8 }, { credits: 13 }] });
    await actOnJob(m.deps, UID, (r as any).id, 'approve');
    expect(m.engineCalls[0]).toMatchObject({ mode: 'retexture', grid: 1024, meshUrl: 'https://signed/studio3d/user-1/old/model.glb' });
  });

  it('safety BLOCK (or no answer) costs nothing and never draws', async () => {
    for (const safety of ['BLOCK', null]) {
      const m = mockDeps({ safety });
      const r = await createJob(m.deps, UID, { mode: 'text', prompt: 'something' });
      expect(r).toMatchObject({ ok: true, step: 'failed', error: 'blocked' });
      expect(m.ledger).toEqual([]);
    }
  });

  it('a failed reference picture costs nothing', async () => {
    const m = mockDeps({ image: false });
    expect(await createJob(m.deps, UID, { mode: 'text', prompt: 'a chair' })).toMatchObject({ step: 'failed', error: 'reference_failed' });
    expect(m.ledger).toEqual([]);
  });

  it('worker start failure refunds the hold', async () => {
    const m = mockDeps({ engineStart: 'throw' });
    const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG });
    const id = (r as any).id;
    expect(r).toMatchObject({ step: 'failed', error: 'worker_start_failed' });
    expect(m.ledger).toEqual([
      { op: 'debit', uid: UID, credits: 14, ref: chargeRef(id) },
      { op: 'refund', uid: UID, credits: 14, ref: refundRef(id) },
    ]);
  });

  it('no worker configured: refund, never a silent success', async () => {
    const m = mockDeps({ noEngine: true });
    expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ step: 'failed', error: 'worker_not_configured' });
    expect(m.ledger.map((l) => l.op)).toEqual(['debit', 'refund']);
  });

  it('a crashed execution (no done manifest) refunds on the next poll', async () => {
    const m = mockDeps({ engineState: 'failed' });
    const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG });
    const polled = await pollJob(m.deps, UID, (r as any).id);
    expect(polled).toMatchObject({ step: 'failed' });
    expect(m.ledger.map((l) => l.op)).toEqual(['debit', 'refund']);
  });

  it('worker "failed" manifest refunds with its reason', async () => {
    const m = mockDeps();
    const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG });
    const id = (r as any).id;
    m.files.set(paths(UID, id).manifest, { v: 1, jobId: id, step: 'failed', error: 'CUDA OOM' });
    expect(await pollJob(m.deps, UID, id)).toMatchObject({ step: 'failed', error: 'CUDA OOM' });
  });

  it('insufficient credits fails the hold and refunds nothing', async () => {
    const m = mockDeps({ deduct: 'insufficient' });
    expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ step: 'failed', error: 'insufficient_credits' });
    expect(m.ledger).toEqual([]);
    expect(m.engineCalls).toEqual([]);
  });

  it('GPUs busy: the job waits in the queue with an ETA', async () => {
    const m = mockDeps({ running: 3 });
    expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ step: 'queued', etaSec: 260 });
    expect(m.engineCalls).toEqual([]);
  });

  it('refuses a second active job, the daily cap, bad input, and another user’s job', async () => {
    expect(await createJob(mockDeps({ active: 1 }).deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ ok: false, status: 429, code: 'user_busy' });
    expect(await createJob(mockDeps({ today: 200 }).deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ ok: false, code: 'daily_cap' });
    expect(await createJob(mockDeps().deps, UID, { mode: 'image', imageUrl: 'https://evil.example/x.png' })).toMatchObject({ ok: false, status: 400 });
    expect(await createJob(mockDeps().deps, UID, { mode: 'retexture', prompt: 'gold', meshUrl: GLB })).toMatchObject({ ok: false, status: 400 });
    const m = mockDeps();
    const r = await createJob(m.deps, UID, { mode: 'text', prompt: 'a lamp' });
    expect(await pollJob(m.deps, 'someone-else', (r as any).id)).toMatchObject({ ok: false, status: 404 });
    expect(await actOnJob(m.deps, 'someone-else', (r as any).id, 'approve')).toMatchObject({ ok: false, status: 404 });
    expect(await pollJob(m.deps, UID, 'not-a-uuid')).toMatchObject({ ok: false, status: 404 });
  });

  it('cancel before the GPU refunds; after it is refused', async () => {
    const m = mockDeps({ running: 3 });
    const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG });
    expect(await actOnJob(m.deps, UID, (r as any).id, 'cancel')).toMatchObject({ step: 'failed', error: 'cancelled' });
    expect(m.ledger.map((l) => l.op)).toEqual(['debit', 'refund']);
    const m2 = mockDeps();
    const r2 = await createJob(m2.deps, UID, { mode: 'image', imageUrl: IMG });
    expect(await actOnJob(m2.deps, UID, (r2 as any).id, 'cancel')).toMatchObject({ ok: false, status: 409 });
  });

  it('cancel on the reference picture keeps the ✦8 (it was delivered) and holds nothing', async () => {
    const m = mockDeps();
    const r = await createJob(m.deps, UID, { mode: 'text', prompt: 'a lamp' });
    await actOnJob(m.deps, UID, (r as any).id, 'cancel');
    expect(m.ledger).toEqual([{ op: 'debit', uid: UID, credits: 8, ref: referenceRef((r as any).id) }]);
  });

  describe('D4: Gemini looks at the uploaded photo first', () => {
    it('an object photo passes, and the check sees exactly the uploaded photo', async () => {
      const m = mockDeps();
      expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG })).toMatchObject({ ok: true, step: 'shape' });
      expect(m.visionCalls).toEqual([IMG]);
    });

    it.each([
      ['PERSON', false, 'blocked_person'],
      ['MINOR', true, 'blocked_minor'],
      ['UNSAFE', true, 'blocked'],
      ['SELF', false, 'confirm_self'],
      ['', true, 'blocked'],
      [null, true, 'blocked'],
      ['throw', true, 'blocked'],
    ] as const)('Gemini says %p (selfie tick %p) → refused as %p, nothing charged, no GPU', async (photo, selfie, error) => {
      const m = mockDeps({ photo });
      expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG, selfie })).toMatchObject({ step: 'failed', error });
      expect(m.ledger).toEqual([]);
      expect(m.engineCalls).toEqual([]);
    });

    it('a selfie becomes a figurine when the user ticked "this photo is of me"', async () => {
      const m = mockDeps({ photo: 'SELF' });
      expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG, selfie: true })).toMatchObject({ ok: true, step: 'shape' });
    });

    it('words that are already refused skip the photo check; text mode never runs it', async () => {
      const m = mockDeps({ safety: 'BLOCK' });
      expect(await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG, prompt: 'make it a weapon' })).toMatchObject({ step: 'failed', error: 'blocked' });
      expect(m.visionCalls).toEqual([]);
      const t = mockDeps();
      await createJob(t.deps, UID, { mode: 'text', prompt: 'a lamp' });
      expect(t.visionCalls).toEqual([]);
    });
  });
});

describe('Phase 8.14 pre-flight', () => {
  it('approve leaves the job being approved out of its owner\'s busy count', async () => {
    const m = mockDeps();
    const created = await createJob(m.deps, UID, { mode: 'text', prompt: 'a chair' });
    const id = (created as any).id;
    const seen: (string | undefined)[] = [];
    const counts = m.deps.store.counts;
    m.deps.store.counts = async (u, exceptId) => (seen.push(exceptId), counts(u, exceptId));
    expect(await actOnJob(m.deps, UID, id, 'approve')).toMatchObject({ ok: true });
    expect(seen[0]).toBe(id);
  });

  it('a user with a draft still before the GPU is busy: no second reference picture', async () => {
    const m = mockDeps({ active: 1 });
    expect(await createJob(m.deps, UID, { mode: 'text', prompt: 'a chair' })).toMatchObject({ ok: false, status: 429, code: 'user_busy' });
    expect(m.ledger).toEqual([]);
  });

  it('a failed job writes one [feature-error] line with user, job and code (no prompt)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const m = mockDeps({ noEngine: true });
      const r = await createJob(m.deps, UID, { mode: 'image', imageUrl: IMG });
      const lines = warn.mock.calls.filter((c) => c[0] === '[feature-error]').map((c) => JSON.parse(c[1] as string));
      expect(lines).toEqual([expect.objectContaining({ feature: 'studio3d', userId: UID, taskId: (r as any).id, code: 'worker_not_configured' })]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(IMG);
    } finally {
      warn.mockRestore();
    }
  });
});
