/**
 * Saga integration tests — verifies the distributed-transaction guarantees:
 *   - happy path commits all steps, compensates none
 *   - a mid-pipeline failure rolls back committed steps in reverse order
 *   - the failing step itself is not compensated; later steps never run
 *   - abort before a step compensates what already committed
 *   - a throwing compensator is swallowed (best-effort) but recorded
 *
 * Mirrors the real avatar → voiceover → assemble multi-step flow: step 2
 * (voiceover) is forced to time out and we assert step 1 (avatar) is undone
 * and the user-credit/state loop runs cleanly.
 */
import { runSaga, type SagaStep } from './saga';

describe('runSaga — distributed transaction', () => {
  test('happy path: all steps commit, none compensate', async () => {
    const order: string[] = [];
    const steps: SagaStep[] = [
      { name: 'avatar',    run: async () => { order.push('run:avatar'); return { id: 'a1' }; },    compensate: async () => { order.push('comp:avatar'); } },
      { name: 'voiceover', run: async () => { order.push('run:voiceover'); return { id: 'v1' }; }, compensate: async () => { order.push('comp:voiceover'); } },
      { name: 'assemble',  run: async () => { order.push('run:assemble'); return { id: 'f1' }; },  compensate: async () => { order.push('comp:assemble'); } },
    ];

    const res = await runSaga(steps, { sagaId: 'saga_happy' });

    expect(res.ok).toBe(true);
    expect(res.completedSteps).toEqual(['avatar', 'voiceover', 'assemble']);
    expect(res.compensatedSteps).toEqual([]);
    expect(order).toEqual(['run:avatar', 'run:voiceover', 'run:assemble']);
  });

  test('failure at step 2 (timeout): rolls back step 1, skips step 3', async () => {
    const order: string[] = [];
    let creditedBack = false; // simulates the Supabase token-credit loop in compensate

    const steps: SagaStep[] = [
      {
        name: 'avatar',
        run: async () => { order.push('run:avatar'); return { id: 'a1', tokens: 50 }; },
        compensate: async (result) => {
          order.push('comp:avatar');
          // The real compensator credits the user's token balance back.
          const r = result as { tokens: number };
          if (r.tokens > 0) creditedBack = true;
        },
      },
      {
        name: 'voiceover',
        run: async () => {
          order.push('run:voiceover');
          // Simulate a downstream provider timeout.
          throw new Error('ElevenLabs request timed out');
        },
        compensate: async () => { order.push('comp:voiceover'); },
      },
      {
        name: 'assemble',
        run: async () => { order.push('run:assemble'); return { id: 'f1' }; },
        compensate: async () => { order.push('comp:assemble'); },
      },
    ];

    const res = await runSaga(steps, { sagaId: 'saga_fail2' });

    // Transaction failed cleanly.
    expect(res.ok).toBe(false);
    expect(res.failedStep).toBe('voiceover');
    expect(res.error).toMatch(/timed out/i);

    // Only step 1 committed → only step 1 compensated. Step 3 never ran.
    expect(res.completedSteps).toEqual(['avatar']);
    expect(res.compensatedSteps).toEqual(['avatar']);
    expect(order).toEqual(['run:avatar', 'run:voiceover', 'comp:avatar']);
    expect(order).not.toContain('run:assemble');
    expect(order).not.toContain('comp:voiceover'); // failing step isn't compensated

    // The state-update / credit loop ran during rollback.
    expect(creditedBack).toBe(true);
  });

  test('reverse-order rollback across 3 committed steps when step 4 fails', async () => {
    const order: string[] = [];
    const mk = (name: string, fail = false): SagaStep => ({
      name,
      run: async () => { order.push(`run:${name}`); if (fail) throw new Error(`${name} blew up`); return { name }; },
      compensate: async () => { order.push(`comp:${name}`); },
    });

    const res = await runSaga([mk('s1'), mk('s2'), mk('s3'), mk('s4', true)], { sagaId: 'saga_reverse' });

    expect(res.ok).toBe(false);
    expect(res.failedStep).toBe('s4');
    // Reverse order: s3, s2, s1
    expect(res.compensatedSteps).toEqual(['s3', 's2', 's1']);
    expect(order).toEqual(['run:s1', 'run:s2', 'run:s3', 'run:s4', 'comp:s3', 'comp:s2', 'comp:s1']);
  });

  test('pre-aborted signal compensates already-committed steps', async () => {
    const order: string[] = [];
    const ctl = new AbortController();
    const steps: SagaStep[] = [
      { name: 'first',  run: async () => { order.push('run:first'); ctl.abort(); return { id: 1 }; }, compensate: async () => { order.push('comp:first'); } },
      { name: 'second', run: async () => { order.push('run:second'); return { id: 2 }; },             compensate: async () => { order.push('comp:second'); } },
    ];

    const res = await runSaga(steps, { sagaId: 'saga_abort', signal: ctl.signal });

    expect(res.ok).toBe(false);
    expect(res.failedStep).toBe('second');     // aborted before second ran
    expect(order).toContain('comp:first');     // first was rolled back
    expect(order).not.toContain('run:second'); // second never executed
  });

  test('a throwing compensator is swallowed but the rollback continues', async () => {
    const order: string[] = [];
    const steps: SagaStep[] = [
      { name: 'a', run: async () => ({ id: 'a' }), compensate: async () => { order.push('comp:a'); } },
      { name: 'b', run: async () => ({ id: 'b' }), compensate: async () => { throw new Error('comp b failed'); } },
      { name: 'c', run: async () => { throw new Error('c failed'); } },
    ];

    const res = await runSaga(steps, { sagaId: 'saga_compfail' });

    expect(res.ok).toBe(false);
    expect(res.failedStep).toBe('c');
    // b's compensator threw → not in compensatedSteps; a's still ran.
    expect(res.compensatedSteps).toEqual(['a']);
    expect(order).toEqual(['comp:a']);
  });

  test('hooks fire for start/done/fail/compensate', async () => {
    const events: string[] = [];
    const steps: SagaStep[] = [
      { name: 'ok',   run: async () => ({}), compensate: async () => {} },
      { name: 'boom', run: async () => { throw new Error('boom'); } },
    ];

    await runSaga(steps, {
      sagaId: 'saga_hooks',
      hooks: {
        onStepStart:  (s) => events.push(`start:${s}`),
        onStepDone:   (s) => events.push(`done:${s}`),
        onStepFail:   (s) => events.push(`fail:${s}`),
        onCompensate: (s) => events.push(`comp:${s}`),
      },
    });

    expect(events).toEqual(['start:ok', 'done:ok', 'start:boom', 'fail:boom', 'comp:ok']);
  });
});
