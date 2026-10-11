/** The composer's Stop finds the card that is still working (./workingCard). */
import { newestWorkingCard, workingOf } from './workingCard';
import type { CardMessage } from './cardPersist';

type M = CardMessage & { id?: string };
const msg = (m: Partial<M>): M => ({ text: '', ...m });

describe('the card the composer Stop stops', () => {
  test('a card reading its files or running its job is working; a plan, a result and a stopped card are not', () => {
    expect(workingOf(msg({ id: 'a', montage: { phase: 'reading' } as M['montage'] }))).toEqual({ id: 'a', kind: 'montage', reading: true, stopping: false });
    expect(workingOf(msg({ id: 'b', montage: { phase: 'running', stopping: true } as M['montage'] }))).toEqual({ id: 'b', kind: 'montage', reading: false, stopping: true });
    expect(workingOf(msg({ id: 'c', audioJob: { phase: 'checking', source: 'link' } }))).toMatchObject({ kind: 'audio', reading: true });
    expect(workingOf(msg({ id: 'd', editJob: { phase: 'running', source: 'file' } as M['editJob'] }))).toMatchObject({ kind: 'edit', reading: false });
    expect(workingOf(msg({ id: 'e', runJob: { phase: 'running', chain: 'soundCut', runId: 'r1' } as unknown as M['runJob'] }))).toMatchObject({ kind: 'run' });
    for (const phase of ['quoted', 'done', 'failed', 'cancelled', 'dismissed'] as const) {
      expect(workingOf(msg({ id: 'x', montage: { phase } as M['montage'] }))).toBeNull();
    }
    expect(workingOf(msg({ montage: { phase: 'running' } as M['montage'] }))).toBeNull(); // no id: nothing to stop it by
  });

  test('the newest working card wins; a chat with none has nothing to stop', () => {
    const list = [
      msg({ id: 'old', montage: { phase: 'running' } as M['montage'] }),
      msg({ id: 'mid', audioJob: { phase: 'done', source: 'file' } }),
      msg({ id: 'new', editJob: { phase: 'reading', source: 'previous' } }),
      msg({ text: 'a reply' }),
    ];
    expect(newestWorkingCard(list)).toMatchObject({ id: 'new', kind: 'edit' });
    expect(newestWorkingCard([msg({ text: 'hi' })])).toBeNull();
  });
});
