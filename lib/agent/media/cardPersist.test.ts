/**
 * Agent G's cards in the saved chat (./cardPersist). The Preview run of 2026-10-11: a language switch mid-render brought
 * the chat back with „Starting the edit" and no card, and the finished video went only to the Library. A card is now
 * saved lean with its message and read back in a state the new page can carry on.
 */
import { notStartedText, persistAudio, persistEdit, persistMontage, persistRun, restoreAgentCards, type CardMessage } from './cardPersist';
import type { AgentMontageState } from './montageChat';
import type { AgentRunState } from '@/lib/agent/run/runCard';

const NOW = 1_760_000_000_000;
const QUOTE = { jobId: 'job-1', credits: 0, totalSec: 20, shots: 8, clips: 3, aspect: '9:16', beatSynced: true, bpm: 120, musicStartSec: 0, manifest: [], clipOrder: [0, 1, 2], engine: 'ffmpeg', unusedFiles: [], expiresAt: NOW + 60_000 } as unknown as AgentMontageState['quote'];
const montage = (s: Partial<AgentMontageState>): AgentMontageState => ({ phase: 'running', quote: QUOTE, prompt: 'დაამონტაჟე', names: ['a.mp4', 'b.mp4', 'c.mp4', 's.mp3'], t0: NOW - 5_000, ...s });

describe('saving', () => {
  test('a running card keeps what the next page needs to follow its job, and drops the signed plan and a pending Stop', () => {
    const saved = persistMontage(montage({ request: { shots: [1] }, token: 'tok', stopping: true, pct: 58, stage: 'stitch' }));
    expect(saved).toEqual({ phase: 'running', quote: QUOTE, prompt: 'დაამონტაჟე', names: ['a.mp4', 'b.mp4', 'c.mp4', 's.mp3'], t0: NOW - 5_000, pct: 58, stage: 'stitch' });
  });

  test('a plan not started yet keeps its signed plan, so Start still works after a language switch', () => {
    expect(persistMontage(montage({ phase: 'quoted', request: { shots: [1] }, token: 'tok' }))).toMatchObject({ phase: 'quoted', request: { shots: [1] }, token: 'tok' });
    expect(persistAudio({ phase: 'quoted', request: { a: 1 }, token: 't' })).toMatchObject({ request: { a: 1 }, token: 't' });
    expect(persistEdit({ phase: 'done', request: { a: 1 }, token: 't', stage: 'completed' })).toEqual({ phase: 'done', stage: 'completed' });
  });

  test('a run card drops its event log and its half-pressed buttons; the plan stays only while it can be started', () => {
    const run = { phase: 'running', chain: 'soundCut', runId: 'run-1', events: [{ seq: 1 }], stopping: true, approving: 'cut', resuming: true, spec: { s: 1 }, token: 't' } as unknown as AgentRunState;
    expect(persistRun(run)).toEqual({ phase: 'running', chain: 'soundCut', runId: 'run-1' });
    expect(persistRun({ ...run, phase: 'planned' })).toMatchObject({ phase: 'planned', spec: { s: 1 }, token: 't' });
  });
});

describe('reading back', () => {
  const msg = (m: Partial<CardMessage>): CardMessage => ({ text: 'მონტაჟს ვიწყებ…', ...m });

  test('a running card stays running (the studio follows its job again); a chat without cards is returned as it is', () => {
    const list = [msg({ montage: montage({ pct: 58 }) })];
    expect(restoreAgentCards(list, 'ka', NOW)).toBe(list);
    const plain = [{ text: 'hi' }];
    expect(restoreAgentCards(plain, 'ka', NOW)).toBe(plain);
  });

  test('a card still reading its files when the page went is closed with what happened: nothing charged, send again', () => {
    const [m] = restoreAgentCards([msg({ montage: montage({ phase: 'reading', quote: undefined, uploaded: 2 }) })], 'ka', NOW);
    expect(m!.montage).toMatchObject({ phase: 'failed', error: 'interrupted' });
    expect(m!.text).toMatch(/^⚠️ გვერდი ხელახლა ჩაიტვირთა/);
    expect(m!.text).toContain('არაფერი ჩამოგეჭრა');
    expect(m!.noRetry).toBe(true);
    const [a] = restoreAgentCards([msg({ audioJob: { phase: 'checking', source: 'link' } })], 'en', NOW);
    expect(a!.audioJob).toMatchObject({ phase: 'failed', error: 'interrupted' });
    expect(a!.text).toContain('Nothing was charged');
  });

  test('a plan read back keeps its Start while valid; an expired one, or one saved without its signed plan, is closed', () => {
    const valid = msg({ montage: montage({ phase: 'quoted', request: {}, token: 'tok' }) });
    expect(restoreAgentCards([valid], 'ka', NOW)[0]!.montage!.phase).toBe('quoted');
    const [late] = restoreAgentCards([valid], 'ru', NOW + 120_000);
    expect(late!.montage).toEqual(expect.objectContaining({ phase: 'dismissed' }));
    expect(late!.montage).not.toHaveProperty('token');
    expect(late!.text).toMatch(/Срок этого плана истёк/);
    expect(restoreAgentCards([msg({ montage: montage({ phase: 'quoted' }) })], 'ka', NOW)[0]!.montage!.phase).toBe('dismissed');
  });

  test('a run whose start never answered (no run id) is closed honestly: it may have started, the job list shows it', () => {
    const [r] = restoreAgentCards([msg({ runJob: { phase: 'running', chain: 'soundCut' } as unknown as AgentRunState })], 'ka', NOW);
    expect(r!.runJob).toMatchObject({ phase: 'failed', error: 'network' });
    expect(r!.text).toContain('დავალებების სიაში');
    const running = { phase: 'running', chain: 'soundCut', runId: 'run-1' } as unknown as AgentRunState;
    expect(restoreAgentCards([msg({ runJob: running })], 'ka', NOW)[0]!.runJob).toBe(running);
  });

  test('finished cards come back exactly as saved', () => {
    const done = msg({ montage: montage({ phase: 'done', stage: 'completed', t1: NOW }) });
    expect(restoreAgentCards([done], 'ka', NOW)[0]).toBe(done);
  });

  test('the line for a job the server never saw says nothing was charged, in every language', () => {
    expect(notStartedText('ka')).toContain('არაფერი ჩამოგეჭრა');
    expect(notStartedText('en')).toContain('Nothing was charged');
    expect(notStartedText('ru')).toContain('Ничего не списано');
  });
});
